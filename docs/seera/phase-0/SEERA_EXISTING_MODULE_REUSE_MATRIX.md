# Seera Existing Module Reuse Matrix

| Existing Module | Current Purpose | Seera Reuse Level | Required Modification | Main Risk | Recommendation |
|---|---|---|---|---|---|
| Auth.js (`lib/auth.ts`, `auth.config.ts`) | Shared login/JWT identity | Reuse With Tenant Hardening | Membership claims, live status/version check, org selection | 30-day JWT retains changed grants | Keep global identity; never put all authority solely in JWT |
| Base RBAC (`lib/rbac.ts`) | ADMIN/STAFF/CUSTOMER gates | Use Only as Reference | Replace business authorization with membership permissions | Role-only cross-entity access | Retain only for legacy MUV adapters |
| Sales RBAC (`lib/platform-core/authorization.ts`) | Data roles and permissions | Reuse With Tenant Hardening | Membership-role many-to-many, scoped grants | One role/user; Founder global bypass | Refactor behind new org principal |
| OS shell/components | Shared navigation and UI primitives | Reuse As-Is | Org-aware nav labels and authorization inputs | Cosmetic switching before security | Activate switch only after backend gate |
| Sales CRM/inquiries | Leads, routing, queues, customers | Reuse With Tenant Hardening | Org ownership and scoped exports/search | Global customer/queue records | Reuse workflows after model migration |
| Opportunities/tasks/calendar | Governed opportunity execution | Reuse With Tenant Hardening | Org keys and assignment predicates | Global aggregates | Reuse service patterns |
| General quotation engine (`lib/quotation/*`) | Versions, pricing, approval, PDF | Reuse With Domain Extension | Org catalog/branding/sequence/scheme/tax snapshots | MUV prices/logo/number leak | Seera templates must fail closed |
| Institutional quotation (`InstQuotation*`) | Institutional-specific quote flow | Use Only as Reference | Channel-party semantics | Duplicates general quotation engine | Harvest workflow fields, do not fork again |
| Storefront Order | Consumer checkout/payment/shipment | Do Not Reuse | N/A for channel order | No buyer/seller parties or item delivery ledger | Keep MUV storefront isolated |
| BusinessOrder | Institutional business orders | Reuse With Domain Extension | Buyer/seller/type/party/fulfilment states/events | Header status and global parents | Candidate aggregate after design decision |
| Commerce operations | Reservation/allocation/pick/pack/dispatch/invoice | Reuse With Domain Extension | Org inventory/parties and item delivery outcomes | Global Product/Warehouse | Reuse fulfilment mechanics |
| Enterprise Network (`lib/enterprise-network/*`) | Partners, hierarchy, territories, targets, claims | Reuse With Tenant Hardening | Real org principal and Seera profiles/portal scope | String key + MUV literal | Best base for channel hierarchy |
| Enterprise Finance (`lib/enterprise-finance/*`) | GL, AR/AP, banking, reconciliation, notes, expenses | Reuse With Tenant Hardening | Real org context, party subledgers, proof workflow | Cross-key references; MUV literal | One ledger engine only |
| Institutional visits/routes/targets/expenses | Check-in/out, survey, plans, claims | Reuse With Domain Extension | Retail beat, GPS events, consent, distance approval, offline | Point capture is not field-force tracking | Reuse UI/service concepts |
| Territory master | State/city/area/territory hierarchy | Reuse With Domain Extension | Org ownership, zone/region/town/market/route/beat | Global unique code, no effective assignment | Align with NetworkTerritory or consolidate additively |
| Customer master | Business fields and contacts | Use Only as Reference | Party/retailer model and scoped uniqueness | Global email/code; MUV coupling | Separate org Party with optional mapping |
| Product/variant/inventory | MUV catalog and stock | Reuse With Tenant Hardening | Org catalog, packs/cases/UOM, channel inventory | Global public product exposure | Backfill MUV then add Seera catalog |
| PricingPolicy/quotation pricing | Discount/tax/approval | Reuse With Domain Extension | Effective price lists, channel levels, schemes | MUV policies visible | Add immutable snapshots and eligibility |
| Razorpay/payment actions | Storefront payment gateway | Use Only as Reference | Seera proof/bank matching is different | Upload could be mistaken for settlement | Use finance AR/reconciliation instead |
| Shipping providers/webhooks | Pluggable carrier integration | Reuse With Tenant Hardening | Org credentials/webhook routing/event mapping | Shared secrets and recipient leakage | Per-org provider configuration |
| Messaging providers | Twilio/MSG91/Interakt/WABA abstraction | Reuse With Tenant Hardening | Per-org sender/templates/consent/retry | Global provider env and no inbox | Preserve interface, add org config/outbox |
| NotificationLog/templates | Delivery attempts | Reuse With Domain Extension | Org, inbox/read state/preferences, retry | Log is not user inbox | Add notification domain, retain delivery log |
| Media/attachments | Cloudinary uploads and metadata | Reuse With Tenant Hardening | Private namespaces, signed access, parent/org validation | Public URL leakage | Central asset authorization gateway |
| SalesAuditLog/platform audit | Operational audit | Reuse With Tenant Hardening | Org and membership snapshot; trigger verification | Global log; nullable actor | Append-only per org |
| Founder/report infrastructure | Alerts, dashboards, saved reports | Reuse With Tenant Hardening | Org-scoped metrics and Seera read models | Some definitions/queries global | Reuse presentation/report framework |
| Vitest + verification scripts | Automated tests | Reuse As-Is | Two-org fixtures and security suites | Existing tests do not prove tenancy | Make isolation tests deployment gate |

## Portal coverage conclusion

Existing internal Founder/Admin/Accounts/Manager shells are reusable. Sales Executive is partial. Distributor, super-stockist, retailer, and delivery-user portals require new role-scoped experiences even where underlying network/finance services are reused.

