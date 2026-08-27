// lib/rateLimit.js
// Best-effort, per-instance in-memory rate limiting. Serverless functions can spin up
// multiple instances, so this is NOT a hard global guarantee — it's a cheap first line of
// defense against casual abuse/scripted spam with zero extra infrastructure. For strict,
// globally-accurate limits under real load, swap this for Upstash Redis / Vercel KV
// (see README "Hardening further").
const buckets = new Map();
const MAX_BUCKETS = 5000; // basic guard against unbounded memory growth

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(req, { windowMs = 60000, max = 30, keyPrefix = '' } = {}) {
  if (buckets.size > MAX_BUCKETS) buckets.clear();

  const key = `${keyPrefix}:${clientIp(req)}`;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}
