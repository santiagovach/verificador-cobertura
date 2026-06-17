/**
 * Descarga los polígonos de municipios desde OpenStreetMap (Overpass API)
 * para los estados con cobertura MoradaUno. Reemplaza data/municipios-mexico.geojson
 * con datos precisos (más vértices, posiciones correctas).
 *
 * Corre este script cuando detectes que los polígonos del mapa están mal ubicados.
 * Después de correrlo, hay que re-correr:
 *   npm run filter-municipalities
 *   npm run filter-firma-fisica
 *
 * Uso: node scripts/fetchMunicipiosOSM.js
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Estados con cobertura MoradaUno (nombre en OSM → nombre a usar en GeoJSON)
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
  // admin_level 6 = municipios/alcaldías en México
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

function relationToGeojson(rel, stateName) {
  const name = rel.tags?.name || ''
  if (!name) return null

  // Separate outer and inner rings from members
  const outerWays = rel.members?.filter(m => m.role === 'outer' && m.geometry?.length > 0) || []
  const innerWays = rel.members?.filter(m => m.role === 'inner' && m.geometry?.length > 0) || []

  if (outerWays.length === 0) return null

  function wayToRing(way) {
    const coords = way.geometry.map(p => [p.lon, p.lat])
    // GeoJSON rings must close (first point = last point)
    if (coords.length > 0) {
      const first = coords[0], last = coords[coords.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push(coords[0])
    }
    return coords
  }

  const outerRings = outerWays.map(wayToRing).filter(r => r.length >= 4)
  const innerRings = innerWays.map(wayToRing).filter(r => r.length >= 4)

  if (outerRings.length === 0) return null

  let geometry
  if (outerRings.length === 1) {
    geometry = {
      type: 'Polygon',
      coordinates: [outerRings[0], ...innerRings],
    }
  } else {
    // Multiple outer rings → MultiPolygon (each outer ring may have associated inner rings)
    geometry = {
      type: 'MultiPolygon',
      coordinates: outerRings.map(outer => [outer]),
    }
  }

  return {
    type: 'Feature',
    properties: {
      NAME_0: 'Mexico',
      NAME_1: stateName,
      NAME_2: name,
    },
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

    let ok = 0
    for (const rel of rels) {
      const feature = relationToGeojson(rel, state.geoName)
      if (feature) {
        features.push(feature)
        ok++
      }
    }
    console.log(`   ✅ ${ok} municipios convertidos`)

    if (STATES.indexOf(state) < STATES.length - 1) {
      await sleep(SLEEP_MS)
    }
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  }

  const outputPath = join(__dirname, '..', 'data', 'municipios-mexico.geojson')
  writeFileSync(outputPath, JSON.stringify(geojson))

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
