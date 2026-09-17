import { useState, useRef, useEffect } from 'react'

const DEBOUNCE_MS = 300

/**
 * Input de texto con autocomplete contra un endpoint propio (no Google) —
 * usado para buscar propietario/asesor e inmobiliaria en Metabase mientras
 * el usuario escribe. `fetchResults(q)` debe regresar un array de
 * `{ id, primary, secondary, raw }`; `raw` es lo que se pasa a `onSelect`.
 */
export default function PartyAutocomplete({ label, placeholder, fetchResults, onSelect, onClear }) {
  const [text, setText] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 'var(--mu-radius-sm)',
          border: '1px solid var(--mu-border)',
          fontSize: '13px',
          fontFamily: 'var(--mu-font-ui)',
          outline: 'none',
          color: 'var(--mu-text)',
          boxSizing: 'border-box',
        }}
      />
      {label && (
        <span style={{ fontSize: '11px', color: 'var(--mu-text-muted)', display: 'block', marginTop: '4px' }}>
          {label}
        </span>
      )}
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--mu-surface, #fff)',
            border: '1px solid var(--mu-border)',
            borderRadius: 'var(--mu-radius-sm)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
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
      {loading && (
        <span style={{ position: 'absolute', right: '12px', top: '11px', fontSize: '11px', color: 'var(--mu-text-muted)' }}>
          …
        </span>
      )}
    </div>
  )
}
