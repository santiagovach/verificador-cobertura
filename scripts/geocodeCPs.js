/**
 * Geocodifica los CPs de firmaFisica.json y guarda sus coordenadas en
 * data/firma-fisica-coords.json (que SÍ se commitea al repo).
 *
 * Corre este script localmente cada vez que cambie significativamente
 * la cobertura de firma física (nuevos municipios, cambios de zona).
 *
 * Prerrequisito: npm run fetch-firma-fisica
 * Uso: node --env-file=.env.local scripts/geocodeCPs.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Nominatim: 1 req/segundo máx (política de uso justo de OSM)
const DELAY_MS = 1100

async function geocodeCP(cp) {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${cp}&country=Mexico&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MoradaUno-VerificadorCobertura/1.0 (jorge@moradauno.com)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data?.[0]) return null
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)]
}

async function main() {
  const firmaPath = join(__dirname, '..', 'src', 'data', 'firmaFisica.json')
  if (!existsSync(firmaPath)) {
    console.error('❌ src/data/firmaFisica.json no encontrado.')
    console.error('   Corre primero: npm run fetch-firma-fisica')
    process.exit(1)
  }

  const coordsPath = join(__dirname, '..', 'data', 'firma-fisica-coords.json')
  const firma = JSON.parse(readFileSync(firmaPath, 'utf8'))
  const cps = Object.keys(firma.byCp)

  // Load existing coords to skip already-geocoded CPs
  const existing = existsSync(coordsPath)
    ? JSON.parse(readFileSync(coordsPath, 'utf8'))
    : {}

  const toGeocode = cps.filter(cp => !existing[cp])
  console.log(`📍 ${cps.length} CPs en firmaFisica.json`)
  console.log(`   ${Object.keys(existing).length} ya geocodificados, ${toGeocode.length} pendientes\n`)

  if (toGeocode.length === 0) {
    console.log('✅ Nada que geocodificar.')
    return
  }

  const coords = { ...existing }
  let ok = 0, failed = 0

  for (let i = 0; i < toGeocode.length; i++) {
    const cp = toGeocode[i]
    try {
      const lngLat = await geocodeCP(cp)
      if (lngLat) {
        coords[cp] = lngLat
        ok++
      } else {
        failed++
      }
    } catch {
      failed++
    }
    process.stdout.write(`\r   ${i + 1}/${toGeocode.length} procesados (${ok} ok, ${failed} fallidos)...`)
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\n\n✅ Geocodificación completa: ${ok} ok, ${failed} fallidos`)
  writeFileSync(coordsPath, JSON.stringify(coords, null, 2))
  console.log(`   data/firma-fisica-coords.json guardado (${Object.keys(coords).length} CPs)`)
  console.log(`\nSiguiente paso:`)
  console.log(`   npm run filter-firma-fisica`)
}

main().catch(e => {
  console.error('❌ Error:', e.message)
  process.exit(1)
})
