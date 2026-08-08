# Pre-Launch Checklist — muvcare.in

Everything needed before flipping `muvcare.in` live, in priority order.
Cross-references: `PRODUCTION_READY.md` (what's already fixed/verified),
`DEPLOYMENT_GUIDE.md` (the how-to for each infrastructure step),
`DEPLOYMENT_READINESS.md` (the fuller original checklist — backups,
monitoring, DR runbooks).

## Accounts & credentials you need to go get (nothing here can be faked)

- [ ] **PostgreSQL database** — pick a provider (Supabase/Neon/Railway, or
  self-managed on a GoDaddy VPS) and get a real `DATABASE_URL`. GoDaddy's
  standard cPanel hosting doesn't include Postgres. (`DEPLOYMENT_GUIDE.md` §1)
- [ ] **GoDaddy Node.js hosting confirmed** — verify your specific GoDaddy
  plan actually has "Setup Node.js App" available in cPanel before assuming
  this deployment path works. (`DEPLOYMENT_GUIDE.md` §0)
- [ ] **Razorpay live-mode account** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`. Without these, only Cash on Delivery works
  (confirmed working) — online payment (UPI/Card/Netbanking) doesn't.
- [ ] **Resend account** (or swap the email provider) — `RESEND_API_KEY`.
  Without it, zero transactional emails send (order confirmations, password
  resets) — confirmed this fails silently rather than crashing checkout,
  but customers get no emails at all.
- [ ] **Shipping provider account** — Shiprocket/Delhivery/Blue Dart/DTDC
  (pick one), plus a real configured pickup location on their side.
- [ ] **SMS/WhatsApp provider account** (optional but recommended) —
  MSG91/Twilio/Interakt/WhatsApp Business. If using WhatsApp specifically,
  message templates need to be submitted and **approved** by Meta/the
  provider before they'll actually send — this can take days, start early.
- [ ] **MUV's real GSTIN** — required for invoices to show real tax info
  instead of a placeholder. Legal/compliance requirement in India, confirm
  with whoever handles MUV's tax filing if you don't have this handy.
- [ ] **Real warehouse/ship-from address** — phone, address, city, state,
  pincode for `WAREHOUSE_*` env vars.

## Content someone at MUV needs to write (not fabricated by this pass, deliberately)

- [ ] **`/about` page** — Our Story. Currently 404s (linked from the footer).
- [ ] **`/contact` page** — real contact info/form. Currently 404s.
- [ ] **`/shipping` page** — actual shipping policy/timelines. Currently 404s.
- [ ] **`/returns` page** — actual returns/refund policy. Currently 404s.
  This one especially has real legal implications for an Indian e-commerce
  business — get this right, don't guess.
- [ ] **`/faq` page**. Currently 404s.
- [ ] **Favicon** — none exists anywhere in the project right now. Browser
  tabs/bookmarks will show a generic icon until one is added
  (`app/icon.png` or `public/favicon.ico`, per Next.js convention).
- [ ] **Social share image** (`og-default.png`, referenced by `lib/seo.ts`
  but the file doesn't exist) — a branded 1200×630 image so links shared on
  WhatsApp/social media show a real preview image instead of a broken one.
  Very relevant given how much Indian e-commerce traffic comes through
  WhatsApp shares specifically.

## Infrastructure steps (all detailed in `DEPLOYMENT_GUIDE.md`)

- [ ] Point `muvcare.in`'s DNS at the GoDaddy hosting account (§2) — do this
  early, propagation can take 24–48 hours.
- [ ] Upload the deployment package and extract it on the server (§3).
- [ ] Create the Node.js App in cPanel, startup file = `server.js` (§4).
- [ ] Paste every required env var into cPanel's environment variables UI —
  use `.env.production.example` as the reference, do **not** upload it as a
  literal `.env.production` file (§5, and the file's own header comment
  explains exactly why that's a footgun).
- [ ] `npm install`, `npx prisma generate`, `npx prisma migrate deploy`,
  `npm run build` — all on the server itself, via cPanel Terminal (§6).
  Never upload a Windows-built `node_modules` or `.next` — they contain
  platform-specific binaries that won't run on GoDaddy's Linux server.
- [ ] Decide: seed demo data, or start with a real empty catalog? If you
  seed, **change the default admin password
  (`admin@muv.co.in` / `ChangeMe123`) immediately** (§6.5).
- [ ] Restart the app in cPanel (§7).
- [ ] Enable SSL (AutoSSL/Let's Encrypt via cPanel), then confirm
  `NEXTAUTH_URL`/`NEXT_PUBLIC_SITE_URL` are set to `https://muvcare.in`
  and restart again (§8).
- [ ] Register the Razorpay webhook URL
  (`https://muvcare.in/api/webhooks/razorpay`) in the Razorpay dashboard,
  and each shipping provider's webhook URL similarly — pointing at the real
  domain, not localhost.

## Verification (do this before telling anyone it's live — full list in `DEPLOYMENT_GUIDE.md` §9)

- [ ] Homepage, shop, product page, collections all load on the real domain
- [ ] Signup/login work on the real domain
- [ ] A full COD checkout completes end-to-end
- [ ] One real small-value online payment (if Razorpay live keys are set),
  refunded immediately after confirming it worked
- [ ] Admin login and dashboard show real data
- [ ] `/sitemap.xml` and `/robots.txt` reference `muvcare.in`, not
  `localhost` or the placeholder `www.muv.co.in`

## Beyond launch day (from `DEPLOYMENT_READINESS.md` — still fully valid)

- [ ] Automated database backups enabled at the DB host level, with at
  least one restore drill completed before launch
- [ ] Logs piped to a real aggregator; `logger.error` calls routed to an
  exception tracker (Sentry or similar)
- [ ] Uptime monitoring on the homepage and both webhook endpoints
- [ ] A documented incident runbook (who gets paged if checkout breaks)

---

**What does NOT need further engineering work**: authentication, the
storefront, cart, COD checkout, the admin panel (products/orders CRUD,
status transitions), and the production build itself are all already fixed
and verified end-to-end (`PRODUCTION_READY.md`). Everything remaining above
is a business decision, a real third-party account, or content only MUV can
author correctly — not a code defect.
