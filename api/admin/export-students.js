// api/admin/export-students.js — admin-only CSV export of the student roster.
import admin from 'firebase-admin';
import { getAdminApp, verifyAdmin } from '../../lib/firebaseAdmin.js';
import { rateLimit } from '../../lib/rateLimit.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, { windowMs: 60000, max: 10, keyPrefix: 'export-students' })) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  const caller = await verifyAdmin(req);
  if (!caller) return res.status(403).json({ error: 'Admin privileges required.' });

  try {
    getAdminApp();
    const snap = await admin.firestore().collection('users').where('role', '==', 'student').get();
    const rows = [['uid', 'email', 'displayName']];
    snap.forEach((d) => {
      const v = d.data();
      rows.push([d.id, v.email || '', v.displayName || '']);
    });
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="astrocore-students-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('export-students error:', err);
    return res.status(500).json({ error: 'Could not export students.' });
  }
}
