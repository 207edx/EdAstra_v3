// api/admin/bootstrap.js
// One-time bootstrap for the first AstroCore admin account.
// Protected by ADMIN_BOOTSTRAP_SECRET and disabled once any admin claim exists.
import admin from 'firebase-admin';
import { getAdminApp } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 5, keyPrefix: 'admin-bootstrap' })) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'Bootstrap is not configured.' });
  }

  const { email, secret } = req.body || {};

  if (!email || typeof email !== 'string' || !secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'email and secret are required.' });
  }

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid bootstrap secret.' });
  }

  try {
    getAdminApp();

    // Bootstrap must only be usable before the first admin exists.
    let pageToken;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      if (page.users.some((user) => user.customClaims?.admin === true)) {
        return res.status(409).json({ error: 'An admin already exists. Bootstrap is disabled.' });
      }
      pageToken = page.pageToken;
    } while (pageToken);

    let user;
    try {
      user = await admin.auth().getUserByEmail(email.trim());
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'No account with that email.' });
      }
      throw err;
    }

    await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });

    await admin.firestore().doc(`users/${user.uid}`).set(
      {
        uid: user.uid,
        email: user.email || email.trim(),
        displayName: user.displayName || '',
        role: 'admin',
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, uid: user.uid });
  } catch (err) {
    console.error('bootstrap error:', err);
    return res.status(500).json({ error: err.message || 'Could not bootstrap admin.' });
  }
}
