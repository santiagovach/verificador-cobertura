import { useState, useCallback } from 'react'
import coverageData from '../data/coverage.json'
import { checkSignatureRadar } from '../lib/coverageRadius.js'
import { checkPIC } from '../utils/api.js'
import { effectiveRentForPlan, actualFeeForPlan } from '../data/protectionPlans.js'

const CP_REGEX = /^\d{5}$/

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const GOOGLE_STATE_NORMALIZE = {
  'distrito federal': 'ciudad de mexico',
  'ciudad de mexico': 'ciudad de mexico',
  'estado de mexico': 'mexico',
  'mexico': 'mexico',
}

function normalizeState(googleStateName) {
  const n = normalize(googleStateName)
  return GOOGLE_STATE_NORMALIZE[n] || n
}

// ─── Cobertura de protección ──────────────────────────────────────────────────

const coveredMunicipalityMap = {}
const coveredEstadoSet = new Set()

for (const { municipio, estado } of coverageData.municipalities) {
  const key = `${normalize(municipio)}|||${normalize(estado)}`
  coveredMunicipalityMap[key] = { municipio, estado }
  coveredEstadoSet.add(normalizeState(estado))
}

function findCoveredMunicipality(googleMunicipio, googleEstado) {
  const normMun = normalize(googleMunicipio)
  const normEst = normalizeState(googleEstado)

  const direct = coveredMunicipalityMap[`${normMun}|||${normEst}`]
  if (direct) return direct

  // CDMX: entire city has coverage. For CP searches Google returns "Ciudad de México" as
  // locality; for specific-address searches it may return the colonia name instead, so we
  // cannot rely on normMun === normEst — just checking the state is enough.
  if (normalizeState(googleEstado) === 'ciudad de mexico') {
    return { municipio: googleMunicipio, estado: googleEstado }
  }

  return null
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

async function geocode(query, isCP = false) {
  let g = window.google?.maps
  if (!g) {
    for (let i = 0; i < 20 && !g; i++) {
      await new Promise(r => setTimeout(r, 150))
      g = window.google?.maps
    }
  }
  if (!g) return null

  const geocoder = new g.Geocoder()
  const request = isCP
    ? { componentRestrictions: { country: 'MX', postalCode: query } }
    : { address: query, componentRestrictions: { country: 'MX' } }

  try {
    const { results } = await geocoder.geocode(request)
    if (!results?.[0]) return null

    const components = results[0].address_components || []
    const loc = results[0].geometry?.location

    const get = (...types) => {
      for (const type of types) {
        const c = components.find(c => c.types.includes(type))
        if (c) return c.long_name
      }
      return null
    }

    return {
      cp: get('postal_code'),
      municipio: get('locality', 'administrative_area_level_2', 'sublocality_level_1'),
      estado: get('administrative_area_level_1'),
      lat: loc?.lat() ?? null,
      lng: loc?.lng() ?? null,
    }
  } catch {
    return null
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSearch() {
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const search = useCallback(async (query, { rentAmount, planId, propertyType, party, agency, accessToken } = {}) => {
    setIsLoading(true)
    setResult(null)

    try {
      let cp = null
      let lat = null
      let lng = null
      let geocodedMunicipio = null
      let geocodedEstado = null

      if (CP_REGEX.test(query.trim())) {
        cp = query.trim()
        const geo = await geocode(cp, true)
        if (geo) {
          lat = geo.lat
          lng = geo.lng
          geocodedMunicipio = geo.municipio
          geocodedEstado = geo.estado
        }
      } else {
        const geo = await geocode(query)
        if (!geo?.cp) {
          setResult({ error: 'No encontramos esa dirección. Prueba con un código postal de 5 dígitos.' })
          return
        }
        cp = geo.cp
        lat = geo.lat
        lng = geo.lng
        geocodedMunicipio = geo.municipio
        geocodedEstado = geo.estado
      }

      // Radar de firma física por puntos (abogados/oficinas) ponderado por
      // renta/PIC — pensado para usarse ANTES de que exista un deal (Sales/CS
      // decide si vale la pena avanzar). Si no se llenó ningún campo opcional
      // (renta, asesor/propietario, inmobiliaria), no se calcula nada y la
      // búsqueda se comporta igual que antes (respuesta estándar por CP).
      const resolveRadar = async (searchLat, searchLng, plaza) => {
        const hasRentAmount = rentAmount != null && rentAmount !== '' && !Number.isNaN(rentAmount)
        const hasParty = Boolean(party)
        const hasAgency = Boolean(agency)
        if ((!hasRentAmount && !hasParty && !hasAgency) || searchLat == null || searchLng == null) return null

        let isPIC = false
        try {
          const organizationIds = []
          if (party?.type === 'broker' && party.organizationId) organizationIds.push(party.organizationId)
          if (agency?.id) organizationIds.push(agency.id)
          const landlordId = party?.type === 'landlord' ? party.id : undefined
          const brokerId = party?.type === 'broker' ? party.id : undefined

          if (landlordId || brokerId || organizationIds.length > 0) {
            const picResult = await checkPIC(accessToken, { landlordId, brokerId, organizationIds })
            isPIC = picResult.isPIC
          }
        } catch (err) {
          return { error: err.message }
        }

        // El tipo de protección ajusta la renta "efectiva" para el radar,
        // ya considerando el pago mínimo y el tope de renta protegida de
        // cada plan (no solo renta x %). Ver src/data/protectionPlans.js.
        // Sin plan seleccionado, no hay ajuste.
        const effectiveRent = hasRentAmount ? effectiveRentForPlan(rentAmount, planId, { plaza, propertyType }) : undefined
        // Revenue = cobro antes de IVA (lo que MoradaUno reconoce como
        // ingreso; el IVA es un traspaso al SAT, no revenue).
        const revenue = hasRentAmount ? actualFeeForPlan(rentAmount, planId, { plaza, propertyType }) : null

        const radar = checkSignatureRadar(
          { lat: searchLat, lng: searchLng },
          { rentAmount: effectiveRent, isPIC }
        )
        return radar && { ...radar, rentAmountRaw: hasRentAmount ? rentAmount : null, planId: planId || null, revenue }
      }

      // 1. Exact CP match
      const exactEntry = coverageData.byCp[cp]
      if (exactEntry) {
        if (!lat && !lng) {
          const fallback = await geocode(`${exactEntry.municipio}, ${exactEntry.estado}, México`)
          if (fallback) { lat = fallback.lat; lng = fallback.lng }
        }
        setResult({
          hasCoverage: true,
          firmaFisicaRadar: await resolveRadar(lat, lng, exactEntry.plaza),
          cp,
          municipio: exactEntry.municipio,
          estado: exactEntry.estado,
          lat,
          lng,
        })
        return
      }

      // 2. No coverage — "Con Cobertura" is CP-exact for every plaza now, so an
      //    absent CP means no coverage, full stop. No municipio or CP-prefix
      //    fallback: a covered neighbor CP must never resurrect coverage for a
      //    CP that was explicitly removed from the sheet.
      setResult({
        hasCoverage: false,
        firmaFisicaRadar: await resolveRadar(lat, lng),
        cp,
        municipio: geocodedMunicipio,
        estado: geocodedEstado,
        lat,
        lng,
      })
    } catch {
      setResult({ error: 'Ocurrió un error al verificar. Intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clear = useCallback(() => setResult(null), [])

  const selectMunicipality = useCallback((municipio, estado) => {
    const munMatch = findCoveredMunicipality(municipio, estado)
    if (!munMatch) return
    setResult({
      hasCoverage: true,
      cp: null,
      municipio: munMatch.municipio,
      estado: munMatch.estado,
      lat: null,
      lng: null,
    })
  }, [])

  return { result, isLoading, search, clear, selectMunicipality }
}
