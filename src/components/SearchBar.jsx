import { useState } from 'react'

export default function SearchBar({ onSearch, isLoading }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) onSearch(trimmed)
  }

  return (
    <section style={{ textAlign: 'center', padding: '40px 0 12px' }}>
      <h1
        style={{
          fontFamily: 'var(--mu-font-display)',
          fontSize: 'clamp(22px, 4vw, 30px)',
          fontWeight: '900',
          color: 'var(--mu-purple-primary)',
          lineHeight: '1.2',
          marginBottom: '10px',
        }}
      >
        ¿Tienes cobertura MoradaUno?
      </h1>
      <p
        style={{
          color: 'var(--mu-text-muted)',
          fontSize: '15px',
          marginBottom: '28px',
          maxWidth: '480px',
          margin: '0 auto 28px',
        }}
      >
        Ingresa un código postal o dirección en México para verificar.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '10px',
          maxWidth: '580px',
          margin: '0 auto',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ej: 06600  o  Av. Reforma 222, CDMX"
          maxLength={200}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            padding: '14px 18px',
            borderRadius: 'var(--mu-radius)',
            border: `2px solid ${focused ? 'var(--mu-purple-primary)' : 'var(--mu-border)'}`,
            fontSize: '15px',
            fontFamily: 'var(--mu-font-ui)',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: focused ? '0 0 0 3px rgba(103, 30, 117, 0.1)' : 'none',
            color: 'var(--mu-text)',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          style={{
            padding: '14px 28px',
            borderRadius: 'var(--mu-radius)',
            background:
              isLoading || !query.trim()
                ? 'var(--mu-neutral-200)'
                : 'var(--mu-purple-primary)',
            color:
              isLoading || !query.trim() ? 'var(--mu-text-muted)' : '#fff',
            fontSize: '15px',
            fontWeight: '600',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
            minWidth: '110px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {isLoading ? (
            <>
              <span className="mu-spinner" />
              Buscando
            </>
          ) : (
            'Verificar'
          )}
        </button>
      </form>
    </section>
  )
}
