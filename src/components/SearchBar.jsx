import { useState, useRef, useEffect, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import PartyAutocomplete from './PartyAutocomplete.jsx'
import { searchParty, searchOrganization } from '../utils/api.js'
import { PROTECTION_PLANS, PROPERTY_TYPES, actualFeeForPlan } from '../data/protectionPlans.js'

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

const FIELD_LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--mu-text-muted)',
  marginBottom: '6px',
}

export default function SearchBar({ onSearch, onClear, isLoading, accessToken }) {
  const [query, setQuery] = useState('')
  const [rentAmount, setRentAmount] = useState('')
  const [planId, setPlanId] = useState('')
  const [propertyType, setPropertyType] = useState('Residencial')
  const [party, setParty] = useState(null) // { id, name, type: 'landlord'|'broker', organizationId }
  const [agency, setAgency] = useState(null) // { id, name }
  const [agencyPresetValue, setAgencyPresetValue] = useState(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const places = useMapsLibrary('places')

  // Si el asesor elegido pertenece a una inmobiliaria, autollenamos ese
  // campo — Santiago pidió esto explícitamente para no repetir el mismo
  // dato dos veces.
  function handlePartySelect(raw) {
    setParty(raw)
    if (raw.type === 'broker' && raw.organizationId && raw.organizationName) {
      setAgency({ id: raw.organizationId, name: raw.organizationName })
      setAgencyPresetValue(raw.organizationName)
    }
  }

  const fetchParty = useCallback(q => searchParty(accessToken, q).then(rows =>
    rows.map(r => ({
      id: r.id,
      primary: r.name,
      secondary: [
        r.type === 'broker' ? `Asesor${r.organizationName ? ' · ' + r.organizationName : ''}` : 'Propietario',
        r.phone,
      ].filter(Boolean).join(' · '),
      raw: r,
    }))
  ), [accessToken])

  const fetchAgency = useCallback(q => searchOrganization(accessToken, q).then(rows =>
    rows.map(r => ({ id: r.id, primary: r.name, secondary: 'Inmobiliaria', raw: r }))
  ), [accessToken])

  // Preview en vivo — plaza exacta se resuelve hasta buscar la dirección,
  // así que este número usa CDMX como referencia y puede variar un poco
  // una vez que se sepa la plaza real (los mínimos cambian por plaza).
  const previewRevenue = rentAmount && planId
    ? actualFeeForPlan(Number(rentAmount), Number(planId), { propertyType })
    : null

  function buildOptions() {
    return {
      rentAmount: rentAmount.trim() ? Number(rentAmount) : undefined,
      planId: planId ? Number(planId) : undefined,
      propertyType,
      party: party || undefined,
      agency: agency || undefined,
    }
  }

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
        onSearch(place.formatted_address, buildOptions())
      }
    })

    return () => {
      window.google.maps.event.removeListener(listener)
    }
  }, [places, rentAmount, planId, propertyType, party, agency]) // onSearch is stable (useCallback with no deps)

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) onSearch(trimmed, buildOptions())
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
        ¿Existe cobertura MoradaUno?
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

      <div
        style={{
          maxWidth: '760px',
          margin: '24px auto 0',
          textAlign: 'left',
          background: 'var(--mu-bg-subtle)',
          border: '1px solid var(--mu-border)',
          borderRadius: 'var(--mu-radius)',
          padding: '20px 24px',
        }}
      >
        <p
          style={{
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--mu-purple-primary)',
            marginBottom: '16px',
          }}
        >
          Opcional — radar de firma física antes de tener un deal
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '14px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={FIELD_LABEL_STYLE}>Monto de renta</label>
            <input
              type="text"
              inputMode="numeric"
              value={rentAmount ? `$${Number(rentAmount).toLocaleString('es-MX')}` : ''}
              onChange={e => setRentAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="$0"
              style={FIELD_STYLE}
            />
          </div>
          <PartyAutocomplete
            label="Asesor / propietario"
            placeholder="Nombre o teléfono"
            fetchResults={fetchParty}
            onSelect={handlePartySelect}
            onClear={() => setParty(null)}
          />
          <PartyAutocomplete
            label="Inmobiliaria"
            placeholder="Nombre"
            fetchResults={fetchAgency}
            presetValue={agencyPresetValue}
            onSelect={raw => setAgency(raw)}
            onClear={() => setAgency(null)}
          />
          <div>
            <label style={FIELD_LABEL_STYLE}>Plan de protección</label>
            <select
              value={planId}
              onChange={e => setPlanId(e.target.value)}
              style={{ ...FIELD_STYLE, color: planId ? 'var(--mu-text)' : 'var(--mu-text-muted)' }}
            >
              <option value="">Sin especificar</option>
              {PROTECTION_PLANS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE}>Tipo de inmueble</label>
            <select
              value={propertyType}
              onChange={e => setPropertyType(e.target.value)}
              style={FIELD_STYLE}
            >
              {PROPERTY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {previewRevenue != null && (
            <div>
              <label style={FIELD_LABEL_STYLE}>Revenue</label>
              <div
                style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--mu-radius-sm)',
                  background: 'var(--mu-purple-primary)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '700',
                  fontFamily: 'var(--mu-font-ui)',
                  boxSizing: 'border-box',
                }}
              >
                ${Math.round(previewRevenue).toLocaleString('es-MX')}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
