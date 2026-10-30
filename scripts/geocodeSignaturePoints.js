/**
 * Geocodifica los puntos de firma (abogados + oficinas) y escribe
 * src/data/signaturePoints.json (commiteado, fuente de verdad para el
 * modelo de cobertura por radar).
 *
 * Prueba varias variantes de cada dirección (de más a menos específica)
 * porque varias direcciones informales (manzana/lote, sin colonia) no
 * matchean tal cual en Nominatim.
 *
 * Uso: node scripts/geocodeSignaturePoints.js        (solo puntos nuevos)
 *      node scripts/geocodeSignaturePoints.js --all  (rehace todos)
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DELAY_MS = 1100

// Los domicilios de los abogados viven en data/signature-points.local.mjs (fuera de git): el JSON
// generado va en el bundle público, así que solo lleva su ubicación redondeada (~1 km).
const LOCAL_POINTS = join(__dirname, '..', 'data', 'signature-points.local.mjs')
if (!existsSync(LOCAL_POINTS)) {
  console.error(`❌ Falta ${LOCAL_POINTS} (direcciones de abogados, no está en git).`)
  process.exit(1)
}
const { POINTS } = await import(LOCAL_POINTS)

async function geocodeQuery(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MoradaUno-VerificadorCobertura/1.0 (jorge@moradauno.com)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data?.[0]) return null
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  }
}

// Abogados: sin dirección y con coordenadas a 2 decimales (~1 km, suficiente para capas de 6/15/25 km).
// Oficinas y la Central de Autobuses son lugares públicos y se quedan exactos.
function publicPoint(p) {
  if (!p.id.startsWith('abogado-') || p.lat == null) return p
  const { direccion, geocodeMatch, geocodePrecision, ...rest } = p
  return { ...rest, lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100, ubicacion: 'aproximada (~1 km)' }
}

// Por defecto solo geocodifica los puntos que todavía no están en el JSON y conserva los
// existentes tal cual (coordenadas y 'confianza' revisados a mano). --all rehace todos.
async function main() {
  const outPath = join(__dirname, '..', 'src', 'data', 'signaturePoints.json')
  const all = process.argv.includes('--all')
  const existing = all || !existsSync(outPath) ? [] : JSON.parse(readFileSync(outPath, 'utf8')).points
  const existingIds = new Set(existing.map(p => p.id))
  const results = [...existing]
  for (const point of POINTS.filter(p => !existingIds.has(p.id))) {
    const queries = [point.direccion + ', México', ...(point.variantes || []).map(v => v + ', México')]
    process.stdout.write(`Geocodificando ${point.nombre}... `)
    let found = null
    let matchedQuery = null
    for (const q of queries) {
      try {
        const geo = await geocodeQuery(q)
        await new Promise(r => setTimeout(r, DELAY_MS))
        if (geo) {
          found = geo
          matchedQuery = q
          break
        }
      } catch (err) {
        console.log(`\n  ⚠️  error en "${q}": ${err.message}`)
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }
    if (!found) {
      console.log('❌ sin resultado en ninguna variante')
      results.push({ id: point.id, nombre: point.nombre, tipo: point.tipo, direccion: point.direccion, lat: null, lng: null, geocodeNote: 'sin resultado' })
    } else {
      const precisionNote = matchedQuery === queries[0] ? 'exacta' : `aproximada (matched: "${matchedQuery}")`
      console.log(`✅ ${found.lat}, ${found.lng} [${precisionNote}]`)
      results.push({ id: point.id, nombre: point.nombre, tipo: point.tipo, direccion: point.direccion, lat: found.lat, lng: found.lng, geocodeMatch: found.displayName, geocodePrecision: precisionNote, ...(point.soloMunicipio && { soloMunicipio: point.soloMunicipio }) })
    }
  }

  writeFileSync(outPath, JSON.stringify({ lastUpdated: new Date().toISOString(), points: results.map(publicPoint) }, null, 2) + '\n')
  console.log(`\n📝 Escrito en ${outPath}`)
}

main()
