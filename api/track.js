/**
 * POST /api/track  { event_type: 'login' | 'pageview' | 'action', path?, action_name? }
 *                  o { path, kind: 'click', label } (click de botón -> action 'click')
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
 * Auth: Bearer <google_access_token>, cualquier cuenta @moradauno.com — o, si ese token ya
 * venció, el header X-Track-Token. El token de Google dura ~1h y la app no lo refresca, pero
 * la búsqueda de cobertura no lo necesita: la gente sigue usando la app horas/días con un token
 * muerto y ese uso se perdía. Por eso, cada vez que llega un token de Google válido se responde
 * con un trackToken firmado (HMAC con un secreto de servidor, 90 días) que solo sirve para esto:
 * identifica al usuario ya verificado sin volver a pedir login, y no se puede falsificar.
 */

import crypto from 'node:crypto'

const TOOL_ID = 'verificador-cobertura'
const VALID_EVENT_TYPES = new Set(['login', 'pageview', 'action'])
const VALID_ACTIONS = new Set(['search'])

const TRACK_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

function signTrackToken(secret, email, exp) {
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`track:${payload}`).digest('base64url')
  return `${payload}.${sig}`
}

function verifyTrackToken(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', secret).update(`track:${payload}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof email !== 'string' || !email.endsWith('@moradauno.com') || !(exp > Date.now())) return null
    return email
  } catch {
    return null
  }
}

async function googleEmail(req) {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) return null
  const tokenRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${authHeader.slice(7)}`)
  const tokenInfo = await tokenRes.json()
  if (!tokenRes.ok || tokenInfo.error || !tokenInfo.email?.endsWith('@moradauno.com')) return null
  return tokenInfo.email
}

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Track-Token')
  res.setHeader('Vary', 'Origin')
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const hubUrl = process.env.ADOPTION_HUB_URL
  const ingestKey = process.env.ADOPTION_HUB_INGEST_KEY
  if (!hubUrl || !ingestKey) return res.status(200).json({ ok: true, skipped: true })

  // El mismo ingestKey (solo vive en el servidor) firma el trackToken; el prefijo "track:" en
  // el HMAC lo separa de su uso como Bearer hacia el hub.
  const verifiedEmail = await googleEmail(req)
  const email = verifiedEmail || verifyTrackToken(ingestKey, req.headers['x-track-token'])
  if (!email) return res.status(401).json({ error: 'Sesión inválida o expirada.' })
  const trackToken = verifiedEmail ? signTrackToken(ingestKey, verifiedEmail, Date.now() + TRACK_TOKEN_TTL_MS) : undefined

  const body = req.body || {}
  const { path } = body
  let { event_type, action_name } = body
  let metadata
  // Clicks de botones: { path, kind: 'click', label } -> evento 'action' con el label en metadata.
  if (body.kind === 'click') {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (!label || label.length > 80) return res.status(400).json({ error: 'label inválido' })
    event_type = 'action'
    action_name = 'click'
    metadata = { label }
  } else {
    if (!VALID_EVENT_TYPES.has(event_type)) return res.status(400).json({ error: 'event_type inválido' })
    if (event_type === 'action' && !VALID_ACTIONS.has(action_name)) {
      return res.status(400).json({ error: 'action_name inválido' })
    }
  }

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
        ...(metadata && { metadata }),
      }),
      signal: AbortSignal.timeout(3000),
    })
    // fetch no truena con 4xx/5xx — sin esto, un ADOPTION_HUB_INGEST_KEY equivocado (401 del
    // hub) se perdía en silencio.
    if (!hubRes.ok) console.error(`[adoptionhub] hub respondió ${hubRes.status}`)
  } catch (err) {
    console.error('[adoptionhub] track failed', err)
  }

  return res.status(200).json({ ok: true, trackToken })
}
