import signaturePointsData from '../data/signaturePoints.json'
import { estimateUberFareRoundTrip } from './uberFareEstimate.js'

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

// Cobrar el traslado fuera de la capa gratis. APAGADO hasta que GTM lo confirme: mientras tanto,
// fuera de la capa se ofrece firma electrónica y `travelCharge` solo se calcula.
export const CHARGE_TRAVEL = false

// Capas por distancia al punto más cercano, medidas en REVENUE NETO = lo que cobramos (antes de IVA)
// menos el Uber ida y vuelta del abogado (Santiago, 2026-10-30): el viaje nunca se come el mínimo,
// y el umbral sube con la distancia porque el Uber sube. Los montos son los de las capas originales
// en renta (2026-09-15) expresados como cobro de M3 Residencial (30%): $25,000 → $7,500, $60,000 → $18,000.
// 0-6 km: siempre gratis
// 6-15 km: gratis si neto >= $7,500 o propietario PIC
// 15-25 km: gratis si neto >= $18,000, o (PIC y neto >= $7,500)
// >25 km: sin capa gratis
export const TIER1_NET_REVENUE = 7500
export const TIER2_NET_REVENUE = 18000

export function resolveRadarCoverage({ distanceKm, revenue, isPIC }) {
  const uber = estimateUberFareRoundTrip(distanceKm)
  const net = (revenue ?? 0) - uber
  const pic = isPIC === true

  if (distanceKm <= 6) return { covered: true, tier: 0, uber, net, bar: 0 }
  if (distanceKm <= 15) return { covered: net >= TIER1_NET_REVENUE || pic, tier: 1, uber, net, bar: TIER1_NET_REVENUE }
  if (distanceKm <= 25) {
    const bar = pic ? TIER1_NET_REVENUE : TIER2_NET_REVENUE
    return { covered: net >= bar, tier: 2, uber, net, bar }
  }
  return { covered: false, tier: null, uber, net, bar: null }
}

// Lo que pagaría el cliente si se cobra el traslado: solo lo que falta para que nuestro neto llegue al
// umbral de su capa, nunca más que el Uber completo. Más allá de 25 km, el Uber completo.
function travelChargeFor({ covered, uber, net, bar }) {
  if (covered) return 0
  if (bar == null) return uber
  return Math.min(uber, Math.max(0, Math.ceil(bar - net)))
}

/**
 * @param {{lat:number,lng:number}} latlng dirección buscada, ya geocodificada
 * @param {{revenue?:number, isPIC?:boolean}} economics cobro de la operación antes de IVA y PIC
 */
export function checkSignatureRadar(latlng, economics = {}) {
  if (latlng?.lat == null || latlng?.lng == null) return null
  const nearest = nearestSignaturePoint(latlng)
  if (!nearest) return null

  const distanceKm = Math.round(nearest.distanceKm * 10) / 10
  const coverage = resolveRadarCoverage({ distanceKm, ...economics })

  return {
    covered: coverage.covered,
    tier: coverage.tier,
    distanceKm,
    nearestPoint: { id: nearest.point.id, nombre: nearest.point.nombre, tipo: nearest.point.tipo, soloMunicipio: nearest.point.soloMunicipio ?? null },
    isPIC: economics.isPIC ?? false,
    uberEstimate: coverage.uber,
    netRevenue: coverage.net,
    travelCharge: travelChargeFor(coverage),
  }
}

// Puntos con 'soloMunicipio' (QRO): el Uber de firmas solo se cubre dentro de ese municipio
// (Zion, 2026-10-28), así que fuera de él no hay firma física gratis aunque esté a pocos km.
// insideZone viene de pointInMunicipality: false = fuera; null (sin polígono) = se confía en la distancia.
export function restrictToZone(radar, insideZone) {
  if (!radar?.covered || insideZone !== false) return radar
  return markNotCovered(radar, { outsideZone: radar.nearestPoint.soloMunicipio.municipio })
}

// Sin cobertura de Protección no hay firma física gratis aunque haya un abogado cerca: el resultado
// ofrece firma electrónica, igual que la línea de Protección (Santiago, 2026-10-30).
export function requireProtectionCoverage(radar) {
  if (!radar?.covered) return radar
  return markNotCovered(radar, { withoutProtection: true })
}

// Fuera de la zona (QRO) o sin Protección no hay capa gratis: si se cobra, es el Uber completo.
function markNotCovered(radar, extra) {
  return { ...radar, covered: false, tier: null, travelCharge: radar.uberEstimate, ...extra }
}
