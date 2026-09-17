import { useState, useRef, useEffect } from 'react'

const DEBOUNCE_MS = 300

const FIELD_STYLE = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  borderRadius: 'var(--mu-radius-sm)',
  border: '1px solid var(--mu-border)',
  fontSize: '14px',
  fontFamily: 'var(--mu-font-ui)',
  outline: 'none',
  color: 'var(--mu-text)',
  boxSizing: 'border-box',
  background: '#fff',
}

const LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--mu-text-muted)',
  marginBottom: '6px',
}

/**
 * Input de texto con autocomplete contra un endpoint propio (no Google) —
 * usado para buscar propietario/asesor e inmobiliaria en Metabase mientras
 * el usuario escribe. `fetchResults(q)` debe regresar un array de
 * `{ id, primary, secondary, raw }`; `raw` es lo que se pasa a `onSelect`.
 *
 * `presetValue` permite que el padre imponga un texto desde afuera (ej.
 * autollenar "Inmobiliaria" cuando se elige un asesor que pertenece a
 * una) — cualquier cambio de valor reemplaza el texto mostrado.
 */
export default function PartyAutocomplete({ label, placeholder, fetchResults, onSelect, onClear, presetValue }) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (presetValue != null) setText(presetValue)
  }, [presetValue])
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e) {
    const value = e.target.value
    setText(value)
    onClear?.()

    clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetchResults(value.trim())
        setResults(r)
        setOpen(r.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
  }

  function handleSelect(item) {
    setText(item.primary)
    setResults([])
    setOpen(false)
    onSelect(item.raw)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && <label style={LABEL_STYLE}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={text}
          onChange={handleChange}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true) }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            ...FIELD_STYLE,
            paddingRight: '30px',
            border: `1px solid ${focused ? 'var(--mu-purple-primary)' : 'var(--mu-border)'}`,
            boxShadow: focused ? '0 0 0 3px rgba(131, 38, 148, 0.1)' : 'none',
          }}
        />
        {loading && (
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--mu-text-muted)' }}>
            …
          </span>
        )}
      </div>
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid var(--mu-border)',
            borderRadius: 'var(--mu-radius-sm)',
            boxShadow: 'var(--mu-shadow)',
            zIndex: 20,
            maxHeight: '220px',
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: '4px 0',
          }}
        >
          {results.map(item => (
            <li key={`${item.id}-${item.primary}`}>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  fontSize: '13px',
                  color: 'var(--mu-text)',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--mu-bg-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 600 }}>{item.primary}</div>
                {item.secondary && (
                  <div style={{ fontSize: '11.5px', color: 'var(--mu-text-muted)' }}>{item.secondary}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
