/**
 * Lee la tab "Firma física" del Sheet y genera src/data/firmaFisica.json.
 *
 * La tab tiene 4 columnas: CP | Municipio | Estado | Plaza
 * Para actualizar: pega una nueva lista en el Sheet y presiona "Actualizar".
 *
 * Corre automáticamente durante el build en Vercel.
 */

import { google } from 'googleapis'
import { writeFileSync, mkdirSync } from 'fs'
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

  console.log('📋 Leyendo tab "Firma física"...')
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "'Firma física'!A:D",
  })

  const rows = res.data.values || []
  if (rows.length < 2) throw new Error('Tab "Firma física" vacía o sin datos.')

  // Esperar header: CP | Municipio | Estado | Plaza
  const header = rows[0].map(h => h.trim().toLowerCase())
  const cpIdx       = header.findIndex(h => h.includes('cp'))
  const munIdx      = header.findIndex(h => h.includes('municipio'))
  const estadoIdx   = header.findIndex(h => h.includes('estado'))
  const plazaIdx    = header.findIndex(h => h.includes('plaza'))

  if (cpIdx === -1 || munIdx === -1 || estadoIdx === -1) {
    throw new Error('Columnas esperadas no encontradas. La tab debe tener: CP, Municipio, Estado, Plaza')
  }

  const byCp = {}
  const munSet = {}
  let skipped = 0

  for (const r of rows.slice(1)) {
    const cp       = (r[cpIdx] || '').trim()
    const municipio = (r[munIdx] || '').trim()
    const estado   = (r[estadoIdx] || '').trim()
    const plaza    = plazaIdx >= 0 ? (r[plazaIdx] || '').trim() : ''

    if (!cp || !municipio || !estado) { skipped++; continue }

    if (!byCp[cp]) {
      byCp[cp] = { municipio, estado }
      const munKey = `${municipio}|||${estado}`
      if (!munSet[munKey]) munSet[munKey] = { municipio, estado, ...(plaza ? { plaza } : {}) }
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
  if (skipped > 0) console.log(`   (${skipped} filas omitidas por datos incompletos)`)
}

main().catch(e => {
  console.error('❌ Error al generar firmaFisica.json:', e.message)
  process.exit(1)
})
