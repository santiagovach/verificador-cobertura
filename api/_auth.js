/**
 * Validación compartida del access token de Google (no es endpoint: Vercel
 * no despliega como función los archivos de api/ que empiezan con "_").
 *
 * Además del dominio, exige que el token sea de ESTA app (aud/azp = nuestro
 * client id) — si no, cualquier token de Google de otra app con una cuenta
 * @moradauno.com pasaba — y que el email esté verificado.
 */

const TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo'

/**
 * Devuelve { email } si el token es válido, o { status, error } si no.
 * status: 500 (falta config), 401 (token inválido), 403 (dominio).
 */
export async function verifyGoogleToken(accessToken) {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('[auth] falta VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID')
    return { status: 500, error: 'Configuración incompleta' }
  }
  if (!accessToken) {
    return { status: 401, error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' }
  }

  const tokenRes = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`)
  const tokenInfo = await tokenRes.json().catch(() => ({}))
  const verified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true'
  const ownClient = tokenInfo.aud === clientId || tokenInfo.azp === clientId

  if (!tokenRes.ok || tokenInfo.error || !tokenInfo.email || !verified || !ownClient) {
    return { status: 401, error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' }
  }
  if (!tokenInfo.email.endsWith('@moradauno.com')) {
    return { status: 403, error: 'Solo se permiten cuentas @moradauno.com' }
  }
  return { email: tokenInfo.email }
}

// Para los endpoints: responde 401/403/500 y devuelve null, o devuelve el email.
export async function requireMoradaunoUser(req, res) {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — falta token' })
    return null
  }
  const result = await verifyGoogleToken(authHeader.slice(7))
  if (!result.email) {
    res.status(result.status).json({ error: result.error })
    return null
  }
  return result.email
}
