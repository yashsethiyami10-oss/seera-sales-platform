"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string; meta?: string };

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result?.error?.message ?? result?.error?.code ?? "Action failed",
    );
  return result;
}

function useAction(language: "EN" | "HI") {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return {
    busy,
    message,
    run: async (action: () => Promise<unknown>) => {
      setBusy(true);
      setMessage("");
      try {
        await action();
        setMessage(
          language === "HI"
            ? "कार्रवाई सफलतापूर्वक पूरी हुई।"
            : "Action completed successfully.",
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
  };
}

export function ApprovalActions({
  language,
  approvals,
}: {
  language: "EN" | "HI";
  approvals: (Option & { domain: string; isOwn?: boolean })[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  // Founder UI Implementation & Visual Gap Closure mission — replaces the old single hidden
  // dropdown + one shared "Save decision" button (no context beyond a truncated option label, one
  // raw error line for every outcome) with a per-request card: requester/date/reason always
  // visible, an explicit "Your own request" note when isOwn (informational only — the backend,
  // not this UI, decides whether self-approval is allowed), and a friendly WHAT/WHY message with
  // the raw error kept under "Technical details" rather than shown bare.
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, { ok: boolean; message: string; technical?: string }>
  >({});

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const reason = (reasons[id] ?? "").trim();
    if (reason.length < 3) {
      setResults((r) => ({
        ...r,
        [id]: {
          ok: false,
          message: hi
            ? "कृपया कम से कम 3 अक्षरों का कारण लिखें।"
            : "Please enter a reason (at least 3 characters) before deciding.",
        },
      }));
      return;
    }
    setBusyId(id);
    try {
      const result = await post(`/api/approvals/${id}`, { decision, reason });
      void result;
      setResults((r) => ({
        ...r,
        [id]: { ok: true, message: hi ? "निर्णय सुरक्षित किया गया।" : "Decision saved." },
      }));
      router.refresh();
    } catch (error) {
      setResults((r) => ({
        ...r,
        [id]: {
          ok: false,
          message: hi
            ? "यह निर्णय सुरक्षित नहीं किया जा सका। कृपया पुनः प्रयास करें।"
            : "Couldn't save this decision. Please try again.",
          technical: error instanceof Error ? error.message : "Action failed",
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "अनुमोदन कतार" : "APPROVAL QUEUE"}</small>
        <h2>{hi ? "लंबित अनुरोध" : "Pending requests"}</h2>
      </div>
      {!approvals.length ? (
        <p role="status">{hi ? "कोई लंबित अनुमोदन नहीं।" : "No pending approvals."}</p>
      ) : (
        <ul className={styles.list}>
          {approvals.map((a) => {
            const result = results[a.value];
            return (
              <li key={a.value}>
                <div className={styles.approvalHead}>
                  <span className={styles.approvalDomain}>{a.domain}</span>
                  {a.isOwn && (
                    <span className={styles.approvalOwnBadge}>
                      {hi ? "आपका अपना अनुरोध" : "Your own request"}
                    </span>
                  )}
                </div>
                <strong>{a.label}</strong>
                {a.meta && <p>{a.meta}</p>}
                <label>
                  {hi ? "निर्णय का कारण" : "Decision reason"}
                  <input
                    value={reasons[a.value] ?? ""}
                    onChange={(e) =>
                      setReasons((r) => ({ ...r, [a.value]: e.target.value }))
                    }
                    minLength={3}
                    placeholder={hi ? "जैसे: सत्यापित और सही" : "e.g. Verified and correct"}
                  />
                </label>
                <div className={styles.inlineActions}>
                  <button disabled={busyId === a.value} onClick={() => decide(a.value, "APPROVED")}>
                    {hi ? "स्वीकृत करें" : "Approve"}
                  </button>
                  <button
                    disabled={busyId === a.value}
                    data-tone="reject"
                    onClick={() => decide(a.value, "REJECTED")}
                  >
                    {hi ? "अस्वीकृत करें" : "Reject"}
                  </button>
                </div>
                {result && (
                  <p role="status" data-ok={result.ok}>
                    {result.message}
                    {result.technical && (
                      <details className={styles.technicalDetails}>
                        <summary>{hi ? "तकनीकी विवरण" : "Technical details"}</summary>
                        {result.technical}
                      </details>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type PriceVersionRow = {
  id: string;
  skuLabel: string;
  tier: string;
  amount: number;
  status: string;
  isCurrentlyActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  marginType: string | null;
  marginValue: number | null;
  // GST/price-mode correction (Founder directive): every price row must show, explicitly, whether
  // its amount already includes GST (MUV) or is a base rate GST is added on top of (every other
  // brand) — never make Founder guess. taxableValuePreview/grossValuePreview are pre-computed by
  // the same governed math buildLineSnapshots uses (document-lines.ts), not re-derived here.
  priceMode: "GST_INCLUSIVE" | "GST_EXCLUSIVE";
  taxRate: number | null;
  taxableValuePreview: number;
  grossValuePreview: number;
};

export function MasterActions({
  language,
  skus,
  priceVersions = [],
  unconfiguredGstSkuCount = 0,
}: {
  language: "EN" | "HI";
  skus: Option[];
  priceVersions?: PriceVersionRow[];
  // Founder-authorized one-time bulk GST RATE configuration (18%, HSN matching the already-frozen
  // precedent) — auto-hides once every active SKU has a governed tax rate + HSN. Sets only the
  // rate/HSN, never a price mode: price mode (GST-inclusive vs GST-exclusive) is derived
  // automatically per SKU from its brand (priceModeForBrand in document-lines.ts — MUV is
  // inclusive, every other brand is exclusive/add-on-top), so this one rate applies correctly
  // regardless of brand. Previously labeled "(18% INCLUSIVE)", which wrongly implied a single
  // universal price-mode rule and was corrected once price mode became brand-derived.
  unconfiguredGstSkuCount?: number;
}) {
  const hi = language === "HI";
  const state = useAction(language);
  const active = priceVersions.filter((p) => p.isCurrentlyActive);
  const history = priceVersions.filter((p) => !p.isCurrentlyActive);
  return (
    <section className={styles.panel}>
      {unconfiguredGstSkuCount > 0 && (
        <div className={styles.panel} style={{ gridColumn: "1/-1" }}>
          <div>
            <small>{hi ? "GST मास्टर" : "GST MASTER"}</small>
            <h2>{hi ? "SKU GST कॉन्फ़िगरेशन पूरा करें" : "Complete SKU GST Configuration"}</h2>
          </div>
          <p>
            {hi
              ? `${unconfiguredGstSkuCount} सक्रिय SKU में GST दर/HSN कॉन्फ़िगर नहीं है। एक क्लिक में सभी को 18% GST पर सेट करें — मूल्य मोड (समावेशी/अतिरिक्त) प्रत्येक SKU के ब्रांड से स्वतः तय होता है (MUV = समावेशी; अन्य सभी = आधार मूल्य पर GST जोड़ा जाता है)। पहले से कॉन्फ़िगर किए गए SKU अप्रभावित रहते हैं।`
              : `${unconfiguredGstSkuCount} active SKU(s) have no GST rate/HSN configured. One click sets all of them to 18% GST — price mode (inclusive vs. added on top) is resolved automatically per SKU by brand (MUV = inclusive; every other brand = GST added on top of the base rate). Already-configured SKUs are left untouched.`}
          </p>
          <button
            type="button"
            className={styles.primaryBig}
            disabled={state.busy}
            onClick={() => void state.run(() => post("/api/foundation/masters", { action: "bulk-configure-sku-gst", payload: {} }))}
          >
            {hi ? "सभी SKU के लिए GST दर कॉन्फ़िगर करें (18%)" : "CONFIGURE GST RATE FOR ALL SKUs (18%)"}
          </button>
        </div>
      )}
      <div>
        <small>{hi ? "मूल्य सूची" : "PRICE LIST"}</small>
        <h2>{hi ? "सक्रिय मूल्य" : "Active prices"}</h2>
      </div>
      <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "उत्पाद" : "Product"}</th>
              <th>{hi ? "स्तर" : "Tier"}</th>
              <th>{hi ? "राशि" : "Amount"}</th>
              <th>{hi ? "GST दर" : "GST rate"}</th>
              <th>{hi ? "मूल्य मोड" : "Price mode"}</th>
              <th>{hi ? "कर योग्य मूल्य" : "Taxable value"}</th>
              <th>{hi ? "सकल मूल्य" : "Gross value"}</th>
              <th>{hi ? "नीति" : "Policy"}</th>
              <th>{hi ? "प्रभावी से" : "Effective from"}</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr>
                <td colSpan={9}>{hi ? "कोई सक्रिय मूल्य नहीं।" : "No active prices yet."}</td>
              </tr>
            )}
            {active.map((p) => (
              <tr key={p.id}>
                <td>{p.skuLabel}</td>
                <td>{p.tier}</td>
                <td>₹{p.amount.toFixed(2)}</td>
                <td>{p.taxRate != null ? `${p.taxRate}%` : hi ? "अकॉन्फ़िगर्ड" : "unconfigured"}</td>
                <td>
                  <span title={p.priceMode === "GST_INCLUSIVE" ? (hi ? "राशि में GST शामिल है" : "Amount already includes GST") : hi ? "GST आधार राशि पर अतिरिक्त जोड़ा जाता है" : "GST is added on top of this base amount"}>
                    {p.priceMode === "GST_INCLUSIVE" ? (hi ? "GST शामिल" : "GST INCLUDED") : hi ? "GST अतिरिक्त" : "GST EXCLUDED"}
                  </span>
                </td>
                <td>₹{p.taxableValuePreview.toFixed(2)}</td>
                <td>₹{p.grossValuePreview.toFixed(2)}</td>
                <td>{p.marginType ? `${p.marginType}${p.marginValue != null ? ` (${p.marginValue})` : ""}` : "—"}</td>
                <td>{p.effectiveFrom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {history.length > 0 && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <h3>{hi ? "मूल्य इतिहास (बंद संस्करण)" : "Price history (closed / superseded versions)"}</h3>
          <table>
            <thead>
              <tr>
                <th>{hi ? "उत्पाद" : "Product"}</th>
                <th>{hi ? "स्तर" : "Tier"}</th>
                <th>{hi ? "राशि" : "Amount"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "अवधि" : "Period"}</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 30).map((p) => (
                <tr key={p.id}>
                  <td>{p.skuLabel}</td>
                  <td>{p.tier}</td>
                  <td>₹{p.amount.toFixed(2)}</td>
                  <td>{p.status}</td>
                  <td>{p.effectiveFrom} → {p.effectiveTo ?? (hi ? "जारी" : "ongoing")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <small>{hi ? "मास्टर डेटा" : "MASTER DATA"}</small>
        <h2>
          {hi ? "SKU बनाएँ या मूल्य बदलें" : "Create SKU or change a price"}
        </h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const action = String(form.get("action"));
          const payload =
            action === "create-sku"
              ? {
                  code: String(form.get("code")),
                  productName: String(form.get("productName")),
                  brand: String(form.get("brand") || "") || undefined,
                  category: String(form.get("category")),
                  packSize: Number(form.get("packSize")),
                  unitType: String(form.get("unitType")),
                  unitsPerCase: Number(form.get("unitsPerCase")),
                  mrp: Number(form.get("mrp")),
                  hsn: String(form.get("hsn") || "") || undefined,
                  taxRate: Number(form.get("taxRate")),
                }
              : action === "supersede-price"
                ? {
                    skuId: String(form.get("skuId")),
                    tier: String(form.get("tier")),
                    amount: Number(form.get("amount")),
                    effectiveFrom: String(form.get("effectiveFrom")),
                    marginType: String(form.get("marginType") || "") || undefined,
                    marginValue: form.get("marginValue") ? Number(form.get("marginValue")) : undefined,
                    reason: String(form.get("reason")),
                  }
                : {
                    skuId: String(form.get("skuId")),
                    tier: String(form.get("tier")),
                    amount: Number(form.get("amount")),
                    effectiveFrom: String(form.get("effectiveFrom")),
                  };
          void state.run(() =>
            post("/api/foundation/masters", { action, payload }),
          );
        }}
      >
        <label>
          {hi ? "कार्रवाई" : "Action"}
          <select name="action">
            <option value="create-sku">{hi ? "नया SKU" : "New SKU"}</option>
            <option value="create-price">
              {hi ? "नया मूल्य संस्करण (कोई मौजूदा मूल्य नहीं)" : "New price version (SKU has no price yet)"}
            </option>
            <option value="supersede-price">
              {hi ? "मूल्य बदलें (मौजूदा मूल्य बंद करें और नया शुरू करें)" : "CHANGE PRICE (close current, start new — no code edit)"}
            </option>
          </select>
        </label>
        <p className={styles.emptyHint}>
          {hi
            ? "मूल्य बदलने के लिए 'मूल्य बदलें' चुनें — पुराना मूल्य इतिहास में सुरक्षित रहता है, पुराने ऑर्डर अप्रभावित रहते हैं।"
            : "Use CHANGE PRICE to revise an existing rate — the old version is preserved in history (never deleted), and past orders keep their original snapshot untouched."}
        </p>
        <label>
          {hi ? "SKU (मूल्य के लिए)" : "SKU (for price)"}
          <select name="skuId">
            <option value="">{hi ? "SKU चुनें" : "Choose SKU"}</option>
            {skus.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "SKU कोड" : "SKU code"}
          <input name="code" />
        </label>
        <label>
          {hi ? "उत्पाद नाम" : "Product name"}
          <input name="productName" />
        </label>
        <label>
          {hi ? "ब्रांड" : "Brand"}
          <input name="brand" defaultValue="Seera" placeholder="Seera / MUV / Shine Plus / Yuva" />
        </label>
        <label>
          {hi ? "श्रेणी" : "Category"}
          <input name="category" />
        </label>
        <label>
          {hi ? "पैक आकार" : "Pack size"}
          <input
            name="packSize"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue="1"
          />
        </label>
        <label>
          {hi ? "इकाई" : "Unit"}
          <input name="unitType" defaultValue="UNIT" />
        </label>
        <label>
          {hi ? "प्रति केस इकाइयाँ" : "Units per case"}
          <input
            name="unitsPerCase"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
          />
        </label>
        <label>
          MRP
          <input
            name="mrp"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue="1"
          />
        </label>
        <label>
          HSN
          <input name="hsn" />
        </label>
        <label>
          {hi ? "कर दर %" : "Tax rate %"}
          <input
            name="taxRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue="0"
          />
        </label>
        <label>
          {hi ? "मूल्य स्तर" : "Price tier"}
          <select name="tier">
            <option>COMPANY_TO_SS</option>
            <option>SS_TO_DISTRIBUTOR</option>
            <option>DISTRIBUTOR_TO_RETAILER</option>
          </select>
        </label>
        <label>
          {hi ? "राशि" : "Amount"}
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue="1"
          />
        </label>
        <label>
          {hi ? "प्रभावी तिथि" : "Effective date"}
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label>
          {hi ? "नीति प्रकार (केवल मूल्य बदलने के लिए, वैकल्पिक)" : "Policy type (CHANGE PRICE only, optional)"}
          <select name="marginType" defaultValue="">
            <option value="">{hi ? "— लागू नहीं —" : "— not applicable —"}</option>
            <option value="FIXED">{hi ? "निश्चित दर" : "FIXED rate"}</option>
            <option value="PERCENTAGE">{hi ? "प्रतिशत मार्कअप" : "PERCENTAGE markup"}</option>
          </select>
        </label>
        <label>
          {hi ? "नीति मान (जैसे 8 के लिए 8%)" : "Policy value (e.g. 8 for 8%)"}
          <input name="marginValue" type="number" step="0.01" />
        </label>
        <label>
          {hi ? "कारण (केवल मूल्य बदलने के लिए आवश्यक)" : "Reason (required for CHANGE PRICE)"}
          <input name="reason" placeholder={hi ? "जैसे: तिमाही मूल्य समीक्षा" : "e.g. Quarterly rate revision"} />
        </label>
        <button disabled={state.busy}>
          {hi ? "सुरक्षित बनाएँ" : "Save governed record"}
        </button>
      </form>
      {state.message && <p role="status">{state.message}</p>}
    </section>
  );
}
