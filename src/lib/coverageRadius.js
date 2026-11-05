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
// Con cobro de traslado, firma física con costo solo hasta esta distancia del punto más cercano: más
// lejos (p. ej. Monterrey, a cientos de km del abogado más cercano) se queda en firma electrónica.
export const MAX_PAID_TRAVEL_KM = 50

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
    nearestPoint: { id: nearest.point.id, nombre: nearest.point.nombre, tipo: nearest.point.tipo },
    isPIC: economics.isPIC ?? false,
    uberEstimate: coverage.uber,
    netRevenue: coverage.net,
    travelCharge: travelChargeFor(coverage),
  }
}

// QRO (Zion, 2026-11-02): la firma presencial depende solo de su zona delimitada, sin costo
// dentro y electrónica fuera — no aplican capas ni revenue. Ver src/lib/qroZones.js.
export function applyQroSigningZone(radar, inSigningZone) {
  if (!radar) return radar
  return { ...radar, covered: inSigningZone, tier: null, qroSigningZone: inSigningZone, travelCharge: inSigningZone ? 0 : radar.uberEstimate }
}
