import { useState, useCallback } from 'react'
import coverageData from '../data/coverage.json'

const CP_REGEX = /^\d{5}$/

// Normalize string for fuzzy matching (remove accents, lowercase)
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Google Maps returns some state names differently than our Sheet
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

// Pre-build municipality lookup and per-estado coverage set
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

  // Direct match
  const direct = coveredMunicipalityMap[`${normMun}|||${normEst}`]
  if (direct) return direct

  // CDMX special case: Google returns "Ciudad de México" as both locality and state,
  // without returning the alcaldía. If the estado has coverage, accept it.
  if (normMun === normEst && coveredEstadoSet.has(normEst)) {
    return { municipio: googleMunicipio, estado: googleEstado }
  }

  return null
}

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
    console.log('[geocode]', query, results?.[0]?.formatted_address, results?.[0]?.geometry?.location?.lat(), results?.[0]?.geometry?.location?.lng())
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
          setResult({
            error: 'No encontramos esa dirección. Prueba con un código postal de 5 dígitos.',
          })
          return
        }
        cp = geo.cp
        lat = geo.lat
        lng = geo.lng
        geocodedMunicipio = geo.municipio
        geocodedEstado = geo.estado
      }

      // 1. Exact CP match in the Sheet
      const exactEntry = coverageData.byCp[cp]
      if (exactEntry) {
        setResult({
          hasCoverage: true,
          cp,
          municipio: exactEntry.municipio,
          estado: exactEntry.estado,
          plaza: exactEntry.plaza,
          lat,
          lng,
        })
        return
      }

      // 2. Fallback: check if the geocoded municipality has coverage
      if (geocodedMunicipio && geocodedEstado) {
        const munMatch = findCoveredMunicipality(geocodedMunicipio, geocodedEstado)
        if (munMatch) {
          setResult({
            hasCoverage: true,
            cp,
            municipio: munMatch.municipio,
            estado: munMatch.estado,
            lat,
            lng,
          })
          return
        }
      }

      // 3. No coverage
      setResult({
        hasCoverage: false,
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

  return { result, isLoading, search, clear }
}
