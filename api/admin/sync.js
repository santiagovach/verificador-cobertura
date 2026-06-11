/**
 * POST /api/admin/sync
 *
 * Valida que el usuario sea admin @moradauno.com y dispara un redeploy
 * de Vercel vía Deploy Hook, lo que regenera el coverage.json desde el Sheet.
 *
 * Auth: Bearer <google_access_token> en el header Authorization.
 */

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

  const accessToken = authHeader.slice(7)

  try {
    // Validar el token de acceso con Google
    const tokenRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
    )
    const tokenInfo = await tokenRes.json()

    if (!tokenRes.ok || tokenInfo.error) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' })
    }

    const email = tokenInfo.email
    if (!email) {
      return res.status(401).json({ error: 'No se pudo verificar el email.' })
    }

    if (!email.endsWith('@moradauno.com')) {
      return res.status(403).json({ error: 'Solo se permiten cuentas @moradauno.com' })
    }

    if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
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
      message: '¡Sincronización iniciada! El mapa se actualizará en aproximadamente 60 segundos.',
      triggeredBy: email,
    })
  } catch (err) {
    console.error('[admin/sync]', err.message)
    return res.status(500).json({ error: 'Error interno. Intenta de nuevo.' })
  }
}
