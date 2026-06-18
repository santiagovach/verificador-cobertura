/**
 * Genera public/firma-fisica-municipalities.geojson
 *
 * Para municipios con ≥ 3 CPs geocodificados (en data/firma-fisica-coords.json):
 *   → usa el convex hull de esos CPs como polígono (muestra solo la zona cubierta)
 * Para el resto:
 *   → usa el polígono OSM completo del municipio
 *
 * Corre localmente después de fetch-firma-fisica (y geocode-cps si hay cambios).
 * El resultado SÍ se commitea al repo.
 *
 * Uso: npm run filter-firma-fisica
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ESTADO_TO_GEOJSON = {
  'ciudad de mexico': 'Distrito Federal',
  'mexico': 'México',
  'nuevo leon': 'Nuevo León',
  'jalisco': 'Jalisco',
  'puebla': 'Puebla',
  'baja california': 'Baja California',
  'queretaro': 'Querétaro',
  'guanajuato': 'Guanajuato',
  'morelos': 'Morelos',
}

const MUNICIPIO_ALIASES = {
  'puebla': 'municipio de puebla',
  'queretaro': 'municipio de queretaro',
  'ensenada': 'municipio de ensenada',
  'mexicali': 'municipio de mexicali',
  'tijuana': 'municipio de tijuana',
  'tecate': 'municipio de tecate',
  'playas de rosarito': 'municipio de playas de rosarito',
  'san quintin': 'municipio de san quintin',
  'san felipe': 'municipio de san felipe',
}

const REVISAR_MUNICIPIOS = new Set(['milpa alta', 'xochimilco', 'tlahuac'])

// ─── Convex Hull (Andrew's monotone chain) ─────────────────────────────────────

function cross(O, A, B) {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
}

function convexHull(points) {
  const unique = [...new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()]
  if (unique.length < 3) return null
  unique.sort((a, b) => a[1] - b[1] || a[0] - b[0])

  const lower = []
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  const hull = [...lower, ...upper]
  if (hull.length < 3) return null
  hull.push(hull[0])
  return hull
}

// ─── Bounding box helpers ───────────────────────────────────────────────────────

function getBbox(ring) {
  const lats = ring.map(c => c[1]), lngs = ring.map(c => c[0])
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats),
           minLng: Math.min(...lngs), maxLng: Math.max(...lngs) }
}

function bboxArea(bb) {
  return (bb.maxLat - bb.minLat) * (bb.maxLng - bb.minLng)
}

function filterToBbox(points, bb, margin = 0.05) {
  const latM = (bb.maxLat - bb.minLat) * margin
  const lngM = (bb.maxLng - bb.minLng) * margin
  return points.filter(([lng, lat]) =>
    lat >= bb.minLat - latM && lat <= bb.maxLat + latM &&
    lng >= bb.minLng - lngM && lng <= bb.maxLng + lngM
  )
}

/**
 * Returns convex hull geometry if the hull is a meaningful sub-zone
 * (20–92% of the municipality bbox area, after filtering coords to the bbox).
 * Returns null to signal "use OSM polygon instead".
 */
function buildHull(cpPoints, osmRing) {
  const osmBbox = getBbox(osmRing)
  const osmArea = bboxArea(osmBbox)

  const inBounds = filterToBbox(cpPoints, osmBbox)
  if (inBounds.length < 3) return null

  const hull = convexHull(inBounds)
  if (!hull) return null

  const hullBbox = getBbox(hull)
  const hullArea = bboxArea(hullBbox)
  const ratio = osmArea > 0 ? hullArea / osmArea : 1

  // Hull is unreliable if it covers almost everything (>92%) — use OSM instead
  // Hull is unreliable if it's tiny (<20%) — too sparse, OSM is more honest
  if (ratio > 0.92 || ratio < 0.20) return null

  return { type: 'Polygon', coordinates: [hull] }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const firmaPath  = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  const inegPath   = join(__dirname, '..', 'data', 'municipios-mexico.geojson')
  const coordsPath = join(__dirname, '..', 'data', 'firma-fisica-coords.json')
  const outputPath = join(__dirname, '..', 'public', 'firma-fisica-municipalities.geojson')

  if (!existsSync(firmaPath)) {
    console.error('❌ src/data/firmaFisica.json no encontrado. Corre: npm run fetch-firma-fisica')
    process.exit(1)
  }
  if (!existsSync(inegPath)) {
    console.error('❌ data/municipios-mexico.geojson no encontrado. Corre: npm run fetch-municipios-osm')
    process.exit(1)
  }

  const firma  = JSON.parse(readFileSync(firmaPath, 'utf8'))
  const inegi  = JSON.parse(readFileSync(inegPath, 'utf8'))
  const cpCoords = existsSync(coordsPath)
    ? JSON.parse(readFileSync(coordsPath, 'utf8'))
    : {}

  const hasCoords = Object.keys(cpCoords).length > 0
  console.log(`📂 ${firma.totalMunicipios} municipios con firma física`)
  console.log(`🗺  ${inegi.features.length} municipios en GeoJSON`)
  console.log(`📍 ${Object.keys(cpCoords).length} CPs geocodificados${hasCoords ? '' : ' (corre geocode-cps para activar hulls)'}`)

  // Build coords index: "municipio|||estado" → [[lng,lat], ...]
  const munCoords = {}
  for (const [cp, lngLat] of Object.entries(cpCoords)) {
    const entry = firma.byCp[cp]
    if (!entry) continue
    const key = `${normalize(entry.municipio)}|||${normalize(entry.estado)}`
    if (!munCoords[key]) munCoords[key] = []
    munCoords[key].push(lngLat)
  }

  // Build covered index for OSM matching
  const coveredIndex = {}
  for (const { municipio, estado } of firma.municipalities) {
    const normalized = normalize(municipio)
    const key = MUNICIPIO_ALIASES[normalized] || normalized
    if (!coveredIndex[key]) coveredIndex[key] = []
    coveredIndex[key].push({ municipio, estado, normalizedEstado: normalize(estado) })
  }

  const matched = []
  const matchedKeys = new Set()

  for (const feature of inegi.features) {
    const p = feature.properties
    const nomMun = p.NAME_2 || ''
    const nomEnt = p.NAME_1 || ''
    const normMun = normalize(nomMun)
    const candidates = coveredIndex[normMun]
    if (!candidates) continue

    const match = candidates.find(c => {
      const geoJsonEstado = ESTADO_TO_GEOJSON[c.normalizedEstado]
      return geoJsonEstado === nomEnt
    })

    if (!match) continue

    const key = `${normalize(match.municipio)}|||${match.normalizedEstado}`
    if (matchedKeys.has(key)) continue
    matchedKeys.add(key)

    const normEst = normalize(match.estado)
    const normMunMatch = normalize(match.municipio)
    const requiresReview = normEst === 'mexico' || normEst === 'estado de mexico' || REVISAR_MUNICIPIOS.has(normMunMatch)

    // Try convex hull from CP coordinates, validated against the OSM polygon bounds
    const cpPoints = munCoords[key] || []
    const osmRing = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates[0][0]
    const hullGeom = cpPoints.length >= 3 ? buildHull(cpPoints, osmRing) : null

    matched.push({
      type: 'Feature',
      properties: {
        municipio: match.municipio,
        estado: match.estado,
        firmaFisica: true,
        requiresReview,
        hullBased: hullGeom !== null,
      },
      geometry: hullGeom ?? feature.geometry,
    })
  }

  const unmatched = firma.municipalities.filter(({ municipio, estado }) => {
    const key = `${normalize(municipio)}|||${normalize(estado)}`
    return !matchedKeys.has(key)
  })

  writeFileSync(outputPath, JSON.stringify({ type: 'FeatureCollection', features: matched }))

  const hullCount = matched.filter(f => f.properties.hullBased).length
  const osmCount  = matched.length - hullCount

  console.log(`\n✅ public/firma-fisica-municipalities.geojson generado`)
  console.log(`   ${matched.length} municipios totales`)
  console.log(`   ${hullCount} con convex hull (CP-based) · ${osmCount} con polígono OSM completo`)

  if (unmatched.length > 0) {
    console.warn(`\n⚠️  ${unmatched.length} municipios sin match:`)
    unmatched.forEach(({ municipio, estado }) => console.warn(`   - "${municipio}", ${estado}`))
  }
}

main()
