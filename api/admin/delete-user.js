// api/admin/delete-user.js
// Real revocation: removes the Firebase Auth account (so the person genuinely can't sign
// back in — not just deleting their Firestore profile doc, which left the old flow's
// "Revoke Access" button purely cosmetic) and cleans up their Firestore profile.
import admin from 'firebase-admin';
import { getAdminApp, verifyAdmin } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 20, keyPrefix: 'delete-user' })) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  const caller = await verifyAdmin(req);
  if (!caller) return res.status(403).json({ error: 'Admin privileges required.' });

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid is required.' });
  if (uid === caller.uid) return res.status(400).json({ error: "You can't delete your own account here." });

  try {
    getAdminApp();
    await admin.auth().deleteUser(uid);
    await admin.firestore().doc(`users/${uid}`).delete();
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-user error:', err);
    return res.status(400).json({ error: err.message || 'Could not delete user.' });
  }
}
