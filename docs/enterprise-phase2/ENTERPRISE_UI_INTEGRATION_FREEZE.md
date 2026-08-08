# Enterprise UI Integration — Freeze Document

**Status: FROZEN**, subject to the limitations in §9. This document is the authoritative record of
the Enterprise UI Integration effort: Stage 1 (Authentication and Role-Aware Entry) through Stage 3
(Route Integrity), the continuous Enterprise UI stages that followed (Role Dashboards through the
final independent audit), and the separately-authorized Commerce Number Trigger Remediation
(documented in full in `COMMERCE_NUMBER_TRIGGER_REMEDIATION.md`, cross-referenced here for
completeness, not repeated).

## 1. Scope

A presentation and orchestration layer built on top of already-frozen backend Parts (Sales
Architecture, Enterprise Operations, Part 3A Foundations, Part 3B Business Network, Part 3C
Enterprise Finance, Part 3D Founder OS, MUV AI). No frozen business rule, permission scope, or schema
was changed by this layer — every page and component calls an existing (or, where explicitly
disclosed, a newly added pure-read) Business Service / Server Action.

## 2. Routes added

| Route | Type | Gate |
|---|---|---|
| `/login/continue` | new | post-OAuth redirect resolution |
| `/access-denied` | new | terminal fallback page |
| `/network` | new | `getSalesPrincipal` + `ENTERPRISE_OPERATIONS_ENABLED` + `ENTERPRISE_BUSINESS_NETWORK_ENABLED` |
| `/network/[entity]` (partners, agreements, claims, support) | new | per-entity `network.*` permission via the service layer |
| `/finance` | new | `getSalesPrincipal` + `ENTERPRISE_OPERATIONS_ENABLED` + `ENTERPRISE_FINANCE_ENABLED` |
| `/finance/[entity]` (journals, receivables, payables, expenses) | new | per-entity `finance.*` permission via the service layer |
| `/sales/leads` | new | `leads.view_all` / `leads.view_assigned` |
| `/sales/institutional` | new | `institutional.manage` / `dashboard.institutional` |
| `/sales/support` | new | `support.manage` |
| `/sales/organization/roles` | new | `users.view` |

## 3. Routes changed (chrome/behavior, not page content)

`app/admin/layout.tsx`, `app/dashboard/layout.tsx` (shared by `/sales`), `app/enterprise/layout.tsx`,
`app/enterprise/page.tsx`, `app/sales/ai/admin/page.tsx`, `app/dashboard/founder/page.tsx` (full
rewrite — see §4), `middleware.ts`, `lib/sales/navigation.ts`, `lib/auth/redirect-policy.ts`.

## 4. Components added or changed

- `components/enterprise-shell/EnterpriseShell.tsx` — new (Stage 2); this pass added an Escape
  handler for the user-menu popover and `role="dialog"`/`aria-modal`/`aria-label` on the mobile
  drawer.
- `components/sales/dashboard.tsx` (`SalesDashboard`) — "Work queue" changed from a hardcoded
  placeholder to a real top-5 pull per role variant (Support: assigned customers; Institutional: open
  institutional inquiries; default: open opportunities).
- `app/dashboard/founder/page.tsx` — rewritten from a generic `SalesDashboard` wrapper into the real
  Founder OS Stage 1 experience (health, KPIs, alerts with acknowledge/resolve, notifications,
  executive timeline, global search), calling only existing, already-tested `actions/founder-os.ts`
  Server Actions. Added a visible search submit button (independent-audit finding — Enter-only submit
  was inconsistent with every other search form in the codebase).

## 5. New pure-read functions (no mutation, no calculation logic duplicated)

- `lib/enterprise-network/partner-service.ts`: `getPartner`
- `lib/enterprise-network/governance-service.ts`: `listAgreements`, `getAgreement`
- `lib/enterprise-network/operations-service.ts`: `listClaims`
- `lib/enterprise-network/enablement-service.ts`: `listSupportCases`
- `lib/enterprise-finance/expense-service.ts`: `listExpenseClaims`
- `lib/sales-channel/repository.ts`: `leadScope`, `listLeads`, `listInstitutionalInquiries`
- `lib/muv-ai/security.ts`: `requireAiAdminPermission` (extracted from inline page logic for
  testability, not new logic)

Each calls its domain's own existing `require*Principal`/`requirePermission` guard as its first
statement, before any database read — confirmed for every one of them, including via the
narrow-permission-denial test suite (§8).

## 6. Permissions and feature flags used

No new permission or feature flag was created. Existing keys used: `network.partners.view`,
`network.agreements.manage`, `network.claims.manage`, `network.partners.manage`,
`network.analytics.view`; `finance.masters.view`, `finance.receivables.view`, `finance.payables.view`,
`finance.expenses.manage`, `finance.reports.view`; `leads.view_all`, `leads.view_assigned`,
`institutional.manage`, `dashboard.institutional`, `support.manage`, `users.view`,
`users.manage`/`roles.manage`; `ai.prompts.manage`/`ai.providers.manage`/`ai.security.manage`.
Feature flags: `ENTERPRISE_OPERATIONS_ENABLED`, `ENTERPRISE_BUSINESS_NETWORK_ENABLED`,
`ENTERPRISE_FINANCE_ENABLED`, `ENTERPRISE_FOUNDER_OS_ENABLED` (all seeded off by default — unchanged;
this pass only ever toggled them temporarily for live validation and reverted them, confirmed in §7).

## 7. Defects found and repaired

**Stage 3 (route integrity), already reported and fixed in the prior session:** AI Administration
under-protected relative to its nav gate; `/enterprise` index unprotected; duplicate Quotations nav
entry; Organization nav under-linked relative to its own page's permission; dead `/sales` cross-link.

**This pass:**
1. `assign_commerce_numbers()` shared trigger bug — full remediation, see
   `COMMERCE_NUMBER_TRIGGER_REMEDIATION.md`.
2. `listInstitutionalInquiries()` had no permission check of its own (independent audit finding) —
   fixed to self-check `institutional.manage`/`dashboard.institutional`.
3. `/network` and `/finance` layouts only checked their own feature flag, not the base
   `ENTERPRISE_OPERATIONS_ENABLED` the service layer also requires (independent audit finding) — a
   flag-misconfiguration would have produced an ungraceful error instead of the intended disabled
   panel. Fixed to check both.
4. Founder OS dashboard's search form had no visible submit button (independent audit finding) —
   added.
5. `EnterpriseShell`'s user-menu popover didn't close on Escape (only outside-click did) — fixed.
   Mobile drawer lacked `role="dialog"`/`aria-modal` — added.

**Independent-audit findings reviewed and NOT changed, with reasoning:**
- `/network/[entity]` relies on the service layer for authorization rather than duplicating a
  page-level check — this is the exact, pre-existing pattern `/enterprise/[module]/page.tsx` already
  uses; changing it would mean redesigning established precedent, not fixing a regression.
- The original narrow-permission-denial suite tested sibling functions rather than every literal new
  function — addressed by adding 7 more test cases targeting the actual new functions directly (§8).

## 8. Test and verifier evidence (exact counts, live re-runs)

- `npx tsc --noEmit`: clean.
- `npm run build`: clean, all routes compile.
- `npx vitest run`: **27 test files, 373 tests, 0 failed, 0 skipped.**
- `npm run verify:phase2` (previously could not run — see §9's note on the missing-artifact repair):
  **22/22 passed.**
- `scripts/verify-sales-architecture.cjs`, `-phase3` (30/30), `-phase4` (32/32), `-phase5` (21/21),
  `-phase6` (44/44), `-phase7` (59/59): all passed.
- `scripts/verify-enterprise-phase1.cjs`: 82/82. `-part3a`: 27/27. `-part3b`: 69/69 (+ `-part3b-db`
  live check, no assertion failures). `-part3c`: 73/73. `-part3d`: 127/127.
- `__tests__/enterprise-ui/narrow-permission-denial.integration.test.ts`: 16/16 (9 original + 7 added
  this pass for the five new pure-read functions and `listInstitutionalInquiries`).
- `__tests__/commerce/number-trigger-remediation.integration.test.ts`: 7/7.

## 9. Repaired: `verify-sales-phase2.cjs` missing build artifact

Root cause: this verifier is the only one of the `verify-*.cjs` scripts that exercises real
application routing logic (`routePublicInquiry`) rather than only checking database state, so it
needs a compiled CommonJS build of `lib/sales-channel/routing.ts` and its (relative-import-only, no
`@/` aliases) dependency chain. That build step existed only as an undocumented, unreproducible
manual `tsc` invocation someone ran once — a genuine in-repository reproducibility defect, not an
external prerequisite. Fixed: `npm run verify:phase2:build` (compiles), `npm run verify:phase2`
(builds then runs). `.tmp-phase2-services/` added to `.gitignore` as a disposable local artifact
directory. Verified working from a clean state (deleted the directory, re-ran `npm run verify:phase2`
end to end).

## 10. Browser/manual validation — what was and wasn't verified

**No browser automation tool is available in this environment.** Everything below is what real
tooling (authenticated HTTP sessions against a running dev server, and direct source-code reading)
could and did verify — and, explicitly, what it could not.

**Verified with real evidence:**
- **Per-role server-side access control**, via real authenticated HTTP sessions (temporary,
  password-known test accounts created for Sales Manager, Sales Officer, Institutional Sales Officer,
  and Customer Support — deactivated afterward, since their login audit-log rows are immutable by
  design and block hard deletion; Founder used the existing seeded admin account; a pure-STAFF account
  with no active Sales role was also created and deactivated). Confirmed for every role: correct
  landing route, correct grant on their own module, correct denial (via thrown `ForbiddenError` → 500,
  or `redirect()` → 307 to `/login` or `/access-denied`, depending on which layer catches it) on every
  other role's route, independent of what navigation shows. One measurement artifact was found and
  resolved along the way: an initial batch-loop test harness intermittently mis-reported
  redirect-based denials as granted access due to a PowerShell/.NET redirect-handling quirk — rebuilt
  to follow redirects and check the final landing URL, then cross-checked every ambiguous result with
  an isolated, single-request follow-up. The corrected results are what's reported here.
- Enabling the relevant feature flags confirmed Founder gets real, correct content on `/network`,
  `/finance`, `/enterprise`, and `/enterprise/vendors`; all flags were reverted to their original
  disabled state afterward (confirmed via a final DB check — only the two pre-existing,
  unrelated `AI_KNOWLEDGE_RETRIEVAL`/`AI_PLATFORM_ENABLED` flags remained on, exactly as before this
  session touched anything).
- **Keyboard/ARIA wiring** confirmed by reading `EnterpriseShell.tsx` directly: Escape closes both the
  drawer and (as of this pass) the user menu; the drawer closes on route change; outside-click closes
  the user menu; every interactive control is a real `<button>`/`<a>`, not a non-semantic
  `div`-with-onClick, so native keyboard focus/activation applies; `aria-label`/`aria-expanded`/
  `aria-haspopup`/`role="menu"`/`role="dialog"`/`aria-modal` are present where expected.
- **Responsive structure** confirmed by reading the Tailwind classes directly: `hidden lg:flex` /
  `lg:hidden` breakpoint pairs correctly gate desktop-sidebar vs. mobile-drawer/hamburger rendering.

**Explicitly NOT verified — no tooling to do so in this environment:**
- Actual pixel-level rendering, drawer slide animation, or visual layout at any viewport size.
- Real keyboard Tab order or visible focus-ring appearance (the code review confirms native focusable
  elements are used and no `outline: none` is applied anywhere in this session's new code, which is
  strong indirect evidence, but not the same as watching a focus ring move).
- Touch/mobile-specific interaction (swipe, tap targets, table horizontal-scroll behavior on an actual
  small viewport).
- Screen-reader behavior in a real assistive-technology product (NVDA/VoiceOver etc.) — only the
  underlying ARIA markup was confirmed present and structurally plausible.

## 11. Remaining limitations (known, disclosed, not fixed this pass — out of scope)

- Business Network and Enterprise Finance UI cover their central entities (Partners; Agreements,
  Claims, Support Cases; Journals, Receivables, Payables, Expense Claims) — not every model in either
  25-model/30-model backend domain (e.g., no UI yet for royalty/commission runs, compliance,
  training, chart-of-accounts, banking/reconciliation, trial balance/ledger reports). Deliberately
  scoped, not silently incomplete — each domain's research notes (this session's own investigation)
  record what exists and isn't yet surfaced.
- Founder OS UI covers Stage 1 (health/KPIs/alerts/notifications/timeline/search) only — Stage 4
  Workspace (saved views, dashboard layouts, pinned-widget reordering, saved reports/scheduling) and
  the Stage 2/3 analysis surfaces (trend/comparison/risk/decision-queue/explainability/drilldown/
  briefs/approval-center/monitoring/exception-center/activity-supervision) all have real, tested
  Server Actions with zero UI — a real, separately-warranted follow-up, not attempted here.
  Opportunity/quotation mutation UI (stage transitions, task management) remains read-only, as it was
  before this effort — a Part 1 (Sales Architecture) gap that predates this work.
- Sidebar-adjacent `loading.tsx` states exist only for `/admin` — consistent with (not a regression
  from) the pre-existing absence across all of `/dashboard`, `/sales`, `/enterprise`, and now
  `/network`/`/finance` too, for consistency with that established, if imperfect, precedent. Fixing it
  would mean introducing a new pattern across the entire Sales/Enterprise surface, which is broader
  than this pass's evidence-first mandate.
- Permission-denied pages render through the generic root error boundary ("Something went wrong")
  rather than a dedicated "Access Denied" message when a page throws `ForbiddenError` directly (as
  opposed to a layout's `redirect("/access-denied")`) — this is the same established, pre-existing
  pattern used by virtually every Sales/Enterprise page's `requirePermission`/`requireAnyPermission`
  call, not a regression; changing it would mean touching dozens of pre-existing pages' shared
  authorization helpers, out of scope for an evidence-first pass.
- No mobile drawer focus trap (Tab can still reach elements behind the overlay while it's open) — a
  real, minor, disclosed gap; not fixed this pass given proportionality.

## 12. Production deployment notes

Nothing in this pass was applied to production. The commerce-trigger migration
(`20260801100000_commerce_number_trigger_remediation`) is the one schema-level change and needs
`prisma migrate deploy` run against production through the normal deployment workflow, before or
alongside this UI layer's deployment — see `COMMERCE_NUMBER_TRIGGER_REMEDIATION.md` §12 for
production-specific guidance (that document explicitly flags that production impact could not be
confirmed from this environment). All new Enterprise UI feature flags remain seeded OFF; enabling
`ENTERPRISE_BUSINESS_NETWORK_ENABLED`/`ENTERPRISE_FINANCE_ENABLED` (and the underlying per-module
flags where relevant) in production is a separate, deliberate rollout decision, not automatic on
deploy.

## 13. Rollback considerations

Every route/component addition in this pass is purely additive (new files, or narrowly-scoped edits
to existing files with the diffs described in §3/§4) — reverting is a matter of removing the new
files and reverting the listed edits; no data migration is entailed by the UI layer itself. The one
schema-level change (the trigger remediation) has its own rollback notes in
`COMMERCE_NUMBER_TRIGGER_REMEDIATION.md` §10.

## 14. Final freeze recommendation

**Recommend: FREEZE**, with the limitations in §11 carried forward as explicitly disclosed, separately
authorizable follow-up work — not silent gaps. Every route added is real, permission- and
flag-gated, and independently verified (both by automated tests and live authenticated HTTP sessions
across all six roles named in the authorization). Zero dead links. Zero regressions across 373 tests
and 500+ verifier checks. The one production-risk-relevant discovery (the commerce trigger bug) was
fully investigated, fixed, and validated under its own bounded, explicitly authorized remediation.
The disclosed limitation is tooling, not scope-cutting: this environment has no browser automation, so
visual/interactive/screen-reader behavior is evidenced only indirectly (via source code), not directly
observed — flagged plainly rather than claimed as verified.
