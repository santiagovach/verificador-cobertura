/**
 * POST /api/track  { event_type: 'login' | 'pageview' | 'action', path?, action_name? }
 *
 * Relay de eventos de uso a AdoptionHUB (moradauno-adoption-hub), el dashboard interno que
 * junta login/pageview de las herramientas de MoradaUno para managers. El email SIEMPRE sale
 * del token de Google verificado aquí en el servidor — nunca del body, que no es confiable.
 *
 * A diferencia de las otras herramientas (Express, fire-and-forget), aquí SÍ se espera la
 * llamada al hub antes de responder: en Vercel la función se congela al mandar la respuesta
 * y un fetch pendiente se perdería. El timeout corto evita que un hub caído la alargue, y el
 * cliente de todos modos no espera esta respuesta.
 *
 * Auth: Bearer <google_access_token>, cualquier cuenta @moradauno.com.
 */

const TOOL_ID = 'verificador-cobertura'
const VALID_EVENT_TYPES = new Set(['login', 'pageview', 'action'])
const VALID_ACTIONS = new Set(['search'])

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const email = await requireMoradaunoUser(req, res)
  if (!email) return

  const { event_type, path, action_name } = req.body || {}
  if (!VALID_EVENT_TYPES.has(event_type)) return res.status(400).json({ error: 'event_type inválido' })
  if (event_type === 'action' && !VALID_ACTIONS.has(action_name)) {
    return res.status(400).json({ error: 'action_name inválido' })
  }

  const hubUrl = process.env.ADOPTION_HUB_URL
  const ingestKey = process.env.ADOPTION_HUB_INGEST_KEY
  if (!hubUrl || !ingestKey) return res.status(200).json({ ok: true, skipped: true })

  try {
    const hubRes = await fetch(`${hubUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ingestKey}` },
      body: JSON.stringify({
        tool: TOOL_ID,
        event_type,
        user_email: email,
        path: typeof path === 'string' ? path.slice(0, 200) : null,
        action_name: event_type === 'action' ? action_name : null,
      }),
      signal: AbortSignal.timeout(3000),
    })
    // fetch no truena con 4xx/5xx — sin esto, un ADOPTION_HUB_INGEST_KEY equivocado (401 del
    // hub) se perdía en silencio.
    if (!hubRes.ok) console.error(`[adoptionhub] hub respondió ${hubRes.status}`)
  } catch (err) {
    console.error('[adoptionhub] track failed', err)
  }

  return res.status(200).json({ ok: true })
}
