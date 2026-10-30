/**
 * GET /api/search-party?q=juan
 *
 * Autocomplete de "asesor / propietario": busca por nombre O teléfono
 * parcial en `landlord` y `broker` (Metabase), para usarse ANTES de que
 * exista un deal — Sales/CS lo usan para saber si vale la pena avanzar,
 * no para revisar un deal ya cerrado.
 *
 * El teléfono se compara normalizado (sin espacios/guiones/+) porque así
 * está guardado de forma inconsistente en la base ("+52 5551044455",
 * "4424397797", "55 4870 2698", etc.) — solo se activa esa comparación
 * si el texto tiene al menos 4 dígitos, para no matchear todo por accidente.
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
  // Orden por calidad de match: exacto, luego "empieza con", luego el resto
  // (incluye matches por teléfono), y al final alfabético.
  const rank = col => `CASE WHEN ${col} = '${exact}' THEN 0 WHEN ${col} LIKE '${like}%' THEN 1 ELSE 2 END`
  const digits = q.replace(/\D/g, '')
  const normalizedPhone = "REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '')"
  const phoneClause = digits.length >= 4 ? ` OR ${normalizedPhone} LIKE '%${digits}%'` : ''

  try {
    const rows = await queryMetabase(`
      (SELECT id, name, phone, NULL AS organization_id, NULL AS organization_name, 'landlord' AS party_type
       FROM landlord WHERE (name LIKE '%${like}%'${phoneClause}) ORDER BY ${rank('name')}, name LIMIT 6)
      UNION ALL
      (SELECT b.id, b.name, b.phone, b.organization_id, bo.name AS organization_name, 'broker' AS party_type
       FROM broker b LEFT JOIN broker_organization bo ON b.organization_id = bo.id
       WHERE (b.name LIKE '%${like}%'${phoneClause.replaceAll('phone', 'b.phone')}) ORDER BY ${rank('b.name')}, b.name LIMIT 6)
    `)

    const results = rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone || null,
      type: r.party_type,
      organizationId: r.organization_id || null,
      organizationName: r.organization_name || null,
    }))

    return res.status(200).json({ results })
  } catch (err) {
    console.error('[search-party]', err.message)
    return res.status(500).json({ error: 'Error al buscar en Metabase. Intenta de nuevo.' })
  }
}
