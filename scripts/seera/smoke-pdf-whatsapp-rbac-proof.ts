import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { createQuotationDraft, issueQuotation } from "../../lib/sales-distribution/quotation-service";

// Live HTTP proof (Executive resume task, priorities 2-4): PDF download for all four document
// types (S.S. Quotation, S.S. GST Invoice, Distributor Quotation, Distributor GST Invoice),
// WhatsApp document-send wiring, and document RBAC (wrong-partner + guessed-ID denial) — all
// against the real running dev server (TEST DB), not just code review. Safe to re-run.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

const BASE_URL = process.env.SEERA_REVIEW_BASE_URL ?? "http://localhost:3001";
const REVIEW_PASSWORD = "SeeraReview!2026";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function login(email: string, tag: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `127.9.1.${tag}` },
    body: JSON.stringify({ email, password: REVIEW_PASSWORD }),
    signal: AbortSignal.timeout(30_000),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text().catch(() => "")}`);
  return cookie;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  console.log(`Target dev server: ${BASE_URL}`);

  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const d1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const ssOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });

  // Real S.S. ISSUED GST invoice does not exist yet in TEST (only a DRAFT was ever created by
  // earlier sessions) — issue one now via the same real billing-service path the S.S. portal
  // GST Billing screen uses, so this proof is against a genuinely issued invoice, not a draft.
  console.log("\n=== Preparing an ISSUED S.S. GST Invoice (may not have existed before) ===");
  const cakeSku = await db.seeraSku.findFirstOrThrow({ where: { status: "ACTIVE" } });
  const suffix = Date.now();
  let ssInvoiceId: string;
  const existingSsInvoice = await db.seeraCommercialDocument.findFirst({ where: { type: "TAX_INVOICE", issuerId: ss1.id, status: "ISSUED" } });
  if (existingSsInvoice) {
    ssInvoiceId = existingSsInvoice.id;
    console.log(`  Reusing existing ISSUED S.S. GST invoice ${existingSsInvoice.documentNumber}`);
  } else {
    const draft = await createBillingDraft(db, ssOwner.id, {
      type: "TAX_INVOICE",
      issuerType: "SUPER_STOCKIST",
      issuerId: ss1.id,
      buyerType: "DISTRIBUTOR",
      buyerId: d1.id,
      sourcePortal: "super-stockist",
      lines: [{ skuId: cakeSku.id, quantity: 2, rate: 315 }],
      idempotencyKey: `pdf-proof-ss-invoice-${suffix}`,
    });
    const issued = await issueBillingDraft(db, ssOwner.id, draft.id);
    ssInvoiceId = issued.id;
    console.log(`  Issued new S.S. GST invoice ${issued.documentNumber} (status=${issued.status})`);
  }

  const ssQuotation = await db.seeraCommercialDocument.findFirstOrThrow({ where: { type: "QUOTATION_DOCUMENT", issuerId: ss1.id, status: "ISSUED" } });
  const distQuotation = await db.seeraCommercialDocument.findFirstOrThrow({ where: { type: "QUOTATION_DOCUMENT", issuerId: d1.id, status: "ISSUED" } });
  const distInvoice = await db.seeraCommercialDocument.findFirstOrThrow({ where: { type: "TAX_INVOICE", issuerId: d1.id, status: "ISSUED" } });

  const ssCookie = await login("review-ss-owner@seera.test", "1");
  const distCookie = await login("review-distributor-owner@seera.test", "2");

  console.log("\n=== TASK 2: PDF download — real HTTP round trip, all four document types ===");
  async function checkPdf(label: string, docId: string, cookie: string) {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}/download`, { headers: { Cookie: cookie } });
    if (res.status !== 200) throw new Error(`ASSERTION FAILED: ${label}: expected 200, got ${res.status} ${await res.text().catch(() => "")}`);
    assert(res.headers.get("content-type") === "application/pdf", `${label}: expected Content-Type application/pdf, got ${res.headers.get("content-type")}`);
    const disposition = res.headers.get("content-disposition") ?? "";
    assert(/attachment; filename="/.test(disposition), `${label}: expected a filename in Content-Disposition, got "${disposition}"`);
    const buf = new Uint8Array(await res.arrayBuffer());
    assert(buf.length > 100, `${label}: expected non-trivial PDF byte length, got ${buf.length}`);
    const magic = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
    assert(magic === "%PDF", `${label}: expected %PDF magic bytes, got "${magic}"`);
    console.log(`  OK ${label}: 200, application/pdf, ${buf.length} bytes, magic="${magic}", disposition="${disposition}"`);
  }
  await checkPdf("S.S. Quotation", ssQuotation.id, ssCookie);
  await checkPdf("S.S. GST Invoice", ssInvoiceId, ssCookie);
  await checkPdf("Distributor Quotation", distQuotation.id, distCookie);
  await checkPdf("Distributor GST Invoice", distInvoice.id, distCookie);

  console.log("\n=== TASK 3: WhatsApp document send — real route, no provider configured in this TEST run ===");
  {
    const res = await fetch(`${BASE_URL}/api/documents/${ssQuotation.id}/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ssCookie },
      body: JSON.stringify({ recipientType: "PARTNER", recipientId: ss1.assignedSuperStockistId ?? d1.id }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`  POST /whatsapp-send (no MESSAGING_PROVIDER credentials set) -> ${res.status}`, JSON.stringify(body));
    assert(res.status === 422 || res.status === 409 || res.status === 400, `expected an honest non-200 (no provider configured / no recipient mobile), got ${res.status}`);
    if (res.status === 422) assert(body?.error?.code === "WHATSAPP_DOCUMENT_SEND_UNSUPPORTED", `expected WHATSAPP_DOCUMENT_SEND_UNSUPPORTED, got ${body?.error?.code}`);
    console.log("  OK — honest failure, never a fabricated 'sent' response, matching the documented fallback contract (UI falls back to Share Link on WhatsApp on 422)");
  }

  console.log("\n=== Preparing cross-partner fixtures for the RBAC proof (4b/4c) ===");
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const d2 = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", id: { not: d1.id } } });
  if (d2) {
    // 4b fixture: an S.S.-issued document addressed to a DIFFERENT Distributor (d2), so the
    // Distributor A (d1) test account is neither issuer nor buyer.
    const existingSsToD2 = await db.seeraCommercialDocument.findFirst({ where: { issuerId: ss1.id, buyerId: d2.id, status: "ISSUED" } });
    if (!existingSsToD2) {
      const draft = await createQuotationDraft(db, ssOwner.id, {
        issuerType: "SUPER_STOCKIST", issuerId: ss1.id, buyerType: "DISTRIBUTOR", buyerId: d2.id,
        sourcePortal: "super-stockist", lines: [{ skuId: cakeSku.id, quantity: 1, rate: 315 }],
        idempotencyKey: `pdf-proof-ss-to-d2-${suffix}`,
      });
      await issueQuotation(db, ssOwner.id, draft.id);
      console.log(`  Created S.S. quotation addressed to a different Distributor (${d2.code}) for the 4b proof`);
    }
    // 4c fixture: an own-issued document for Distributor B (d2), issued by the Founder
    // (system:super_admin, so the issuer-scope check passes for any partner) since no
    // review-fixture login exists for d2's own owner.
    const existingD2Own = await db.seeraCommercialDocument.findFirst({ where: { issuerId: d2.id, status: "ISSUED" } });
    if (!existingD2Own) {
      let d2Retailer = await db.seeraRetailer.findFirst({ where: { distributorId: d2.id } });
      if (!d2Retailer) {
        d2Retailer = await db.seeraRetailer.create({
          data: {
            code: `RBAC-PROOF-D2-RETAILER-${suffix}`,
            businessName: "RBAC Proof Fixture Retailer (D2)",
            address: { city: "Test" },
            distributorId: d2.id,
            lifecycle: "ACTIVE",
            source: "PLANNED",
            createdById: founder.id,
          },
        });
        console.log(`  Created a minimal TEST-only retailer under Distributor B (${d2.code}) so the 4c proof has a real buyer`);
      }
      // Founder (system:super_admin) still cannot pass requireIssuerScope's real
      // requirePartyMembership check for quotation-service.ts's createQuotationDraft — that check
      // has no super_admin bypass by design (a genuine, hard, non-bypassable scope rule this proof
      // must NOT weaken just to build a fixture). Since this document only needs to *exist* for the
      // 4c cross-Distributor download-denial proof (the thing under test is downloadDocument's
      // scope check, not quotation issuance), create it directly at the data layer instead of
      // going through the service function that legitimately refuses this actor.
      await db.seeraCommercialDocument.create({
        data: {
          documentNumber: `RBAC-PROOF-D2-${suffix}`,
          type: "QUOTATION_DOCUMENT",
          source: "SYSTEM_GENERATED",
          status: "ISSUED",
          issuerType: "DISTRIBUTOR",
          issuerId: d2.id,
          buyerType: "RETAILER",
          buyerId: d2Retailer.id,
          actorId: founder.id,
          sourcePortal: "distributor",
          issuerSnapshot: { legalName: d2.legalName },
          buyerSnapshot: { legalName: d2Retailer.businessName },
          supplySnapshot: {},
          lineSnapshot: [],
          taxSnapshot: {},
          subtotal: 315,
          taxableTotal: 315,
          grandTotal: 315,
          issueDate: new Date(),
          verificationStatus: "VERIFIED",
          issuedAt: new Date(),
          idempotencyKey: `rbac-proof-d2-own-${suffix}`,
        },
      });
      console.log(`  Created Distributor B (${d2.code})'s own issued quotation (fixture row) for the 4c proof`);
    }
  }

  console.log("\n=== TASK 4: Document RBAC proof (live HTTP) ===");
  // 4a. S.S. cannot download the Distributor's document (different, unrelated partner scope).
  {
    const res = await fetch(`${BASE_URL}/api/documents/${distInvoice.id}/download`, { headers: { Cookie: ssCookie } });
    assert(res.status === 403, `S.S. downloading Distributor's own invoice: expected 403, got ${res.status}`);
    console.log(`  OK — S.S. owner denied (403) downloading the Distributor's own GST invoice ${distInvoice.documentNumber}`);
  }
  // 4b. Distributor cannot download the S.S.'s issuer-only document it isn't the buyer of.
  //     (d1 IS the buyer of ssQuotation/ssInvoice, so use a genuinely unrelated S.S. document:
  //     one issued to a different Distributor.)
  {
    const ss1OnlyDoc = await db.seeraCommercialDocument.findFirst({
      where: { issuerId: ss1.id, status: "ISSUED", buyerId: { not: d1.id } },
    });
    if (ss1OnlyDoc) {
      const res = await fetch(`${BASE_URL}/api/documents/${ss1OnlyDoc.id}/download`, { headers: { Cookie: distCookie } });
      assert(res.status === 403, `Distributor downloading an S.S. document addressed to a different Distributor: expected 403, got ${res.status}`);
      console.log(`  OK — Distributor owner denied (403) downloading S.S. document ${ss1OnlyDoc.documentNumber} addressed to a different buyer`);
    } else {
      console.log("  SKIPPED (4b) — no S.S. document addressed to a different Distributor exists in TEST to probe against");
    }
  }
  // 4c. Distributor A (d1) cannot download Distributor B (d2)'s own document.
  {
    const d2 = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", id: { not: d1.id } } });
    const d2Doc = d2 ? await db.seeraCommercialDocument.findFirst({ where: { issuerId: d2.id, status: "ISSUED" } }) : null;
    if (d2Doc) {
      const res = await fetch(`${BASE_URL}/api/documents/${d2Doc.id}/download`, { headers: { Cookie: distCookie } });
      assert(res.status === 403, `Distributor A downloading Distributor B's document: expected 403, got ${res.status}`);
      console.log(`  OK — Distributor A (${d1.code}) denied (403) downloading Distributor B's (${d2!.code}) document ${d2Doc.documentNumber}`);
    } else {
      console.log("  SKIPPED (4c) — no second Distributor with an ISSUED document exists in TEST to probe against");
    }
  }
  // 4d. A guessed/nonexistent document id cannot be used to bypass scope.
  {
    const res = await fetch(`${BASE_URL}/api/documents/cnonexistent00000000000000000/download`, { headers: { Cookie: ssCookie } });
    assert(res.status === 404 || res.status === 403, `Guessed nonexistent document id: expected 404 or 403, got ${res.status}`);
    console.log(`  OK — guessed/nonexistent document id correctly rejected (${res.status}), no scope bypass`);
  }
  // 4e. No cookie at all (unauthenticated) cannot download.
  {
    const res = await fetch(`${BASE_URL}/api/documents/${ssQuotation.id}/download`);
    assert(res.status === 401 || res.status === 403, `Unauthenticated download: expected 401/403, got ${res.status}`);
    console.log(`  OK — unauthenticated request correctly rejected (${res.status})`);
  }

  console.log("\nALL PDF / WHATSAPP / RBAC LIVE SMOKE CHECKS PASSED");
}
main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
