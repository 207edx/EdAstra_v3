// api/admin/set-role.js
// Promote or demote a user. Caller MUST already be an admin (verified via a real Firebase
// ID token + custom claim, not a client-trusted field) — this is what makes role changes
// actually secure, unlike editing a "role" field directly in Firestore from the browser.
import admin from 'firebase-admin';
import { getAdminApp, verifyAdmin } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 30, keyPrefix: 'set-role' })) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  const caller = await verifyAdmin(req);
  if (!caller) return res.status(403).json({ error: 'Admin privileges required.' });

  const { uid, role } = req.body || {};
  if (!uid || !['student', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'uid and role ("student" | "admin") are required.' });
  }
  if (uid === caller.uid && role !== 'admin') {
    return res.status(400).json({ error: "You can't demote your own account." });
  }

  try {
    getAdminApp();
    await admin.auth().setCustomUserClaims(uid, { admin: role === 'admin' });
    await admin.firestore().doc(`users/${uid}`).set({ role }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('set-role error:', err);
    return res.status(400).json({ error: err.message || 'Could not update role.' });
  }
}
