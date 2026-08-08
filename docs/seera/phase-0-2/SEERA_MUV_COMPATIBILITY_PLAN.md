# MUV Compatibility Plan

## Routing rule

```text
Existing MUV request -> existing route/action/service/schema remains authoritative
Seera request        -> new Seera route/service/schema with explicit organisation principal
Shared capability    -> new wrapper/adapter; legacy MUV caller behavior unchanged
```

There is no fallback that assigns an unscoped Seera record to MUV.

| MUV surface | Protection strategy |
|---|---|
| Authentication | Keep Auth.js configuration, User uniqueness, JWT fields and login routes unchanged; layer Seera membership resolution after authentication on Seera routes |
| Roles/permissions | Keep `requireAdmin/Staff/Customer` and Sales permissions authoritative for MUV; new Seera guard never broadens them |
| Routes/dashboards | No rename or route interception; Seera lives under separate route group/shell and feature flag |
| Users/customers | No data rewrite; new memberships reference User; new BusinessParty does not replace Customer |
| Products/prices | Existing catalog unchanged; Seera catalog/pricing separate |
| Quotations/orders | Existing engines and numbering unchanged; Seera aggregate/sequence separate |
| Finance/reports | Existing MUV books, keys, postings and queries unchanged; Seera adapters cannot default to `MUV` |
| Files | Existing access remains; new Seera assets use separate namespace/authorization |
| Notifications | Existing templates/senders unchanged; Seera configuration must exist or send fails closed |
| AI | Existing MUV AI organization/context/workflows unchanged; no Seera retrieval in Phase 1 |
| Seed | Existing seed remains; separate idempotent foundation seed creates org metadata only |
| Document sequences | Existing tables/rows untouched; new Seera sequence cannot consume MUV number |

## Compatibility verification

Capture pre/post route responses, permission outcomes, key record counts, sequence next values, finance trial balances and representative document hashes. Deploy new tables/code dark, run MUV baseline, create Seera metadata only, rerun baseline, then enable Seera flag for test membership. Rollback disables flag/removes new route deployment and leaves new tables dormant; no MUV data restoration is required because none was rewritten.

