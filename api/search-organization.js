/**
 * GET /api/search-organization?q=century
 *
 * Autocomplete de "inmobiliaria": busca por nombre parcial en
 * `broker_organization` (Metabase). Mismo query que ya usa
 * moradauno-case-finder (server/services/metabase.js:searchOrganizations).
 *
 * Auth: Bearer <google_access_token> de esta app, cualquier cuenta @moradauno.com
 * verificada (ver _auth.js).
 */

import { requireMoradaunoUser } from './_auth.js'

const METABASE_URL = 'https://morada-uno.metabaseapp.com'
const DB_ID = 2 // M1ApiProd mysql

function escapeSqlString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Escapa los comodines de LIKE (% y _) y la propia diagonal ANTES de
// escapeSqlString: así '%' llega al patrón como '\%' (literal), no como comodín.
function escapeLikeTerm(str) {
  return escapeSqlString(String(str).replace(/[\\%_]/g, '\\$&'))
}

// Limpia el texto de búsqueda: sin caracteres de plantilla de Metabase
// ({{ }} / [[ ]]), sin espacios a los lados y máximo 80 caracteres.
function cleanQuery(raw) {
  return String(raw || '').replace(/[{}\[\]]/g, '').trim().slice(0, 80).trim()
}

async function queryMetabase(sql) {
  const apiKey = process.env.METABASE_API_KEY
  if (!apiKey) throw new Error('METABASE_API_KEY no configurada')

  const res = await fetch(`${METABASE_URL}/api/dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ database: DB_ID, type: 'native', native: { query: sql } }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Metabase HTTP ${res.status}`)
  const payload = await res.json()
  if (payload.error) throw new Error(`Metabase: ${payload.error}`)

  const cols = payload.data.cols.map(c => c.name)
  return payload.data.rows.map(row => Object.fromEntries(cols.map((col, i) => [col, row[i]])))
}

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Vary', 'Origin')
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const email = await requireMoradaunoUser(req, res)
  if (!email) return

  const q = cleanQuery(req.query.q)
  if (q.length < 2) return res.status(200).json({ results: [] })

  const exact = escapeSqlString(q)
  const like = escapeLikeTerm(q)

  try {
    // Orden por calidad de match: exacto, luego "empieza con", luego el resto.
    const rows = await queryMetabase(`
      SELECT id, name
      FROM broker_organization
      WHERE name LIKE '%${like}%'
      ORDER BY CASE WHEN name = '${exact}' THEN 0 WHEN name LIKE '${like}%' THEN 1 ELSE 2 END, name
      LIMIT 8
    `)

    return res.status(200).json({ results: rows.map(r => ({ id: r.id, name: r.name })) })
  } catch (err) {
    console.error('[search-organization]', err.message)
    return res.status(500).json({ error: 'Error al buscar en Metabase. Intenta de nuevo.' })
  }
}
