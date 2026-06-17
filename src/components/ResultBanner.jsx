export default function ResultBanner({ result }) {
  if (!result) return null

  const { hasCoverage, firmaFisicaStatus, cp, municipio, estado, error } = result

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

        {/* Bullet 1: Cobertura de protección */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px' }}>{hasCoverage ? '●' : '○'}</span>
          <p style={{ fontSize: '15px', fontWeight: '700', color: hasCoverage ? 'var(--mu-success)' : 'var(--mu-purple-dark)', fontFamily: 'var(--mu-font-ui)' }}>
            {hasCoverage
              ? `¡Tenemos cobertura en ${municipio || estado}!`
              : 'Por ahora no tenemos cobertura en esta zona.'}
          </p>
        </div>

        {/* Bullet 2: Firma física (solo si hay cobertura general) */}
        {hasCoverage && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '15px', color: firmaFisicaStatus === 'disponible' ? '#0284C7' : firmaFisicaStatus === 'revisar' ? '#D97706' : 'var(--mu-text-muted)' }}>●</span>
            <p style={{
              fontSize: '15px',
              fontWeight: '600',
              color: firmaFisicaStatus === 'disponible' ? '#0284C7' : firmaFisicaStatus === 'revisar' ? '#D97706' : 'var(--mu-text-muted)',
              fontFamily: 'var(--mu-font-ui)',
            }}>
              Firma presencial:{' '}
              <span style={{ fontWeight: firmaFisicaStatus ? '700' : '400' }}>
                {firmaFisicaStatus === 'disponible' ? 'Disponible'
                  : firmaFisicaStatus === 'revisar' ? 'Revisar disponibilidad por revenue'
                  : 'No disponible'}
              </span>
            </p>
          </div>
        )}

        {!hasCoverage && (
          <p style={{ fontSize: '13px', color: 'var(--mu-text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
            Estamos creciendo constantemente — pronto podríamos llegar a tu zona.
          </p>
        )}
      </div>
    </div>
  )
}
