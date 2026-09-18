/**
 * Geocodifica los centroides de los municipios con cobertura de Protección
 * (coverage.json) — usado para medir qué tan lejos está una dirección SIN
 * cobertura del área de cobertura más cercana (mensaje "cerca" vs "lejos"
 * en el bullet 1 del resultado). Aproximación: centroide del municipio,
 * no el borde real del polígono — suficiente para un mensaje de tono, no
 * es un umbral financiero como las capas de firma física.
 *
 * Uso: node scripts/geocodeCoverageMunicipalities.js
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DELAY_MS = 1100

async function geocodeQuery(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MoradaUno-VerificadorCobertura/1.0 (jorge@moradauno.com)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data?.[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

async function main() {
  const coveragePath = join(__dirname, '..', 'src', 'data', 'coverage.json')
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'))
  const municipalities = coverage.municipalities

  const outPath = join(__dirname, '..', 'src', 'data', 'coverageMunicipalityCentroids.json')
  const existing = (() => {
    try { return JSON.parse(readFileSync(outPath, 'utf8')).points } catch { return [] }
  })()
  const existingKeys = new Set(existing.map(p => `${p.municipio}|||${p.estado}`))

  const results = [...existing]
  for (const { municipio, estado } of municipalities) {
    const key = `${municipio}|||${estado}`
    if (existingKeys.has(key)) continue

    process.stdout.write(`Geocodificando ${municipio}, ${estado}... `)
    try {
      const geo = await geocodeQuery(`${municipio}, ${estado}, México`)
      if (!geo) {
        console.log('❌ sin resultado')
        results.push({ municipio, estado, lat: null, lng: null })
      } else {
        console.log(`✅ ${geo.lat}, ${geo.lng}`)
        results.push({ municipio, estado, lat: geo.lat, lng: geo.lng })
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`)
      results.push({ municipio, estado, lat: null, lng: null })
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  writeFileSync(outPath, JSON.stringify({ lastUpdated: new Date().toISOString(), points: results }, null, 2))
  console.log(`\n📝 Escrito en ${outPath} (${results.length} municipios)`)
}

main()
