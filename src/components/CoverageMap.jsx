import { useEffect, useRef, useState } from 'react'
import { Map, useMap, useApiIsLoaded } from '@vis.gl/react-google-maps'

const DEFAULT_CENTER = { lat: 23.6345, lng: -102.5528 }
const DEFAULT_ZOOM = 5

const POLYGON_STYLE = {
  fillColor: '#671E75',
  fillOpacity: 0.4,
  strokeColor: '#4A1654',
  strokeWeight: 1,
  strokeOpacity: 0.8,
  cursor: 'pointer',
}

const FIRMA_STYLE = {
  fillColor: '#0EA5E9',
  fillOpacity: 0.5,
  strokeColor: '#0284C7',
  strokeWeight: 1.5,
  strokeOpacity: 0.9,
  cursor: 'pointer',
}

const FIRMA_REVISAR_STYLE = {
  fillColor: '#7DD3FC',
  fillOpacity: 0.2,
  strokeColor: '#7DD3FC',
  strokeWeight: 1,
  strokeOpacity: 0.5,
  cursor: 'pointer',
}

function MapTooltip({ content, position }) {
  if (!content) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: position.y - 44,
        left: position.x,
        transform: 'translateX(-50%)',
        background: 'rgba(18, 5, 26, 0.88)',
        color: '#fff',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        fontFamily: 'var(--mu-font-ui)',
        fontWeight: '500',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}
    >
      {content}
    </div>
  )
}

function CoverageLayer({ searchResult, onMunicipalityClick }) {
  const map = useMap()
  const dataLayerRef = useRef(null)
  const firmaLayerRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [tooltip, setTooltip] = useState({ content: null, x: 0, y: 0 })

  useEffect(() => {
    if (!map) return
    const g = window.google?.maps
    if (!g) return

    // Layer 1: cobertura de protección (purple)
    const layer = new g.Data({ map })
    dataLayerRef.current = layer
    layer.loadGeoJson('/coverage-municipalities.geojson', null, features => {
      if (features && features.length > 0) setLoaded(true)
    })
    layer.setStyle(POLYGON_STYLE)

    const addTooltip = (l) => {
      l.addListener('mouseover', e => {
        const isRevisar = l === firmaLayerRef.current && e.feature.getProperty('requiresReview')
        l.overrideStyle(e.feature, { fillOpacity: isRevisar ? 0.35 : 0.7, strokeWeight: 2 })
        const municipio = e.feature.getProperty('municipio')
        const estado = e.feature.getProperty('estado')
        const tag = l === firmaLayerRef.current ? ' · Firma física' : ''
        setTooltip({ content: `${municipio}, ${estado}${tag}`, x: e.domEvent?.offsetX ?? 0, y: e.domEvent?.offsetY ?? 0 })
      })
      l.addListener('mousemove', e => {
        setTooltip(prev => ({ ...prev, x: e.domEvent?.offsetX ?? prev.x, y: e.domEvent?.offsetY ?? prev.y }))
      })
      l.addListener('mouseout', e => {
        l.revertStyle(e.feature)
        setTooltip({ content: null, x: 0, y: 0 })
      })
      l.addListener('click', e => {
        const municipio = e.feature.getProperty('municipio')
        const estado = e.feature.getProperty('estado')
        if (municipio && estado) onMunicipalityClick?.(municipio, estado)
      })
    }

    addTooltip(layer)

    // Layer 2: firma física (teal), rendered on top
    const firmaLayer = new g.Data({ map })
    firmaLayerRef.current = firmaLayer
    firmaLayer.loadGeoJson('/firma-fisica-municipalities.geojson')
    firmaLayer.setStyle(feature =>
      feature.getProperty('requiresReview') ? FIRMA_REVISAR_STYLE : FIRMA_STYLE
    )
    addTooltip(firmaLayer)

    return () => {
      layer.setMap(null)
      firmaLayer.setMap(null)
    }
  }, [map])

  // Pin marker for the searched CP/address
  const markerRef = useRef(null)

  useEffect(() => {
    const g = window.google?.maps
    if (!g) return

    // Remove previous marker
    if (markerRef.current) {
      markerRef.current.setMap(null)
      markerRef.current = null
    }

    if (!map || !searchResult?.lat || !searchResult?.lng) return

    const pinSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"
          fill="#671E75" stroke="white" stroke-width="2"/>
        <circle cx="18" cy="18" r="7" fill="white"/>
        <circle cx="18" cy="18" r="4" fill="#671E75"/>
      </svg>
    `

    const position = { lat: searchResult.lat, lng: searchResult.lng }

    const marker = new g.Marker({
      position,
      map,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg)}`,
        scaledSize: new g.Size(36, 48),
        anchor: new g.Point(18, 48),
      },
      title: searchResult.cp ? `CP ${searchResult.cp}` : '',
      animation: g.Animation.DROP,
    })

    map.panTo(position)
    map.setZoom(14)
    markerRef.current = marker

    return () => {
      marker.setMap(null)
    }
  }, [map, searchResult])

  // Zoom to searched municipality (only when no exact coordinates — pin centering takes priority)
  useEffect(() => {
    if (!map || !loaded || !searchResult?.municipio || searchResult?.lat) return
    if (!dataLayerRef.current) return

    const g = window.google?.maps
    if (!g) return

    try {
      const { municipio, estado } = searchResult
      const bounds = new g.LatLngBounds()
      let found = false

      dataLayerRef.current.forEach(feature => {
        if (
          feature.getProperty('municipio') === municipio &&
          feature.getProperty('estado') === estado
        ) {
          const geom = feature.getGeometry()
          if (geom) {
            geom.forEachLatLng(ll => bounds.extend(ll))
            found = true
          }
        }
      })

      if (found && !bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 80, bottom: 80, left: 80, right: 80 })
      }
    } catch (e) {
      console.warn('[CoverageMap] fitBounds error:', e)
    }
  }, [map, loaded, searchResult])

  return (
    <MapTooltip content={tooltip.content} position={{ x: tooltip.x, y: tooltip.y }} />
  )
}

function MapLoader({ searchResult, onMunicipalityClick }) {
  const apiLoaded = useApiIsLoaded()

  const mapHeight = 'calc(100vh - 300px)'
  const mapMinHeight = '420px'

  if (!apiLoaded) {
    return (
      <div style={{
        height: mapHeight,
        minHeight: mapMinHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--mu-neutral-100)',
        borderRadius: 'var(--mu-radius)',
        color: 'var(--mu-text-muted)',
        fontSize: '14px',
        gap: '10px',
      }}>
        <span className="mu-spinner" style={{ borderTopColor: 'var(--mu-purple-primary)', borderColor: 'var(--mu-border)' }} />
        Cargando mapa...
      </div>
    )
  }

  return (
    <div
      style={{
        borderRadius: 'var(--mu-radius)',
        overflow: 'hidden',
        boxShadow: 'var(--mu-shadow)',
        height: mapHeight,
        minHeight: mapMinHeight,
        position: 'relative',
        background: 'var(--mu-neutral-100)',
      }}
    >
      <Map
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={true}
        zoomControl={true}
        style={{ width: '100%', height: '100%' }}
      >
        <CoverageLayer searchResult={searchResult} onMunicipalityClick={onMunicipalityClick} />
      </Map>
    </div>
  )
}

export default function CoverageMap({ searchResult, onMunicipalityClick }) {
  return <MapLoader searchResult={searchResult} onMunicipalityClick={onMunicipalityClick} />
}
