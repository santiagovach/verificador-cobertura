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

  const escaped = escapeSqlString(q)
  const digits = q.replace(/\D/g, '')
  const normalizedPhone = "REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '')"
  const phoneClause = digits.length >= 4 ? ` OR ${normalizedPhone} LIKE '%${digits}%'` : ''

  try {
    const rows = await queryMetabase(`
      (SELECT id, name, phone, NULL AS organization_id, NULL AS organization_name, 'landlord' AS party_type
       FROM landlord WHERE (name LIKE '%${escaped}%'${phoneClause}) ORDER BY name LIMIT 6)
      UNION ALL
      (SELECT b.id, b.name, b.phone, b.organization_id, bo.name AS organization_name, 'broker' AS party_type
       FROM broker b LEFT JOIN broker_organization bo ON b.organization_id = bo.id
       WHERE (b.name LIKE '%${escaped}%'${phoneClause.replaceAll('phone', 'b.phone')}) ORDER BY b.name LIMIT 6)
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
