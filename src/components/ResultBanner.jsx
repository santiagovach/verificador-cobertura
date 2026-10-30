import { PROTECTION_PLANS } from '../data/protectionPlans.js'
import { CHARGE_TRAVEL } from '../lib/coverageRadius.js'

export default function ResultBanner({ result }) {
  if (!result) return null

  const { hasCoverage, nearCoverage, firmaFisicaRadar, cp, municipio, estado, error, fromMapClick } = result

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

        {/* Bullet 1: Cobertura de Protección MoradaUno — nunca un "no" rotundo: si no hay cobertura, se ofrece
            lo que sí está disponible en todo el país (Investigación, Firma de contratos), matizado por qué
            tan lejos está la zona de cobertura más cercana. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px' }}>{hasCoverage ? '●' : '○'}</span>
          <p style={{ fontSize: '15px', fontWeight: '700', color: hasCoverage ? 'var(--mu-success)' : 'var(--mu-purple-dark)', fontFamily: 'var(--mu-font-ui)' }}>
            {fromMapClick
              ? <>{location} tiene zonas con cobertura de Protección. Busca la dirección o el código postal para confirmar</>
              : hasCoverage
              ? <>En {location} están disponibles todas las Protecciones de MoradaUno, Servicios de Investigación y Firma de contratos</>
              : nearCoverage
                ? <>En {location} podemos ofrecer únicamente Servicios de investigación y Firma de contratos electrónico</>
                : <>Seguimos trabajando juntos para ofrecerte nuestros productos y servicios. Para más información, consulta con tu agente MoradaUno.</>}
          </p>
        </div>

        {/* Bullet 2: Cobertura de firma física — siempre se muestra. Fuera de la capa gratis se ofrece
            firma electrónica; cuando GTM confirme cobrar el traslado (CHARGE_TRAVEL), se ofrece firma
            física cobrando solo lo que falta para no perder revenue (travelCharge, tope = Uber). */}
        {!firmaFisicaRadar && !fromMapClick && (
          <p style={{ fontSize: '13px', color: 'var(--mu-warning)', marginTop: '6px' }}>
            Cobertura de firma física: no se pudo calcular porque no se ubicó la dirección en el mapa. Consulta con tu agente MoradaUno
          </p>
        )}
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
                ? <>En {location} ofrecemos servicio de firma física <b>sin costo adicional</b></>
                : CHARGE_TRAVEL && !firmaFisicaRadar.withoutProtection
                  ? <>En {location} ofrecemos firma física con un costo de traslado aproximado de <b>${firmaFisicaRadar.travelCharge.toLocaleString('es-MX')}</b>, o firma electrónica sin costo</>
                  : <>Por el momento podemos ofrecer firma electrónica. Para más información, consulta con tu agente MoradaUno</>}
            </p>
          </div>
        )}
        {firmaFisicaRadar && !firmaFisicaRadar.error && (
          <p style={{ fontSize: '12px', color: 'var(--mu-text-muted)', marginTop: '2px', marginLeft: '23px' }}>
            {firmaFisicaRadar.distanceKm} km de {firmaFisicaRadar.nearestPoint?.nombre}
            {firmaFisicaRadar.tier != null && ` · capa ${TIER_LABELS[firmaFisicaRadar.tier]}`}
            {firmaFisicaRadar.tier > 0 && firmaFisicaRadar.uberEstimate != null && ` · Uber aprox. $${firmaFisicaRadar.uberEstimate.toLocaleString('es-MX')}`}
            {firmaFisicaRadar.outsideZone && ` · fuera de la ciudad de ${firmaFisicaRadar.outsideZone} (Uber de firmas solo dentro)`}
            {firmaFisicaRadar.withoutProtection && ' · sin cobertura de Protección'}
            {firmaFisicaRadar.picError && ' · no se pudo consultar PIC (se evaluó sin PIC)'}
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
