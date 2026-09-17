// Catálogo de tipos de protección — SOLO los 4 productos vigentes que
// vendemos (Protección MLegal, M3, M6, M12). IDs son los reales de la tabla
// `sub_product` en Metabase (verificado 2026-09-17: DESCRIBE + SELECT sobre
// sub_product), no inventados.
//
// El costo (% de un mes de renta + IVA) es la tarifa OFICIAL publicada
// (tarjetas de producto), no un promedio calculado sobre deals — a
// diferencia del cost_percent real en `agreement`, que varía deal a deal
// por promociones/excepciones. M6 tiene una promo de lanzamiento (40%)
// vigente sobre su tarifa regular (45%); se usa la tarifa regular como
// referencia estable ya que la promo es temporal.
//
// El multiplicador de "renta efectiva" para el radar sale de dividir el
// costo de cada plan entre el de M3 (30%, línea base histórica).
export const PROTECTION_PLANS = [
  { id: 17, label: 'M Legal', costPercent: 0.25, multiplier: 0.8 },
  { id: 2, label: 'M3', costPercent: 0.30, multiplier: 1.0 },
  { id: 34, label: 'M6', costPercent: 0.45, multiplier: 1.5 },
  { id: 4, label: 'M12', costPercent: 0.60, multiplier: 2.0 },
]

export function planMultiplier(planId) {
  if (!planId) return 1
  const plan = PROTECTION_PLANS.find(p => p.id === planId)
  return plan?.multiplier ?? 1
}
