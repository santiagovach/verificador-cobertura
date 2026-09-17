/**
 * GET /api/check-pic?landlordId=123&brokerId=456&organizationIds=789,101
 *
 * Decide si un propietario, un asesor y/o una o más inmobiliarias
 * califican como PIC. Tres fuentes distintas:
 *
 * 1. Propietario (landlordId): >10 rentas cerradas y renta promedio
 *    >= $20,000 en TODOS sus deals (calculado — no hay flag directo para
 *    propietarios). "Cerrada" se aproxima con agreement.signing_date IS
 *    NOT NULL (no existe una columna literal de estatus "Closed").
 * 2. Asesor (brokerId): flag DIRECTO y autoritativo —
 *    broker_hubspot_data.perfil = 'PIC' (viene de HubSpot, no calculado
 *    por esta app). Solo ~65% de los brokers tienen fila en esa tabla;
 *    si no la tiene, este check simplemente no aplica (no cuenta como
 *    "no PIC", solo como "sin dato" — puede seguir calificando por su
 *    inmobiliaria).
 * 3. Inmobiliaria (organizationIds): agregando TODOS los deals de TODOS
 *    sus brokers, mismo umbral que propietario. Si la inmobiliaria
 *    califica, cualquiera de sus brokers hereda el estatus aunque ese
 *    broker en lo individual no llegue a >10 deals ni tenga perfil PIC.
 *
 * Acepta cualquier combinación de los tres — isPIC = true si CUALQUIERA
 * de los checks pasados califica.
 *
 * Auth: Bearer <google_access_token>, cualquier cuenta @moradauno.com.
 */

const METABASE_URL = 'https://morada-uno.metabaseapp.com'
const DB_ID = 2 // M1ApiProd mysql

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

const PIC_MIN_CLOSED_DEALS = 10
const PIC_MIN_AVG_RENT = 20000

async function checkLandlordPIC(landlordId) {
  const rows = await queryMetabase(`
    SELECT
      SUM(CASE WHEN a.signing_date IS NOT NULL THEN 1 ELSE 0 END) AS closed_count,
      AVG(a.value) AS avg_rent
    FROM deal d
    JOIN agreement a ON d.agreement_id = a.id
    WHERE d.landlord_id = ${landlordId}
  `)
  const row = rows[0] || {}
  const closedDealsCount = row.closed_count != null ? parseInt(row.closed_count, 10) : 0
  const avgRent = row.avg_rent != null ? parseFloat(row.avg_rent) : 0
  return {
    source: 'landlord',
    id: landlordId,
    closedDealsCount,
    avgRent,
    qualifies: closedDealsCount > PIC_MIN_CLOSED_DEALS && avgRent >= PIC_MIN_AVG_RENT,
  }
}

async function checkBrokerPIC(brokerId) {
  const rows = await queryMetabase(`
    SELECT perfil
    FROM broker_hubspot_data
    WHERE broker_id = ${brokerId}
    LIMIT 1
  `)
  const perfil = rows[0]?.perfil || null
  return {
    source: 'broker',
    id: brokerId,
    perfil,
    qualifies: perfil === 'PIC',
  }
}

async function checkOrganizationPIC(organizationId) {
  const rows = await queryMetabase(`
    SELECT
      SUM(CASE WHEN a.signing_date IS NOT NULL THEN 1 ELSE 0 END) AS closed_count,
      AVG(a.value) AS avg_rent
    FROM deal d
    JOIN agreement a ON d.agreement_id = a.id
    JOIN broker b ON d.broker_id = b.id
    WHERE b.organization_id = ${organizationId}
  `)
  const row = rows[0] || {}
  const closedDealsCount = row.closed_count != null ? parseInt(row.closed_count, 10) : 0
  const avgRent = row.avg_rent != null ? parseFloat(row.avg_rent) : 0
  return {
    source: 'organization',
    id: organizationId,
    closedDealsCount,
    avgRent,
    qualifies: closedDealsCount > PIC_MIN_CLOSED_DEALS && avgRent >= PIC_MIN_AVG_RENT,
  }
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const email = await requireMoradaunoUser(req, res)
  if (!email) return

  const landlordId = parseInt(req.query.landlordId, 10)
  const brokerId = parseInt(req.query.brokerId, 10)
  const organizationIds = [...new Set(
    (req.query.organizationIds || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Number.isInteger)
  )]

  if (!Number.isInteger(landlordId) && !Number.isInteger(brokerId) && organizationIds.length === 0) {
    return res.status(400).json({ error: 'Se requiere landlordId, brokerId y/o organizationIds' })
  }

  try {
    const checks = []
    if (Number.isInteger(landlordId)) checks.push(await checkLandlordPIC(landlordId))
    if (Number.isInteger(brokerId)) checks.push(await checkBrokerPIC(brokerId))
    for (const orgId of organizationIds) checks.push(await checkOrganizationPIC(orgId))

    const matched = checks.find(c => c.qualifies)

    return res.status(200).json({
      isPIC: Boolean(matched),
      matchedVia: matched?.source || null,
      checks,
    })
  } catch (err) {
    console.error('[check-pic]', err.message)
    return res.status(500).json({ error: 'Error al consultar Metabase. Intenta de nuevo.' })
  }
}
