// api/health.js — simple uptime/deploy check, useful for monitoring.
export default function handler(req, res) {
  res.status(200).json({ ok: true, service: 'astrocore', time: new Date().toISOString() });
}
