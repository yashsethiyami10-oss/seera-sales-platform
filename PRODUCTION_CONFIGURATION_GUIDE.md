# MUV — Production Configuration Guide

Exact environment-variable reference for a production deploy of `muvcare.in`. This does not
replace `.env.production.example` (the file itself remains the copy-paste source) — it explains,
per variable, whether it's required for launch, what happens if it's left blank, and what value
it should actually hold. Paste real values into cPanel's Environment Variables UI per
`DEPLOYMENT_GUIDE.md` §5 — never upload this file or `.env.production.example` as a literal
`.env.production` file on the server (Next.js would load it automatically and it would need to
contain real secrets to be useful, defeating the point of a `.example` template).

## Tier 1 — Required, app will not boot without these

| Variable | Value for `muvcare.in` | If missing |
|---|---|---|
| `DATABASE_URL` | Real Postgres connection string from Supabase/Neon (`postgresql://...?sslmode=require`) | App does not start — this is one of only two vars `lib/env.ts` unconditionally checks |
| `AUTH_SECRET` | A real random secret — `.env.production.example` ships a usable pre-generated value, or generate your own: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | Auth.js throws on boot by design |
| `NEXTAUTH_URL` | `https://muvcare.in` (exact, no trailing slash, `https` not `http` once SSL is live) | Auth.js secure-cookie behavior breaks |

## Tier 2 — Required for a complete, trustworthy launch (not a hard boot failure, but a real quality gap if skipped)

| Variable | Value | If missing |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://muvcare.in` | Emails, sitemap, and Open Graph tags generate wrong/broken absolute URLs |
| `MUV_GSTIN` | MUV's real GSTIN | Invoices show `"GSTIN_NOT_CONFIGURED"` instead of a real tax ID — an Indian tax-compliance issue, not cosmetic |
| `RESEND_API_KEY` | Real Resend API key | Every transactional email throws (caught, logged, non-blocking) — customers get zero emails |
| `EMAIL_FROM_ADDRESS` | `MUV <orders@muvcare.in>` (already correct in `.env.production.example`) | Falls back to whatever default the code has, may not match MUV's actual domain |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Real Cloudinary credentials | No product images can be uploaded at all |
| `SHIPPING_PROVIDER` + matching provider keys | Pick one of `SHIPROCKET` / `DELHIVERY` / `BLUEDART` / `DTDC`, fill only that provider's keys | Rate calculation and fulfillment throw |
| `WAREHOUSE_PHONE` / `WAREHOUSE_ADDRESS_LINE1` / `WAREHOUSE_CITY` / `WAREHOUSE_STATE` / `WAREHOUSE_PINCODE` | Real ship-from address | Shipping provider integration cannot create a valid pickup |

## Tier 3 — Required only if that specific payment/notification channel is wanted at launch

| Variable | Value | If missing |
|---|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Real **live-mode** Razorpay keys (not test mode) | Only Cash on Delivery works — a legitimate launch choice, not a defect, if that's the decision |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Real Google OAuth credentials | Google social login silently unavailable — email/password login still works fine |
| `MESSAGING_PROVIDER` + matching provider keys (`MSG91_*` / `TWILIO_*` / `INTERAKT_API_KEY` / `WHATSAPP_PHONE_NUMBER_ID`+`WHATSAPP_ACCESS_TOKEN`) | Pick one provider, fill only its keys | SMS/WhatsApp notification sends throw (caught, logged, non-blocking) — email notifications still work if `RESEND_API_KEY` is set |

## Tier 4 — Leave unset for launch (deliberately, not an oversight)

| Variable | Recommended launch value | Why |
|---|---|---|
| `LLM_PROVIDER` | Unset (`""`) | Keeps the AI runtime on its deterministic, zero-cost, zero-network-call fallback. Setting this is a separate, later, explicitly-authorized decision — not part of a storefront launch |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Unset | Only relevant once `LLM_PROVIDER=ANTHROPIC` is authorized |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Unset | Only relevant once `LLM_PROVIDER=OPENAI` is authorized |
| `FEATURE_RUNTIME_PIPELINE_ENABLED` and the other 6 `FEATURE_*` runtime flags (`FEATURE_RUNTIME_SEMANTIC_RETRIEVAL`, `FEATURE_RUNTIME_INTENT_INTELLIGENCE`, `FEATURE_RUNTIME_FOUNDER_REASONING`, `FEATURE_RUNTIME_CONFLICT_RESOLUTION`, `FEATURE_RUNTIME_PRIVACY_PROTECTION`, `FEATURE_WEBSITE_RUNTIME_INTEGRATION_ENABLED`) | Unset (all default `false`) | Every AI capability is gated behind these; leaving them off is what makes AI a non-blocker for this launch, per Stage 8's explicit design |

## Sanity checks after setting environment variables

1. Confirm no `NEXT_PUBLIC_`-prefixed variable holds a secret except
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` — that is the one deliberate, safe exception documented in
   CLAUDE.md; every other credential must stay server-only.
2. Confirm `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` both read `https://muvcare.in` exactly —
   mismatched or `http://` values break Auth.js cookies and generate wrong absolute links.
3. Restart the Node app in cPanel after **any** environment variable change — cPanel's Node.js
   Selector does not hot-reload env vars.
4. Run `validateLLMProviderConfig()` (or simply confirm `LLM_PROVIDER` is unset) if there's ever
   doubt about whether an AI provider was accidentally left configured — it performs a real,
   zero-network-call check without requiring a live API call to verify.

## What this guide deliberately does not cover

Application logic, database schema, and every other engineering concern already covered by
`DEPLOYMENT_GUIDE.md` (the step-by-step cPanel walkthrough) and `DEPLOYMENT_READINESS.md` (the
fuller checklist including migrations, backups, monitoring, disaster recovery). This guide is
narrowly the environment-variable reference — read those two documents for everything else.
