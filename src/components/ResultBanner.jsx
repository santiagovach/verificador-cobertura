export default function ResultBanner({ result }) {
  if (!result) return null

  const { hasCoverage, cp, municipio, estado, error } = result

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
      <span
        style={{
          fontSize: '32px',
          lineHeight: 1,
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        {hasCoverage ? '✅' : '😕'}
      </span>

      <div>
        <p
          style={{
            fontSize: '18px',
            fontWeight: '700',
            color: hasCoverage ? 'var(--mu-success)' : 'var(--mu-purple-dark)',
            marginBottom: '4px',
            fontFamily: 'var(--mu-font-ui)',
          }}
        >
          {hasCoverage
            ? `¡Tenemos cobertura en ${municipio}!`
            : 'Por ahora no tenemos cobertura en esta zona.'}
        </p>

        <p style={{ fontSize: '14px', color: 'var(--mu-text-muted)' }}>
          {hasCoverage
            ? `CP ${cp} · ${municipio}, ${estado}`
            : cp
            ? `CP ${cp}${municipio ? ` · ${municipio}, ${estado}` : ''}`
            : null}
        </p>

        {!hasCoverage && (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--mu-text-muted)',
              marginTop: '6px',
              fontStyle: 'italic',
            }}
          >
            Estamos creciendo constantemente — pronto podríamos llegar a tu zona.
          </p>
        )}
      </div>
    </div>
  )
}
