import { PROTECTION_PLANS } from '../data/protectionPlans.js'

export default function ResultBanner({ result }) {
  if (!result) return null

  const { hasCoverage, firmaFisicaRadar, cp, municipio, estado, error } = result

  const TIER_LABELS = { 0: 'Garantizada (≤6 km)', 1: 'Estándar (6-15 km)', 2: 'Excepcional (15-25 km)' }
  const planLabel = firmaFisicaRadar?.planId
    ? PROTECTION_PLANS.find(p => p.id === firmaFisicaRadar.planId)?.label
    : null
  const location = municipio || estado || 'esta zona'

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--mu-radius)',
          background: 'var(--mu-warning-bg)',
          border: '1px solid #F5D060',
          color: 'var(--mu-warning)',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '20px' }}>⚠️</span>
        {error}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '20px 24px',
        borderRadius: 'var(--mu-radius)',
        background: hasCoverage ? 'var(--mu-success-bg)' : 'var(--mu-bg-subtle)',
        border: `2px solid ${hasCoverage ? 'var(--mu-success-border)' : 'var(--mu-border)'}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
        {hasCoverage ? '✅' : '😕'}
      </span>

      <div style={{ flex: 1 }}>
        {/* Subtitle: CP · Municipio */}
        <p style={{ fontSize: '13px', color: 'var(--mu-text-muted)', marginBottom: '10px' }}>
          {cp ? `CP ${cp}` : null}
          {municipio ? ` · ${municipio}, ${estado}` : null}
        </p>

        {/* Bullet 1: Cobertura de Protección MoradaUno (el resto de servicios — Investigación, Firma de contratos — se ofrecen en todo el país) */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px' }}>{hasCoverage ? '●' : '○'}</span>
          <p style={{ fontSize: '15px', fontWeight: '700', color: hasCoverage ? 'var(--mu-success)' : 'var(--mu-purple-dark)', fontFamily: 'var(--mu-font-ui)' }}>
            {hasCoverage
              ? <>En {location} podemos ofrecer <b>Protección MoradaUno</b> y Servicios de Investigación y Firma de contratos</>
              : <>En {location} podemos ofrecer Servicios de Investigación y de Firma de contratos. Estamos trabajando para expandirnos en esta zona para proteger tu inmueble</>}
          </p>
        </div>

        {/* Bullet 2: Cobertura de firma física — siempre se muestra (gratis dentro de la capa, o con tarifa aproximada fuera de ella) */}
        {firmaFisicaRadar?.error && (
          <p style={{ fontSize: '13px', color: 'var(--mu-warning)', marginTop: '6px' }}>
            ⚠️ No se pudo calcular la cobertura de firma física: {firmaFisicaRadar.error}
          </p>
        )}
        {firmaFisicaRadar && !firmaFisicaRadar.error && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '15px', color: firmaFisicaRadar.covered ? '#0284C7' : '#D97706' }}>●</span>
            <p style={{ fontSize: '15px', fontWeight: '600', color: firmaFisicaRadar.covered ? '#0284C7' : '#D97706', fontFamily: 'var(--mu-font-ui)' }}>
              Cobertura de firma física:{' '}
              {firmaFisicaRadar.covered
                ? <>En {location} hay servicio de firma física <b>sin costo adicional</b></>
                : <>En {location} hay servicio de firma física por un monto de <b>${firmaFisicaRadar.estimatedFare.toLocaleString('es-MX')}</b> adicional, consúltalo con tu agente de confianza para contratar</>}
            </p>
          </div>
        )}
        {firmaFisicaRadar && !firmaFisicaRadar.error && (
          <p style={{ fontSize: '12px', color: 'var(--mu-text-muted)', marginTop: '2px', marginLeft: '23px' }}>
            {firmaFisicaRadar.distanceKm} km de {firmaFisicaRadar.nearestPoint?.nombre}
            {firmaFisicaRadar.tier != null && ` · capa ${TIER_LABELS[firmaFisicaRadar.tier]}`}
            {firmaFisicaRadar.isPIC && ' · PIC'}
            {firmaFisicaRadar.rentAmountRaw != null && ` · renta $${firmaFisicaRadar.rentAmountRaw.toLocaleString('es-MX')}`}
            {planLabel && ` · plan ${planLabel}`}
            {firmaFisicaRadar.revenue != null && ` · revenue $${Math.round(firmaFisicaRadar.revenue).toLocaleString('es-MX')}`}
          </p>
        )}
      </div>
    </div>
  )
}
