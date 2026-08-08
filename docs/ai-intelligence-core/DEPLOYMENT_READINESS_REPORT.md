# Stage 8 — Deployment Readiness Report (Phase 7)

**Do NOT deploy.** This report is a readiness assessment only, scoped specifically to what the AI
subsystem (Stages 6C–8) adds on top of the app-wide deployment checklist that already exists in
`DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_READINESS.md`, and `PRE_LAUNCH_CHECKLIST.md`. It does not
duplicate those documents' app-wide content (hosting target, GoDaddy/Passenger setup, general env
vars, DB migration steps) — read them directly for that. This report answers one question: *given
the app-wide checklist is followed, is the AI subsystem specifically ready to be turned on?*

## Hosting readiness

No change from the app-wide baseline. The AI subsystem is entirely in-process (`lib/runtime/*`,
`lib/ai/*`, `lib/experience/*`) — no new service, container, or process to deploy. It runs inside
the same Next.js server `server.js`/`npm run start` already targets.

## Environment configuration — AI-specific variables

| Variable | Required for | Status today |
|---|---|---|
| `LLM_PROVIDER` | Selecting ANTHROPIC/OPENAI/MOCK | Unset in every real environment — defaults safely to MOCK behavior (`validateLLMProviderConfig()`, Phase 3) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Live Anthropic calls | Unset — confirmed via `validateLLMProviderConfig()` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Live OpenAI calls | Unset |
| `FEATURE_RUNTIME_PIPELINE_ENABLED` and 6 sibling `FEATURE_*` flags (see `lib/production/feature-flags.ts`) | Turning on any runtime module in production | All unset — all flags default `false` |
| `FEATURE_WEBSITE_RUNTIME_INTEGRATION_ENABLED` (new this stage) | The actual website go-live switch | Unset — default `false` |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `INTERAKT_API_KEY` | Outbound WhatsApp sends | Already documented in `.env.example`; unset in real environments (pre-existing, not new this stage) |

**No new required variable was added to `lib/env.ts`'s `validateEnv()`.** Per CLAUDE.md's explicit
rule, only `DATABASE_URL` and `AUTH_SECRET` break the app unconditionally — every AI-related
variable above is optional and fails gracefully at its own call site (mock/fallback behavior),
consistent with how Cloudinary/Razorpay/shipping/messaging are already handled. This was a
deliberate choice, not an oversight: it means the AI subsystem can never be the reason the app
fails to boot.

## SSL assumptions

No new assumption introduced. Outbound calls to Anthropic/OpenAI (when eventually activated) use
`fetch()` against their public HTTPS endpoints — no custom certificate handling, no new TLS
configuration surface.

## API configuration

Covered by Phase 3 (`PRODUCTION_INTEGRATION_REPORT.md`): provider abstraction, retry, timeout,
fallback, and prompt versioning are all real and in place. `validateLLMProviderConfig()` is the
concrete pre-flight check a deployment process could call before assuming any live provider is
usable — it was not wired into any deployment script or health-check endpoint this stage (out of
scope; see Recommendation).

## Monitoring readiness

**Confirmed absent, app-wide — not a new gap introduced by the AI subsystem.**
`DEPLOYMENT_READINESS.md`'s own Monitoring Strategy section already states plainly: nothing in
this codebase implements monitoring beyond `lib/logger.ts`'s structured stdout output, and no
error-tracking/APM package (Sentry, Datadog, etc.) exists in `package.json`. The AI subsystem
follows the same pattern — every runtime module logs via the shared `logger`, including the new
Stage 8 fallback path (`experience-orchestrator.ts`'s catch block logs
`"experience:runtime-path-failed-falling-back-to-legacy"` before falling back) — but there is no
alerting or dashboard consuming those logs today. This is a pre-existing, app-wide gap that the AI
subsystem inherits rather than introduces.

## Logging

Real and specific to the AI subsystem: `RuntimeAuditLog` (Prisma model, Stage 6C/6D) persists a
per-turn `stageTrace` JSON field carrying provider/usage/promptVersion/fallback-used data (Phase
3). This is genuine structured audit logging, beyond the app-wide stdout baseline — but it is
storage, not alerting; nothing currently reads `RuntimeAuditLog` back out for a human to review
proactively (no admin UI surfaces it, confirmed by grep — out of this stage's scope to build).

## Analytics hooks

None specific to the AI subsystem exist. The app-wide baseline (per `PROJECT_STATUS.md`/
`WIRING.md`) has no analytics package installed; the AI subsystem does not add one.

## Backup strategy

No change from the app-wide baseline, which `DEPLOYMENT_READINESS.md` already states plainly has
no implemented backup strategy. The AI subsystem's own data (`RuntimeAuditLog` rows, the 5
Knowledge Factory JSON/txt files under `docs/`) would be covered by whatever database/filesystem
backup strategy is eventually adopted app-wide — nothing AI-specific needs a separate strategy,
since the Knowledge Factory content itself is static, version-controllable text/JSON, not
runtime-mutated state (the Founder's own "repositories remain frozen" instruction means these
files are not written to at runtime).

## Rollback strategy

This is the one area where the AI subsystem is **better positioned than the app-wide baseline**:
every piece of Stage 6C–8 functionality is gated behind a feature flag defaulting `false`
(`lib/production/feature-flags.ts`). Rollback of any AI feature, including the new website
integration, is a single flag flip back to `false` — no code deploy, no database rollback
required. This was a deliberate design choice carried through every stage of this engagement, and
Stage 8 confirmed it still holds for the newest addition (`WEBSITE_RUNTIME_INTEGRATION_ENABLED`).

## Deployment checklist — AI subsystem addendum

This supplements, does not replace, the existing app-wide checklist in `DEPLOYMENT_READINESS.md`:

- [ ] Confirm all `FEATURE_*` flags remain unset (or explicitly `false`) in the production
      environment file, unless a specific flag has been Founder-authorized to go live.
- [ ] If any live LLM provider is to be authorized: set `LLM_PROVIDER` and the matching API key,
      then run `validateLLMProviderConfig()` (or an equivalent manual check) before assuming it
      works — config-shape validation is not proof of a working live call (see
      `PRODUCTION_INTEGRATION_REPORT.md`).
- [ ] If website runtime integration is to be authorized: complete the human smoke test described
      in `WEBSITE_AI_INTEGRATION_REPORT.md`'s Recommendation section first.
- [ ] Do not attempt to enable any WhatsApp inbound flow — it does not exist yet (see
      `WHATSAPP_INTEGRATION_PREPARATION.md`); only outbound notification sending is real.
- [ ] Re-run the full regression suite (194 checks, all scripts under `scripts/verify-stage*.ts`)
      immediately before any production deploy touching this subsystem.

## What this report does not claim

It does not claim monitoring, backups, or analytics are production-ready — they are not, app-wide,
and this report says so plainly rather than treating the AI subsystem as an exception. It does not
claim any live provider was tested. It does not authorize deployment.
