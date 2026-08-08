# MUV — Subscription Requirements (Cost Roll-Up)

Companion to `OPERATIONAL_DEPENDENCY_AUDIT.md` — that document explains *why* each item is
needed and cites the evidence; this one is a fast, cost-focused summary for budgeting. All
figures are realistic estimates at **launch scale** (a new D2C storefront, not an established
high-volume business) — costs will legitimately grow with real traffic/order volume, and that
growth is called out explicitly rather than hidden in a single number.

## Required for Launch — genuinely mandatory, no way around them

| Service | Free tier usable at launch? | Estimated monthly cost | Notes |
|---|---|---|---|
| Domain (`muvcare.in`) | No (annual, not monthly) | ~₹65–125/mo equivalent (₹800–1,500/yr) | Confirm current registration/renewal status directly — not verifiable from this repo |
| GoDaddy Node.js hosting | No | Depends on existing plan tier (~₹500–3,000+/mo) | Assumed already purchased; confirm plan includes "Setup Node.js App" |
| PostgreSQL (Supabase or Neon) | **Yes**, at launch scale | $0 to start | Upgrade to ~$25/mo tier once real order volume/concurrency demands it — not needed day one |
| Cloudinary (media storage) | **Yes** | $0 to start | ~25 credits/mo free tier; revisit only once catalog/traffic genuinely exceeds it |
| Resend (transactional email) | **Yes** | $0 to start | 3,000 emails/mo free; $20/mo tier only once volume exceeds that |
| Razorpay | N/A (transaction-fee model) | ~2% per transaction, no monthly fee | Only "costs" money when it's making money (a completed sale) |
| SSL | Yes (GoDaddy AutoSSL) | $0 | Automatic |

**Required-for-launch total fixed monthly cost: roughly the hosting + domain cost already
committed to, plus $0 in new subscriptions** — every other required-for-launch dependency has a
genuinely usable free tier at this stage.

## Required After Growth — real, but not day-one

| Service | Trigger for upgrading | Estimated cost once triggered |
|---|---|---|
| Postgres paid tier | Real order volume / connection concurrency exceeds free-tier limits | ~$25/mo |
| Cloudinary paid tier | Catalog size or image traffic exceeds free-tier credits | Plans start ~$89/mo |
| Resend paid tier | Email volume exceeds 3,000/mo | $20/mo (50k emails) |
| Database backup/PITR upgrade | Real revenue is flowing and data loss risk becomes unacceptable | Often bundled into the same paid DB tier above |
| WhatsApp conversation costs | Sending volume exceeds Meta's free monthly conversation allotment | Variable, per-conversation (India rates differ by category) |
| Log aggregation (Axiom/Better Stack) | Debugging via raw cPanel log files becomes impractical | $0–~$26/mo depending on provider/volume |

## Optional — genuine value, not required

| Service | Purpose | Estimated cost | Recommendation |
|---|---|---|---|
| Sentry (error tracking) | Catch production errors proactively | $0 (free tier, ~5,000 errors/mo) | Worth adding even at launch — it's free and closes a real visibility gap |
| UptimeRobot | Uptime monitoring | $0 (free tier) | Same — free and closes a real gap |
| MSG91 or Interakt (WhatsApp/SMS) | Order notifications beyond email | Pay-as-you-go (MSG91) or SaaS subscription (Interakt, few thousand ₹/mo) | Start with MSG91's pay-as-you-go if WhatsApp/SMS notifications are wanted; skip entirely if email is judged sufficient at launch |
| GA4 + Search Console | Traffic/conversion analytics | $0 | Free, but requires a consent mechanism to be built first (see Legal section) — sequence this correctly, don't rush it ahead of the consent banner |

## Future Enhancement — not currently relevant, no cost to plan for yet

| Item | Why it's future, not now |
|---|---|
| WhatsApp inbound/conversational AI | Requires new engineering (webhook route, conversation-state model) not yet built — its own future Founder Execution Protocol |
| LLM provider (OpenAI/Anthropic) live activation | Already fully engineered but deliberately inactive by design (Stage 8) — a Founder Production Authorization decision, not a launch cost |
| Instagram/Facebook integration | No code, no current product requirement |
| CDN beyond Cloudinary | No evidence of need at this traffic scale |
| SMS provider failover | No evidence of need until real reliability data exists |
| Redis-backed rate limiting (Upstash) | Only needed once scaling beyond a single server instance — not relevant to the current single-instance GoDaddy launch plan |

## What NOT to subscribe to right now

Per the explicit instruction to prefer free tiers and avoid unnecessary subscriptions: do not
pre-purchase a paid Postgres tier, a paid Cloudinary tier, a paid email tier, a WhatsApp BSP
subscription, or any monitoring/APM tool beyond the free tiers listed above, before real traffic
data justifies it. Every "Required After Growth" item above has a clear, observable trigger — this
audit recommends waiting for that trigger, not front-loading the cost.
