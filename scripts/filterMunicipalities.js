/**
 * One-time setup script: filtra el GeoJSON de municipios de INEGI
 * para incluir solo los municipios con cobertura MoradaUno.
 *
 * El resultado (public/coverage-municipalities.geojson) SÍ se commitea al repo.
 * Solo hay que volver a correr este script cuando cambien los municipios de cobertura.
 *
 * ANTES DE CORRER:
 * 1. Descarga el Marco Geoestadístico Nacional de INEGI:
 *    https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=889463807469
 *    (Descarga "Conjunto de datos vectoriales" → formato shapefile)
 *    Convierte a GeoJSON con: ogr2ogr -f GeoJSON municipios.geojson *.shp
 *    O descarga directamente el GeoJSON de:
 *    https://raw.githubusercontent.com/PhantomInsights/mexican-municipalities/main/mexico.geojson
 *
 * 2. Guarda el archivo como: data/municipios-mexico.geojson
 *
 * 3. Asegúrate de haber corrido primero: npm run fetch-coverage
 *
 * 4. Corre: npm run filter-municipalities
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

// Mapeo de nombres de estado del Sheet → nombre exacto en este GeoJSON (NAME_1)
// GeoJSON usa "Distrito Federal" para CDMX y "México" para Estado de México
const ESTADO_TO_GEOJSON = {
  'ciudad de mexico': 'Distrito Federal',
  'cdmx': 'Distrito Federal',
  'mexico': 'México',
  'estado de mexico': 'México',
  'nuevo leon': 'Nuevo León',
  'jalisco': 'Jalisco',
  'puebla': 'Puebla',
  'baja california': 'Baja California',
  'queretaro': 'Querétaro',
  'guanajuato': 'Guanajuato',
  'morelos': 'Morelos',
}

function main() {
  const coveragePath = join(__dirname, '..', 'src', 'data', 'coverage.json')
  const inegPath = join(__dirname, '..', 'data', 'municipios-mexico.geojson')
  const outputPath = join(__dirname, '..', 'public', 'coverage-municipalities.geojson')

  if (!existsSync(coveragePath)) {
    console.error('❌ src/data/coverage.json no encontrado.')
    console.error('   Corre primero: npm run fetch-coverage')
    process.exit(1)
  }

  if (!existsSync(inegPath)) {
    console.error('❌ data/municipios-mexico.geojson no encontrado.')
    console.error('   Descárgalo y guárdalo como data/municipios-mexico.geojson')
    console.error('   Ver instrucciones al inicio de este script.')
    process.exit(1)
  }

  console.log('📂 Cargando coverage.json...')
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'))

  console.log('🗺  Cargando municipios-mexico.geojson...')
  const inegi = JSON.parse(readFileSync(inegPath, 'utf8'))
  console.log(`   ${inegi.features.length} municipios en INEGI`)
  console.log(`   ${coverage.municipalities.length} municipios con cobertura en Sheet`)

  // Aliases: nombre en el Sheet → nombre en el GeoJSON
  const MUNICIPIO_ALIASES = {
    'la magdalena contreras': 'magdalena contreras',
    'tlalnepantla de baz': 'tlalnepantla',
    'el carmen': 'carmen',
    'san pedro tlaquepaque': 'tlaquepaque',
  }

  // Index de municipios cubiertos: normalizedMun → { municipio, estado }
  const coveredIndex = {}
  for (const { municipio, estado } of coverage.municipalities) {
    const normalized = normalize(municipio)
    const key = MUNICIPIO_ALIASES[normalized] || normalized
    if (!coveredIndex[key]) coveredIndex[key] = []
    coveredIndex[key].push({ municipio, estado, normalizedEstado: normalize(estado) })
  }

  const matched = []
  const matchedKeys = new Set()

  for (const feature of inegi.features) {
    const p = feature.properties
    // Este GeoJSON usa NAME_1 (estado) y NAME_2 (municipio)
    const nomMun = p.NAME_2 || ''
    const nomEnt = p.NAME_1 || ''

    const normMun = normalize(nomMun)
    const candidates = coveredIndex[normMun]
    if (!candidates) continue

    // Match por estado usando el mapeo Sheet → GeoJSON
    const match = candidates.find(c => {
      const geoJsonEstado = ESTADO_TO_GEOJSON[c.normalizedEstado]
      return geoJsonEstado === nomEnt
    })

    if (match) {
      // Key usa el nombre original del Sheet (no el alias) para que el reporte sea correcto
      const key = `${normalize(match.municipio)}|||${match.normalizedEstado}`
      if (matchedKeys.has(key)) continue
      matchedKeys.add(key)

      matched.push({
        ...feature,
        properties: {
          municipio: match.municipio,
          estado: match.estado,
          cobertura: true,
        },
      })
    }
  }

  // Reporte de municipios sin match
  const unmatched = coverage.municipalities.filter(({ municipio, estado }) => {
    const key = `${normalize(municipio)}|||${normalize(estado)}`
    return !matchedKeys.has(key)
  })

  const result = { type: 'FeatureCollection', features: matched }
  writeFileSync(outputPath, JSON.stringify(result))

  console.log(`\n✅ public/coverage-municipalities.geojson generado`)
  console.log(`   ${matched.length} municipios con polígono`)

  if (unmatched.length > 0) {
    console.warn(`\n⚠️  ${unmatched.length} municipios sin match en INEGI (revisar manualmente):`)
    unmatched.forEach(({ municipio, estado }) =>
      console.warn(`   - "${municipio}", ${estado}`)
    )
    console.warn('\n   Pueden ser diferencias de nombre entre el Sheet e INEGI.')
    console.warn('   Agrega aliases en ESTADO_VARIANTS o corrige el Sheet.')
  }
}

main()
