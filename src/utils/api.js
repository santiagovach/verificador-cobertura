const API_BASE = import.meta.env.VITE_API_URL || ''

export async function triggerSync(accessToken) {
  const res = await fetch(`${API_BASE}/api/admin/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error desconocido al sincronizar.')
  return data
}

export async function searchParty(accessToken, q) {
  const res = await fetch(`${API_BASE}/api/search-party?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al buscar.')
  return data.results
}

export async function searchOrganization(accessToken, q) {
  const res = await fetch(`${API_BASE}/api/search-organization?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al buscar.')
  return data.results
}

export async function checkPIC(accessToken, { landlordId, organizationIds } = {}) {
  const params = new URLSearchParams()
  if (landlordId) params.set('landlordId', landlordId)
  if (organizationIds?.length) params.set('organizationIds', organizationIds.join(','))

  const res = await fetch(`${API_BASE}/api/check-pic?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al verificar PIC.')
  return data
}
