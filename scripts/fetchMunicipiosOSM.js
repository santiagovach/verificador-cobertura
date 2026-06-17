/**
 * Descarga los polígonos de municipios desde OpenStreetMap (Overpass API)
 * para los estados con cobertura MoradaUno. Reemplaza data/municipios-mexico.geojson
 * con datos precisos.
 *
 * Corre este script cuando necesites actualizar los límites municipales.
 * Después de correrlo, re-corre:
 *   npm run filter-municipalities
 *   npm run filter-firma-fisica
 *
 * Uso: node scripts/fetchMunicipiosOSM.js
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const STATES = [
  { osmName: 'Ciudad de México',    geoName: 'Distrito Federal', adminLevel: '4' },
  { osmName: 'Estado de México',    geoName: 'México',           adminLevel: '4' },
  { osmName: 'Querétaro',           geoName: 'Querétaro',        adminLevel: '4' },
  { osmName: 'Jalisco',             geoName: 'Jalisco',          adminLevel: '4' },
  { osmName: 'Guanajuato',          geoName: 'Guanajuato',       adminLevel: '4' },
  { osmName: 'Morelos',             geoName: 'Morelos',          adminLevel: '4' },
  { osmName: 'Puebla',              geoName: 'Puebla',           adminLevel: '4' },
  { osmName: 'Nuevo León',          geoName: 'Nuevo León',       adminLevel: '4' },
  { osmName: 'Baja California',     geoName: 'Baja California',  adminLevel: '4' },
]

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const SLEEP_MS = 3000

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchState(state) {
  const query = `
[out:json][timeout:120];
area["name"="${state.osmName}"]["admin_level"="${state.adminLevel}"]->.s;
relation(area.s)["boundary"="administrative"]["admin_level"="6"];
out geom;
`
  const encoded = encodeURIComponent(query.trim())
  const url = `${OVERPASS_URL}?data=${encoded}`

  let attempts = 0
  while (attempts < 3) {
    attempts++
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MoradaUno-VerificadorCobertura/1.0' },
        signal: AbortSignal.timeout(130_000),
      })
      if (!res.ok) {
        console.warn(`  ⚠️  HTTP ${res.status} para ${state.osmName}, reintento ${attempts}`)
        await sleep(SLEEP_MS * attempts)
        continue
      }
      return await res.json()
    } catch (e) {
      console.warn(`  ⚠️  Error para ${state.osmName}: ${e.message}, reintento ${attempts}`)
      await sleep(SLEEP_MS * attempts)
    }
  }
  return null
}

/**
 * Ensambla segmentos de "way" OSM en anillos cerrados (ring stitching).
 * OSM divide los límites en segmentos que deben unirse en orden.
 */
function assembleRings(ways) {
  if (ways.length === 0) return []

  // Index endpoints: "lng,lat" → [{wayIdx, atStart}]
  const endpointIndex = new Map()
  ways.forEach((coords, idx) => {
    if (coords.length < 2) return
    const key0 = `${coords[0][0]},${coords[0][1]}`
    const keyN = `${coords[coords.length - 1][0]},${coords[coords.length - 1][1]}`
    if (!endpointIndex.has(key0)) endpointIndex.set(key0, [])
    if (!endpointIndex.has(keyN)) endpointIndex.set(keyN, [])
    endpointIndex.get(key0).push({ idx, atStart: true })
    endpointIndex.get(keyN).push({ idx, atStart: false })
  })

  const used = new Set()
  const rings = []

  for (let seed = 0; seed < ways.length; seed++) {
    if (used.has(seed) || ways[seed].length < 2) continue

    const ring = [...ways[seed]]
    used.add(seed)

    const originKey = `${ring[0][0]},${ring[0][1]}`

    let iterations = 0
    while (iterations++ < ways.length * 2) {
      const tailKey = `${ring[ring.length - 1][0]},${ring[ring.length - 1][1]}`

      // Check if the ring is closed
      if (tailKey === originKey && ring.length > 3) break

      const candidates = (endpointIndex.get(tailKey) || []).filter(c => !used.has(c.idx))
      if (candidates.length === 0) break

      const { idx, atStart } = candidates[0]
      used.add(idx)
      const next = ways[idx]

      if (atStart) {
        // tail matches start of next → append without first point (duplicate)
        ring.push(...next.slice(1))
      } else {
        // tail matches end of next → append reversed without last point (duplicate)
        ring.push(...[...next].reverse().slice(1))
      }
    }

    // Ensure ring is closed
    const first = ring[0], last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...ring[0]])

    if (ring.length >= 4) rings.push(ring)
  }

  return rings
}

function relationToGeojson(rel, stateName) {
  const name = rel.tags?.name || ''
  if (!name) return null

  const outerWays = (rel.members || [])
    .filter(m => m.role === 'outer' && m.geometry?.length >= 2)
    .map(m => m.geometry.map(p => [p.lon, p.lat]))

  const innerWays = (rel.members || [])
    .filter(m => m.role === 'inner' && m.geometry?.length >= 2)
    .map(m => m.geometry.map(p => [p.lon, p.lat]))

  if (outerWays.length === 0) return null

  const outerRings = assembleRings(outerWays)
  const innerRings = assembleRings(innerWays)

  if (outerRings.length === 0) return null

  let geometry
  if (outerRings.length === 1) {
    geometry = {
      type: 'Polygon',
      coordinates: [outerRings[0], ...innerRings],
    }
  } else {
    geometry = {
      type: 'MultiPolygon',
      coordinates: outerRings.map(outer => [outer]),
    }
  }

  return {
    type: 'Feature',
    properties: { NAME_0: 'Mexico', NAME_1: stateName, NAME_2: name },
    geometry,
  }
}

async function main() {
  console.log('🗺  Descargando municipios de OpenStreetMap (Overpass API)')
  console.log(`   Estados: ${STATES.map(s => s.osmName).join(', ')}\n`)

  const features = []

  for (const state of STATES) {
    console.log(`📥 ${state.osmName}...`)
    const data = await fetchState(state)

    if (!data) {
      console.warn(`   ❌ Sin datos para ${state.osmName}`)
      continue
    }

    const rels = data.elements || []
    console.log(`   ${rels.length} relaciones encontradas`)

    let ok = 0, skipped = 0
    for (const rel of rels) {
      const feature = relationToGeojson(rel, state.geoName)
      if (feature) { features.push(feature); ok++ }
      else skipped++
    }
    console.log(`   ✅ ${ok} municipios convertidos${skipped ? `, ${skipped} sin geometría` : ''}`)

    if (STATES.indexOf(state) < STATES.length - 1) await sleep(SLEEP_MS)
  }

  const outputPath = join(__dirname, '..', 'data', 'municipios-mexico.geojson')
  writeFileSync(outputPath, JSON.stringify({ type: 'FeatureCollection', features }))

  console.log(`\n✅ data/municipios-mexico.geojson actualizado`)
  console.log(`   ${features.length} municipios totales`)
  console.log(`\nSiguientes pasos:`)
  console.log(`   npm run filter-municipalities`)
  console.log(`   npm run filter-firma-fisica`)
}

main().catch(e => {
  console.error('❌ Error:', e.message)
  process.exit(1)
})
