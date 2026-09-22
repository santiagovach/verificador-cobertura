// Valida que un punto geocodificado caiga dentro del municipio que el Sheet
// "Con Cobertura" le asigna a su CP. El Sheet tiene rangos de CP asignados en
// bloque a un solo municipio (p. ej. 62000–62790 como "Cuernavaca", aunque
// 62520 es Tepoztlán), así que el renglón del Sheet no basta.
//
// Se valida por geometría y no por nombre: el 'locality' de Google suele ser
// un poblado dentro del municipio (Ojo de Agua → Tecámac), lo que daría
// falsos negativos. Usa los mismos polígonos de la capa morada del mapa.

const GEOJSON_URL = '/coverage-municipalities.geojson'
// Tolerancia para geocodes que caen justo en el borde del polígono.
const EDGE_TOLERANCE_KM = 1.5

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const key = (municipio, estado) => `${normalize(municipio)}|||${normalize(estado)}`

let polygonsPromise = null

function loadPolygons() {
  if (!polygonsPromise) {
    polygonsPromise = fetch(GEOJSON_URL)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(indexPolygons)
      .catch(err => {
        polygonsPromise = null
        throw err
      })
  }
  return polygonsPromise
}

export function indexPolygons(geojson) {
  const byKey = new Map()
  for (const f of geojson.features || []) {
    const { municipio, estado } = f.properties || {}
    const g = f.geometry
    if (!g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    const k = key(municipio, estado)
    byKey.set(k, (byKey.get(k) || []).concat(polys))
  }
  return byKey
}

function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Distancia aproximada (km) de un punto a un segmento, en proyección
// equirectangular local — suficiente para una tolerancia de ~1 km.
function segmentDistanceKm([x1, y1], [x2, y2], x, y) {
  const kx = 111.32 * Math.cos((y * Math.PI) / 180)
  const ky = 110.57
  const ax = (x1 - x) * kx, ay = (y1 - y) * ky
  const bx = (x2 - x) * kx, by = (y2 - y) * ky
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

function nearEdge(polys, x, y, tolKm) {
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        if (segmentDistanceKm(ring[i - 1], ring[i], x, y) <= tolKm) return true
      }
    }
  }
  return false
}

// true/false si hay polígono para ese municipio; null si no se puede validar
// (sin polígono o sin coordenadas) — en ese caso se confía en el Sheet.
export function polygonsContain(byKey, { municipio, estado }, { lat, lng }) {
  if (lat == null || lng == null) return null
  const polys = byKey.get(key(municipio, estado))
  if (!polys?.length) return null
  const inside = polys.some(([outer, ...holes]) =>
    ringContains(outer, lng, lat) && !holes.some(h => ringContains(h, lng, lat))
  )
  return inside || nearEdge(polys, lng, lat, EDGE_TOLERANCE_KM)
}

export async function pointInMunicipality(entry, point) {
  try {
    return polygonsContain(await loadPolygons(), entry, point)
  } catch {
    return null
  }
}
