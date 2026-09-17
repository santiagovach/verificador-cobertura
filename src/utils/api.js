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

export async function lookupLandlord(accessToken, dealId) {
  const res = await fetch(`${API_BASE}/api/lookup-landlord?dealId=${encodeURIComponent(dealId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error desconocido al buscar el deal.')
  return data
}
