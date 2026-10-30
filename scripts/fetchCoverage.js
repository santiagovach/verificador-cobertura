/**
 * Build-time script: lee el tab "Con Cobertura" del Google Sheet
 * y genera src/data/coverage.json que se incluye en el bundle de Vite.
 *
 * Requiere una Service Account con acceso de lectura al Sheet.
 * Configurar en .env.local:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_JSON  — contenido del JSON como string
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH  — o ruta al archivo .json local
 *   GOOGLE_SHEETS_ID                 — ID del Sheet (ya configurado)
 */

import { google } from 'googleapis'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHEET_ID = process.env.GOOGLE_SHEETS_ID || '18SWVTHsJ3cUlreCeFCZLpf5KVP81KT-d7W7CKdUtQVs'
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

async function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH

  if (keyJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes: SCOPES,
    })
  }

  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: join(process.cwd(), keyPath),
      scopes: SCOPES,
    })
  }

  throw new Error(
    'No se encontraron credenciales de Google.\n' +
    'Configura GOOGLE_SERVICE_ACCOUNT_KEY_JSON o GOOGLE_SERVICE_ACCOUNT_KEY_PATH en .env.local'
  )
}

async function fetchCoverage() {
  console.log('📊 Leyendo Google Sheet de cobertura...')

  const auth = await getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Con Cobertura!A:D',
  })

  const rows = response.data.values
  if (!rows || rows.length < 2) {
    throw new Error('No se encontraron datos en el tab "Con Cobertura".')
  }

  const [header, ...dataRows] = rows
  console.log(`  Columnas detectadas: ${header.join(', ')}`)
  console.log(`  Filas de datos: ${dataRows.length}`)

  // byCp[cp] es una LISTA: el Sheet repite ~140 CPs con municipios distintos (Izcalli/Teoloyucan,
  // Tlaquepaque/Zapopan...) y antes ganaba el último renglón, así que el polígono se validaba
  // contra el municipio equivocado y una dirección cubierta salía sin cobertura.
  const byCp = {}
  const municipalitySet = new Set()
  const skipped = []

  for (const row of dataRows) {
    const [cp, municipio, estado, plaza] = row.map(v => v?.trim() || '')
    if (!cp || cp.length !== 5 || !/^\d{5}$/.test(cp)) {
      if (row.some(v => v?.trim())) skipped.push(row.join(' | '))
      continue
    }

    const entries = (byCp[cp] ||= [])
    if (!entries.some(e => e.municipio === municipio && e.estado === estado)) entries.push({ municipio, estado, plaza })
    municipalitySet.add(`${municipio}|||${estado}`)
  }

  const duplicated = Object.entries(byCp).filter(([, entries]) => entries.length > 1)
  if (skipped.length) console.log(`  ⚠️  ${skipped.length} renglones sin CP válido (ignorados), p. ej.: ${skipped.slice(0, 3).join(' / ')}`)
  if (duplicated.length) console.log(`  ⚠️  ${duplicated.length} CPs con más de un municipio en el Sheet, p. ej.: ${duplicated.slice(0, 3).map(([cp, e]) => `${cp} (${e.map(x => x.municipio).join(' / ')})`).join(', ')}`)

  // Si el tab viene medio borrado, mejor que el build falle a que producción pierda cobertura.
  const MIN_CPS = 3000
  if (Object.keys(byCp).length < MIN_CPS) {
    throw new Error(`Solo ${Object.keys(byCp).length} CPs en "Con Cobertura" (mínimo esperado ${MIN_CPS}). ¿Se borró parte del Sheet?`)
  }

  const municipalities = Array.from(municipalitySet).map(key => {
    const [municipio, estado] = key.split('|||')
    return { municipio, estado }
  })

  const coverage = {
    lastUpdated: new Date().toISOString(),
    totalCPs: Object.keys(byCp).length,
    municipalities,
    byCp,
  }

  const dataDir = join(__dirname, '..', 'src', 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

  const outputPath = join(dataDir, 'coverage.json')
  writeFileSync(outputPath, JSON.stringify(coverage))

  console.log(`✅ coverage.json generado: ${coverage.totalCPs} CPs, ${municipalities.length} municipios`)
}

fetchCoverage().catch(err => {
  console.error('❌ Error al generar coverage.json:', err.message)
  process.exit(1)
})
