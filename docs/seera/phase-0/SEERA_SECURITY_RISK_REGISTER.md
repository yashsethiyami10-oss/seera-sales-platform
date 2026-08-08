# Seera Security Risk Register

Only inspected-code findings are included.

| Risk ID | Area | Description | Severity | Evidence | Impact | Required Mitigation |
|---|---|---|---|---|---|---|
| SR-001 | Identity | No organisation membership or multi-role authority | Critical | `prisma/schema.prisma:24-153` | Any shared user model would grant global business authority | Organisation/membership/scoped-role model and stale-session invalidation |
| SR-002 | Context | Enterprise principal is compile-time MUV | Critical | `lib/platform-core/context.ts`; `lib/validations/enterprise-phase2.ts` | Seera cannot be represented safely; client key hacks would bypass trust | Server-resolved membership context, remove literal validators behind migration |
| SR-003 | UI/context | Company switch is intentionally static/single-company | High | `components/os-shell/Header/CompanySwitcher.tsx` | Cosmetic switch could imply isolation that does not exist | Keep disabled until backend isolation gate passes |
| SR-004 | Data | Core Customer/Product/Territory/Order models lack org key | Critical | `prisma/schema.prisma:222-940` | Direct cross-entity reads, selectors and aggregates | Org ownership/backfill/composite constraints/scoped repositories |
| SR-005 | RBAC | Base and Sales checks lack membership | Critical | `lib/rbac.ts`; `lib/platform-core/authorization.ts` | Horizontal/vertical escalation across entities | Central `requireOrgPermission` plus assignment predicates |
| SR-006 | Founder | Founder bypass is global | Critical | `principalHasPermission` in `authorization.ts` | One role implicitly crosses legal entities | Organisation-specific Founder membership; reserve platform break-glass separately |
| SR-007 | Query consistency | Mixed direct Prisma access and partial org filtering | High | scoped enterprise services versus global Sales/storefront actions/APIs | Missed `where` leaks records/reports/exports | Repository contract, lint/review rule, adversarial tests, optional RLS defence |
| SR-008 | Referential tenancy | `organizationKey` is a string repeated on parent/child rows | High | enterprise schema models from line 4857 onward | Cross-key parent/child joins are structurally possible | Organisation FK and composite FK/assertions in transactions |
| SR-009 | Orders | No immutable item delivery/refusal/return quantity events | Critical | `BusinessOrderItem`, `OrderItem` | Booked value may be misreported as delivered performance | Item event ledger and derived metrics |
| SR-010 | Payments | Existing Razorpay/payment status is not proof/bank reconciliation workflow | High | `actions/payments.ts`, `lib/payments/razorpay.ts`; finance banking is separate | Fraudulent upload could be treated as paid if reused naively | Pending proof + maker-checker + receipt/allocation/reconciliation |
| SR-011 | Files | No uniform organisation-private file authorization | Critical | `MediaAsset`, varied attachment models, `lib/media.ts` | KYC/proof/ledger documents can leak by URL or selector | Central Asset record, org namespace, private signed access, malware/type checks |
| SR-012 | Audit | SalesAuditLog has no organisation and nullable actor | High | `prisma/schema.prisma:261-278` | Cross-entity audit disclosure and weak attribution | Org/membership snapshot; append-only DB enforcement verification |
| SR-013 | GPS | Institutional coordinates lack tracking privacy/device policy | High | `InstVisit`; CheckInForm geolocation | Excess collection, territory bypass, sensitive raw export | Work-session consent, scoped access, retention, device/sync evidence |
| SR-014 | Offline | No service worker/local DB/outbox/conflict model | High | only ConnectionStatus; repo search finds no service worker/IndexedDB | Duplicated/lost visits/orders in weak networks | Idempotent command/outbox design before PWA |
| SR-015 | Notifications | Delivery log/provider config is not org inbox/sender isolation | High | `NotificationLog`, `lib/notify/*`, `lib/messaging/index.ts` | MUV sender/content/recipient can cross into Seera | Org templates/senders/outbox/recipient validation |
| SR-016 | Sessions | JWT max age is 30 days and authority is not membership-versioned | High | `lib/auth.ts` | Disabled membership/role changes may persist in session UX | Live sensitive checks, membership version, token refresh/revocation |
| SR-017 | Rate limiting | In-process counters do not coordinate instances | Medium | `lib/rate-limit.ts`, documented in `AGENTS.md` | Brute-force/reminder abuse at scale | Redis-backed limiter retaining interface |
| SR-018 | Money | Commerce uses integer rupees while finance uses Decimal | High | schema header and Finance models | Conversion/rounding errors in channel tax/ledger | Approve minor-unit convention and explicit boundary tests |
| SR-019 | Knowledge governance | Required constitution files absent from checkout | High | `.Codex` absent; only Knowledge index present | Architecture cannot be certified against supreme source | Restore canonical files and perform Founder conflict review |
| SR-020 | Testing | No tenant-isolation suite because tenant model does not exist | Critical | `__tests__` inventory | Regressions can ship unnoticed | Two-org fixtures and mandatory isolation/security suite |

## Security acceptance gate

No Seera data import or portal activation until SR-001/002/004/005/006/009/011/020 are closed and independently reviewed. Financial/location permissions require explicit segregation-of-duties and privacy approval.

