import coverageCentroidsData from '../data/coverageMunicipalityCentroids.json'
import { haversineDistanceKm } from './coverageRadius.js'

const centroids = coverageCentroidsData.points.filter(p => p.lat != null && p.lng != null)

/**
 * Distancia (km) de un punto a la zona de cobertura de Protección más
 * cercana — aproximada con el centroide del municipio, no el borde real
 * del polígono. Se usa solo para tono del mensaje (cerca/lejos), no es un
 * umbral financiero como las capas de firma física.
 */
export function distanceToNearestCoverage(latlng) {
  if (latlng?.lat == null || latlng?.lng == null || centroids.length === 0) return null
  let min = Infinity
  for (const c of centroids) {
    const d = haversineDistanceKm(latlng, c)
    if (d < min) min = d
  }
  return Math.round(min * 10) / 10
}
