# AstroCore — Student Portal + Admin Dashboard

A student learning portal (recorded classes, live sessions, doubts, polls, leaderboards)
with a separate admin dashboard, running on **Firebase** (Auth + Firestore) with a small
**Vercel serverless backend** for anything that needs to happen securely on a server
instead of the browser.

This package turns your original two static HTML files into a deployable project with:

- A real backend (`/api`) using the Firebase **Admin SDK**
- A real admin role, enforced server-side via Firebase **custom claims** — not a field
  a student could edit on themselves
- Firestore & Storage **security rules** (your project likely has none right now,
  which means anyone can currently read/write your whole database directly)
- Security headers (CSP, HSTS, etc.)
- Basic rate limiting on API routes
- An "Admins" management tab in the dashboard: promote/demote/delete accounts, export
  a students CSV — all previously impossible or fake (see "What was actually broken" below)

---

## How this is split

- **`index.html` and `admin.html` work on their own**, with your Firebase config already
  filled in — just like your original files. You can open/host them anywhere and login,
  browsing, doubts, polls, etc. all work with zero setup.
- **The `/api` folder is optional extra security** for one specific thing: making the
  "admin" role real and unforgeable, and letting you promote/demote/delete accounts
  safely. It only needs to be deployed (and its env vars set) once you're ready to use
  the **Admins** tab in the dashboard. Until then, that tab just won't work — everything
  else in the app is unaffected.

## 0. What was actually broken in the original files (read this first)

I found these while reading your code — worth knowing even if you don't read anything else:

1. **`admin.html` had no real admin check.** Any account that could log in — including a
   normal student account — could open the admin dashboard. The code even had a comment
   saying so ("no separate admin role is enforced").
2. **No visible Firestore security rules.** If your Firestore is still on a default/open
   ruleset, literally anyone on the internet who finds your Firebase project ID can read
   or write your entire database directly, bypassing your app completely.
3. **"Revoke Access" didn't actually revoke access.** It deleted the student's Firestore
   profile document, but their real login (Firebase Auth account) still worked — they'd
   just hit a broken UI, not actual removal.

Everything below fixes all three.

---

## 1. Project structure

```
astrocore/
├── index.html              student portal (frontend)
├── admin.html               admin dashboard (frontend)
├── api/                     Vercel serverless functions (the "backend" — optional, see below)
│   ├── health.js            uptime check
│   └── admin/
│       ├── bootstrap.js     one-time: create your first admin
│       ├── set-role.js      promote/demote a user (admin-only)
│       ├── list-users.js    list all accounts (admin-only)
│       ├── delete-user.js   permanently delete an account (admin-only)
│       └── export-students.js  CSV export of students (admin-only)
├── lib/
│   ├── firebaseAdmin.js     Admin SDK init + token verification helper
│   └── rateLimit.js         basic per-IP rate limiting
├── firestore.rules          Firestore security rules
├── firestore.indexes.json
├── storage.rules            Storage security rules (locked down; unused today)
├── firebase.json            lets the Firebase CLI deploy the two rules files above
├── vercel.json               routes + security headers
├── package.json
└── .env.example              template for the environment variables you need
```

---

## 2. One-time setup

You'll need: a **Firebase project** (you already have one — `school-astra`, based on the
original code) and a **Vercel account**. Both have generous free tiers.

### 2.1 Firebase client config

Already filled in for you in `index.html` and `admin.html` (your `school-astra` project's
public config) — you don't need to do anything here. This is normal for Firebase web
apps: this config identifies your project, it doesn't grant any special access, so it's
fine for it to live directly in the page like it did originally.

### 2.2 Get your Firebase Admin service account (only needed for the Admins tab)

Firebase Console → ⚙️ **Project settings** → **Service accounts** tab → **Generate new
private key**. This downloads a JSON file. **Never commit this file or share it** — it
grants full admin access to your Firebase project. You'll need three values out of it:

- `project_id`
- `client_email`
- `private_key`

### 2.3 Deploy Firestore & Storage rules

These rules are what actually stop strangers from reading/writing your database — the
files alone (`firestore.rules`, `storage.rules`) do nothing until deployed.

```bash
npm install -g firebase-tools     # one-time
firebase login
firebase use --add                # pick your project, e.g. school-astra
firebase deploy --only firestore:rules,storage:rules
```

---

## 3. Deploy to Vercel

### 3.1 Push this project to a Git repo (GitHub/GitLab/Bitbucket), then in Vercel:
"Add New… → Project" → import the repo. Framework preset: **Other**. Leave build
command empty — there's no build step, it's static HTML + serverless functions.

### 3.2 Set environment variables

Vercel → your project → **Settings → Environment Variables**. Add all of these
(apply to Production, Preview, and Development):

| Variable | Where it comes from |
|---|---|
| `FIREBASE_PROJECT_ID` | service account JSON (2.2) `project_id` |
| `FIREBASE_CLIENT_EMAIL` | service account JSON (2.2) `client_email` |
| `FIREBASE_PRIVATE_KEY` | service account JSON (2.2) `private_key` — **paste it exactly as it appears in the JSON file, including the `\n` sequences and the `-----BEGIN/END-----` lines** |
| `ADMIN_BOOTSTRAP_SECRET` | make up any long random string yourself, e.g. run `openssl rand -hex 24` |

`FIREBASE_PRIVATE_KEY` is the one people usually get wrong — copy the whole string value
from the JSON file (it'll look like `"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"`),
paste it into the Vercel field as one single-line value with the `\n` left as literal
backslash-n characters. `lib/firebaseAdmin.js` converts them back to real newlines at
runtime.

### 3.3 Deploy

Click Deploy. Vercel will serve `index.html` at `/`, `admin.html` at `/admin`, and turn
everything in `/api` into serverless functions automatically.

---

## 4. First admin setup

Nobody is an admin yet — not even you. Do this once:

1. Go to your deployed site (`/`) and **sign up** a normal account with your own email
   (the student portal's signup form). This creates a Firebase Auth account.
2. Call the bootstrap endpoint once, with the secret you set in `ADMIN_BOOTSTRAP_SECRET`:

   ```bash
   curl -X POST https://YOUR-SITE.vercel.app/api/admin/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","secret":"YOUR_ADMIN_BOOTSTRAP_SECRET"}'
   ```

   You should get back `{"ok":true,"uid":"..."}`.
3. Go to `/admin`, log in with that same account, sign out and back in once if it doesn't
   pick up admin access immediately (this forces a fresh token with the new permission).
4. **Important — remove `ADMIN_BOOTSTRAP_SECRET` from Vercel's environment variables now**
   (or rotate it to a new random value) and redeploy. Anyone who ever learns that secret
   could otherwise mint themselves an admin account forever. You won't need it again —
   from here on, promote further admins from inside the dashboard itself (see below).

---

## 5. Using the new Admins tab

Inside `/admin`, a new **Admins** section in the dock lets you:

- See every account (student + admin), when they last signed in
- **Promote** a student to admin, or **demote** an admin back to student
- **Delete** an account entirely (this really deletes their Firebase Auth login now —
  the old "Revoke Access" button only deleted a Firestore document and left their login
  working)
- **Export students CSV**

All of these call the `/api/admin/*` endpoints, which check a real Firebase-issued token
and the `admin` custom claim server-side — a student can't reach these by guessing a URL
or editing the page's JavaScript, because the server independently re-verifies who they
are on every call.

---

## 6. How the security model works, briefly

- **Authentication**: Firebase Auth (unchanged from your original app).
- **Authorization ("is this person an admin?")**: a Firebase Auth **custom claim**
  (`admin: true`), which can only be set by code running with your service account
  (i.e., the `/api/admin/*` functions). The browser can never set this on itself.
- **Firestore rules** (`firestore.rules`) are the actual last line of defense — even if
  someone bypassed your frontend entirely and talked to Firestore directly, the rules
  reject anything a student shouldn't be able to do (editing other people's data,
  granting themselves the `admin` role field, double-voting on a doubt, editing a poll
  after it's closed, etc).
- **Rate limiting** (`lib/rateLimit.js`) is a lightweight, per-server-instance limiter —
  fine for deterring casual abuse/scripts, not a substitute for a dedicated service if
  this app gets serious traffic (see "Hardening further" below).

---

## 7. Local development

```bash
npm install
cp .env.example .env      # fill in the same values as the Vercel env vars
npm install -g vercel     # one-time
vercel dev
```

This runs both the static files and the `/api` functions locally, usually at
`http://localhost:3000`.

---

## 8. Hardening further (optional, for later)

These weren't done here to keep this deployable out-of-the-box, but worth knowing about
if this project grows:

- **Signup gating**: right now anyone can self-register a student account on `/`.
  If you want it invite-only, the robust way is a Firebase Auth "blocking function"
  (requires Identity Platform, which has its own free tier) that rejects signups
  without a valid invite code — happy to help wire this up if you want it.
- **Stronger rate limiting**: swap `lib/rateLimit.js` for
  [Upstash Redis](https://vercel.com/integrations/upstash) or Vercel KV if you need
  limits that hold up across multiple serverless instances / high traffic.
- **Email verification**: Firebase Auth supports `sendEmailVerification()` — consider
  requiring a verified email before granting full student access.
- **Attendance tracking**: `live_sessions/{id}/attendance` exists in the admin UI and
  rules but nothing in the student portal writes to it yet — it's a placeholder for a
  future "mark yourself present" feature.

---

## 9. Offline / no-Vercel use

`index.html` and `admin.html` are plain static files with your Firebase config already
in them — you can open `index.html` directly in a browser, or host both files on any
static host (Firebase Hosting, Netlify, GitHub Pages, a plain web server), and login,
classes, doubts, and polls will all work with zero setup. The one thing that requires
this to be running through Vercel with the env vars set is the **Admins** tab. Note this
is still an online app either way — Firebase Auth/Firestore need an internet connection
to sign in and sync data; "offline" here means "no Vercel/backend setup required," not
"works with no internet."

## 10. Troubleshooting

- **Bootstrap returns 404 "No account with that email"** → sign up that email in the
  student portal first; the bootstrap endpoint promotes an *existing* account, it doesn't
  create one.
- **Admin panel still shows "Not an admin account" after promoting** → sign all the way
  out and back in (custom claims are embedded in the login token and only refresh on a
  new sign-in or an explicit token refresh).
- **Firestore permission-denied errors** → make sure you ran
  `firebase deploy --only firestore:rules` — the rules file in this repo does nothing
  until deployed to your actual project.
