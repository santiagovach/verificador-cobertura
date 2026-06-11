// Logo SVG inline — derivado del brandbook (ícono "M" estilizado + wordmark)
function MoradaUnoLogo() {
  return (
    <svg
      width="168"
      height="32"
      viewBox="0 0 168 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="MoradaUno"
    >
      {/* Ícono: cuadrado redondeado con "M" estilizada */}
      <rect width="30" height="30" x="0" y="1" rx="5" fill="#671E75" />
      <rect width="10" height="10" x="14" y="1" rx="3" fill="#B14EB5" />
      <path
        d="M6 23V10.5L15 19.5L24 10.5V23"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wordmark: "Morada" bold + "Uno" regular */}
      <text
        x="38"
        y="22"
        fontFamily="Figtree, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="19"
        fill="#671E75"
        letterSpacing="-0.3"
      >
        Morada
      </text>
      <text
        x="112"
        y="22"
        fontFamily="Figtree, -apple-system, sans-serif"
        fontWeight="400"
        fontSize="19"
        fill="#671E75"
        letterSpacing="-0.3"
      >
        Uno
      </text>
    </svg>
  )
}

export default function Header({ user, onSignIn, onSignOut }) {
  return (
    <header
      style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--mu-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#fff',
        boxShadow: 'var(--mu-shadow-sm)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <MoradaUnoLogo />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img
                src={user.picture}
                alt={user.name}
                referrerPolicy="no-referrer"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--mu-border)',
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--mu-text-muted)',
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email}
              </span>
            </div>
            <button
              onClick={onSignOut}
              style={{
                fontSize: '13px',
                fontWeight: '500',
                padding: '6px 14px',
                borderRadius: 'var(--mu-radius-xs)',
                border: '1px solid var(--mu-border)',
                color: 'var(--mu-text-muted)',
                background: 'transparent',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--mu-purple-primary)'
                e.currentTarget.style.color = 'var(--mu-purple-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--mu-border)'
                e.currentTarget.style.color = 'var(--mu-text-muted)'
              }}
            >
              Salir
            </button>
          </>
        ) : (
          <button
            onClick={onSignIn}
            style={{
              fontSize: '14px',
              fontWeight: '600',
              padding: '8px 22px',
              borderRadius: 'var(--mu-radius-sm)',
              background: 'var(--mu-purple-primary)',
              color: '#fff',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--mu-purple-mid)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--mu-purple-primary)')}
          >
            Iniciar sesión
          </button>
        )}
      </div>
    </header>
  )
}
