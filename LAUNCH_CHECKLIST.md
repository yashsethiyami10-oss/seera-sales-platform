# MUV — Launch Checklist

Single sequenced checklist assembled from `OPERATIONAL_DEPENDENCY_AUDIT.md`,
`SUBSCRIPTION_REQUIREMENTS.md`, and the pre-existing `DEPLOYMENT_GUIDE.md` /
`DEPLOYMENT_READINESS.md` / `PRE_LAUNCH_CHECKLIST.md`. This is the order-of-operations view —
read `OPERATIONAL_DEPENDENCY_AUDIT.md` for the reasoning behind any individual item. **This
checklist does not authorize deployment** — completing it is preparation, not permission; the
Stage 8 and this Stage's own Stop Rules both require explicit Founder Production Authorization
before anything here is actually executed against the live domain.

## Step 0 — Confirm what's already true (before doing anything)

- [ ] Confirm the GoDaddy domain (`muvcare.in`) registration is active and billing is current
- [ ] Confirm the GoDaddy hosting plan is active and genuinely includes "Setup Node.js App"
- [ ] Confirm who holds the actual account credentials for GoDaddy, and for every third-party
      service below — this checklist assumes a real person will execute each step, not that it
      happens automatically

## Step 1 — Accounts to create (start these early; some have lead time)

- [ ] PostgreSQL provider — Supabase or Neon, free tier (`OPERATIONAL_DEPENDENCY_AUDIT.md` §2)
- [ ] Cloudinary account, free tier
- [ ] Resend account, free tier
- [ ] Razorpay account — **start KYC/business verification now**, it has real lead time
      independent of engineering readiness
- [ ] MUV's real GSTIN on hand (needed for invoices — legal/tax requirement, not optional)
- [ ] Real warehouse/ship-from address (phone, address, city, state, pincode)
- [ ] Shipping provider account (Shiprocket/Delhivery/Blue Dart/DTDC — pick one) with a real
      pickup location configured on their side
- [ ] (Optional) MSG91 or Interakt account, if SMS/WhatsApp notifications are wanted at launch
- [ ] (Optional) Sentry account, free tier — closes a real monitoring gap at zero cost
- [ ] (Optional) UptimeRobot account, free tier — same

## Step 2 — DNS and SSL (start early — propagation takes time)

- [ ] Point `muvcare.in`'s nameservers/DNS at the GoDaddy hosting account
- [ ] Confirm `muvcare.in` is set as the primary/addon domain in cPanel, document root correct
- [ ] Once DNS resolves: confirm GoDaddy AutoSSL issues a certificate for `https://muvcare.in`
- [ ] Add Resend's SPF and DKIM DNS records at the same time (deliverability depends on this —
      do not defer it to "later," it's a DNS change and this is the natural time to batch it)
- [ ] (Recommended) Add a DMARC record, monitor-only policy is fine to start

## Step 3 — Deploy the code

- [ ] Upload the project to `~/muv-platform` on the GoDaddy server (File Manager or SFTP)
- [ ] Create the Node.js App in cPanel: Node 18.x/20.x LTS, Application mode = Production,
      startup file = `server.js`
- [ ] Paste every required environment variable into cPanel's Environment Variables UI — use
      `PRODUCTION_CONFIGURATION_GUIDE.md` as the exact reference, **never upload
      `.env.production.example` as a literal file**
- [ ] `npm install` (on the server itself — never upload a Windows-built `node_modules`)
- [ ] `npx prisma generate && npx prisma migrate deploy` (never `migrate dev` against production)
- [ ] Decide: seed demo data (`npm run db:seed`) or start with a real empty catalog + a real
      admin account created through the admin UI. **If seeded, change the default admin
      password (`admin@muv.co.in` / `ChangeMe123`) immediately** — it is a known, published value
- [ ] `npm run build` — confirm it exits clean
- [ ] Restart the app in cPanel; confirm `http://muvcare.in` loads
- [ ] Re-confirm `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` are `https://muvcare.in` once SSL is
      live, and restart again after any env var change

## Step 4 — Register webhooks (only after the domain is live)

- [ ] Razorpay dashboard: webhook URL = `https://muvcare.in/api/webhooks/razorpay`
- [ ] Shipping provider dashboard: webhook URL = `https://muvcare.in/api/webhooks/shipping/<provider>`
- [ ] Submit WhatsApp message templates for approval now if WhatsApp notifications are wanted —
      approval can take days, so this should not be the last step even though it's listed here

## Step 5 — Backups and restore drill (before telling anyone the site is live)

- [ ] Enable automated daily backups at the Postgres host level
- [ ] Confirm actual backup retention meets India's GST record-keeping requirements — a
      compliance question to confirm with whoever handles MUV's tax filing, not an engineering
      default to assume
- [ ] Run one restore drill against a scratch database — confirm the app can actually read from
      the restored copy

## Step 6 — Legal content review (already built, needs a legal pass, not new writing)

- [ ] `/privacy`, `/terms`, `/returns`, `/shipping` all already exist with real, honest, general
      content (confirmed via direct file read for this audit) — get one legal review pass on
      these before go-live, especially `/returns` given India-specific consumer protection
      implications
- [ ] Confirm `/about`, `/contact`, `/faq` (also confirmed to exist already) have real, accurate
      content and a working contact method

## Step 7 — Missing assets (small, but real gaps)

- [ ] Add a favicon (`app/icon.png` or `public/favicon.ico`) — currently genuinely absent
- [ ] Add a social share image (`og-default.png`, already referenced by `lib/seo.ts` but the file
      doesn't exist) — sized 1200×630

## Step 8 — Verification (do this before telling anyone it's live)

- [ ] `https://muvcare.in` loads the homepage with real content
- [ ] `/shop`, a product detail page, and a collection page all load
- [ ] Sign up a real test account; log in
- [ ] Complete one full COD checkout end-to-end
- [ ] If Razorpay live keys are set: place one real small-value online order, refund it
      immediately, and confirm both the payment and the refund actually reflect correctly
- [ ] Confirm the order-confirmation email actually arrives — not just that the Server Action
      returned success
- [ ] Confirm a webhook actually reaches the deployed endpoint (check `NotificationLog`/logs for
      the real event, not just the provider dashboard's "sent" status)
- [ ] Log into `/admin` with the real admin account, confirm the dashboard shows real data
- [ ] `https://muvcare.in/sitemap.xml` and `/robots.txt` both resolve and reference
      `muvcare.in` URLs, not `localhost` or the old placeholder `www.muv.co.in`
- [ ] Attempt 6 failed logins in a row on a test account — confirm the 6th is rate-limited

## Explicitly NOT part of this launch

- [ ] Do **not** set any `FEATURE_*` AI runtime flag to `true` — the entire MUV AI subsystem is
      designed to be fully optional to a working storefront launch (see
      `docs/ai-intelligence-core/STAGE8_FOUNDER_REVIEW_PACKAGE.md`)
- [ ] Do **not** attempt any WhatsApp inbound/conversational flow — it does not exist yet
- [ ] Do **not** treat this checklist's completion as deployment authorization — per the Stop
      Rule, wait for explicit Founder Production Authorization before executing any step that
      touches the live domain
