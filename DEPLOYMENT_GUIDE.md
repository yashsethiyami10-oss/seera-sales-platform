# MUV — GoDaddy cPanel Deployment Guide

Step-by-step instructions for deploying this project to GoDaddy's cPanel
Node.js hosting for **muvcare.in**. This is the *how*; `PRODUCTION_READY.md`
is the record of what's already been fixed and verified, and
`DEPLOYMENT_READINESS.md` has the fuller pre-existing checklist (backups,
monitoring, migrations discipline) — read both before going live. This guide
assumes GoDaddy's cPanel with "Setup Node.js App" (built on Phusion
Passenger), which is what GoDaddy's Business/VPS Node.js hosting plans use.

**Prerequisite check before starting:** confirm your GoDaddy plan actually
includes Node.js hosting (not all GoDaddy plans do — shared "Web Hosting"
plans generally don't; "Business Hosting" and VPS plans do). Look for
"Setup Node.js App" under the Software section of cPanel. If it's not
there, this guide doesn't apply to your plan — you'd need a VPS plan or a
different host (Vercel, Railway, Render all support Next.js natively and are
simpler for this stack specifically).

---

## 0. Why a custom `server.js`

GoDaddy's Node.js Selector runs on Phusion Passenger, which expects a plain
Node.js script as the app's entry point — it does not invoke `npm start` or
understand `next start` directly. This project includes `server.js` at the
root specifically for this: it wraps Next.js's programmatic server API and
listens on whatever port Passenger assigns via `process.env.PORT`. It's
already been tested locally (confirmed serving all routes correctly) — you
will point cPanel's "Application startup file" at this.

---

## 1. Database — decide this first

GoDaddy's standard cPanel hosting (shared or the Node.js-enabled Business
tier) **does not offer PostgreSQL** — only MySQL/MariaDB, and this project's
Prisma schema is written for PostgreSQL. You have two options:

**Option A — External managed Postgres (recommended, simplest):**
Use Supabase, Neon, or Railway's free/starter Postgres tier. Each gives you
a `postgresql://...` connection string in about two minutes. This is by far
the easiest path if you don't already have a preferred provider — no server
administration, automatic backups.

**Option B — GoDaddy VPS with self-managed Postgres:**
Only viable if your GoDaddy plan is a full VPS (root access). Install
PostgreSQL yourself, create the `muv` database and a role, and use a local
`postgresql://localhost:5432/muv` connection string. More control, more
maintenance burden (you own backups, updates, security patching).

Either way, once you have a connection string, keep it — you'll paste it
into `DATABASE_URL` in Section 5.

---

## 2. Point the domain at GoDaddy hosting

If `muvcare.in` isn't already pointed at this GoDaddy hosting account:
1. In GoDaddy's Domain Manager, confirm the domain's nameservers point at
   the hosting account (GoDaddy does this automatically if the domain and
   hosting were purchased together; otherwise update nameservers/DNS A
   records to point at the hosting account's IP).
2. In cPanel → Domains, confirm `muvcare.in` is set as the primary domain
   (or an addon domain) for the hosting account, with its document root
   pointing wherever you'll deploy this app.

DNS propagation can take up to 24–48 hours — do this step early.

---

## 3. Upload the code

You have two options; pick whichever cPanel offers / you're comfortable with.

**Option A — File Manager (simplest, no extra tools):**
1. Build the deployment package locally: this project ships a script-free
   zip at the repo root created for exactly this step (see the note printed
   at the end of this session — the archive excludes `node_modules` and
   `.next`, which must be rebuilt fresh on the server since they contain
   platform-specific binaries that won't run on GoDaddy's Linux server if
   built on Windows).
2. In cPanel → File Manager, navigate to (or create) the directory you want
   this app to live in — commonly outside `public_html` for a Node app
   managed by Passenger (cPanel's Node.js Selector handles the proxy/
   `.htaccess` wiring itself; it does not need to live inside `public_html`).
   A common convention: `~/muv-platform`.
3. Upload the zip, then use File Manager's "Extract" on it.

**Option B — SFTP:**
Use GoDaddy's SFTP credentials (cPanel → FTP Accounts, or the main account's
SFTP access) with any SFTP client (FileZilla, WinSCP) to upload the
extracted project folder directly to `~/muv-platform`.

---

## 4. Create the Node.js app in cPanel

1. cPanel → Software → **Setup Node.js App** → **Create Application**.
2. **Node.js version**: pick the newest available LTS the selector offers —
   18.x or 20.x. This project's `package.json` declares
   `"engines": { "node": ">=18.18.0" }`; avoid anything older than 18.18.
3. **Application mode**: Production.
4. **Application root**: the folder you uploaded to (e.g. `muv-platform`).
5. **Application URL**: `muvcare.in` (or the appropriate subdomain if
   staging first, e.g. `staging.muvcare.in`).
6. **Application startup file**: `server.js` — this is the file this
   project ships specifically for this step.
7. Click **Create**. cPanel provisions a virtual environment and shows you
   a command like `source /home/.../nodevenv/muv-platform/20/bin/activate`
   — note this path, you'll use it from the terminal in Section 6.

---

## 5. Set environment variables

Still on the Node.js App's config page in cPanel, scroll to **Environment
Variables**. Add every variable from `.env.production.example` (in this
project's root) here, one at a time, with real values:

- Do **not** upload `.env.production.example` renamed to `.env.production`
  and expect Passenger to read it — cPanel's Node.js Selector manages env
  vars through this UI, not a dotenv file. Copy each `KEY=value` pair in by
  hand (or via cPanel's "Import" if your version of the interface offers a
  bulk-paste option).
- At minimum, `DATABASE_URL`, `AUTH_SECRET`, and `NEXTAUTH_URL` are required
  for the app to boot at all — see `.env.production.example`'s comments for
  which of the rest are required for which features (payments, email,
  shipping, SMS).
- Set `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` to `https://muvcare.in`
  exactly (once SSL is live — see Section 8; use `http://` temporarily only
  if testing before SSL is provisioned, then update).
- `AUTH_SECRET` in the example file is a real, usable, pre-generated random
  value — safe to paste as-is, or generate your own with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

---

## 6. Install dependencies and build — via cPanel Terminal

1. cPanel → Advanced → **Terminal** (or SSH in, if enabled on your plan).
2. Activate the Node virtual environment cPanel showed you in Section 4:
   ```
   source /home/<youruser>/nodevenv/muv-platform/20/bin/activate
   cd ~/muv-platform
   ```
3. Install dependencies (this must run on the server — do not upload a
   Windows-built `node_modules`, native binaries like Prisma's query engine
   and `sharp` are platform-specific):
   ```
   npm install
   ```
4. Generate the Prisma client and push/migrate the schema:
   ```
   npx prisma generate
   npx prisma migrate deploy
   ```
   (`migrate deploy`, not `db push` — see `DEPLOYMENT_READINESS.md` Section 3
   for why this distinction matters for a real database.)
5. Decide on seed data: if the production database should start with the
   same demo categories/products/coupon/admin login used in local testing,
   run `npm run db:seed` now — otherwise skip this and create your real
   catalog and a real admin account through the admin UI once the app is
   live. If you do seed, **change the seeded admin password
   (`admin@muv.co.in` / `ChangeMe123`) immediately** — it's a known,
   published default.
6. Build for production:
   ```
   npm run build
   ```
   Confirm this exits with no errors (one build warning from Auth.js's own
   dependency chain is expected and documented as harmless in
   `PRODUCTION_READY.md` — everything else should be clean).

---

## 7. Start / restart the app

Back in cPanel → Setup Node.js App, find this application in the list and
click **Restart**. cPanel/Passenger will start `server.js` and route
`muvcare.in` traffic to it automatically — there's no separate "run the
server" step; Passenger keeps it running and restarts it on crash.

Visit `http://muvcare.in` (or `https://` if SSL is already live) and
confirm the homepage loads.

---

## 8. SSL (HTTPS)

1. cPanel → Security → **SSL/TLS Status**, or **AutoSSL** — GoDaddy
   provisions a free Let's Encrypt-based certificate automatically for
   domains pointed at the hosting account, usually within a few minutes to
   hours of DNS resolving correctly.
2. Once issued, confirm `https://muvcare.in` loads with a valid padlock.
3. **Go back to Section 5 and confirm `NEXTAUTH_URL` and
   `NEXT_PUBLIC_SITE_URL` are set to `https://muvcare.in`** (not `http://`)
   — Auth.js's secure-cookie behavior and every absolute link this app
   generates (emails, sitemap, OG tags) depend on this being accurate.
   Restart the Node app after changing env vars for the change to take
   effect.

---

## 9. Post-deploy verification

Run through this before telling anyone the site is live:

- [ ] `https://muvcare.in` loads the homepage with real content
- [ ] `/shop`, a product page, and `/collections/<category>` all load
- [ ] `/login` and `/signup` work — sign up a real test account
- [ ] Add an item to cart, complete a **COD** checkout end-to-end (safe —
  no real payment provider hit)
- [ ] If Razorpay live keys are configured: place one real small-value
  online order and immediately refund it via the admin panel, per
  `DEPLOYMENT_READINESS.md`'s post-deploy checklist
- [ ] Log into `/admin` with the real admin account, confirm the dashboard
  shows real data
- [ ] `https://muvcare.in/sitemap.xml` and `/robots.txt` both resolve and
  reference `muvcare.in` URLs (not `localhost` or the old placeholder
  `www.muv.co.in`)
- [ ] Check cPanel's Node.js App logs (there's a log viewer in the same
  Setup Node.js App page) for unexpected errors after the above steps

---

## 10. Troubleshooting

**App shows a 503 / "Application failed to start":**
Check the Node app's error log in cPanel (Setup Node.js App → your app →
there's usually a log path shown, or check
`~/muv-platform/stderr.log` if Passenger created one). Common causes: a
required env var is missing (app throws on boot — check `AUTH_SECRET`,
`DATABASE_URL` first), or `npm install`/`npm run build` didn't actually
complete successfully.

**App starts but every page 500s:**
Almost always `DATABASE_URL` — confirm the app can actually reach the
database from GoDaddy's network (if using an external Postgres provider,
confirm it allows connections from GoDaddy's IP, not just `localhost`; most
managed providers allow all IPs by default but confirm any IP allowlist).

**`UntrustedHost` error in logs:**
Should not happen — this project's `lib/auth.config.ts` already sets
`trustHost: true` (see `PRODUCTION_READY.md` for why). If it appears anyway,
confirm you're running the code actually uploaded from this project (not an
older copy) and that `server.js` is genuinely what cPanel is executing.

**Static assets (logo, CSS) don't load:**
Confirm the Application Root in Section 4 points at the actual project
folder (containing `public/`, `.next/`, etc.), not a parent or subfolder.

**Changes to code don't show up after a git pull / re-upload:**
`npm run build` must be re-run after any source change, then Restart the
app in cPanel — Passenger serves the built `.next` output, not source files
directly.

---

## 11. Updating the site after launch

For any future code change:
1. Upload/pull the updated source to `~/muv-platform`.
2. `source .../nodevenv/muv-platform/20/bin/activate && cd ~/muv-platform`
3. `npm install` (only needed if `package.json` changed)
4. `npx prisma generate && npx prisma migrate deploy` (only if the schema
   changed — never `migrate dev` against production, see
   `DEPLOYMENT_READINESS.md`)
5. `npm run build`
6. Restart the app in cPanel → Setup Node.js App

Consider a staging subdomain (`staging.muvcare.in`) as a second Node.js App
pointed at a copy of this project, to test updates before they hit the real
domain — cheap insurance once real customers are using the live site.
