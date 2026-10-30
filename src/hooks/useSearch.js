import { useState, useCallback, useRef } from 'react'
import coverageData from '../data/coverage.json'
import { checkSignatureRadar, restrictToZone, requireProtectionCoverage } from '../lib/coverageRadius.js'
import { distanceToNearestCoverage } from '../lib/coverageProximity.js'
import { pointInMunicipality } from '../lib/municipalityContains.js'
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

    // Colonias, fraccionamientos o municipios ("Juriquilla, Qro.") geocodifican sin CP: se toma el
    // CP del punto con geocodificación inversa en vez de responder "No encontramos esa dirección".
    let cp = get('postal_code')
    if (!cp && loc) {
      try {
        const { results: reverse } = await geocoder.geocode({ location: loc })
        cp = reverse
          ?.flatMap(r => r.address_components || [])
          .find(c => c.types.includes('postal_code'))?.long_name ?? null
      } catch { /* sin CP: se reporta como no encontrada */ }
    }

    return {
      cp,
      municipio: get('locality', 'administrative_area_level_2', 'sublocality_level_1'),
      // Municipio político — mejor etiqueta que 'locality' (que puede ser una
      // colonia o poblado) cuando Google lo devuelve.
      adminMunicipio: get('administrative_area_level_2'),
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
  const [result, setResultState] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  // Solo la búsqueda más reciente puede escribir el resultado: si una anterior (con otra dirección,
  // renta o asesor) termina después — p. ej. por el check de PIC — ya no lo sobrescribe.
  const latestSearchRef = useRef(0)

  const search = useCallback(async (query, { rentAmount, planId, propertyType, party, agency, accessToken } = {}) => {
    const searchId = ++latestSearchRef.current
    const setResult = value => { if (searchId === latestSearchRef.current) setResultState(value) }
    setIsLoading(true)
    setResult(null)

    try {
      let cp = null
      let lat = null
      let lng = null
      let geocodedMunicipio = null
      let geocodedEstado = null
      let geocodedAdminMunicipio = null

      if (CP_REGEX.test(query.trim())) {
        cp = query.trim()
        const geo = await geocode(cp, true)
        if (geo) {
          lat = geo.lat
          lng = geo.lng
          geocodedMunicipio = geo.municipio
          geocodedAdminMunicipio = geo.adminMunicipio
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
        geocodedAdminMunicipio = geo.adminMunicipio
        geocodedEstado = geo.estado
      }

      // Radar de firma física por puntos (abogados/oficinas) — pensado para
      // usarse ANTES de que exista un deal (Sales/CS decide si vale la pena
      // avanzar). SIEMPRE se calcula (distancia + capa) en cuanto hay
      // coordenadas; renta/PIC/plan son opcionales y solo afinan el
      // resultado — sin ellos, se evalúa con el peor caso (renta $0, sin
      // PIC), que es exactamente lo que se necesita para decidir gratis vs.
      // tarifa. Ver src/lib/uberFareEstimate.js.
      const resolveRadar = async (searchLat, searchLng, plaza) => {
        if (searchLat == null || searchLng == null) return null
        const hasRentAmount = rentAmount != null && rentAmount !== '' && !Number.isNaN(rentAmount)

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

        let radar = checkSignatureRadar(
          { lat: searchLat, lng: searchLng },
          { rentAmount: effectiveRent, isPIC }
        )
        // Sin tolerancia de borde: Corregidora/El Marqués están pegados a la ciudad de Querétaro.
        const zone = radar?.nearestPoint.soloMunicipio
        if (zone) radar = restrictToZone(radar, await pointInMunicipality(zone, { lat: searchLat, lng: searchLng }, 0))
        return radar && { ...radar, rentAmountRaw: hasRentAmount ? rentAmount : null, planId: planId || null, revenue }
      }

      // 1. Exact CP match
      //    El Sheet asigna rangos de CP en bloque a un municipio (62520 aparece
      //    como Cuernavaca aunque es Tepoztlán): si el punto geocodificado cae
      //    fuera del polígono de ese municipio, el renglón está mal → sin
      //    cobertura. Sin polígono/coordenadas se confía en el Sheet.
      //    El Sheet lista muchos CPs por bloques de 10 (04360 cubre 04360–04369 en
      //    CDMX; 76070 cubre 76079 en Querétaro; León y Morelos van 100% por
      //    bloques), así que un CP sin renglón propio hereda el de su bloque. Fuera
      //    de CDMX el bloque solo cuenta si el punto cae dentro del polígono del
      //    municipio del bloque (Santiago, 2026-10-30) — sin polígono no se hereda.
      const ownEntry = cp && coverageData.byCp[cp]
      const blockEntry = !ownEntry && cp && coverageData.byCp[`${cp.slice(0, 4)}0`]
      const isCdmx = entry => normalizeState(entry.estado) === 'ciudad de mexico'
      let exactEntry = null
      if (ownEntry) {
        exactEntry = isCdmx(ownEntry) || (await pointInMunicipality(ownEntry, { lat, lng })) !== false ? ownEntry : null
      } else if (blockEntry) {
        exactEntry = isCdmx(blockEntry) || (await pointInMunicipality(blockEntry, { lat, lng })) === true ? blockEntry : null
      }
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

      // 2. No coverage — ni el CP ni su bloque de 10 (validado por polígono) están en
      //    "Con Cobertura". No hay fallback por municipio ni por prefijo más amplio.
      const distanceToCoverageKm = distanceToNearestCoverage({ lat, lng })
      setResult({
        hasCoverage: false,
        nearCoverage: distanceToCoverageKm != null && distanceToCoverageKm <= 10,
        distanceToCoverageKm,
        firmaFisicaRadar: requireProtectionCoverage(await resolveRadar(lat, lng)),
        cp,
        municipio: geocodedAdminMunicipio || geocodedMunicipio,
        estado: geocodedEstado,
        lat,
        lng,
      })
    } catch {
      setResult({ error: 'Ocurrió un error al verificar. Intenta de nuevo.' })
    } finally {
      if (searchId === latestSearchRef.current) setIsLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    latestSearchRef.current++
    setResultState(null)
    setIsLoading(false)
  }, [])

  const selectMunicipality = useCallback((municipio, estado) => {
    const munMatch = findCoveredMunicipality(municipio, estado)
    if (!munMatch) return
    latestSearchRef.current++
    setResultState({
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
