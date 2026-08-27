// lib/firebaseAdmin.js
// Server-side only. Uses a Firebase service account (never exposed to the browser)
// to verify ID tokens and manage users/custom claims with full admin privileges.
import admin from 'firebase-admin';

export function getAdminApp() {
  if (admin.apps.length) return admin.apps[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel env vars can't store real newlines cleanly, so the private key is stored
  // with literal "\n" sequences and unescaped here at runtime.
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in your environment.'
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

/**
 * Reads the "Authorization: Bearer <idToken>" header, verifies it against Firebase Auth,
 * and returns the decoded token only if the token is valid AND carries the admin custom claim.
 * Returns null otherwise (caller should respond 401/403).
 */
export async function verifyAdmin(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;

  try {
    getAdminApp();
    // checkRevoked=true so a revoked/disabled account is rejected immediately,
    // not just once its short-lived token naturally expires.
    const decoded = await admin.auth().verifyIdToken(match[1], true);
    if (decoded.admin === true) return decoded;
    return null;
  } catch {
    return null;
  }
}
