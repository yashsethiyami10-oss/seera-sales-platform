# Seera MUV Route Isolation Map

## Applied boundary

The 225-file copied `app/` tree was hash-verified and moved to `reference/muv-app/`. Manifest: `reference/MUV_APP_ROUTE_ARCHIVE_MANIFEST.sha256`. Hash differences: 0.

The new active app contains only Seera root identity and seven portal-shell route definitions. Middleware returns HTTP 503 with `SEERA_PORTAL_NOT_ACTIVE` for every `/portal/*` request. There is no environment bypass. The root TypeScript compilation scope excludes copied actions/components/reference/test trees.

| Class | Examples | Treatment |
|---|---|---|
| A — reusable foundation | layout mechanics and generic UI concepts | selectively copy later after review |
| B — may remain compiled but inaccessible | none in active route tree during Block 1 | fail-closed preference used |
| C — required isolation | storefront, admin/account, sales, finance, network, enterprise, APIs | archived outside active `app/` |
| D — later removal candidate | consumer storefront/CMS/support/manufacturing routes | retain in reference until dependency proof |
| E — must not be used | MUV AI/knowledge, hard-coded MUV finance/network and MUV webhook flows | reference only; no Seera import |

Portal shells: Founder/Admin, Company Admin, Accounts, Sales Manager, Sales Executive, Distributor and Super Stockist. Each has a stable required-permission code, but no portal is accessible until Block 2 implements independent auth and server authorization.

