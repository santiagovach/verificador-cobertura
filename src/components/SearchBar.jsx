import { useState, useRef, useEffect } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

export default function SearchBar({ onSearch, onClear, isLoading }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const places = useMapsLibrary('places')

  useEffect(() => {
    if (!places || !inputRef.current) return

    const ac = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'mx' },
      types: ['geocode'],
      fields: ['formatted_address'],
    })

    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (place?.formatted_address) {
        setQuery(place.formatted_address)
        onSearch(place.formatted_address)
      }
    })

    return () => {
      window.google.maps.event.removeListener(listener)
    }
  }, [places]) // onSearch is stable (useCallback with no deps)

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
          fontWeight: '800',
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
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ej: 06600  o  Av. Reforma 222, CDMX"
            maxLength={200}
            autoComplete="off"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: '100%',
              padding: query ? '14px 40px 14px 18px' : '14px 18px',
              borderRadius: 'var(--mu-radius)',
              border: `2px solid ${focused ? 'var(--mu-purple-primary)' : 'var(--mu-border)'}`,
              fontSize: '15px',
              fontFamily: 'var(--mu-font-ui)',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              boxShadow: focused ? '0 0 0 3px rgba(103, 30, 117, 0.1)' : 'none',
              color: 'var(--mu-text)',
              boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); onClear?.(); inputRef.current?.focus() }}
              aria-label="Limpiar búsqueda"
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--mu-neutral-200)',
                color: 'var(--mu-text-muted)',
                fontSize: '13px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--mu-border)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--mu-neutral-200)')}
            >
              ×
            </button>
          )}
        </div>
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
