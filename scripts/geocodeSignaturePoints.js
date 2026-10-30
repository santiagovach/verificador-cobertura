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

const POINTS = [
  {
    id: 'abogado-mancera',
    nombre: 'Francisco Javier Mancera Rodríguez',
    tipo: 'abogado',
    direccion: 'Cordilleras 49, Dep 103, Infonavit Iztacalco, Iztacalco, C.P. 09800, CDMX',
    variantes: [
      'Cordilleras 49, Infonavit Iztacalco, Iztacalco, Ciudad de México',
      'Infonavit Iztacalco, Iztacalco, Ciudad de México, México',
      '09800, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-silva',
    nombre: 'Alitzel Angelica Silva Ordaz',
    tipo: 'abogado',
    direccion: 'Retorno 1 de sur 12c n. 6 interior 3, Col. Agrícola Oriental, C.P 08500, Alcaldía Iztacalco',
    variantes: [
      'Retorno 1 Sur 12C, Agrícola Oriental, Iztacalco, Ciudad de México',
      'Agrícola Oriental, Iztacalco, Ciudad de México, México',
      '08500, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-lopez',
    nombre: 'Luis López',
    tipo: 'abogado',
    direccion: 'Calle 21, manzana 34, lote 13, Olivar del Conde, Primera Sección, Alvaro Obregón, Ciudad de México',
    variantes: [
      'Calle 21, Olivar del Conde 1a Sección, Álvaro Obregón, Ciudad de México',
      'Olivar del Conde 1a Sección, Álvaro Obregón, Ciudad de México, México',
      'Olivar del Conde, Álvaro Obregón, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-cruz-alexandro',
    nombre: 'Alexandro Cruz',
    tipo: 'abogado',
    direccion: 'Calle Alzea, manzana 16, lote 7, Colonia Buenavista, Iztapalapa, Ciudad de México',
    variantes: [
      'Calle Alzea, Buenavista, Iztapalapa, Ciudad de México',
      'Buenavista, Iztapalapa, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-galvan',
    nombre: 'Angelica Galván',
    tipo: 'abogado',
    direccion: 'Calle Coronas 1982, Colonia Aquiles de Serdán 15430, Venustiano Carranza, Ciudad de México',
    variantes: [
      'Calle Coronas 1982, Aquiles Serdán, Venustiano Carranza, Ciudad de México',
      'Aquiles Serdán, Venustiano Carranza, Ciudad de México, México',
      '15430, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-figueroa',
    nombre: 'César Figueroa',
    tipo: 'abogado',
    direccion: 'calle Agustín Lara manzana 132 lote 19, Emiliano Zapata',
    variantes: [
      'Colonia Emiliano Zapata, Ciudad de México, México',
      'Emiliano Zapata, México',
    ],
  },
  {
    id: 'abogado-trejo',
    nombre: 'Gabriela Trejo',
    tipo: 'abogado',
    direccion: 'Bahía de ballenas 28 Int. 14, Verónica Anzures, Cdmx, Código postal 11300, Miguel Hidalgo',
    variantes: [
      'Bahía de Ballenas 28, Verónica Anzures, Miguel Hidalgo, Ciudad de México',
      'Verónica Anzures, Miguel Hidalgo, Ciudad de México, México',
    ],
  },
  {
    id: 'abogado-cruz-amairani',
    nombre: 'Amairani Cruz',
    tipo: 'abogado',
    direccion: 'Flor silvestre 212, Col. Benito Juárez, Cd. Nezahualcóyotl, Edo. Méx.',
    variantes: [
      'Flor Silvestre 212, Benito Juárez, Nezahualcóyotl, Estado de México',
      'Colonia Benito Juárez, Nezahualcóyotl, Estado de México, México',
      'Nezahualcóyotl, Estado de México, México',
    ],
  },
  {
    id: 'abogado-gonzalez',
    nombre: 'Rebeca González',
    tipo: 'abogado',
    direccion: 'Calle Nahuataclas 12, Ajusco, Coyoacán, C.P. 04300, Ciudad de México',
    variantes: [
      'Calle Nahuatlaca 12, Ajusco, Coyoacán, Ciudad de México',
      'Ajusco, Coyoacán, Ciudad de México, México',
      '04300, Ciudad de México, México',
    ],
  },
  {
    id: 'oficina-cdmx',
    nombre: 'MoradaUno Oficina CDMX',
    tipo: 'oficina',
    direccion: 'Av. Insurgentes Sur 552, Roma Norte, Cuauhtémoc, 06760, Ciudad de México',
    variantes: [],
  },
  {
    id: 'oficina-gdl',
    nombre: 'MoradaUno Oficina Gdl',
    tipo: 'oficina',
    direccion: 'Avenida Adolfo López Mateos Sur, 1480-PH N-B, Piso 7, Chapalita, 45040 Guadalajara, Jalisco',
    variantes: [
      'Avenida Adolfo López Mateos Sur 1480, Chapalita, Guadalajara, Jalisco',
      'Chapalita, Guadalajara, Jalisco, México',
      '45040, Guadalajara, Jalisco, México',
    ],
  },
  {
    id: 'oficina-qro',
    nombre: 'MoradaUno Oficina QRO',
    tipo: 'oficina',
    // Uber de firmas solo dentro de la ciudad de Querétaro (Zion, 2026-10-28)
    soloMunicipio: { municipio: 'Querétaro', estado: 'Querétaro' },
    direccion: 'Avenida Camino Real de Carretas Numero 104, Oficina 503, Colonia Milenio III, C.P. 76060 Querétaro, Qro',
    variantes: [
      'Camino Real de Carretas 104, Milenio III, Querétaro',
      'Milenio III, Querétaro, México',
      '76060, Querétaro, México',
    ],
  },
  {
    id: 'oficina-tijuana',
    nombre: 'MoradaUno Oficina Tijuana',
    tipo: 'oficina',
    direccion: 'PROL PASEO DE LOS HEROES, Calz. Escolar 5A, Agua Caliente, 22014 Tijuana, B.C.',
    variantes: [
      'Paseo de los Héroes, Agua Caliente, Tijuana, Baja California',
      'Agua Caliente, Tijuana, Baja California, México',
    ],
  },
  // Abogados de firma GDL (Josh, 2026-10-28)
  {
    id: 'abogado-orozco',
    nombre: 'Joseph Haydn Orozco Vega (GDL)',
    tipo: 'abogado',
    direccion: 'Reforma 1063, Colonia Santa Teresita, C.P. 44600, Guadalajara, Jalisco',
    variantes: [
      'Avenida Reforma 1063, Santa Teresita, Guadalajara, Jalisco',
      'Santa Teresita, Guadalajara, Jalisco, México',
      '44600, Guadalajara, Jalisco, México',
    ],
  },
  {
    id: 'abogado-diego-gdl',
    nombre: 'Diego (GDL)',
    tipo: 'abogado',
    direccion: 'Campo Castillo 1045, Colonia Campo Real, C.P. 45134, Zapopan, Jalisco',
    variantes: [
      'Campo Castillo 1045, Campo Real, Zapopan, Jalisco',
      'Campo Real, Zapopan, Jalisco, México',
      '45134, Zapopan, Jalisco, México',
    ],
  },
  {
    id: 'abogado-max-gdl',
    nombre: 'Max (GDL)',
    tipo: 'abogado',
    direccion: 'Rinconada del Olmo 2518, Colonia Jardines del Valle, C.P. 45138, Zapopan, Jalisco',
    variantes: [
      'Rinconada del Olmo 2518, Jardines del Valle, Zapopan, Jalisco',
      'Jardines del Valle, Zapopan, Jalisco, México',
      '45138, Zapopan, Jalisco, México',
    ],
  },
  {
    id: 'abogado-alex-gdl',
    nombre: 'Alex (GDL)',
    tipo: 'abogado',
    direccion: 'Calle Alejandrina 3248, Colonia Victoria, C.P. 45088, Zapopan, Jalisco',
    variantes: [
      'Alejandrina 3248, Victoria, Zapopan, Jalisco',
      'Colonia Victoria, Zapopan, Jalisco, México',
      '45088, Zapopan, Jalisco, México',
    ],
  },
  {
    id: 'abogado-emily-gdl',
    nombre: 'Emily (GDL)',
    tipo: 'abogado',
    direccion: 'Camino a las Moras 601, interior 162, San Agustín, C.P. 45145, Tlajomulco de Zúñiga, Jalisco',
    variantes: [
      'Camino a las Moras 601, San Agustín, Tlajomulco de Zúñiga, Jalisco',
      'San Agustín, Tlajomulco de Zúñiga, Jalisco, México',
      '45145, Tlajomulco de Zúñiga, Jalisco, México',
    ],
  },
  // QRO: los abogados viven fuera de la zona y llegan en camión; salen a firmas desde la
  // Central de Autobuses o la oficina (Zion, 2026-10-28). Uber de firmas solo dentro de Querétaro.
  {
    id: 'salida-qro-central',
    nombre: 'Abogados QRO · Central de Autobuses (punto de salida)',
    tipo: 'abogado',
    // Uber de firmas solo dentro de la ciudad de Querétaro (Zion, 2026-10-28)
    soloMunicipio: { municipio: 'Querétaro', estado: 'Querétaro' },
    direccion: 'Prolongación Luis Vega y Monroy 800, Colonia Ex-Hacienda Carretas, C.P. 76079, Santiago de Querétaro, Qro',
    variantes: [
      'Terminal de Autobuses de Querétaro, Prolongación Luis Vega y Monroy 800, Querétaro',
      'Prolongación Luis Vega y Monroy 800, Querétaro',
      '76079, Querétaro, México',
    ],
  },
]

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

  writeFileSync(outPath, JSON.stringify({ lastUpdated: new Date().toISOString(), points: results }, null, 2))
  console.log(`\n📝 Escrito en ${outPath}`)
}

main()
