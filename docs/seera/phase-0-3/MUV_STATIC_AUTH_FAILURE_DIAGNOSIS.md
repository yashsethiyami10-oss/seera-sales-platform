# MUV Static/Auth Failure Diagnosis

| File/test | Expected / actual | Classification | Evidence and action |
|---|---|---|---|
| `admin/product-editor-verification`: save 12 images/content/FAQs | Expected success; never returns by 60s | FAIL — TEST INFRASTRUCTURE or pre-existing DB/update blocker; application defect not proven | Stalls at `prisma.productContent.upsert`; cleanup restore also exceeds 60s; 19 leaks are unfinished Prisma requests. Investigate locks/query plan/test fixture on dedicated DB. Do not change product action in this phase. |
| `enterprise-ui/narrow-permission-denial`: Founder dashboard positive control | Expected defined; full file times out at 60s | FAIL — TEST INFRASTRUCTURE | Same test passes alone in 13.977s with valid `beforeAll`; 15/16 pass in full file. Cumulative pool/latency, not stale expectation. |
| `institutional`: blank GST conversion | Expected success; Phase 0.2 timed out | PASS when validly isolated | Full file passes; operation 5.516s. A filtered run failed because preceding fixture creation was skipped and is invalid evidence. |
| `institutional`: valid GST conversion/create lead | Expected success; Phase 0.2 returned false after P2024 | PASS when validly isolated | Full file passes; operation 5.931s. Earlier false result followed pool exhaustion. |

No production correction is authorized or recommended from these results.

