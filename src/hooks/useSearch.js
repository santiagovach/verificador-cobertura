import { useState, useCallback } from 'react'
import coverageData from '../data/coverage.json'
import firmaFisicaData from '../data/firmaFisica.json'

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

  // 2. Municipality fallback
  if (geocodedMunicipio && geocodedEstado) {
    const normMun = normalize(geocodedMunicipio)
    const normEst = normalizeState(geocodedEstado)
    const entry = firmaFisicaMunicipalityMap[`${normMun}|||${normEst}`]
    if (entry) return firmaFisicaStatus(entry.municipio, entry.estado)
  }

  // 3. CP prefix fallback — for CPs absent from the dataset but in the same alcaldía range.
  //    CDMX geocoding returns "Ciudad de México" as locality (not the specific alcaldía), so
  //    steps 1–2 both fail; matching a nearby CP by prefix reliably identifies the alcaldía.
  if (cp) {
    for (let len = cp.length - 1; len >= 3; len--) {
      const prefix = cp.slice(0, len)
      const match = Object.keys(firmaFisicaData.byCp).find(k => k.startsWith(prefix))
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

  const search = useCallback(async query => {
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
          cp,
          municipio: exactEntry.municipio,
          estado: exactEntry.estado,
          lat,
          lng,
        })
        return
      }

      // 2. Municipality fallback for coverage
      if (geocodedMunicipio && geocodedEstado) {
        const munMatch = findCoveredMunicipality(geocodedMunicipio, geocodedEstado)
        if (munMatch) {
          setResult({
            hasCoverage: true,
            firmaFisicaStatus: checkFirmaFisica(cp, munMatch.municipio, munMatch.estado),
            cp,
            municipio: munMatch.municipio,
            estado: munMatch.estado,
            lat,
            lng,
          })
          return
        }
      }

      // 3. CP prefix fallback — Google often returns a colonia name (sublocality_level_1) as
      //    the municipality for CDMX address searches instead of the alcaldía, so steps 1–2
      //    both fail even when the CP range is fully covered.
      if (cp) {
        for (let len = cp.length - 1; len >= 3; len--) {
          const prefix = cp.slice(0, len)
          const matchKey = Object.keys(coverageData.byCp).find(k => k.startsWith(prefix))
          if (matchKey) {
            const prefixEntry = coverageData.byCp[matchKey]
            if (!lat && !lng) {
              const fallback = await geocode(`${prefixEntry.municipio}, ${prefixEntry.estado}, México`)
              if (fallback) { lat = fallback.lat; lng = fallback.lng }
            }
            setResult({
              hasCoverage: true,
              firmaFisicaStatus: checkFirmaFisica(cp, prefixEntry.municipio, prefixEntry.estado),
              cp,
              municipio: prefixEntry.municipio,
              estado: prefixEntry.estado,
              lat,
              lng,
            })
            return
          }
        }
      }

      // 4. No coverage
      setResult({
        hasCoverage: false,
        firmaFisicaStatus: null,
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
