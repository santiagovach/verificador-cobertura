/**
 * POST /api/admin/sync
 *
 * Valida que el usuario sea admin @moradauno.com y dispara un redeploy
 * de Vercel vía Deploy Hook, lo que regenera el coverage.json desde el Sheet.
 *
 * Auth: Bearer <google_access_token> en el header Authorization.
 */

import { verifyGoogleToken } from '../_auth.js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Vary', 'Origin')
}

export default async function handler(req, res) {
  setCors(req, res)

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado — falta token' })
  }

  try {
    const auth = await verifyGoogleToken(authHeader.slice(7))
    if (!auth.email) return res.status(auth.status).json({ error: auth.error })
    const email = auth.email

    // Fail closed: sin ADMIN_EMAILS configurado nadie es admin.
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({
        error: `Tu cuenta (${email}) no tiene permisos de administrador.`,
      })
    }

    const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
    if (!hookUrl) {
      return res.status(500).json({ error: 'Deploy Hook no configurado en el servidor.' })
    }

    const deployRes = await fetch(hookUrl, { method: 'POST' })
    if (!deployRes.ok) {
      return res.status(500).json({ error: 'Error al disparar el redeploy. Intenta de nuevo.' })
    }

    return res.status(200).json({
      message: 'Redeploy en cola. Los datos se actualizarán cuando termine el build (unos minutos); si no cambian, revisa el deploy en Vercel.',
      triggeredBy: email,
    })
  } catch (err) {
    console.error('[admin/sync]', err.message)
    return res.status(500).json({ error: 'Error interno. Intenta de nuevo.' })
  }
}
