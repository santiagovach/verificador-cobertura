/**
 * GET /api/search-organization?q=century
 *
 * Autocomplete de "inmobiliaria": busca por nombre parcial en
 * `broker_organization` (Metabase). Mismo query que ya usa
 * moradauno-case-finder (server/services/metabase.js:searchOrganizations).
 *
 * Auth: Bearer <google_access_token>, cualquier cuenta @moradauno.com.
 */

const METABASE_URL = 'https://morada-uno.metabaseapp.com'
const DB_ID = 2 // M1ApiProd mysql

function escapeSqlString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
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

async function requireMoradaunoUser(req, res) {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — falta token' })
    return null
  }
  const accessToken = authHeader.slice(7)
  const tokenRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`)
  const tokenInfo = await tokenRes.json()
  if (!tokenRes.ok || tokenInfo.error || !tokenInfo.email) {
    res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' })
    return null
  }
  if (!tokenInfo.email.endsWith('@moradauno.com')) {
    res.status(403).json({ error: 'Solo se permiten cuentas @moradauno.com' })
    return null
  }
  return tokenInfo.email
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const email = await requireMoradaunoUser(req, res)
  if (!email) return

  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.status(200).json({ results: [] })

  try {
    const rows = await queryMetabase(`
      SELECT id, name
      FROM broker_organization
      WHERE name LIKE '%${escapeSqlString(q)}%'
      ORDER BY name
      LIMIT 8
    `)

    return res.status(200).json({ results: rows.map(r => ({ id: r.id, name: r.name })) })
  } catch (err) {
    console.error('[search-organization]', err.message)
    return res.status(500).json({ error: 'Error al buscar en Metabase. Intenta de nuevo.' })
  }
}
