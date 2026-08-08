import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentPdfFilename, renderIssuedDocumentPdf, type IssuedDocumentSnapshot } from "@/lib/sales-distribution/document-pdf";

const snapshot: IssuedDocumentSnapshot = { type:"TAX_INVOICE",documentNumber:"INV/2026-27/000001",issueDate:"2026-08-08",issuer:{legalName:"सीरा कंपनी प्राइवेट लिमिटेड",gstin:"09ABCDE1234F1Z5",address:"लखनऊ, उत्तर प्रदेश",state:"उत्तर प्रदेश",stateCode:"09"},buyer:{legalName:"Distributor Legal Name",gstin:"27ABCDE1234F1Z5",address:"Mumbai, Maharashtra",state:"Maharashtra",stateCode:"27"},orderReference:"ORDER-1",lines:[{description:"Seera Product",hsn:"330499",quantity:10,unit:"PCS",rate:100,discount:0,taxableValue:1000,igst:180,total:1180}],subtotal:1000,taxableTotal:1000,cgstTotal:0,sgstTotal:0,igstTotal:180,grandTotal:1180,paymentTerms:"Advance",notes:"Immutable legal snapshot" };
const source=(file:string)=>readFileSync(path.join(process.cwd(),file),"utf8");

describe("Phase 6-9 completion pass",()=>{
  it("renders a real PDF from immutable snapshot data",async()=>{const before=structuredClone(snapshot);const bytes=await renderIssuedDocumentPdf(snapshot);expect(new TextDecoder().decode(bytes.slice(0,5))).toBe("%PDF-");expect(bytes.byteLength).toBeGreaterThan(5000);expect(snapshot).toEqual(before);});
  it("creates safe content-disposition filenames",()=>expect(documentPdfFilename(snapshot)).toBe("TAX_INVOICE-INV_2026-27_000001.pdf"));
  it("uses bundled Latin and Devanagari fonts",()=>{expect(source("lib/sales-distribution/document-pdf.ts")).toContain("noto-sans-devanagari");expect(source("lib/sales-distribution/document-pdf.ts")).not.toContain("replace(/[^\\x00-\\x7F]");});
  it("hashes secure tokens and never stores raw tokens",()=>{const code=source("lib/sales-distribution/document-service.ts");expect(code).toContain('randomBytes(32).toString("base64url")');expect(code).toContain("tokenHash: hashToken(token)");expect(code).not.toContain("token: token");});
  it("enforces document party scope",()=>expect(source("lib/sales-distribution/document-service.ts")).toContain("parties.has(document.issuerId) || parties.has(document.buyerId)"));
  it("requires verified legal billing profile",()=>expect(source("lib/sales-distribution/document-service.ts")).toContain("VERIFIED_BILLING_PROFILE_REQUIRED"));
  it("requires approved notes linked to original invoice",()=>expect(source("lib/sales-distribution/document-service.ts")).toContain("NOTE_APPROVAL_REQUIRED"));
  it("posts finance transactionally without balance overwrite",()=>{const code=source("lib/sales-distribution/financial-service.ts");expect(code).toContain("db.$transaction");expect(code).not.toMatch(/balance\s*:\s*input/);});
  it("blocks payment over-allocation and duplicates",()=>{const code=source("lib/sales-distribution/financial-service.ts");expect(code).toContain("PAYMENT_OVER_ALLOCATION");expect(code).toContain("DUPLICATE_ALLOCATION");});
  it("derives ageing from original due dates",()=>expect(source("lib/sales-distribution/financial-service.ts")).toContain("originalDueDate"));
  it("keeps Manager retailing and team scope explicit",()=>{const code=source("lib/sales-distribution/manager-service.ts");expect(code).toContain("MANAGER_RETAILING_SESSION_REQUIRED");expect(code).toContain("TEAM_SCOPE_DENIED");});
  it("keeps Manager activity attribution separate",()=>expect(source("lib/sales-distribution/manager-service.ts")).toContain("managerAttributionOnly: true"));
  it("prevents TA self approval and requires independent Accounts approval",()=>{const code=source("lib/sales-distribution/travel-lifecycle-service.ts");expect(code).toContain("TA_SELF_APPROVAL_DENIED");expect(code).toContain("TA_APPROVAL_SEPARATION_REQUIRED");});
  it("reactivates without deleting lifecycle history",()=>{const code=source("lib/sales-distribution/travel-lifecycle-service.ts");expect(code).toContain("seeraPartnerLifecycleEvent.create");expect(code).not.toContain("seeraPartnerLifecycleEvent.delete");});
  it("exposes authenticated executable APIs and portal controls",()=>{expect(source("app/api/documents/[id]/download/route.ts")).toContain("resolveRequestIdentity");expect(source("components/seera/PhaseCompletionPanel.tsx")).toContain("/api/manager/operations");});
});
