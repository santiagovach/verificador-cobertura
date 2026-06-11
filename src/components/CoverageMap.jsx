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

function CoverageLayer({ searchResult }) {
  const map = useMap()
  const dataLayerRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [tooltip, setTooltip] = useState({ content: null, x: 0, y: 0 })

  useEffect(() => {
    if (!map) return
    // Wait for google.maps to be available on window
    const g = window.google?.maps
    if (!g) return

    const layer = new g.Data({ map })
    dataLayerRef.current = layer

    layer.loadGeoJson('/coverage-municipalities.geojson', null, features => {
      if (features && features.length > 0) setLoaded(true)
    })

    layer.setStyle(POLYGON_STYLE)

    layer.addListener('mouseover', e => {
      layer.overrideStyle(e.feature, { fillOpacity: 0.65, strokeWeight: 2 })
      const municipio = e.feature.getProperty('municipio')
      const estado = e.feature.getProperty('estado')
      setTooltip({
        content: `${municipio}, ${estado}`,
        x: e.domEvent?.offsetX ?? 0,
        y: e.domEvent?.offsetY ?? 0,
      })
    })

    layer.addListener('mousemove', e => {
      setTooltip(prev => ({
        ...prev,
        x: e.domEvent?.offsetX ?? prev.x,
        y: e.domEvent?.offsetY ?? prev.y,
      }))
    })

    layer.addListener('mouseout', e => {
      layer.revertStyle(e.feature)
      setTooltip({ content: null, x: 0, y: 0 })
    })

    return () => {
      layer.setMap(null)
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

    const marker = new g.Marker({
      position: { lat: searchResult.lat, lng: searchResult.lng },
      map,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg)}`,
        scaledSize: new g.Size(36, 48),
        anchor: new g.Point(18, 48),
      },
      title: searchResult.cp ? `CP ${searchResult.cp}` : '',
      animation: g.Animation.DROP,
    })

    markerRef.current = marker

    return () => {
      marker.setMap(null)
    }
  }, [map, searchResult])

  // Zoom to searched municipality
  useEffect(() => {
    if (!map || !loaded || !searchResult?.municipio) return
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

function MapLoader({ searchResult }) {
  const apiLoaded = useApiIsLoaded()

  if (!apiLoaded) {
    return (
      <div style={{
        height: '460px',
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
        height: '460px',
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
        <CoverageLayer searchResult={searchResult} />
      </Map>
    </div>
  )
}

export default function CoverageMap({ searchResult }) {
  return <MapLoader searchResult={searchResult} />
}
