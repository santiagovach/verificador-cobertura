// Catálogo de tipos de protección — SOLO los 4 productos vigentes que
// vendemos (Protección MLegal, M3, M6, M12). IDs son los reales de la tabla
// `sub_product` en Metabase (verificado 2026-09-17: DESCRIBE + SELECT sobre
// sub_product), no inventados. Tarifas, mínimos y máximos son los oficiales
// publicados en las tarjetas de producto — no promedios de `agreement.cost_percent`.
//
// - costPercent: % de un mes de renta + IVA (tarifa regular; M6 tiene una
//   promo de lanzamiento al 40% vigente sobre su 45% regular — se usa la
//   tarifa regular como referencia estable).
// - minPayment: pago mínimo mensual (aplica aunque renta × costPercent salga
//   más bajo — ej. MLegal nunca cobra menos de $4,000+IVA aunque la renta
//   sea de $2,000).
// - maxProtectedRent: tope de renta que se protege (arriba de eso, el costo
//   ya no sigue creciendo) — MLegal no tiene tope.
export const PROTECTION_PLANS = [
  { id: 17, label: 'M Legal', costPercent: 0.25, minPayment: 4000, maxProtectedRent: null },
  { id: 2, label: 'M3', costPercent: 0.30, minPayment: 5000, maxProtectedRent: 150000 },
  { id: 34, label: 'M6', costPercent: 0.45, minPayment: 6000, maxProtectedRent: 150000 },
  { id: 4, label: 'M12', costPercent: 0.60, minPayment: 6000, maxProtectedRent: 100000 },
]

// M3 como línea base histórica del radar (30% de un mes de renta).
const BASELINE_COST_PERCENT = 0.30

/**
 * Convierte renta + plan en una "renta efectiva" para el radar, ya
 * considerando el piso (pago mínimo) y el techo (renta máxima protegida)
 * de cada plan — no solo renta x %.
 *
 * 1. Se aplica el techo de renta protegida (si el plan tiene uno).
 * 2. Se calcula el cobro real: max(renta_protegida x %, pago_mínimo).
 * 3. Se vuelve a expresar en "renta equivalente" usando el % de M3, para
 *    que las mismas capas ($25k/$60k) sigan siendo comparables sin
 *    importar qué plan se eligió.
 */
export function effectiveRentForPlan(rentAmount, planId) {
  if (!rentAmount) return 0
  const plan = PROTECTION_PLANS.find(p => p.id === planId)
  if (!plan) return rentAmount // sin plan seleccionado: sin ajuste

  const protectedRent = plan.maxProtectedRent != null
    ? Math.min(rentAmount, plan.maxProtectedRent)
    : rentAmount

  const actualFee = Math.max(protectedRent * plan.costPercent, plan.minPayment)
  return actualFee / BASELINE_COST_PERCENT
}
