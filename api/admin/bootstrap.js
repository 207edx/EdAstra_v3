// api/admin/bootstrap.js
// Solves the chicken-and-egg problem: the very first admin can't be promoted by "an admin"
// because none exists yet. This endpoint promotes ONE account to admin, gated by a secret
// (ADMIN_BOOTSTRAP_SECRET) that only you know, set as a Vercel env var.
//
// IMPORTANT: after you've created your first admin, delete the ADMIN_BOOTSTRAP_SECRET env
// var in Vercel (or rotate it) and redeploy. Leaving it set means anyone who ever learns
// the secret could mint themselves an admin account. See README "First admin setup".
import admin from 'firebase-admin';
import { getAdminApp } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 5, keyPrefix: 'bootstrap' })) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  }

  if (!process.env.ADMIN_BOOTSTRAP_SECRET) {
    return res.status(500).json({ error: 'Bootstrap is disabled (ADMIN_BOOTSTRAP_SECRET is not set).' });
  }

  const { email, secret } = req.body || {};
  if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    return res.status(401).json({ error: 'Invalid bootstrap secret.' });
  }
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required — the user must already have signed up once.' });
  }

  try {
    getAdminApp();
    const user = await admin.auth().getUserByEmail(email.trim().toLowerCase());
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    await admin.firestore().doc(`users/${user.uid}`).set({ role: 'admin' }, { merge: true });
    return res.status(200).json({ ok: true, uid: user.uid, email: user.email });
  } catch (err) {
    console.error('bootstrap error:', err);
    if (err.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'No account with that email. Sign up in the student portal first.' });
    }
    return res.status(500).json({ error: 'Could not promote user.' });
  }
}
