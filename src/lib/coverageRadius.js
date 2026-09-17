import signaturePointsData from '../data/signaturePoints.json'

const EARTH_RADIUS_KM = 6371

export function haversineDistanceKm(a, b) {
  const toRad = deg => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

const signaturePoints = signaturePointsData.points.filter(p => p.lat != null && p.lng != null)

export function nearestSignaturePoint(latlng) {
  let nearest = null
  let minDist = Infinity
  for (const point of signaturePoints) {
    const dist = haversineDistanceKm(latlng, point)
    if (dist < minDist) {
      minDist = dist
      nearest = point
    }
  }
  if (!nearest) return null
  return { point: nearest, distanceKm: minDist }
}

// Capas de radio confirmadas con Santiago (2026-09-15):
// 0-6km: siempre cubierto
// 6-15km: cubierto si renta >= $25,000/mes o propietario PIC
// 15-25km: cubierto si renta >= $60,000/mes, o (PIC y renta >= $25,000)
// >25km: no cubierto, sin excepción
export function resolveRadarCoverage({ distanceKm, rentAmount, isPIC }) {
  const renta = rentAmount ?? 0

  if (distanceKm <= 6) return { covered: true, tier: 0 }
  if (distanceKm <= 15) return { covered: renta >= 25000 || isPIC === true, tier: 1 }
  if (distanceKm <= 25) return { covered: renta >= 60000 || (isPIC === true && renta >= 25000), tier: 2 }
  return { covered: false, tier: null }
}

/**
 * @param {{lat:number,lng:number}} latlng dirección buscada, ya geocodificada
 * @param {{rentAmount?:number, isPIC?:boolean}} economics datos del deal/propietario (lookup automático u override manual)
 */
export function checkSignatureRadar(latlng, economics = {}) {
  if (latlng?.lat == null || latlng?.lng == null) return null
  const nearest = nearestSignaturePoint(latlng)
  if (!nearest) return null

  const distanceKm = Math.round(nearest.distanceKm * 10) / 10
  const { covered, tier } = resolveRadarCoverage({ distanceKm, ...economics })

  return {
    covered,
    tier,
    distanceKm,
    nearestPoint: { id: nearest.point.id, nombre: nearest.point.nombre, tipo: nearest.point.tipo },
    effectiveRent: economics.rentAmount ?? null,
    isPIC: economics.isPIC ?? false,
  }
}
