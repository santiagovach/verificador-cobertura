// Estimación APROXIMADA de tarifa de Uber — no es una cotización real.
// El API de precios de Uber (GET /v1.2/estimates/price) existe pero requiere
// aprobación de Uber Business Development, y usarlo para mostrarle un precio
// al cliente violaría sus términos de uso (§ II B, comparación de precios con
// terceros). Por eso esto es una fórmula con tarifas públicas conocidas de
// CDMX (verificadas 2026-09-18), aplicada igual a las 5 plazas — no hay datos
// confiables de tarifa por plaza para GDL/Querétaro/Puebla/Tijuana.
//
// Tarifa base $7 + $1.80/min + $3.57/km, mínimo $35 — un viaje de 10km en
// CDMX cuesta ~$88 según fuentes públicas, consistente con esta fórmula.
const BASE_FARE = 7
const PER_MINUTE = 1.80
const PER_KM = 3.57
const MINIMUM_FARE = 35

// Velocidad promedio urbana asumida para convertir distancia a minutos —
// no tenemos tiempo de viaje real, solo distancia en línea recta (haversine).
const AVG_SPEED_KMH = 25

/**
 * Estima el costo (ida y vuelta, redondeado a pesos) de mandar a un abogado
 * a firmar fuera del radio gratuito. Round-trip porque el abogado tiene que
 * regresar — confirmado con Santiago 2026-09-18.
 */
export function estimateUberFareRoundTrip(distanceKm) {
  if (distanceKm == null || distanceKm < 0) return null
  const minutes = (distanceKm / AVG_SPEED_KMH) * 60
  const oneWay = Math.max(MINIMUM_FARE, BASE_FARE + PER_MINUTE * minutes + PER_KM * distanceKm)
  return Math.round(oneWay * 2)
}
