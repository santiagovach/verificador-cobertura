import { useState, Component } from 'react'

class MapErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '20px', background: '#FFF8E7', borderRadius: 'var(--mu-radius)', color: 'var(--mu-warning)', fontSize: '14px' }}>
          El mapa no pudo cargarse. Recarga la página o revisa la consola.
        </div>
      )
    }
    return this.props.children
  }
}
import { APIProvider } from '@vis.gl/react-google-maps'
import Header from './components/Header.jsx'
import SearchBar from './components/SearchBar.jsx'
import ResultBanner from './components/ResultBanner.jsx'
import CoverageMap from './components/CoverageMap.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import { useAuth } from './hooks/useAuth.js'
import { useSearch } from './hooks/useSearch.js'

function LoginPrompt({ onSignIn }) {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px',
        gap: '20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          background: 'var(--mu-bg-subtle)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}
      >
        🏠
      </div>
      <div>
        <h2
          style={{
            fontFamily: 'var(--mu-font-display)',
            fontSize: '22px',
            fontWeight: '900',
            color: 'var(--mu-purple-primary)',
            marginBottom: '8px',
          }}
        >
          Verificador de Cobertura
        </h2>
        <p style={{ color: 'var(--mu-text-muted)', fontSize: '15px', maxWidth: '360px' }}>
          Esta herramienta es exclusiva para el equipo MoradaUno. Inicia sesión
          con tu cuenta <strong>@moradauno.com</strong> para continuar.
        </p>
      </div>
      <button
        onClick={onSignIn}
        style={{
          padding: '12px 32px',
          background: 'var(--mu-purple-primary)',
          color: '#fff',
          borderRadius: 'var(--mu-radius-sm)',
          fontWeight: '600',
          fontSize: '15px',
          fontFamily: 'var(--mu-font-ui)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mu-purple-mid)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--mu-purple-primary)')}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            fill="#EA4335"
          />
        </svg>
        Iniciar sesión con Google
      </button>
    </main>
  )
}

export default function App() {
  const { user, isAdmin, signIn, signOut } = useAuth()
  const { result, isLoading, search } = useSearch()
  const [showAdmin, setShowAdmin] = useState(false)

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        <Header user={user} onSignIn={signIn} onSignOut={signOut} />

        {!user ? (
          <LoginPrompt onSignIn={signIn} />
        ) : (
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '0 20px 32px',
              maxWidth: '960px',
              margin: '0 auto',
              width: '100%',
              gap: '20px',
            }}
          >
            <SearchBar onSearch={search} isLoading={isLoading} />
            {result && <ResultBanner result={result} />}
            <MapErrorBoundary>
              <CoverageMap searchResult={result?.error ? null : result} />
            </MapErrorBoundary>
          </main>
        )}

        {isAdmin && (
          <footer
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--mu-border)',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => setShowAdmin(true)}
              style={{
                fontSize: '12px',
                color: 'var(--mu-neutral-400)',
                padding: '4px 10px',
                borderRadius: 'var(--mu-radius-xs)',
                opacity: 0.7,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
            >
              Actualizar cobertura
            </button>
          </footer>
        )}

      </div>

      {showAdmin && (
        <AdminPanel
          isAdmin={isAdmin}
          user={user}
          onSignIn={signIn}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </APIProvider>
  )
}
