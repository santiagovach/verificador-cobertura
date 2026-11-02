// Municipios con CPs en "Con Cobertura" cuya cobertura todavía se está confirmando con el equipo
// de la plaza: el buscador responde "por confirmar" (ni sí ni no) y el mapa no los pinta.
// Santiago, 2026-11-02: en BC solo Tijuana, Rosarito y Tecate quedan con cobertura; el resto está
// lejos de la oficina de Tijuana (Ensenada ~80 km, Mexicali ~140 km, San Quintín/San Felipe 240+ km).
export const PENDING_CONFIRMATION = [
  { municipio: 'Ensenada', estado: 'Baja California' },
  { municipio: 'Mexicali', estado: 'Baja California' },
  { municipio: 'San Quintín', estado: 'Baja California' },
  { municipio: 'San Felipe', estado: 'Baja California' },
]

const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const PENDING_KEYS = new Set(PENDING_CONFIRMATION.map(m => `${normalize(m.municipio)}|||${normalize(m.estado)}`))

export function isPendingConfirmation(municipio, estado) {
  return PENDING_KEYS.has(`${normalize(municipio)}|||${normalize(estado)}`)
}
