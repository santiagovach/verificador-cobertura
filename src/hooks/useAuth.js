import { useState, useCallback } from 'react'
import { useGoogleLogin } from '@react-oauth/google'

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)

function loadStoredUser() {
  try {
    const raw = localStorage.getItem('mu_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState(loadStoredUser)

  const signIn = useGoogleLogin({
    hosted_domain: 'moradauno.com',
    scope: 'openid email profile',
    onSuccess: async tokenResponse => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        const profile = await res.json()

        if (!profile.email?.endsWith('@moradauno.com')) {
          alert('Solo se permiten cuentas @moradauno.com')
          return
        }

        const userData = {
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          accessToken: tokenResponse.access_token,
        }

        localStorage.setItem('mu_user', JSON.stringify(userData))
        setUser(userData)
      } catch {
        alert('Error al obtener la información de tu cuenta. Intenta de nuevo.')
      }
    },
    onError: () => alert('No se pudo completar el inicio de sesión. Intenta de nuevo.'),
  })

  const signOut = useCallback(() => {
    localStorage.removeItem('mu_user')
    setUser(null)
  }, [])

  const isAdmin = user ? ADMIN_EMAILS.includes(user.email) : false

  return { user, isAdmin, signIn, signOut }
}
