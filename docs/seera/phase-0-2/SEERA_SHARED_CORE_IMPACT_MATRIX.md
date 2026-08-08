# Shared-Core Impact Matrix

| Existing File/Symbol | Proposed Change | Why Unavoidable | Additive Alternative Considered | MUV Behaviour Risk | Required Tests | Rollback | Class |
|---|---|---|---|---|---|---|---|
| `prisma/schema.prisma` | Append new foundation models only | Shared DB needs registry/membership | Separate schema/deployment | Low if additive | Prisma diff, migration, full MUV baseline | Reverse only new empty tables before Seera data | Minimal compatible extension |
| `User` model | Add relation field only, no scalar/constraint change | Prisma relation navigation | Store userId without relation | Low | auth/session/seed | Remove relation with reverse migration | Requires Founder approval |
| `lib/auth.ts` / `auth.config.ts` | No Phase 1 behavior change | N/A | New Seera context resolver | None | existing auth | N/A | No change required |
| `lib/rbac.ts` | No change | Legacy MUV boundary must remain | New `lib/seera/auth/*` | None | existing RBAC | N/A | No change required |
| `lib/platform-core/context.ts` | No change; MUV literal preserved for MUV | Avoid enterprise regression | New Seera principal/context | None | enterprise suites | N/A | New wrapper only |
| `middleware.ts` | Prefer no change; Seera layout/server guards first | Middleware convenience is not security | Separate Seera layout | None | route denial | N/A | No change required |
| OS shell CompanySwitcher | No change in Phase 1 | Existing MUV badge is intentional | Separate Seera portal shell | None | visual/route | N/A | No change required |
| Prisma client `lib/prisma.ts` | No change | Shared pool is already singleton | Import from new Seera repository | None | baseline/pool | N/A | No change required |
| New Seera context adapter | New file | Explicit membership/org authority | Modify MUV principal | None to MUV | bilateral denial/stale session | Remove Seera routes/flag | New adapter only |
| New feature/sequence repositories | New files/tables | Fail-closed activation/numbering | Reuse MUV config/sequence | None | idempotency/isolation | Disable flag | New wrapper only |
| Existing Customer/Product/Order | No change | Isolated models viable | Add org keys | Critical if changed | N/A | N/A | High-risk modification — reject |
| Existing finance models/services | No Phase 1 change | Seera finance out of scope | Extend MUV key | Critical | N/A | N/A | High-risk modification — reject |
| Existing notification/media/AI | No Phase 1 change | Business integration later | Add org fallback | High | N/A | N/A | High-risk modification — reject |

No existing shared business file has an unavoidable Phase 1 modification beyond the additive Prisma relation declaration; even that requires migration review and can be avoided with scalar IDs if relation generation risks MUV.

