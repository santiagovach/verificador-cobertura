const API_BASE = import.meta.env.VITE_API_URL || ''

// Los tokens de Google (login implícito) expiran ~1h y esta app no los
// refresca. Antes, un 401 fallaba en silencio (la búsqueda de asesor/
// propietario/inmobiliaria simplemente no mostraba resultados, sin decir
// por qué). Ahora se detecta el 401 y se avisa a App.jsx para forzar un
// re-login limpio en vez de dejar al usuario adivinando.
async function authorizedFetch(url, options, accessToken) {
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('mu:session-expired'))
    throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error desconocido.')
  return data
}

export async function triggerSync(accessToken) {
  return authorizedFetch(`${API_BASE}/api/admin/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, accessToken)
}

export async function searchParty(accessToken, q) {
  const data = await authorizedFetch(`${API_BASE}/api/search-party?q=${encodeURIComponent(q)}`, {}, accessToken)
  return data.results
}

export async function searchOrganization(accessToken, q) {
  const data = await authorizedFetch(`${API_BASE}/api/search-organization?q=${encodeURIComponent(q)}`, {}, accessToken)
  return data.results
}

export async function checkPIC(accessToken, { landlordId, organizationIds } = {}) {
  const params = new URLSearchParams()
  if (landlordId) params.set('landlordId', landlordId)
  if (organizationIds?.length) params.set('organizationIds', organizationIds.join(','))

  return authorizedFetch(`${API_BASE}/api/check-pic?${params.toString()}`, {}, accessToken)
}
