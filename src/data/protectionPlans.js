// Catálogo de tipos de protección — SOLO los 4 productos vigentes que
// vendemos (MLegal, M3, M6, M12). IDs reales de `sub_product` en Metabase.
// Tarifas/mínimos/topes vienen de `sub_product_variation` (verificado
// 2026-09-17 contra Metabase — join sub_product_variation + sub_product +
// office), NO de la tarjeta de producto ni de promedios de agreement.cost_percent.
//
// `sub_product_variation` es real: varía por office_id (plaza) Y por
// `type` (Residencial/Comercial/Industrial/All). Hallazgos:
// - rent_percent y rent_max_value son iguales en las 5 plazas para cada
//   plan — solo el MÍNIMO (`revenue_min`) varía por plaza.
// - M6 y M12 SOLO existen como "Residencial" (o "All") — no hay tarifa
//   Comercial/Industrial para ellos; si se elige otro tipo de inmueble,
//   se usa la misma tarifa Residencial (no hay otra en el sistema).
// - M3 sí cambia fuerte por tipo: 30% Residencial vs 50% Comercial (min
//   $5,000 vs $7,500). MLegal es 25% en los 3 tipos, solo cambia el mínimo.
// - MLegal SÍ tiene tope de $150,000 en la base de datos, aunque la
//   tarjeta de producto dice "no aplica monto máximo" — Santiago confirmó
//   usar el dato real de la base (150,000), no la tarjeta.
export const PROTECTION_PLANS = [
  {
    id: 17,
    label: 'M Legal',
    ratesByType: { Residencial: 0.25, Comercial: 0.25, Industrial: 0.25 },
    maxProtectedRent: 150000,
    minByPlaza: {
      CDMX: { Residencial: 4000, Comercial: 5000, Industrial: 5000 },
      Guadalajara: { Residencial: 3750, Comercial: 3750, Industrial: 3750 },
      Querétaro: { Residencial: 4000, Comercial: 5000, Industrial: 5000 },
      Puebla: { Residencial: 4000, Comercial: 5000, Industrial: 5000 },
      Tijuana: { Residencial: 4000, Comercial: 5000, Industrial: 5000 },
    },
  },
  {
    id: 2,
    label: 'M3',
    ratesByType: { Residencial: 0.30, Comercial: 0.50, Industrial: 0.50 },
    maxProtectedRent: 150000,
    minByPlaza: {
      CDMX: { Residencial: 5000, Comercial: 7500, Industrial: 7500 },
      Guadalajara: { Residencial: 3750, Comercial: 7500, Industrial: 7500 },
      Querétaro: { Residencial: 4000, Comercial: 7500, Industrial: 7500 },
      Puebla: { Residencial: 4000, Comercial: 7500, Industrial: 7500 },
      Tijuana: { Residencial: 5000, Comercial: 7500, Industrial: 7500 },
    },
  },
  {
    id: 34,
    label: 'M6',
    ratesByType: { Residencial: 0.45, Comercial: 0.45, Industrial: 0.45 },
    maxProtectedRent: 150000,
    flatMinPayment: 6000, // uniforme en las 5 plazas, solo existe "Residencial"
  },
  {
    id: 4,
    label: 'M12',
    ratesByType: { Residencial: 0.60, Comercial: 0.60, Industrial: 0.60 },
    maxProtectedRent: 100000,
    flatMinPayment: 6000, // uniforme en las 5 plazas, solo existe "Residencial"
  },
]

export const PROPERTY_TYPES = ['Residencial', 'Comercial', 'Industrial']

const DEFAULT_PLAZA = 'CDMX'
const DEFAULT_PROPERTY_TYPE = 'Residencial'

// M3 Residencial (30%) como línea base histórica del radar.
const BASELINE_COST_PERCENT = 0.30

function resolveMinPayment(plan, plaza, propertyType) {
  if (plan.flatMinPayment != null) return plan.flatMinPayment
  const plazaTable = plan.minByPlaza[plaza] || plan.minByPlaza[DEFAULT_PLAZA]
  return plazaTable[propertyType] ?? plazaTable[DEFAULT_PROPERTY_TYPE]
}

/**
 * Cobro mensual real (revenue) que le deja a MoradaUno esa renta bajo ese
 * plan — ya con el piso (pago mínimo) y el techo (renta máxima protegida)
 * reales de la plaza + tipo de inmueble. Este es el número en pesos, no
 * normalizado — para eso ver `effectiveRentForPlan`.
 *
 * @param {number} rentAmount
 * @param {number} planId
 * @param {{plaza?: string, propertyType?: 'Residencial'|'Comercial'|'Industrial'}} ctx
 */
export function actualFeeForPlan(rentAmount, planId, { plaza, propertyType } = {}) {
  if (!rentAmount) return 0
  const plan = PROTECTION_PLANS.find(p => p.id === planId)
  if (!plan) return null // sin plan seleccionado: no hay cobro que calcular

  const type = propertyType || DEFAULT_PROPERTY_TYPE
  const rentPercent = plan.ratesByType[type] ?? plan.ratesByType[DEFAULT_PROPERTY_TYPE]
  const protectedRent = plan.maxProtectedRent != null
    ? Math.min(rentAmount, plan.maxProtectedRent)
    : rentAmount
  const minPayment = resolveMinPayment(plan, plaza || DEFAULT_PLAZA, type)
  return Math.max(protectedRent * rentPercent, minPayment)
}

/**
 * Convierte renta + plan + plaza + tipo de inmueble en una "renta efectiva"
 * para el radar — el cobro real (`actualFeeForPlan`) reexpresado sobre la
 * tarifa de M3 (30%) para seguir siendo comparable contra las mismas capas.
 * Sin plan seleccionado, regresa la renta tal cual (sin ajuste).
 */
export function effectiveRentForPlan(rentAmount, planId, ctx = {}) {
  if (!rentAmount) return 0
  const fee = actualFeeForPlan(rentAmount, planId, ctx)
  return fee == null ? rentAmount : fee / BASELINE_COST_PERCENT
}
