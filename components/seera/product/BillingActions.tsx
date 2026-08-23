"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { DocumentRowActions, type RowAction } from "./DocumentRowActions";

type Option = { value: string; label: string };
// taxRate null (not 0) means "no governed GST rate configured yet" — kept distinct from a
// legitimate 0%-rated SKU (Founder UAT fix, mirrors QuotationActions.tsx's own comment: a coerced
// `?? 0` made the server's TAX_CONFIGURATION_REQUIRED gate unreachable from this UI).
type Sku = { value: string; label: string; rate: number; taxRate: number | null; brand: string; unitsPerCase: number; caseUnit: "BOX" | "BAG" | null };
// Mirrors priceModeForBrand in lib/sales-distribution/document-lines.ts — see QuotationActions.tsx's
// identical local copy for why this isn't imported from that module client-side.
const isGstInclusiveBrand = (brand: string) => /^muv$/i.test(brand.trim());
// Commercial UOM (Billing/Quotation Finalization, 23-Aug) — identical convention to
// QuotationActions.tsx's own toBasePcLine (itself mirroring FieldJourney.tsx's order line): the
// editor collects quantity/rate at whichever unit the user picks, this converts to the base-PC
// quantity/per-PC rate document-lines.ts's buildLineSnapshots has always expected. Gross value is
// invariant under the conversion, so no tax/preview math changes.
type EditableLine = { key: string; skuId: string; quantity: number; rate: number; discountPct: number; taxRate: number | null; uom: string };
function toBasePcLine(line: EditableLine, skuByValue: Map<string, Sku>) {
  const sku = skuByValue.get(line.skuId);
  const packFactor = line.uom !== "PC" && sku && sku.unitsPerCase > 1 ? sku.unitsPerCase : 1;
  return {
    skuId: line.skuId,
    quantity: line.quantity * packFactor,
    rate: packFactor > 1 ? line.rate / packFactor : line.rate,
    discountPct: line.discountPct,
    taxRate: line.taxRate,
    uom: packFactor > 1 ? { unit: line.uom, packFactor, uomQuantity: line.quantity } : undefined,
  };
}
// Mirrors buildLineSnapshots' per-line math exactly (document-lines.ts) — see QuotationActions.tsx's
// identical local copy for the full rationale.
function taxBreakdownPreview(rate: number, quantity: number, discountPct: number, taxRate: number | null, inclusive: boolean) {
  const gross = rate * quantity;
  const grossAfterDiscount = gross - (gross * discountPct) / 100;
  const rateNum = taxRate ?? 0;
  if (inclusive) {
    const taxableValue = grossAfterDiscount / (1 + rateNum / 100);
    return { taxableValue, taxAmount: grossAfterDiscount - taxableValue, finalValue: grossAfterDiscount };
  }
  const taxAmount = grossAfterDiscount * (rateNum / 100);
  return { taxableValue: grossAfterDiscount, taxAmount, finalValue: grossAfterDiscount + taxAmount };
}
type BillingDoc = {
  id: string;
  documentNumber: string;
  type: string;
  status: string;
  buyerLabel: string;
  buyerType: string;
  buyerId: string;
  grandTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  creditedTotal: number;
};
const key = () => crypto.randomUUID();
async function post(action: string, payload: unknown) {
  const r = await fetch("/api/distribution/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

export function BillingActions({
  language,
  issuerType,
  issuers,
  buyers,
  skus,
  orders,
  documents,
}: {
  language: "EN" | "HI";
  issuerType: "DISTRIBUTOR" | "SUPER_STOCKIST";
  issuers: Option[];
  buyers: (Option & { type: "RETAILER" | "DISTRIBUTOR" | "SUPER_STOCKIST" })[];
  skus: Sku[];
  orders: Option[];
  documents: BillingDoc[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [type, setType] = useState("TAX_INVOICE"),
    [originalDocumentId, setOriginalDocumentId] = useState(""),
    [lines, setLines] = useState<EditableLine[]>([
      { key: key(), skuId: "", quantity: 1, rate: 0, discountPct: 0, taxRate: null, uom: "PC" },
    ]),
    skuByValue = new Map(skus.map((s) => [s.value, s]));
  const isNote = type === "CREDIT_NOTE" || type === "DEBIT_NOTE";
  const issuedDocuments = documents.filter((d) => d.status !== "DRAFT");
  const run = async (action: string, payload: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await post(action, payload);
      setMessage(hi ? "कार्रवाई सफलतापूर्वक पूरी हुई।" : "Action completed successfully.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const setLine = (k: string, patch: Partial<(typeof lines)[number]>) =>
    setLines((current) => current.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const [shareLinks, setShareLinks] = useState<Record<string, { url: string; whatsapp: string }>>({});
  // "sent": the actual PDF file was delivered via WhatsApp (real document message).
  // "unsupported": the active MESSAGING_PROVIDER can't send a raw file (no provider
  // configured, or the provider only accepts media by public URL) — falls back to a
  // link, but the UI below never calls that a "PDF" send, only a link share, per the
  // Founder's hard requirement not to conflate the two.
  const [docSendStatus, setDocSendStatus] = useState<Record<string, "sent" | "unsupported">>({});
  const shareOrSend = async (d: BillingDoc) => {
    if (d.buyerType !== "DISTRIBUTOR" && d.buyerType !== "SUPER_STOCKIST") {
      setMessage(hi ? "इस प्राप्तकर्ता प्रकार के लिए साझा उपलब्ध नहीं है।" : "Share isn't available for this recipient type yet.");
      return;
    }
    setBusy(true);
    try {
      const sendRes = await fetch(`/api/documents/${d.id}/whatsapp-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType: "PARTNER", recipientId: d.buyerId }),
      });
      if (sendRes.ok) {
        setDocSendStatus((c) => ({ ...c, [d.id]: "sent" }));
        setMessage(hi ? "PDF WhatsApp पर भेज दिया गया।" : "PDF sent via WhatsApp.");
        return;
      }
      if (sendRes.status !== 422) {
        const sendErr = await sendRes.json().catch(() => ({}));
        throw new Error(sendErr?.error?.message ?? "Could not send PDF via WhatsApp");
      }
      // 422 = provider genuinely can't send a real file — fall back to an honest link share.
      setDocSendStatus((c) => ({ ...c, [d.id]: "unsupported" }));
      const r = await fetch(`/api/documents/${d.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType: "PARTNER", recipientId: d.buyerId, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error?.message ?? "Could not create share link");
      setShareLinks((c) => ({ ...c, [d.id]: { url: data.secureUrl, whatsapp: data.intents.whatsapp } }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Share failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "बिलिंग" : "BILLING"}</small>
        <h2>{hi ? "ड्राफ्ट बनाएँ और जारी करें" : "Draft and issue billing documents"}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const buyerId = String(f.get("buyerId"));
          const buyer = buyers.find((b) => b.value === buyerId);
          if (!buyer) {
            setMessage(hi ? "कृपया एक खरीदार चुनें।" : "Please choose a buyer.");
            return;
          }
          void run("create-billing-draft", {
            type,
            issuerType,
            issuerId: String(f.get("issuerId")),
            buyerType: buyer.type,
            buyerId,
            sourcePortal: issuerType === "DISTRIBUTOR" ? "distributor" : "super-stockist",
            orderId: String(f.get("orderId") || "") || undefined,
            originalDocumentId: isNote ? originalDocumentId || undefined : undefined,
            paymentTerms: String(f.get("paymentTerms") || "") || undefined,
            notes: String(f.get("notes") || "") || undefined,
            idempotencyKey: key(),
            lines: lines
              .filter((l) => l.skuId && l.quantity > 0)
              .map((l) => toBasePcLine(l, skuByValue)),
          });
        }}
      >
        <label>
          {hi ? "दस्तावेज़ प्रकार" : "Document type"}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="TAX_INVOICE">TAX_INVOICE</option>
            <option value="NON_TAX_INVOICE">NON_TAX_INVOICE</option>
            <option value="PRO_FORMA_INVOICE">PRO_FORMA_INVOICE</option>
            <option value="DELIVERY_CHALLAN">DELIVERY_CHALLAN</option>
            <option value="RECEIPT">RECEIPT</option>
            <option value="CREDIT_NOTE">CREDIT_NOTE</option>
            <option value="DEBIT_NOTE">DEBIT_NOTE</option>
          </select>
        </label>
        {!issuers.length && (
          <p className={styles.emptyHint}>
            {hi
              ? "कोई सत्यापित बिलिंग पहचान कॉन्फ़िगर नहीं है — GST बिल जारी करने से पहले एक सत्यापित बिलिंग प्रोफ़ाइल आवश्यक है। कृपया Accounts से संपर्क करें।"
              : "No verified billing identity is configured — a verified billing profile is required before GST documents can be issued. Contact Accounts."}
          </p>
        )}
        <label>
          {hi ? "जारीकर्ता" : "Issuer"}
          <select name="issuerId" required disabled={!issuers.length}>
            <option value="" disabled>
              {hi ? "जारीकर्ता चुनें" : "Choose issuer"}
            </option>
            {issuers.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "खरीदार" : "Buyer"}
          <select name="buyerId" required disabled={!buyers.length}>
            <option value="">{hi ? "चुनें" : "Choose"}</option>
            {buyers.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        {issuers.length > 0 && !buyers.length && (
          <p className={styles.emptyHint}>
            {hi ? "कोई सक्रिय खरीदार उपलब्ध नहीं है।" : "No active buyer is available."}
          </p>
        )}
        <label>
          {hi ? "स्रोत ऑर्डर (वैकल्पिक)" : "Source order (optional)"}
          <select name="orderId" defaultValue="">
            <option value="">{hi ? "लागू नहीं" : "Not applicable"}</option>
            {orders.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {isNote && (
          <label>
            {hi ? "मूल दस्तावेज़" : "Original document"}
            <select
              value={originalDocumentId}
              onChange={(e) => setOriginalDocumentId(e.target.value)}
              required
            >
              <option value="">{hi ? "मूल दस्तावेज़ चुनें" : "Choose the document being corrected"}</option>
              {issuedDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.documentNumber} · {d.type} · ₹{d.grandTotal.toFixed(2)}
                </option>
              ))}
            </select>
            {type === "CREDIT_NOTE" && originalDocumentId && (() => {
              const original = issuedDocuments.find((d) => d.id === originalDocumentId);
              if (!original) return null;
              const remaining = original.grandTotal - original.creditedTotal;
              return (
                <small>
                  {hi
                    ? `मूल राशि ₹${original.grandTotal.toFixed(2)} · पहले से क्रेडिट ₹${original.creditedTotal.toFixed(2)} · शेष पात्र क्रेडिट ₹${remaining.toFixed(2)}`
                    : `Original ₹${original.grandTotal.toFixed(2)} · Already credited ₹${original.creditedTotal.toFixed(2)} · Remaining eligible credit ₹${remaining.toFixed(2)}`}
                </small>
              );
            })()}
          </label>
        )}
        {lines.map((line, index) => (
          <fieldset key={line.key}>
            <legend>{hi ? `उत्पाद ${index + 1}` : `Product ${index + 1}`}</legend>
            <label>
              {hi ? "SKU" : "SKU"}
              <select
                value={line.skuId}
                onChange={(e) => {
                  const sku = skus.find((s) => s.value === e.target.value);
                  // Mirrors QuotationActions.tsx: default to the SKU's governed case unit when one
                  // exists, PC stays available as the secondary "Sell by" option.
                  const defaultUom = sku && sku.caseUnit && sku.unitsPerCase > 1 ? sku.caseUnit : "PC";
                  setLine(line.key, {
                    skuId: e.target.value,
                    rate: sku?.rate ?? 0,
                    taxRate: sku?.taxRate ?? null,
                    uom: defaultUom,
                  });
                }}
                required
              >
                <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
                {skus.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {(() => {
              const sku = skus.find((s) => s.value === line.skuId);
              return sku && sku.caseUnit && sku.unitsPerCase > 1 ? (
                <label>
                  {hi ? "बेचें" : "Sell by"}
                  <select value={line.uom} onChange={(e) => setLine(line.key, { uom: e.target.value })}>
                    <option value="PC">{hi ? "पीस" : "PC"}</option>
                    <option value={sku.caseUnit}>{sku.caseUnit} ({sku.unitsPerCase} PC)</option>
                  </select>
                </label>
              ) : null;
            })()}
            <label>
              {hi ? "मात्रा" : "Quantity"} {line.uom !== "PC" ? `(${line.uom})` : ""}
              <input
                type="number"
                min="1"
                step="1"
                value={line.quantity}
                onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })}
                required
              />
              {(() => {
                const sku = skus.find((s) => s.value === line.skuId);
                return sku && line.uom !== "PC" ? <small>{`= ${line.quantity * sku.unitsPerCase} PC`}</small> : null;
              })()}
            </label>
            <label>
              {hi ? `दर / ${line.uom}` : `Rate / ${line.uom}`}
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.rate}
                onChange={(e) => setLine(line.key, { rate: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              {hi ? "छूट %" : "Discount %"}
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={line.discountPct}
                onChange={(e) => setLine(line.key, { discountPct: Number(e.target.value) })}
              />
            </label>
            <label>
              {hi ? "कर (SKU से शासित)" : "Tax (governed by SKU)"}
              {line.skuId && skus.find((s) => s.value === line.skuId)?.taxRate == null ? (
                <input value={hi ? "कर कॉन्फ़िगरेशन आवश्यक" : "TAX CONFIGURATION REQUIRED"} disabled readOnly />
              ) : (
                <input value={line.skuId ? `${line.taxRate}% · ${isGstInclusiveBrand(skus.find((s) => s.value === line.skuId)?.brand ?? "") ? (hi ? "GST शामिल" : "GST INCLUDED") : hi ? "GST अतिरिक्त" : "GST EXCLUDED"}` : "—"} disabled readOnly />
              )}
            </label>
            {line.skuId && line.taxRate != null && line.quantity > 0 && (() => {
              const sku = skus.find((s) => s.value === line.skuId);
              const inclusive = isGstInclusiveBrand(sku?.brand ?? "");
              const { taxableValue, taxAmount, finalValue } = taxBreakdownPreview(line.rate, line.quantity, line.discountPct, line.taxRate, inclusive);
              return (
                <p className={styles.emptyHint} style={{ gridColumn: "1/-1" }}>
                  {inclusive
                    ? hi
                      ? `₹${line.rate.toFixed(2)} में GST @${line.taxRate}% शामिल है — कर योग्य ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, अंतिम ₹${finalValue.toFixed(2)} (कुल मात्रा ${line.quantity} के लिए)। कर योग्य दर स्वयं गणना करने की आवश्यकता नहीं।`
                      : `₹${line.rate.toFixed(2)} includes GST @${line.taxRate}% — Taxable ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, Final ₹${finalValue.toFixed(2)} (for qty ${line.quantity}). You never need to work out the taxable rate yourself.`
                    : hi
                      ? `₹${line.rate.toFixed(2)} आधार दर पर GST @${line.taxRate}% जोड़ा जाएगा — कर योग्य ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, अंतिम ₹${finalValue.toFixed(2)} (कुल मात्रा ${line.quantity} के लिए)।`
                      : `₹${line.rate.toFixed(2)} base rate + GST @${line.taxRate}% on top — Taxable ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, Final ₹${finalValue.toFixed(2)} (for qty ${line.quantity}).`}
                </p>
              );
            })()}
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              >
                {hi ? "हटाएँ" : "Remove"}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            setLines((current) => [
              ...current,
              { key: key(), skuId: "", quantity: 1, rate: 0, discountPct: 0, taxRate: null, uom: "PC" },
            ])
          }
        >
          {hi ? "+ उत्पाद जोड़ें" : "+ Add product"}
        </button>
        <label>
          {hi ? "भुगतान शर्तें" : "Payment terms"}
          <input name="paymentTerms" />
        </label>
        <label>
          {isNote ? (hi ? "कारण" : "Reason") : hi ? "टिप्पणी" : "Notes"}
          <input name="notes" required={isNote} />
        </label>
        <button disabled={busy || !issuers.length || !buyers.length || !skus.length}>
          {hi ? "ड्राफ्ट सहेजें" : "Save draft"}
        </button>
        {lines.some((l) => l.skuId && l.quantity > 0 && l.taxRate == null) && (
          <p className={styles.emptyHint}>
            {hi
              ? "एक या अधिक उत्पादों में GST दर कॉन्फ़िगर नहीं है — ड्राफ्ट सहेजा जा सकता है, लेकिन Founder/Admin द्वारा दर सेट किए बिना जारी नहीं किया जा सकता।"
              : "One or more products have no GST rate configured — the draft can still be saved, but cannot be issued until Founder/Admin sets a rate under Masters."}
          </p>
        )}
      </form>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "नंबर" : "Number"}</th>
              <th>{hi ? "प्रकार" : "Type"}</th>
              <th>{hi ? "खरीदार" : "Buyer"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
              <th>{hi ? "कर विभाजन" : "Tax split"}</th>
              <th>{hi ? "कुल" : "Total"}</th>
              <th>{hi ? "कार्रवाई" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>{d.documentNumber}</td>
                <td>{d.type}</td>
                <td>{d.buyerLabel}</td>
                <td>{d.status}</td>
                <td>
                  {d.igstTotal > 0 ? `IGST ₹${d.igstTotal.toFixed(2)}` : `CGST ₹${d.cgstTotal.toFixed(2)} + SGST ₹${d.sgstTotal.toFixed(2)}`}
                </td>
                <td>₹{d.grandTotal.toFixed(2)}</td>
                <td>
                  {(() => {
                    // Final Master Revision (Part 11/12, 22-Aug): same primary/secondary pattern
                    // QuotationActions.tsx uses — shared presentation, issuer-specific data only.
                    const download: RowAction = { label: hi ? "PDF डाउनलोड करें" : "Download PDF", href: `/api/documents/${d.id}/download`, external: true };
                    const send: RowAction = { label: hi ? "WhatsApp पर भेजें" : "Send via WhatsApp", onClick: () => void shareOrSend(d), disabled: busy };
                    const primary: RowAction =
                      d.status === "DRAFT"
                        ? { label: hi ? "जारी करें" : "Issue", tone: "primary", disabled: busy, onClick: () => void run("issue-billing-draft", { documentId: d.id }) }
                        : download;
                    const secondary: RowAction[] = d.status === "DRAFT" ? [] : [send];
                    return <DocumentRowActions primary={primary} secondary={secondary} />;
                  })()}
                  {docSendStatus[d.id] === "sent" && (
                    <p className={styles.notice} data-ok="true">{hi ? "PDF WhatsApp पर भेजा गया ✓" : "PDF sent via WhatsApp ✓"}</p>
                  )}
                  {shareLinks[d.id] && (
                    <p className={styles.notice} data-ok="true">
                      {docSendStatus[d.id] === "unsupported" && (
                        <>
                          <small>{hi ? "यह प्रदाता सीधे फ़ाइल नहीं भेज सकता — केवल लिंक साझा किया जा सकता है।" : "This provider can't send the file directly — link only."}</small>
                          <br />
                        </>
                      )}
                      <a href={shareLinks[d.id]!.whatsapp} target="_blank" rel="noreferrer">
                        {hi ? "लिंक WhatsApp पर शेयर करें →" : "Share Link on WhatsApp →"}
                      </a>{" "}
                      <small>{shareLinks[d.id]!.url}</small>
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {!documents.length && (
              <tr>
                <td colSpan={7}>{hi ? "अभी तक कोई दस्तावेज़ नहीं" : "No documents yet"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
