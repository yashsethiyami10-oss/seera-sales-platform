# Seera Package Identity Preparation

Status: **Prepared — no database activity**  
Date: 2026-08-08

## Applied identity changes

| Surface | Previous copied identity | Seera identity | Reason |
|---|---|---|---|
| `package.json` package name | `muv` | `seera-sales-distribution-os` | Independent npm/project identity |
| `package.json` version | `1.0.0` | `0.1.0` | Honest pre-Phase 1 Seera baseline |
| `package-lock.json` root package | MUV name/version | Seera name/version | Lockfile consistency only; dependencies unchanged |
| Root application metadata | MUV consumer-brand title/description | Seera Sales & Distribution OS | Top-level application identity |
| SEO organization constants | MUV name/domain/description | Seera name, neutral localhost fallback, Seera description | Prevent copied MUV identity becoming Seera defaults |
| Passenger server log label | MUV | Seera Sales & Distribution OS | Operational process identity |

No dependency, script name, route, module, CSS class, model, environment variable, or database behavior was changed.

## MUV reference classification

### A — project identity changed now

- npm package root name/version;
- root app title and description;
- global SEO organization name/default description;
- default canonical origin changed from MUV production to neutral localhost when no Seera URL is configured;
- server startup label.

### B — reusable shared implementation; retain temporarily

- technical CSS tokens/classes such as `muv-os-card` where renaming would be a broad behavioral refactor;
- copied UI primitives, shell layout mechanics, auth/session mechanics, validation/error patterns, provider interfaces, test helpers;
- script names that directly address retained copied MUV modules, such as `verify:muv-ai-markdown`.

These identifiers are implementation provenance, not Seera business identity. Rename only with dependency proof and tests.

### C — MUV-specific business functionality; isolate later

- storefront routes/content, MUV customer/catalog/order workflows, MUV AI modules, enterprise manufacturing, MUV finance organization constants, MUV notification/content settings;
- hard-coded `organizationKey: "MUV"`, MUV domains/emails/GST variables, storefront sitemap/robots defaults, MUV product/support/knowledge modules;
- MUV deployment and seed assumptions.

These must not be cosmetically relabeled. They require disable/isolate decisions before Seera runtime activation.

### D — historical/reference; retain unchanged

- root MUV phase/audit/deployment reports copied as provenance;
- `docs/seera/phase-0*` historical records;
- MUV Knowledge material and MUV reference snapshots;
- migration names and historical comments describing why MUV code behaved as it did.

## Deliberately unchanged

- `.env`, `.env.test`, and all credentials;
- `.env.example` and `.env.production.example`, because they contain mixed MUV business contracts requiring a governed replacement rather than partial edits;
- `app/sitemap.ts` and `app/robots.ts`, because they query MUV storefront tables and belong to class C;
- deep `muv-*` modules, paths, imports, CSS selectors, database identifiers, and test names;
- active Prisma schema and migrations.

## Remaining identity gate

Before any Seera runtime is started, Phase 1 preparation must supply a Seera-only environment example, disable MUV-only route groups, replace MUV seed/deployment assumptions, and prove no class-C module is reachable. This document does not authorize that work.

