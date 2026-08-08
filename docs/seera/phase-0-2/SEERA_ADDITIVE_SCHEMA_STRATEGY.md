# Additive Schema Strategy

## Option decision

- Option A, modify all MUV tables: **rejected—high risk**.
- Option B, key only shared enterprise models: insufficient; identity/context still unsafe.
- Option C, separate organisation-scoped Seera domain: **preferred default**.
- Option D, hybrid wrappers/adapters: **recommended with C** for genuinely shared identity/foundation services.

MUV stability takes precedence over schema elegance.

| Proposed Change | Why Required | Isolated Alternative | MUV Risk | Reversible | Recommended |
|---|---|---|---|---|---|
| New `Organization` | Entity registry | Separate Seera deployment | Low | Yes | Yes |
| New `OrganizationMembership` | Authority boundary | Separate auth | Low/medium | Yes | Yes |
| New role/assignment tables | Multi-role per membership | Hard-coded Seera roles | Low | Yes | Yes |
| New `OrganizationSetting` | No cross-brand fallback | Seera config file | Low | Yes | Yes |
| New `OrganizationSequence` | Separate documents | Seera-specific sequence table | Low | Yes | Yes; may name Seera-specific initially |
| New `OrganizationFeatureFlag` | Safe activation | Environment flag | Low | Yes | Yes |
| New scoped audit/context records | Switch/access evidence | Seera-only audit | Low | Yes | Yes |
| Add membership version to JWT/session | Immediate invalidation | Live DB check every request | Medium | Yes | Minimal compatible extension only after tests |
| Add org IDs to legacy Customer/Product/Order | Architectural unification | Separate Seera models | Critical | Difficult | Reject in Phase 1 |
| Alter existing finance `organizationKey` | Reuse engine | Seera book adapter/new mappings | Critical | Difficult | Reject in Phase 1 |
| Replace Role enum | Membership roles | New tables | Critical | No/simple rollback unavailable | Reject |

Proposed tables remain nullable-free internally because they contain only new rows; no legacy backfill is needed. Foreign keys cascade only for non-financial join/config rows; business/audit membership history uses restrict/soft status.

