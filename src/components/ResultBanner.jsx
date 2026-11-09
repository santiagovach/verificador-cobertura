import { PROTECTION_PLANS } from '../data/protectionPlans.js'
import { CHARGE_TRAVEL, MAX_PAID_TRAVEL_KM } from '../lib/coverageRadius.js'
import Toggle from './Toggle.jsx'

// chargeTravel: simulación del cobro de traslado (switch de admin para la demo con GTM); por defecto
// sigue la bandera CHARGE_TRAVEL.
// onToggleChargeTravel: solo admins — muestra el switch en la línea de firma física.
export default function ResultBanner({ result, chargeTravel = CHARGE_TRAVEL, onToggleChargeTravel }) {
  if (!result) return null

  const { hasCoverage, nearCoverage, firmaFisicaRadar, cp, municipio, estado, error, fromMapClick, pendingConfirmation, inPaintedMunicipality } = result

  const TIER_LABELS = { 0: 'Garantizada (≤6 km)', 1: 'Estándar (6-15 km)', 2: 'Excepcional (15-25 km)' }
  const planLabel = firmaFisicaRadar?.planId
    ? PROTECTION_PLANS.find(p => p.id === firmaFisicaRadar.planId)?.label
    : null
  const location = municipio || estado || 'esta zona'
  // Firma física con costo: fuera de la capa gratis, hasta MAX_PAID_TRAVEL_KM. QRO no aplica: Zion
  // definió firma presencial solo dentro de su zona (fuera = electrónica).
  const paidTravelApplies = !!firmaFisicaRadar && !firmaFisicaRadar.covered &&
    firmaFisicaRadar.qroSigningZone == null && firmaFisicaRadar.distanceKm <= MAX_PAID_TRAVEL_KM &&
    firmaFisicaRadar.travelCharge > 0
  const offersPaidTravel = chargeTravel && paidTravelApplies
  // El switch solo aparece cuando prenderlo cambia el mensaje.
  const showTravelToggle = !!onToggleChargeTravel && paidTravelApplies

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
        {hasCoverage ? '✅' : pendingConfirmation ? '⏳' : '😕'}
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
            {pendingConfirmation
              ? <>En {location} la cobertura está <b>por confirmar</b>. Para más información, consulta con tu agente MoradaUno</>
              : fromMapClick
              ? <>{location} tiene zonas con cobertura de Protección. Busca la dirección o el código postal para confirmar</>
              : hasCoverage
              ? <>En {location} están disponibles todas las Protecciones de MoradaUno, Servicios de Investigación y Firma de contratos</>
              : inPaintedMunicipality && cp
                ? <>{location} tiene cobertura de Protección solo en algunos códigos postales y el CP {cp} aún está fuera de esa zona. Aquí podemos ofrecer Servicios de investigación y Firma de contratos electrónico</>
              : nearCoverage
                ? <>En {location} podemos ofrecer únicamente Servicios de investigación y Firma de contratos electrónico</>
                : <>Seguimos trabajando juntos para ofrecerte nuestros productos y servicios. Para más información, consulta con tu agente MoradaUno.</>}
          </p>
        </div>

        {/* Bullet 2: Cobertura de firma física — solo cuando hay cobertura de Protección. Fuera de la capa gratis se ofrece
            firma electrónica; cuando GTM confirme cobrar el traslado (CHARGE_TRAVEL), se ofrece firma
            física cobrando solo lo que falta para no perder revenue (travelCharge, tope = Uber). */}
        {hasCoverage && !fromMapClick && !firmaFisicaRadar && (
          <p style={{ fontSize: '13px', color: 'var(--mu-warning)', marginTop: '6px' }}>
            Cobertura de firma física: no se pudo calcular porque no se ubicó la dirección en el mapa. Consulta con tu agente MoradaUno
          </p>
        )}
        {hasCoverage && firmaFisicaRadar?.error && (
          <p style={{ fontSize: '13px', color: 'var(--mu-warning)', marginTop: '6px' }}>
            ⚠️ No se pudo calcular la cobertura de firma física: {firmaFisicaRadar.error}
          </p>
        )}
        {hasCoverage && firmaFisicaRadar && !firmaFisicaRadar.error && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '15px', color: firmaFisicaRadar.covered || offersPaidTravel ? '#0284C7' : '#D97706' }}>●</span>
            <p style={{ fontSize: '15px', fontWeight: '600', color: firmaFisicaRadar.covered || offersPaidTravel ? '#0284C7' : '#D97706', fontFamily: 'var(--mu-font-ui)' }}>
              Cobertura de firma física:{' '}
              {firmaFisicaRadar.covered
                ? <>En {location} ofrecemos servicio de firma física <b>sin costo adicional</b></>
                : offersPaidTravel
                  ? <>En {location} ofrecemos firma física con un costo de traslado aproximado de <b>${firmaFisicaRadar.travelCharge.toLocaleString('es-MX')}</b>, o firma electrónica sin costo</>
                  : <>Por el momento podemos ofrecer firma electrónica. Para más información, consulta con tu agente MoradaUno</>}
            </p>
            {showTravelToggle && (
              <span style={{ marginLeft: 'auto', alignSelf: 'center', paddingLeft: '12px' }}>
                <Toggle
                  checked={!!chargeTravel}
                  onChange={onToggleChargeTravel}
                  ariaLabel="Cobrar traslado de firma física"
                />
              </span>
            )}
          </div>
        )}
        {hasCoverage && firmaFisicaRadar && !firmaFisicaRadar.error && (
          <p style={{ fontSize: '12px', color: 'var(--mu-text-muted)', marginTop: '2px', marginLeft: '23px' }}>
            {firmaFisicaRadar.distanceKm > 25 && firmaFisicaRadar.qroSigningZone == null
              ? 'Sin punto de firma presencial a menos de 25 km'
              : `${firmaFisicaRadar.distanceKm} km de ${firmaFisicaRadar.nearestPoint?.nombre}`}
            {firmaFisicaRadar.tier != null && ` · capa ${TIER_LABELS[firmaFisicaRadar.tier]}`}
            {firmaFisicaRadar.tier > 0 && firmaFisicaRadar.uberEstimate != null && ` · Uber aprox. $${firmaFisicaRadar.uberEstimate.toLocaleString('es-MX')}`}
            {firmaFisicaRadar.qroSigningZone === true && ' · dentro de la zona de firmas QRO'}
            {firmaFisicaRadar.qroSigningZone === false && ' · fuera de la zona de firmas QRO'}
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
