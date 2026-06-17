export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
  if (!hookUrl) {
    return res.status(500).json({ error: 'Deploy Hook not configured' })
  }

  const deployRes = await fetch(hookUrl, { method: 'POST' })
  if (!deployRes.ok) {
    return res.status(500).json({ error: 'Deploy hook returned non-ok status' })
  }

  return res.status(200).json({ ok: true })
}
