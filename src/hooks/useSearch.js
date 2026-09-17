import { useState, useCallback } from 'react'
import coverageData from '../data/coverage.json'
import firmaFisicaData from '../data/firmaFisica.json'
import { checkSignatureRadar } from '../lib/coverageRadius.js'
import { checkPIC } from '../utils/api.js'
import { effectiveRentForPlan } from '../data/protectionPlans.js'

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

// ─── Cobertura de firma física ─────────────────────────────────────────────────

const firmaFisicaMunicipalityMap = {}

for (const { municipio, estado } of firmaFisicaData.municipalities) {
  const key = `${normalize(municipio)}|||${normalize(estado)}`
  firmaFisicaMunicipalityMap[key] = { municipio, estado }
}

// Querétaro y Guadalajara/Jalisco tienen cobertura exacta por CP (parcial dentro
// del municipio), no municipio-completo — para esos estados el prefix fallback no
// es válido: un CP cercano "Si" no dice nada sobre un CP "No" o sin revisar.
const EXACT_ONLY_ESTADOS = new Set(firmaFisicaData.exactOnlyEstados || [])
const firmaFisicaPrefixKeys = Object.keys(firmaFisicaData.byCp).filter(
  cp => !EXACT_ONLY_ESTADOS.has(firmaFisicaData.byCp[cp].estado)
)

// Municipios que sí aparecen en el dataset exacto por CP (tienen al menos un CP
// "Sí") — usado para el click en el mapa (sin CP puntual): ahí no podemos decir
// disponible/no disponible para todo el municipio, solo que depende del CP.
const exactOnlyMunicipioSet = new Set()
for (const cp in firmaFisicaData.byCp) {
  const { municipio, estado } = firmaFisicaData.byCp[cp]
  if (EXACT_ONLY_ESTADOS.has(estado)) {
    exactOnlyMunicipioSet.add(`${normalize(municipio)}|||${normalize(estado)}`)
  }
}

const REVISAR_MUNICIPIOS = new Set(['milpa alta', 'xochimilco', 'tlahuac'])

function firmaFisicaStatus(municipio, estado) {
  const normEst = normalize(estado)
  const normMun = normalize(municipio)
  if (normEst === 'mexico' || normEst === 'estado de mexico') return 'revisar'
  if (REVISAR_MUNICIPIOS.has(normMun)) return 'revisar'
  return 'disponible'
}

function checkFirmaFisica(cp, geocodedMunicipio, geocodedEstado) {
  // 1. Exact CP match
  if (cp && firmaFisicaData.byCp[cp]) {
    const { municipio, estado } = firmaFisicaData.byCp[cp]
    return firmaFisicaStatus(municipio, estado)
  }

  // 2. No specific CP (e.g. clicking a municipio on the map) in a plaza with
  //    exact-per-CP data — can't say disponible/no disponible for the whole
  //    municipio, only that it depends on the CP.
  if (!cp && geocodedMunicipio && geocodedEstado) {
    const key = `${normalize(geocodedMunicipio)}|||${normalize(geocodedEstado)}`
    if (exactOnlyMunicipioSet.has(key)) return 'depende_cp'
  }

  // 3. Municipality fallback
  if (geocodedMunicipio && geocodedEstado) {
    const normMun = normalize(geocodedMunicipio)
    const normEst = normalizeState(geocodedEstado)
    const entry = firmaFisicaMunicipalityMap[`${normMun}|||${normEst}`]
    if (entry) return firmaFisicaStatus(entry.municipio, entry.estado)
  }

  // 4. CP prefix fallback — for CPs absent from the dataset but in the same alcaldía range.
  //    CDMX geocoding returns "Ciudad de México" as locality (not the specific alcaldía), so
  //    steps 1–2 both fail; matching a nearby CP by prefix reliably identifies the alcaldía.
  if (cp) {
    for (let len = cp.length - 1; len >= 3; len--) {
      const prefix = cp.slice(0, len)
      const match = firmaFisicaPrefixKeys.find(k => k.startsWith(prefix))
      if (match) {
        const { municipio, estado } = firmaFisicaData.byCp[match]
        return firmaFisicaStatus(municipio, estado)
      }
    }
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

          if (landlordId || organizationIds.length > 0) {
            const picResult = await checkPIC(accessToken, { landlordId, organizationIds })
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

        const radar = checkSignatureRadar(
          { lat: searchLat, lng: searchLng },
          { rentAmount: effectiveRent, isPIC }
        )
        return radar && { ...radar, rentAmountRaw: hasRentAmount ? rentAmount : null, planId: planId || null }
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
          firmaFisicaStatus: checkFirmaFisica(cp, exactEntry.municipio, exactEntry.estado),
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
        firmaFisicaStatus: null,
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
      firmaFisicaStatus: checkFirmaFisica(null, munMatch.municipio, munMatch.estado),
      cp: null,
      municipio: munMatch.municipio,
      estado: munMatch.estado,
      lat: null,
      lng: null,
    })
  }, [])

  return { result, isLoading, search, clear, selectMunicipality }
}
