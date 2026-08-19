/**
 * Genera src/data/firmaFisica.json combinando dos fuentes:
 *
 * 1. La tab "Firma física" (gid FIRMA_FISICA_SHEET_GID, spreadsheet
 *    FIRMA_FISICA_SHEETS_ID) — cobertura municipio-completo para las plazas
 *    que aún no tienen el dato a nivel CP (CDMX, México/EdoMex, Puebla, Tijuana).
 *
 * 2. La columna "Firma física" (Si/No) del tab "Con Cobertura" — cobertura
 *    exacta por CP para Querétaro y Guadalajara/Jalisco, las únicas plazas
 *    donde ese dato ya fue revisado. Solo los CPs marcados "Si" cuentan como
 *    cobertura; el resto queda fuera del dataset (no se infiere por municipio
 *    ni por prefijo — ver EXACT_ONLY_ESTADOS en useSearch.js).
 *
 * Los estados en EXACT_CP_ESTADOS se excluyen por completo de la fuente 1,
 * para no mezclar el dato viejo (municipio-completo) con el nuevo (por CP).
 *
 * Corre automáticamente durante el build en Vercel.
 */

import { google } from 'googleapis'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CON_COBERTURA_SHEET_ID = process.env.GOOGLE_SHEETS_ID || '18SWVTHsJ3cUlreCeFCZLpf5KVP81KT-d7W7CKdUtQVs'
const EXACT_CP_ESTADOS = ['Querétaro', 'Jalisco']
const EXACT_CP_PLAZAS = ['Querétaro', 'Guadalajara']

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

// Fuente 1: tab "Firma física" — municipio-completo, para las plazas aún no revisadas.
async function fetchLegacyByCp(sheets) {
  const sheetId = process.env.FIRMA_FISICA_SHEETS_ID
  if (!sheetId) {
    console.warn('⚠️  FIRMA_FISICA_SHEETS_ID no configurado — sin datos legacy de firma física.')
    return {}
  }

  console.log('📋 Leyendo tab "Firma física" (legacy, municipio-completo)...')
  const FIRMA_FISICA_GID = parseInt(process.env.FIRMA_FISICA_SHEET_GID || '3445650', 10)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' })
  const sheet = meta.data.sheets.find(s => s.properties.sheetId === FIRMA_FISICA_GID)
  if (!sheet) {
    const available = meta.data.sheets.map(s => `"${s.properties.title}" (gid=${s.properties.sheetId})`).join(', ')
    throw new Error(`No se encontró tab con gid=${FIRMA_FISICA_GID}. Tabs: ${available}`)
  }
  const tabName = sheet.properties.title
  console.log(`  Tab encontrado: "${tabName}" (gid=${FIRMA_FISICA_GID})`)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${tabName}'!A:D`,
  })

  const rows = res.data.values || []
  if (rows.length < 2) throw new Error('Tab "Firma física" vacía o sin datos.')

  const header = rows[0].map(h => h.trim().toLowerCase())
  const cpIdx = header.findIndex(h => h.includes('cp'))
  const munIdx = header.findIndex(h => h.includes('municipio'))
  const estadoIdx = header.findIndex(h => h.includes('estado'))

  if (cpIdx === -1 || munIdx === -1 || estadoIdx === -1) {
    throw new Error('Columnas esperadas no encontradas. La tab debe tener: CP, Municipio, Estado')
  }

  const byCp = {}
  let skipped = 0
  let excluded = 0

  for (const r of rows.slice(1)) {
    const cp = (r[cpIdx] || '').trim()
    const municipio = (r[munIdx] || '').trim()
    const estado = (r[estadoIdx] || '').trim()

    if (!cp || !municipio || !estado) { skipped++; continue }
    if (EXACT_CP_ESTADOS.includes(estado)) { excluded++; continue }

    if (!byCp[cp]) byCp[cp] = { municipio, estado }
  }

  console.log(`  ${Object.keys(byCp).length} CPs legacy (${excluded} excluidos por pertenecer a plazas con dato exacto: ${EXACT_CP_ESTADOS.join(', ')})`)
  if (skipped > 0) console.log(`  (${skipped} filas legacy omitidas por datos incompletos)`)

  return byCp
}

// Fuente 2: columna "Firma física" (Si/No) del tab "Con Cobertura" — exacto por CP.
async function fetchExactCpByCp(sheets) {
  console.log('📋 Leyendo columna "Firma física" del tab "Con Cobertura" (exacto por CP)...')

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CON_COBERTURA_SHEET_ID,
    range: 'Con Cobertura!A:E',
  })

  const rows = res.data.values || []
  if (rows.length < 2) throw new Error('Tab "Con Cobertura" vacía o sin datos.')

  const header = rows[0].map(h => h.trim().toLowerCase())
  const cpIdx = header.findIndex(h => h.includes('postal') || h.includes('cp'))
  const munIdx = header.findIndex(h => h.includes('municipio'))
  const estadoIdx = header.findIndex(h => h.includes('estado'))
  const plazaIdx = header.findIndex(h => h.includes('plaza'))
  const firmaIdx = header.findIndex(h => h.includes('firma'))

  if ([cpIdx, munIdx, estadoIdx, plazaIdx, firmaIdx].includes(-1)) {
    throw new Error('Columnas esperadas no encontradas en "Con Cobertura". Debe tener: CP, Municipio, Estado, Plaza, Firma física')
  }

  const byCp = {}
  let siCount = 0

  for (const r of rows.slice(1)) {
    const plaza = (r[plazaIdx] || '').trim()
    if (!EXACT_CP_PLAZAS.includes(plaza)) continue

    const firma = (r[firmaIdx] || '').trim().toLowerCase()
    if (firma !== 'si' && firma !== 'sí') continue

    const cp = (r[cpIdx] || '').trim()
    const municipio = (r[munIdx] || '').trim()
    const estado = (r[estadoIdx] || '').trim()
    if (!cp || !municipio || !estado) continue

    byCp[cp] = { municipio, estado, plaza }
    siCount++
  }

  console.log(`  ${siCount} CPs marcados "Si" en ${EXACT_CP_PLAZAS.join(', ')}`)

  return byCp
}

async function main() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() })

  const [legacyByCp, exactByCp] = await Promise.all([
    fetchLegacyByCp(sheets),
    fetchExactCpByCp(sheets),
  ])

  const byCp = { ...legacyByCp, ...exactByCp }

  // La lista de municipios (usada para el fallback por municipio en la búsqueda y
  // para pintar polígonos en el mapa) sale SOLO de la data legacy: los municipios
  // de Querétaro/Jalisco tienen cobertura parcial por CP, así que no deben pintarse
  // ni matchearse enteros — solo el lookup exacto por CP (byCp) aplica para ellos.
  const munSet = {}
  for (const { municipio, estado } of Object.values(legacyByCp)) {
    const key = `${municipio}|||${estado}`
    if (!munSet[key]) munSet[key] = { municipio, estado }
  }

  const result = {
    lastUpdated: new Date().toISOString(),
    totalCPs: Object.keys(byCp).length,
    totalMunicipios: Object.keys(munSet).length,
    municipalities: Object.values(munSet),
    byCp,
    // Estados con cobertura exacta por CP: useSearch.js NO debe usar fallback
    // por municipio ni por prefijo de CP para ellos (la cobertura es parcial,
    // no todo el municipio tiene firma física).
    exactOnlyEstados: EXACT_CP_ESTADOS,
  }

  const outPath = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(result))

  console.log(`✅ firmaFisica.json generado: ${result.totalCPs} CPs, ${result.totalMunicipios} municipios`)
}

main().catch(e => {
  console.error('❌ Error al generar firmaFisica.json:', e.message)
  console.warn('⚠️  El build continuará sin datos de firma física actualizados.')
  const outPath = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  try {
    mkdirSync(dirname(outPath), { recursive: true })
    if (!existsSync(outPath)) {
      const empty = { lastUpdated: new Date().toISOString(), totalCPs: 0, totalMunicipios: 0, municipalities: [], byCp: {}, exactOnlyEstados: EXACT_CP_ESTADOS }
      writeFileSync(outPath, JSON.stringify(empty))
    }
  } catch {}
})
