/**
 * GET /api/lookup-landlord?dealId=127578
 *
 * Dado un deal ID, resuelve renta/revenue del deal y si el propietario
 * asociado califica como "PIC" (>10 rentas cerradas y renta promedio
 * >= $20,000 en todos sus deals), consultando Metabase en vivo.
 *
 * "Cerrada" se aproxima como agreement.signing_date IS NOT NULL — no existe
 * una columna literal "closed" en la tabla `agreement`/`deal` (el status
 * "Closed" que expone la API de Admin es un campo derivado, no una columna
 * de MySQL) — verificar este proxy contra un propietario real con >10 deals
 * antes de confiar en el resultado en producción.
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

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const email = await requireMoradaunoUser(req, res)
  if (!email) return

  const dealId = parseInt(req.query.dealId, 10)
  if (!Number.isInteger(dealId) || dealId <= 0) {
    return res.status(400).json({ error: 'dealId inválido' })
  }

  try {
    const dealRows = await queryMetabase(`
      SELECT d.landlord_id, a.value AS rent_amount, a.revenue, a.cost_percent
      FROM deal d
      JOIN agreement a ON d.agreement_id = a.id
      WHERE d.id = ${dealId}
      LIMIT 1
    `)

    const deal = dealRows[0]
    if (!deal) return res.status(404).json({ error: `Deal ${dealId} no encontrado` })

    const rentAmount = deal.rent_amount != null ? parseFloat(deal.rent_amount) : null
    const revenue = deal.revenue != null ? parseFloat(deal.revenue) : null
    const landlordId = deal.landlord_id ? parseInt(deal.landlord_id, 10) : null

    if (!landlordId) {
      return res.status(200).json({
        dealId,
        rentAmount,
        revenue,
        landlordAssigned: false,
        isPIC: null,
        closedDealsCount: null,
        avgRent: null,
      })
    }

    const aggRows = await queryMetabase(`
      SELECT
        SUM(CASE WHEN a.signing_date IS NOT NULL THEN 1 ELSE 0 END) AS closed_count,
        AVG(a.value) AS avg_rent
      FROM deal d
      JOIN agreement a ON d.agreement_id = a.id
      WHERE d.landlord_id = ${landlordId}
    `)

    const agg = aggRows[0] || {}
    const closedDealsCount = agg.closed_count != null ? parseInt(agg.closed_count, 10) : 0
    const avgRent = agg.avg_rent != null ? parseFloat(agg.avg_rent) : 0
    const isPIC = closedDealsCount > PIC_MIN_CLOSED_DEALS && avgRent >= PIC_MIN_AVG_RENT

    return res.status(200).json({
      dealId,
      rentAmount,
      revenue,
      landlordAssigned: true,
      landlordId,
      isPIC,
      closedDealsCount,
      avgRent,
    })
  } catch (err) {
    console.error('[lookup-landlord]', err.message)
    return res.status(500).json({ error: 'Error al consultar Metabase. Intenta de nuevo.' })
  }
}
