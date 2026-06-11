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

  const byCp = {}
  const municipalitySet = new Set()

  for (const row of dataRows) {
    const [cp, municipio, estado, plaza] = row.map(v => v?.trim() || '')
    if (!cp || cp.length !== 5 || !/^\d{5}$/.test(cp)) continue

    byCp[cp] = { municipio, estado, plaza }
    municipalitySet.add(`${municipio}|||${estado}`)
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
