import { useState } from 'react'
import { triggerSync } from '../utils/api.js'

export default function AdminPanel({ isAdmin, user, onSignIn, onClose }) {
  const [status, setStatus] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)

  async function handleSync() {
    setIsSyncing(true)
    setStatus(null)
    try {
      const data = await triggerSync(user.accessToken)
      setStatus({ type: 'success', message: data.message })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panel de administración"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(18, 5, 26, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--mu-radius)',
          padding: '32px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--mu-shadow-lg)',
        }}
      >
        {/* Header del modal */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--mu-font-ui)',
                fontWeight: '700',
                fontSize: '18px',
                color: 'var(--mu-purple-primary)',
              }}
            >
              Actualizar cobertura
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--mu-text-muted)', marginTop: '2px' }}>
              Panel de administración
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              fontSize: '18px',
              color: 'var(--mu-text-muted)',
              padding: '4px 8px',
              borderRadius: 'var(--mu-radius-xs)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Estado: no autenticado */}
        {!user && (
          <div>
            <p
              style={{
                color: 'var(--mu-text-muted)',
                fontSize: '14px',
                marginBottom: '20px',
                lineHeight: '1.6',
              }}
            >
              Inicia sesión con tu cuenta <strong>@moradauno.com</strong> para
              poder sincronizar el mapa desde el Google Sheet.
            </p>
            <button
              onClick={onSignIn}
              style={{
                width: '100%',
                padding: '13px',
                background: 'var(--mu-purple-primary)',
                color: '#fff',
                borderRadius: 'var(--mu-radius-sm)',
                fontWeight: '600',
                fontSize: '15px',
                fontFamily: 'var(--mu-font-ui)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--mu-purple-mid)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--mu-purple-primary)')}
            >
              Iniciar sesión con Google
            </button>
          </div>
        )}

        {/* Estado: autenticado pero sin permiso */}
        {user && !isAdmin && (
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--mu-error-bg)',
              borderRadius: 'var(--mu-radius-sm)',
              color: 'var(--mu-error)',
              fontSize: '14px',
              lineHeight: '1.5',
            }}
          >
            Tu cuenta <strong>{user.email}</strong> no tiene permisos de
            administrador. Contacta al equipo de tecnología.
          </div>
        )}

        {/* Estado: admin autenticado */}
        {user && isAdmin && (
          <div>
            <p
              style={{
                color: 'var(--mu-text-muted)',
                fontSize: '14px',
                lineHeight: '1.7',
                marginBottom: '20px',
              }}
            >
              Actualiza el Google Sheet con los nuevos códigos postales y luego
              presiona el botón. El mapa se regenerará en{' '}
              <strong>~60 segundos</strong>.
            </p>

            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                width: '100%',
                padding: '14px',
                background: isSyncing ? 'var(--mu-neutral-200)' : 'var(--mu-purple-primary)',
                color: isSyncing ? 'var(--mu-text-muted)' : '#fff',
                borderRadius: 'var(--mu-radius-sm)',
                fontWeight: '600',
                fontSize: '15px',
                fontFamily: 'var(--mu-font-ui)',
                transition: 'background 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseEnter={e => {
                if (!isSyncing) e.currentTarget.style.background = 'var(--mu-purple-mid)'
              }}
              onMouseLeave={e => {
                if (!isSyncing) e.currentTarget.style.background = 'var(--mu-purple-primary)'
              }}
            >
              {isSyncing ? (
                <>
                  <span className="mu-spinner" />
                  Sincronizando...
                </>
              ) : (
                '🔄  Sincronizar desde Google Sheet'
              )}
            </button>

            {status && (
              <div
                role="alert"
                style={{
                  marginTop: '16px',
                  padding: '13px 16px',
                  borderRadius: 'var(--mu-radius-sm)',
                  background:
                    status.type === 'success'
                      ? 'var(--mu-success-bg)'
                      : 'var(--mu-error-bg)',
                  color:
                    status.type === 'success' ? 'var(--mu-success)' : 'var(--mu-error)',
                  fontSize: '14px',
                  lineHeight: '1.5',
                }}
              >
                {status.message}
              </div>
            )}

            <p
              style={{
                marginTop: '16px',
                fontSize: '12px',
                color: 'var(--mu-text-muted)',
                textAlign: 'center',
              }}
            >
              Sesión activa: {user.email}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
