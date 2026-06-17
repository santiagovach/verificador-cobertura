/**
 * Lee el Planificador M1 del equipo de firmas y genera src/data/firmaFisica.json.
 * Solo procesa filas con Tipo de firma = "Presencial".
 * Corre automáticamente durante el build en Vercel.
 */

import { google } from 'googleapis'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON
  if (keyJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }
  throw new Error('No se encontró credencial de service account.')
}

async function main() {
  const sheetId = process.env.FIRMA_FISICA_SHEETS_ID
  if (!sheetId) {
    console.warn('⚠️  FIRMA_FISICA_SHEETS_ID no configurado — generando firmaFisica.json vacío.')
    const empty = { lastUpdated: new Date().toISOString(), totalCPs: 0, totalMunicipios: 0, municipalities: [], byCp: {} }
    const outPath = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(empty))
    return
  }

  console.log('📋 Leyendo Planificador de firmas...')
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Planificador M1!A:U',
  })

  const rows = res.data.values || []
  if (rows.length < 2) throw new Error('Sheet vacío o sin datos.')

  const header = rows[0]
  const idx = (name) => header.indexOf(name)
  const dirIdx = idx('Dirección')
  const tipoIdx = idx('Tipo de firma')

  // Load coverage.json to resolve CP → municipio/estado
  const coveragePath = join(__dirname, '..', 'src', 'data', 'coverage.json')
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'))

  const byCp = {}
  const munSet = {}

  let total = 0, conCP = 0, sinMatch = 0

  for (const r of rows.slice(1)) {
    const tipo = (r[tipoIdx] || '').toLowerCase().trim()
    if (tipo !== 'presencial') continue
    total++

    const dir = r[dirIdx] || ''
    const cpMatch = dir.match(/\b(\d{5})\b/)
    if (!cpMatch) continue

    const cp = cpMatch[1]
    const entry = coverage.byCp[cp]
    if (!entry) { sinMatch++; continue }

    conCP++
    if (!byCp[cp]) {
      byCp[cp] = { municipio: entry.municipio, estado: entry.estado }
      const munKey = `${entry.municipio}|||${entry.estado}`
      if (!munSet[munKey]) munSet[munKey] = { municipio: entry.municipio, estado: entry.estado }
    }
  }

  const municipalities = Object.values(munSet)
  const result = {
    lastUpdated: new Date().toISOString(),
    totalCPs: Object.keys(byCp).length,
    totalMunicipios: municipalities.length,
    municipalities,
    byCp,
  }

  const outPath = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(result))

  console.log(`✅ firmaFisica.json generado: ${result.totalCPs} CPs, ${result.totalMunicipios} municipios`)
  console.log(`   (${total} presenciales procesadas, ${conCP} con CP en cobertura, ${sinMatch} sin match)`)
}

main().catch(e => {
  console.error('❌ Error al generar firmaFisica.json:', e.message)
  process.exit(1)
})
