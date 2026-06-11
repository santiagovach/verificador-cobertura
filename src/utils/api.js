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
