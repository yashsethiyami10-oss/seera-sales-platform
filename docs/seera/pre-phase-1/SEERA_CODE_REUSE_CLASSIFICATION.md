# Seera Copied-Code Reuse Classification

Status: **Classification only — no mass deletion or deep refactor**  
Date: 2026-08-08

## Rules

- Reuse patterns only after removing MUV data/schema/business assumptions inside Seera.
- No code may import from the MUV filesystem or query a MUV database.
- “Keep” means candidate, not production-ready.
- Modules dependent on copied MUV Prisma models remain disabled until adapted.

| Area | Classification | Evidence/condition |
|---|---|---|
| Next.js/TypeScript/Tailwind mechanics | Keep and reuse | Generic runtime structure |
| UI primitives (`components/ui`) | Keep and reuse | Audit brand tokens/assets before portal use |
| OS shell/layout | Adapt for Seera | Navigation, switcher, AI panel and styling contain MUV assumptions |
| Auth.js mechanics | Adapt for Seera | Roles, Prisma models, callbacks, email and sessions are MUV-bound |
| RBAC helper pattern | Adapt for Seera | Replace enum roles with permission + scope; retain server-boundary discipline |
| Zod convention | Keep and reuse | Generic helpers only; MUV domain schemas disabled |
| Error normalization | Keep and reuse | Review Seera codes and log redaction |
| Environment validation | Adapt for Seera | Add production/test/MUV identity guard before commands |
| Audit patterns | Adapt for Seera | Retain append-only concepts; remove MUV principal/schema coupling |
| Messaging interface | Adapt for Seera | Seera credentials, templates, consent, outbox, recipient scope |
| Media/file utilities | Adapt for Seera | Replace public assumptions with private storage/signed access |
| Toast/modal/form primitives | Keep and reuse | Accessibility review remains |
| Quotation/PDF patterns | Adapt for Seera | Rebuild party, pricing, seller, approval and document scope |
| Enterprise finance concepts | Reference/adapt selectively | Balanced journals/reversals useful; code is MUV-schema-bound |
| Payment provider | Do not use now | MUV Razorpay business flow |
| Shipping providers | Do not use now | MUV commerce flow differs from distributor delivery |
| Storefront/cart/account/CMS routes | Disable from Seera routes | Separate consumer commerce business |
| MUV AI/knowledge | Disable from Seera routes | Outside early phases and MUV-specific |
| Manufacturing/procurement | Disable from Seera routes | Outside frozen V1 scope absent approval |
| MUV finance/network routes | Disable from Seera routes | Hard-coded `organizationKey: "MUV"` |
| MUV seeds | Do not use | MUV users/products/config and database writes |
| Copied Prisma schema/migrations | Do not use | Reference until clean replacement |
| Existing tests | Adapt selectively | Do not run MUV fixtures against Seera |
| Historical reports/docs | Keep as reference | Provenance; new constitution supersedes shared-MUV direction |

Before a Seera server starts, copied MUV route groups must be outside the active app tree, compile-time isolated, or proven harmless against the clean schema. A runtime flag is insufficient if module evaluation imports missing MUV Prisma models.

No module is removed merely because it is MUV-named. Removal requires import graph, route ownership, tests, and reference-value evidence.

