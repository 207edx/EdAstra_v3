// api/admin/list-users.js — admin-only directory of every Auth account + their live role.
import admin from 'firebase-admin';
import { getAdminApp, verifyAdmin } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 30, keyPrefix: 'list-users' })) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  const caller = await verifyAdmin(req);
  if (!caller) return res.status(403).json({ error: 'Admin privileges required.' });

  try {
    getAdminApp();
    const users = [];
    let pageToken;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      for (const u of page.users) {
        users.push({
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || '',
          disabled: !!u.disabled,
          admin: !!(u.customClaims && u.customClaims.admin),
          createdAt: u.metadata.creationTime,
          lastSignIn: u.metadata.lastSignInTime,
        });
      }
      pageToken = page.pageToken;
    } while (pageToken);

    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    return res.status(200).json({ users });
  } catch (err) {
    console.error('list-users error:', err);
    return res.status(500).json({ error: 'Could not list users.' });
  }
}
