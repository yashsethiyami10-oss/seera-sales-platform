"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./WorkflowActions.module.css";
type Party = {
  id: string;
  type: string;
  label: string;
  snapshot: {
    legalName: string;
    tradeName?: string;
    gstin?: string;
    address: string;
    state?: string;
    stateCode?: string;
  };
};
// taxRate null (not 0) means "no governed GST rate configured yet" — see QuotationActions.tsx's
// identical comment. This component is a THIRD, independent path to a tax-bearing document (posts
// straight to /api/documents/issue -> issueSystemDocument, which trusts whatever cgst/sgst/igst the
// caller computed — it has no skuId per line to re-validate against, unlike buildLineSnapshots'
// document-lines.ts gate) — Founder UAT fix: it must not let a TAX_INVOICE/CREDIT_NOTE/DEBIT_NOTE go
// out with silently-zero tax for an unconfigured SKU, so the client-side gate below is the real
// enforcement point for this specific path, not decorative.
type Sku = {
  id: string;
  label: string;
  hsn?: string;
  unit: string;
  rate: number;
  taxRate: number | null;
};
const key = () => crypto.randomUUID();
export function DocumentActions({
  language,
  portal,
  issuers,
  buyers,
  skus,
  canIssue,
  canUpload,
  mode = "ALL",
  canPostLedger = false,
}: {
  language: "EN" | "HI";
  portal: string;
  issuers: Party[];
  buyers: Party[];
  skus: Sku[];
  canIssue: boolean;
  canUpload: boolean;
  mode?: "ALL" | "QUOTATION" | "BILLING";
  canPostLedger?: boolean;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [tab, setTab] = useState<"ISSUE" | "UPLOAD">(canIssue ? "ISSUE" : "UPLOAD"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [skuId, setSkuId] = useState(""),
    [qty, setQty] = useState(1),
    // Mirrors the JSX <option> order below so the controlled select's initial value matches
    // whichever option would have rendered first (was previously an uncontrolled select).
    [docType, setDocType] = useState(mode === "QUOTATION" ? "QUOTATION_DOCUMENT" : canPostLedger ? "TAX_INVOICE" : "PRO_FORMA_INVOICE"),
    chosen = skus.find((x) => x.id === skuId),
    needsGovernedTax = ["TAX_INVOICE", "NON_TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(docType),
    taxConfigMissing = needsGovernedTax && Boolean(chosen) && chosen?.taxRate == null,
    totals = useMemo(() => {
      const taxable = (chosen?.rate ?? 0) * qty,
        tax = (taxable * (chosen?.taxRate ?? 0)) / 100;
      return { taxable, tax, total: taxable + tax };
    }, [chosen, qty]);
  const done = (text: string) => {
    setMessage(text);
    router.refresh();
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "दस्तावेज़ केंद्र" : "DOCUMENT CENTRE"}</small>
        <h2>
          {hi
            ? "जारी करें या बाहरी दस्तावेज़ अपलोड करें"
            : "Issue or upload a document"}
        </h2>
        <div>
          {canIssue && (
            <button type="button" onClick={() => setTab("ISSUE")}>
              ISSUE
            </button>
          )}{" "}
          {canUpload && (
            <button type="button" onClick={() => setTab("UPLOAD")}>
              UPLOAD
            </button>
          )}
        </div>
      </div>
      {tab === "ISSUE" && canIssue ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const f = new FormData(e.currentTarget),
                issuer = issuers.find(
                  (x) => x.id === String(f.get("issuerId")),
                ),
                buyer = buyers.find((x) => x.id === String(f.get("buyerId")));
              if (!issuer || !buyer || !chosen)
                throw new Error("Choose issuer, buyer and product");
              const type = String(f.get("type")),
                isTax = type === "TAX_INVOICE",
                cgst = isTax ? totals.tax / 2 : 0,
                sgst = isTax ? totals.tax / 2 : 0;
              const response = await fetch("/api/documents/issue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type,
                  issuerType: issuer.type,
                  issuerId: issuer.id,
                  buyerType: buyer.type,
                  buyerId: buyer.id,
                  sourcePortal: portal,
                  issuerSnapshot: issuer.snapshot,
                  buyerSnapshot: buyer.snapshot,
                  supplySnapshot: { channel: "PORTAL" },
                  lines: [
                    {
                      description: chosen.label,
                      hsn: chosen.hsn,
                      quantity: qty,
                      unit: chosen.unit,
                      rate: chosen.rate,
                      taxableValue: totals.taxable,
                      cgst,
                      sgst,
                      igst: 0,
                      total: totals.total,
                    },
                  ],
                  subtotal: totals.taxable,
                  taxableTotal: totals.taxable,
                  cgstTotal: cgst,
                  sgstTotal: sgst,
                  igstTotal: 0,
                  grandTotal: totals.total,
                  paymentTerms: String(f.get("paymentTerms") ?? ""),
                  notes: String(f.get("notes") ?? ""),
                  idempotencyKey: key(),
                }),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(
                  data?.error?.message ?? data?.error?.code ?? "Issue failed",
                );
              done(hi ? "दस्तावेज़ जारी हुआ।" : "Document issued.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Issue failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {hi ? "दस्तावेज़ प्रकार" : "Document type"}
            <select name="type" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {mode === "QUOTATION" ? (
                <option>QUOTATION_DOCUMENT</option>
              ) : (
                <>
                  {canPostLedger && <option>TAX_INVOICE</option>}
                  {canPostLedger && <option>NON_TAX_INVOICE</option>}
                  <option>PRO_FORMA_INVOICE</option>
                  {mode === "ALL" && <option>QUOTATION_DOCUMENT</option>}
                  <option>DELIVERY_CHALLAN</option>
                  <option>RECEIPT</option>
                  <option>PAYMENT_RECEIPT</option>
                  {canPostLedger && <option>CREDIT_NOTE</option>}
                  {canPostLedger && <option>DEBIT_NOTE</option>}
                </>
              )}
            </select>
          </label>
          <label>
            {hi ? "सत्यापित जारीकर्ता" : "Verified issuer"}
            <select name="issuerId" required>
              <option value="">
                {hi ? "कानूनी नाम से चुनें" : "Choose legal identity"}
              </option>
              {issuers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "खरीदार" : "Buyer"}
            <select name="buyerId" required>
              <option value="">
                {hi ? "व्यवसाय नाम से चुनें" : "Choose business"}
              </option>
              {buyers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "उत्पाद" : "Product"}
            <select
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              required
            >
              <option value="">{hi ? "SKU चुनें" : "Choose SKU"}</option>
              {skus.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} · ₹{x.rate}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "मात्रा" : "Quantity"}
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </label>
          {taxConfigMissing && (
            <p className={styles.emptyHint}>
              {hi
                ? "कर कॉन्फ़िगरेशन आवश्यक — चयनित उत्पाद के लिए कोई शासित GST दर सेट नहीं है। कृपया Masters से संपर्क करें।"
                : "TAX CONFIGURATION REQUIRED — the chosen product has no governed GST rate set. Contact Masters/Founder before issuing."}
            </p>
          )}
          <label>
            {hi ? "भुगतान शर्तें" : "Payment terms"}
            <input name="paymentTerms" />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Notes"}
            <input name="notes" />
          </label>
          <label>
            {hi ? "कुल" : "Total"}
            <input value={`₹${totals.total.toFixed(2)}`} readOnly />
          </label>
          <button
            disabled={busy || !issuers.length || !buyers.length || !chosen || taxConfigMissing}
          >
            {hi ? "दस्तावेज़ जारी करें" : "Issue document"}
          </button>
        </form>
      ) : canUpload ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const form = new FormData(e.currentTarget),
                issuer = issuers.find(
                  (x) => x.id === String(form.get("issuerId")),
                ),
                buyer = buyers.find(
                  (x) => x.id === String(form.get("buyerId")),
                ),
                file = form.get("file");
              if (!issuer || !buyer || !(file instanceof File))
                throw new Error("Choose issuer, buyer and file");
              const payload = new FormData();
              payload.set("file", file);
              payload.set(
                "metadata",
                JSON.stringify({
                  documentNumber: String(form.get("documentNumber")),
                  type: String(form.get("type")),
                  issuerType: issuer.type,
                  issuerId: issuer.id,
                  buyerType: buyer.type,
                  buyerId: buyer.id,
                  sourcePortal: portal,
                  issueDate: String(form.get("issueDate")) || undefined,
                  amount: Number(form.get("amount")),
                  notes: String(form.get("notes") ?? ""),
                  idempotencyKey: key(),
                }),
              );
              const response = await fetch("/api/documents/upload", {
                  method: "POST",
                  body: payload,
                }),
                data = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(
                  data?.error?.message ?? data?.error?.code ?? "Upload failed",
                );
              done(hi ? "दस्तावेज़ अपलोड हुआ।" : "Document uploaded.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Upload failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {hi ? "दस्तावेज़ प्रकार" : "Document type"}
            <select name="type">
              <option>EXTERNAL_BILL</option>
              <option>SUPPORTING_DOCUMENT</option>
              <option>CLAIM_RETURN_DOCUMENT</option>
              <option>PAYMENT_PROOF</option>
              <option>ADJUSTMENT_DOCUMENT</option>
            </select>
          </label>
          <label>
            {hi ? "दस्तावेज़ नंबर" : "Document number"}
            <input name="documentNumber" required />
          </label>
          <label>
            {hi ? "जारीकर्ता" : "Issuer"}
            <select name="issuerId" required>
              {issuers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "खरीदार" : "Buyer"}
            <select name="buyerId" required>
              {buyers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "राशि" : "Amount"}
            <input name="amount" type="number" min="0" step="0.01" required />
          </label>
          <label>
            {hi ? "जारी तिथि" : "Issue date"}
            <input name="issueDate" type="date" />
          </label>
          <label>
            {hi ? "फ़ाइल" : "File"}
            <input
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Notes"}
            <input name="notes" />
          </label>
          <button disabled={busy || !issuers.length || !buyers.length}>
            {hi ? "सुरक्षित अपलोड" : "Secure upload"}
          </button>
        </form>
      ) : null}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
