"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { SkuSelect } from "./SkuSelect";
import { DocumentRowActions, type RowAction } from "./DocumentRowActions";

type Option = { value: string; label: string };
// Founder rule (P0 21-Aug): every Distributor/Super Stockist QUOTATION rate is the final
// GST-inclusive selling price, regardless of brand — the server (quotation-service.ts) forces
// `forcePriceMode: "GST_INCLUSIVE"` on every line unconditionally, so the client preview must match
// that unconditionally too, not branch by brand like the (brand-based) billing/invoice flow still
// does. Kept as a constant, not a per-brand function, so nothing here can silently diverge again.
const QUOTATION_LINES_ARE_GST_INCLUSIVE = true;
// Mirrors buildLineSnapshots' per-line math exactly (document-lines.ts) — live preview only, the
// server remains the source of truth on submit. Founder directive: the S.S./Distributor user must
// never have to work out the taxable/base figure themselves — the rate they type IS the final
// commercial rate for GST-inclusive (MUV) lines, and this breakdown shows what that resolves to
// without requiring any manual calculation.
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
// taxRate is null (not 0) when a SKU has no governed GST rate configured yet — kept distinct from a
// legitimate 0%-rated SKU (Founder UAT fix: a coerced `?? 0` here made the server's
// TAX_CONFIGURATION_REQUIRED gate unreachable, since a submitted line always looked "configured".
// Both the SKU's own display and the submit gate below now check `== null`, not falsy).
type Sku = { value: string; label: string; rate: number; taxRate: number | null; brand: string };
type QuotationLine = {
  skuId: string;
  productNameSnapshot: string;
  hsn?: string;
  quantity: number;
  rate: number;
  discountPct: number;
  taxRate: number | null;
  lineTotal: number;
  priceMode: "GST_INCLUSIVE" | "GST_EXCLUSIVE";
};
type Quotation = {
  id: string;
  documentNumber: string;
  status: string;
  buyerLabel: string;
  buyerType: string;
  buyerId: string;
  grandTotal: number;
  validUntil?: string;
  lines: QuotationLine[];
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

export function QuotationActions({
  language,
  issuerType,
  issuers,
  buyers,
  skus,
  quotations,
}: {
  language: "EN" | "HI";
  issuerType: "DISTRIBUTOR" | "SUPER_STOCKIST";
  issuers: Option[];
  buyers: (Option & { type: "RETAILER" | "DISTRIBUTOR" })[];
  skus: Sku[];
  quotations: Quotation[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [lines, setLines] = useState([
      { key: key(), skuId: "", quantity: 1, rate: 0, discountPct: 0, taxRate: null as number | null },
    ]);
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
  const shareOrSend = async (q: Quotation) => {
    if (q.buyerType !== "DISTRIBUTOR" && q.buyerType !== "SUPER_STOCKIST") {
      setMessage(hi ? "इस प्राप्तकर्ता प्रकार के लिए साझा उपलब्ध नहीं है।" : "Share isn't available for this recipient type yet.");
      return;
    }
    setBusy(true);
    try {
      const sendRes = await fetch(`/api/documents/${q.id}/whatsapp-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType: "PARTNER", recipientId: q.buyerId, idempotencyKey: key() }),
      });
      if (sendRes.ok) {
        setDocSendStatus((c) => ({ ...c, [q.id]: "sent" }));
        setMessage(hi ? "PDF WhatsApp पर भेज दिया गया।" : "PDF sent via WhatsApp.");
        return;
      }
      if (sendRes.status !== 422) {
        const sendErr = await sendRes.json().catch(() => ({}));
        throw new Error(sendErr?.error?.message ?? "Could not send PDF via WhatsApp");
      }
      // 422 = provider genuinely can't send a real file — fall back to an honest link share.
      setDocSendStatus((c) => ({ ...c, [q.id]: "unsupported" }));
      const r = await fetch(`/api/documents/${q.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType: "PARTNER", recipientId: q.buyerId, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message ?? "Could not create share link");
      setShareLinks((c) => ({ ...c, [q.id]: { url: d.secureUrl, whatsapp: d.intents.whatsapp } }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Share failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "कोटेशन" : "QUOTATIONS"}</small>
        <h2>{hi ? "कोटेशन बनाएँ और प्रबंधित करें" : "Create and manage quotations"}</h2>
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
          void run("create-quotation-draft", {
            issuerType,
            issuerId: String(f.get("issuerId")),
            buyerType: buyer.type,
            buyerId,
            sourcePortal: issuerType === "DISTRIBUTOR" ? "distributor" : "super-stockist",
            validUntil: String(f.get("validUntil") || "") || undefined,
            paymentTerms: String(f.get("paymentTerms") || "") || undefined,
            notes: String(f.get("notes") || "") || undefined,
            idempotencyKey: key(),
            lines: lines
              .filter((l) => l.skuId && l.quantity > 0)
              .map(({ skuId, quantity, rate, discountPct, taxRate }) => ({
                skuId,
                quantity,
                rate,
                discountPct,
                taxRate,
              })),
          });
        }}
      >
        {!issuers.length && (
          <p className={styles.emptyHint}>
            {hi
              ? "कोई सत्यापित बिलिंग पहचान कॉन्फ़िगर नहीं है — कोटेशन जारी करने से पहले एक सत्यापित बिलिंग प्रोफ़ाइल आवश्यक है। कृपया Accounts से संपर्क करें।"
              : "No verified billing identity is configured — a verified billing profile is required before quotations can be issued. Contact Accounts."}
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
            {hi ? "कोई सक्रिय वितरक उपलब्ध नहीं है। पहले एक वितरक जोड़ें।" : "No active Distributor is available. Add a Distributor first."}
          </p>
        )}
        {lines.map((line, index) => (
          <fieldset key={line.key}>
            <legend>
              {hi ? `उत्पाद ${index + 1}` : `Product ${index + 1}`}
            </legend>
            <label>
              {hi ? "SKU" : "SKU"}
              <SkuSelect
                language={language}
                skus={skus}
                value={line.skuId}
                onChange={(v) => {
                  const sku = skus.find((s) => s.value === v);
                  setLine(line.key, {
                    skuId: v,
                    rate: sku?.rate ?? 0,
                    taxRate: sku?.taxRate ?? null,
                  });
                }}
                required
              />
            </label>
            <label>
              {hi ? "मात्रा" : "Quantity"}
              <input
                type="number"
                min="1"
                step="1"
                value={line.quantity}
                onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              {hi ? "दर / विक्रय मूल्य (GST सहित)" : "Rate / Selling Price (Incl. GST)"}
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
                <input value={line.skuId ? `${line.taxRate}% · ${hi ? "GST शामिल" : "GST INCLUDED"}` : "—"} disabled readOnly />
              )}
            </label>
            {line.skuId && line.taxRate != null && line.quantity > 0 && (() => {
              const { taxableValue, taxAmount, finalValue } = taxBreakdownPreview(line.rate, line.quantity, line.discountPct, line.taxRate, QUOTATION_LINES_ARE_GST_INCLUSIVE);
              return (
                <p className={styles.emptyHint} style={{ gridColumn: "1/-1" }}>
                  {hi
                    ? `₹${line.rate.toFixed(2)} में GST @${line.taxRate}% शामिल है — कर योग्य ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, अंतिम ₹${finalValue.toFixed(2)} (कुल मात्रा ${line.quantity} के लिए)। कर योग्य दर स्वयं गणना करने की आवश्यकता नहीं।`
                    : `₹${line.rate.toFixed(2)} includes GST @${line.taxRate}% — Taxable ₹${taxableValue.toFixed(2)}, GST ₹${taxAmount.toFixed(2)}, Final ₹${finalValue.toFixed(2)} (for qty ${line.quantity}). You never need to work out the taxable rate yourself.`}
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
              { key: key(), skuId: "", quantity: 1, rate: 0, discountPct: 0, taxRate: null as number | null },
            ])
          }
        >
          {hi ? "+ उत्पाद जोड़ें" : "+ Add product"}
        </button>
        <label>
          {hi ? "मान्य तक" : "Valid until"}
          <input name="validUntil" type="date" />
        </label>
        <label>
          {hi ? "भुगतान शर्तें" : "Payment terms"}
          <input name="paymentTerms" />
        </label>
        <label>
          {hi ? "टिप्पणी" : "Notes"}
          <input name="notes" />
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
              <th>{hi ? "खरीदार" : "Buyer"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
              <th>{hi ? "कुल" : "Total"}</th>
              <th>{hi ? "मान्य तक" : "Valid until"}</th>
              <th>{hi ? "कार्रवाई" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id}>
                <td>{q.documentNumber}</td>
                <td>{q.buyerLabel}</td>
                <td>{q.status}</td>
                <td>₹{q.grandTotal.toFixed(2)}</td>
                <td>{q.validUntil ?? "—"}</td>
                <td>
                  {(() => {
                    // Final Master Revision (Part 11, 22-Aug): ONE primary action per status (the
                    // thing this row most wants next) stays a visible button; everything else
                    // collapses into "More ⋮" — matching the Founder's exact DRAFT/ISSUED/ACCEPTED/
                    // CONVERTED grouping instead of every possible action shown inline at once.
                    const download: RowAction = { label: hi ? "PDF डाउनलोड करें" : "Download PDF", href: `/api/documents/${q.id}/download`, external: true };
                    const send: RowAction = { label: hi ? "WhatsApp पर भेजें" : "Send via WhatsApp", onClick: () => void shareOrSend(q), disabled: busy };
                    const duplicate: RowAction = { label: hi ? "डुप्लिकेट" : "Duplicate", onClick: () => void run("duplicate-quotation", { quotationId: q.id, idempotencyKey: key() }), disabled: busy };
                    let primary: RowAction | null = null;
                    const secondary: RowAction[] = [];
                    if (q.status === "DRAFT") {
                      primary = {
                        label: hi ? "जारी करें" : "Issue",
                        tone: "primary",
                        disabled: busy || q.lines.some((l) => l.taxRate == null),
                        title: q.lines.some((l) => l.taxRate == null) ? (hi ? "जारी करने से पहले सभी उत्पादों में GST दर कॉन्फ़िगर होनी चाहिए" : "All products need a configured GST rate before this can be issued") : undefined,
                        onClick: () => void run("issue-quotation", { quotationId: q.id }),
                      };
                    } else if (q.status === "ISSUED") {
                      primary = { label: hi ? "स्वीकृत" : "Accept", tone: "primary", disabled: busy, onClick: () => void run("respond-quotation", { quotationId: q.id, decision: "ACCEPTED" }) };
                      secondary.push(
                        {
                          label: hi ? "अस्वीकृत" : "Reject",
                          disabled: busy,
                          onClick: () => {
                            const reason = window.prompt(hi ? "अस्वीकृति का कारण" : "Reason for rejection");
                            if (reason == null) return;
                            void run("respond-quotation", { quotationId: q.id, decision: "REJECTED", reason });
                          },
                        },
                        { label: hi ? "समाप्त करें" : "Expire", disabled: busy, onClick: () => void run("expire-quotation", { quotationId: q.id }) },
                        download,
                        send,
                        duplicate,
                      );
                    } else if (q.status === "ACCEPTED") {
                      primary = { label: hi ? "ऑर्डर में बदलें" : "Convert to order", tone: "primary", disabled: busy, onClick: () => void run("convert-quotation", { quotationId: q.id, idempotencyKey: key() }) };
                      secondary.push(download, send, duplicate);
                    } else {
                      primary = download;
                      secondary.push(send, duplicate);
                    }
                    return <DocumentRowActions primary={primary} secondary={secondary} />;
                  })()}
                  {docSendStatus[q.id] === "sent" && (
                    <p className={styles.notice} data-ok="true">{hi ? "PDF WhatsApp पर भेजा गया ✓" : "PDF sent via WhatsApp ✓"}</p>
                  )}
                  {shareLinks[q.id] && (
                    <p className={styles.notice} data-ok="true">
                      {docSendStatus[q.id] === "unsupported" && (
                        <>
                          <small>{hi ? "यह प्रदाता सीधे फ़ाइल नहीं भेज सकता — केवल लिंक साझा किया जा सकता है।" : "This provider can't send the file directly — link only."}</small>
                          <br />
                        </>
                      )}
                      <a href={shareLinks[q.id]!.whatsapp} target="_blank" rel="noreferrer">
                        {hi ? "लिंक WhatsApp पर शेयर करें →" : "Share Link on WhatsApp →"}
                      </a>{" "}
                      <small>{shareLinks[q.id]!.url}</small>
                    </p>
                  )}
                  {q.lines.length > 0 && (
                    <details>
                      <summary>{hi ? "पंक्तियाँ देखें" : "View lines"}</summary>
                      <div className={styles.tableWrap}>
                        <table>
                          <thead>
                            <tr>
                              <th>{hi ? "उत्पाद" : "Product"}</th>
                              <th>HSN</th>
                              <th>{hi ? "मात्रा" : "Qty"}</th>
                              <th>{hi ? "दर" : "Rate"}</th>
                              <th>{hi ? "कर %" : "Tax %"}</th>
                              <th>{hi ? "मूल्य मोड" : "Price mode"}</th>
                              <th>{hi ? "कुल" : "Total"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {q.lines.map((l, i) => (
                              <tr key={i}>
                                <td>{l.productNameSnapshot}</td>
                                <td>{l.hsn || "—"}</td>
                                <td>{l.quantity}</td>
                                <td>₹{l.rate.toFixed(2)}</td>
                                <td>{l.taxRate}%</td>
                                <td>{l.priceMode === "GST_INCLUSIVE" ? (hi ? "GST शामिल" : "GST INCLUDED") : hi ? "GST अतिरिक्त" : "GST EXCLUDED"}</td>
                                <td>₹{l.lineTotal.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {!quotations.length && (
              <tr>
                <td colSpan={6}>{hi ? "अभी तक कोई कोटेशन नहीं" : "No quotations yet"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
