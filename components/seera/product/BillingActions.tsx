"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string };
// taxRate null (not 0) means "no governed GST rate configured yet" — kept distinct from a
// legitimate 0%-rated SKU (Founder UAT fix, mirrors QuotationActions.tsx's own comment: a coerced
// `?? 0` made the server's TAX_CONFIGURATION_REQUIRED gate unreachable from this UI).
type Sku = { value: string; label: string; rate: number; taxRate: number | null };
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
    [lines, setLines] = useState([
      { key: key(), skuId: "", quantity: 1, rate: 0, discountPct: 0, taxRate: null as number | null },
    ]);
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
  const share = async (d: BillingDoc) => {
    if (d.buyerType !== "DISTRIBUTOR" && d.buyerType !== "SUPER_STOCKIST") {
      setMessage(hi ? "इस प्राप्तकर्ता प्रकार के लिए साझा उपलब्ध नहीं है।" : "Share isn't available for this recipient type yet.");
      return;
    }
    setBusy(true);
    try {
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
                  setLine(line.key, {
                    skuId: e.target.value,
                    rate: sku?.rate ?? 0,
                    taxRate: sku?.taxRate ?? null,
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
              {hi ? "दर" : "Rate"}
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
                <input value={line.skuId ? `${line.taxRate}%` : "—"} disabled readOnly />
              )}
            </label>
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
          {hi ? "भुगतान शर्तें" : "Payment terms"}
          <input name="paymentTerms" />
        </label>
        <label>
          {hi ? "टिप्पणी" : "Notes"}
          <input name="notes" />
        </label>
        <button
          disabled={
            busy ||
            !issuers.length ||
            !buyers.length ||
            !skus.length ||
            // Founder UAT fix: previously nothing stopped submitting a line whose SKU has no
            // governed tax rate — it silently issued at 0% tax. Now blocked client-side, backed by
            // the server's own TAX_CONFIGURATION_REQUIRED gate (document-lines.ts).
            lines.some((l) => l.skuId && l.quantity > 0 && l.taxRate == null)
          }
        >
          {hi ? "ड्राफ्ट सहेजें" : "Save draft"}
        </button>
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
                  <div className={styles.inlineActions}>
                    {d.status === "DRAFT" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run("issue-billing-draft", { documentId: d.id })}
                      >
                        {hi ? "जारी करें" : "Issue"}
                      </button>
                    )}
                    {d.status !== "DRAFT" && (
                      <>
                        <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer">{hi ? "PDF / प्रिंट" : "PDF / Print"}</a>
                        <button type="button" disabled={busy} onClick={() => void share(d)}>
                          {hi ? "WhatsApp पर साझा करें" : "SHARE TO WHATSAPP"}
                        </button>
                      </>
                    )}
                  </div>
                  {shareLinks[d.id] && (
                    <p className={styles.notice} data-ok="true">
                      <a href={shareLinks[d.id]!.whatsapp} target="_blank" rel="noreferrer">
                        {hi ? "WhatsApp में खोलें →" : "Open in WhatsApp →"}
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
