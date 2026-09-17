// Catálogo de tipos de protección (sub_product en Metabase), con un
// multiplicador de "renta efectiva" para el radar de firma física.
//
// El multiplicador viene de dividir el cost_percent PROMEDIO real de cada
// plan (calculado sobre deals reales, filtrando outliers de captura) entre
// el de M3 (el plan más común, ~35% — usado como línea base). Un plan más
// rentable para MoradaUno "cuenta" como si la renta fuera más grande para
// efectos de qué tan lejos vale la pena mandar a firmar; uno menos rentable
// cuenta como más chica. Redondeado a un decimal para que sea fácil de leer
// y ajustar — no es una tarifa oficial de producto.
//
// Verificado 2026-09-17 contra Metabase (avg cost_percent, cost_percent
// entre 0 y 2 para excluir errores de captura):
export const PROTECTION_PLANS = [
  { id: 4, label: 'M12', avgCostPercent: 0.58, multiplier: 1.7 },
  { id: 2, label: 'M3', avgCostPercent: 0.35, multiplier: 1.0 },
  { id: 3, label: 'M3 Light', avgCostPercent: 0.23, multiplier: 0.7 },
  { id: 17, label: 'M Legal', avgCostPercent: 0.31, multiplier: 0.9 },
  { id: 1, label: 'Seguro de daños', avgCostPercent: 0.35, multiplier: 1.0 },
  { id: 10, label: 'Investigación + Contratos', avgCostPercent: 0.15, multiplier: 0.4 },
  { id: 11, label: 'Investigación + RPP + Contratos', avgCostPercent: 0.09, multiplier: 0.25 },
  { id: 6, label: 'Investigación + RPP', avgCostPercent: 0.08, multiplier: 0.25 },
  { id: 5, label: 'Investigación', avgCostPercent: 0.08, multiplier: 0.2 },
  { id: 18, label: 'Contratos', avgCostPercent: 0.06, multiplier: 0.2 },
]

export function planMultiplier(planId) {
  if (!planId) return 1
  const plan = PROTECTION_PLANS.find(p => p.id === planId)
  return plan?.multiplier ?? 1
}
