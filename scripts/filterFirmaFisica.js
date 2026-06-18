/**
 * Genera public/firma-fisica-municipalities.geojson usando los polígonos
 * OSM completos por municipio. El resultado SÍ se commitea al repo.
 *
 * Corre localmente después de fetch-firma-fisica (y fetch-municipios-osm
 * si los polígonos necesitan actualizarse).
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

function main() {
  const firmaPath  = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  const inegPath   = join(__dirname, '..', 'data', 'municipios-mexico.geojson')
  const outputPath = join(__dirname, '..', 'public', 'firma-fisica-municipalities.geojson')

  if (!existsSync(firmaPath)) {
    console.error('❌ src/data/firmaFisica.json no encontrado. Corre: npm run fetch-firma-fisica')
    process.exit(1)
  }
  if (!existsSync(inegPath)) {
    console.error('❌ data/municipios-mexico.geojson no encontrado. Corre: npm run fetch-municipios-osm')
    process.exit(1)
  }

  const firma = JSON.parse(readFileSync(firmaPath, 'utf8'))
  const inegi = JSON.parse(readFileSync(inegPath, 'utf8'))

  console.log(`📂 ${firma.totalMunicipios} municipios con firma física`)
  console.log(`🗺  ${inegi.features.length} municipios en GeoJSON`)

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
    const requiresReview =
      normEst === 'mexico' || normEst === 'estado de mexico' ||
      REVISAR_MUNICIPIOS.has(normMunMatch)

    matched.push({
      type: 'Feature',
      properties: { municipio: match.municipio, estado: match.estado, firmaFisica: true, requiresReview },
      geometry: feature.geometry,
    })
  }

  const unmatched = firma.municipalities.filter(({ municipio, estado }) => {
    const key = `${normalize(municipio)}|||${normalize(estado)}`
    return !matchedKeys.has(key)
  })

  writeFileSync(outputPath, JSON.stringify({ type: 'FeatureCollection', features: matched }))

  console.log(`\n✅ public/firma-fisica-municipalities.geojson generado`)
  console.log(`   ${matched.length} municipios con polígono OSM`)

  if (unmatched.length > 0) {
    console.warn(`\n⚠️  ${unmatched.length} municipios sin match:`)
    unmatched.forEach(({ municipio, estado }) => console.warn(`   - "${municipio}", ${estado}`))
  }
}

main()
