// Querétaro según Zion Nieto (City Manager QRO, 2026-11-02), en vez del Sheet de Alely:
// - Protección: solo la zona metropolitana (municipios de Querétaro, Corregidora y El Marqués).
//   Fuera de ella no hay cobertura en QRO aunque el Sheet traiga CPs (Amealco, etc.).
// - Zonas rojas ("zona de peligro sin protección"): sin ningún servicio.
// - Firma presencial: solo dentro de la zona que él delimitó, siempre sin costo. Dentro de la
//   zona metropolitana pero fuera de esa zona, firma electrónica.
// Polígonos en src/data/qroZones.json (de su Google My Maps).
import qroZonesData from '../data/qroZones.json'
import { ringContains, pointInMunicipality } from './municipalityContains.js'

export const QRO_METRO = [
  { municipio: 'Querétaro', estado: 'Querétaro' },
  { municipio: 'Corregidora', estado: 'Querétaro' },
  { municipio: 'El Marqués', estado: 'Querétaro' },
]

export const QRO_SIGNING_ZONE = qroZonesData.signingZone
export const QRO_RED_ZONES = qroZonesData.redZones

const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
export const isQueretaroState = estado => normalize(estado) === 'queretaro'
export const isQroMetro = (municipio, estado) =>
  isQueretaroState(estado) && QRO_METRO.some(m => normalize(m.municipio) === normalize(municipio))

export const inQroSigningZone = ({ lat, lng }) => ringContains(QRO_SIGNING_ZONE, lng, lat)
export const inQroRedZone = ({ lat, lng }) => QRO_RED_ZONES.some(r => ringContains(r, lng, lat))

/**
 * @returns {Promise<null | { red: true } | { red: false, municipio: string, estado: string, inSigningZone: boolean }>}
 *   null si el punto no está en la zona metropolitana de QRO (o no se pudo validar).
 */
export async function resolveQro(point) {
  if (point?.lat == null || point?.lng == null) return null
  const inside = await Promise.all(QRO_METRO.map(m => pointInMunicipality(m, point, 0)))
  const metro = QRO_METRO[inside.indexOf(true)]
  if (!metro) return null
  if (inQroRedZone(point)) return { red: true }
  return { red: false, ...metro, inSigningZone: inQroSigningZone(point) }
}
