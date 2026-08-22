"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./WorkflowActions.module.css";
import { FileUploadField } from "./FileUploadField";

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

export type CompanyOrderStatusCard = { id: string; orderNumber: string; status: "PAYMENT_REQUIRED" | "PROOF_SUBMITTED" | "VERIFIED" | "DISPATCHED"; total: number; placedAt: string };

// RUN 2B: rate/pack/scheme are display-only — the server always re-derives the authoritative
// COMPANY_TO_SS price itself in createCompanyOrder (workflow-service.ts), so nothing here is
// trusted for the actual commercial total.
export type CompanyCatalogItem = {
  skuId: string;
  brand: string;
  productName: string;
  packDescription: string;
  orderUnit: string;
  unitsPerOrderUnit: number;
  rateBasis: string;
  rate: number | null;
  scheme?: string;
  unavailable: boolean;
};

function PaymentProofPanel({ language, superStockistId, orderId, orderNumber, amountDue }: { language: "EN" | "HI"; superStockistId: string; orderId: string; orderNumber: string; amountDue: number }) {
  const hi = language === "HI",
    router = useRouter(),
    [fileId, setFileId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState<{ amount: number; reference: string; submittedAt: string } | null>(null);

  // P0-4 (23-Aug): a single static sentence ("Payment proof submitted — waiting for Accounts
  // verification.") was the ENTIRE post-submission screen — no order number, no amount, no
  // timestamp, no next action. Replaced with a real status summary matching the Founder's exact
  // required fields, with a clear primary next action (view the order in the Recent orders list
  // below, which already live-updates via router.refresh()) rather than "Place another order"
  // reading as the only meaningful thing to do next.
  if (done)
    return (
      <div className={styles.notice} data-ok="true">
        <ul>
          <li>{hi ? "ऑर्डर दर्ज हुआ ✓" : "ORDER PLACED ✓"}</li>
          <li>{hi ? "भुगतान प्रमाण जमा ✓" : "PAYMENT PROOF SUBMITTED ✓"}</li>
          <li>{hi ? "Accounts सत्यापन — लंबित" : "ACCOUNTS VERIFICATION — PENDING"}</li>
        </ul>
        <p className={styles.cardTotal}>
          {hi ? "कंपनी ऑर्डर नंबर" : "Company Order Number"}: <strong>{orderNumber}</strong>
          <br />
          {hi ? "ऑर्डर राशि" : "Order Amount"}: ₹{done.amount.toFixed(2)}
          <br />
          {hi ? "बैंक / UTR संदर्भ" : "Bank / UTR reference"}: {done.reference}
          <br />
          {hi ? "प्रमाण जमा किया गया" : "Proof submitted at"}: {done.submittedAt}
        </p>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.primaryBig}
            onClick={() => document.getElementById("recent-company-orders")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {hi ? "ऑर्डर विवरण देखें" : "VIEW ORDER DETAILS"}
          </button>
        </div>
      </div>
    );

  return (
    <form
      style={{ display: "grid", gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const amount = Number(f.get("amount") || amountDue);
        const reference = String(f.get("reference") || "");
        setBusy(true);
        setError("");
        void post("submit-payment-proof", {
          superStockistId,
          orderId,
          amount,
          reference,
          fileId: fileId || undefined,
          idempotencyKey: key(),
        })
          .then(() => {
            setDone({ amount, reference, submittedAt: new Date().toLocaleString(hi ? "hi-IN" : "en-IN") });
            router.refresh();
          })
          .catch((err) => setError(err instanceof Error ? err.message : "Could not submit proof"))
          .finally(() => setBusy(false));
      }}
    >
      <p className={styles.cardTotal}>
        {hi ? "कंपनी ऑर्डर" : "Company order"}: <strong>{orderNumber}</strong> · {hi ? "देय राशि" : "Amount due"}: ₹{amountDue.toFixed(2)}
      </p>
      <label>
        {hi ? "राशि" : "Amount"}
        <input name="amount" type="number" min="0.01" step="0.01" defaultValue={amountDue} required />
      </label>
      <label>
        {hi ? "बैंक / UTR संदर्भ" : "Bank / UTR reference"}
        <input name="reference" minLength={3} required />
      </label>
      <FileUploadField
        language={language}
        documentType="PAYMENT_PROOF"
        issuerType="SUPER_STOCKIST"
        issuerId={superStockistId}
        buyerType="COMPANY"
        buyerId="SEERA_COMPANY"
        sourcePortal="super-stockist"
        amount={amountDue}
        onUploaded={setFileId}
      />
      <button disabled={busy} className={styles.primaryBig}>
        {hi ? "भुगतान प्रमाण जमा करें" : "SUBMIT PAYMENT PROOF"}
      </button>
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </form>
  );
}

type CartLine = { skuId: string; quantity: number };

export function CompanyOrderWizard({
  language,
  superStockistId,
  catalog,
  recentOrders,
}: {
  language: "EN" | "HI";
  superStockistId: string;
  catalog: CompanyCatalogItem[];
  recentOrders: CompanyOrderStatusCard[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    brands = useMemo(() => [...new Set(catalog.map((c) => c.brand))].sort((a, b) => (a === "Seera" ? -1 : b === "Seera" ? 1 : a.localeCompare(b))), [catalog]),
    [brand, setBrand] = useState<string>(brands[0] ?? "Seera"),
    [qtyDraft, setQtyDraft] = useState<Record<string, number>>({}),
    [cart, setCart] = useState<CartLine[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState<{ id: string; orderNumber: string; total: number } | null>(null),
    // P0-1 (23-Aug): ADD TO ORDER previously mutated local cart state with ZERO visible feedback —
    // the Review cart section only renders once cart.length > 0, below the fold, so a click that
    // "worked" looked identical to one that silently did nothing. justAddedSkuId drives a transient
    // ADDED state on the exact button clicked; the persistent "In cart: N" line on every card (see
    // cartQuantity below) is the non-transient confirmation that survives after the flash clears.
    [justAddedSkuId, setJustAddedSkuId] = useState<string | null>(null);

  const visible = catalog.filter((c) => c.brand === brand);
  const byId = new Map(catalog.map((c) => [c.skuId, c]));
  const cartWithDetail = cart.map((line) => ({ ...line, item: byId.get(line.skuId) })).filter((l) => l.item);
  const estimatedTotal = cartWithDetail.reduce((sum, l) => sum + (l.item!.rate ?? 0) * l.quantity, 0);
  const cartQuantity = (skuId: string) => cart.find((l) => l.skuId === skuId)?.quantity ?? 0;

  const addToCart = (skuId: string) => {
    const quantity = qtyDraft[skuId] ?? 1;
    if (!quantity || quantity <= 0) return;
    setCart((c) => {
      const existing = c.find((l) => l.skuId === skuId);
      if (existing) return c.map((l) => (l.skuId === skuId ? { ...l, quantity: l.quantity + quantity } : l));
      return [...c, { skuId, quantity }];
    });
    setJustAddedSkuId(skuId);
    window.setTimeout(() => setJustAddedSkuId((current) => (current === skuId ? null : current)), 1500);
  };

  if (submitted)
    return (
      <div className={styles.cardStack}>
        <section className={styles.panel}>
          <div>
            <small>{hi ? "कंपनी से ऑर्डर" : "ORDER FROM COMPANY"}</small>
            <h2>{hi ? "ऑर्डर दर्ज हुआ" : "ORDER PLACED"}</h2>
          </div>
          <div className={styles.notice} data-ok="true" style={{ gridColumn: "1/-1" }}>
            <p>
              <strong>{hi ? "कंपनी ऑर्डर नंबर" : "Company Order Number"}</strong>: <strong>{submitted.orderNumber}</strong>
              <br />
              {hi ? "कुल" : "Total"}: ₹{submitted.total.toFixed(2)}
            </p>
            <span className={styles.badge}>{hi ? "भुगतान आवश्यक" : "PAYMENT REQUIRED"}</span>
            <PaymentProofPanel language={language} superStockistId={superStockistId} orderId={submitted.id} orderNumber={submitted.orderNumber} amountDue={submitted.total} />
            <button
              type="button"
              className={styles.secondaryBig}
              onClick={() => {
                setSubmitted(null);
                setCart([]);
                router.refresh();
              }}
            >
              {hi ? "एक और ऑर्डर करें" : "Place another order"}
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className={styles.cardStack}>
      <section className={styles.panel}>
        <div>
          <small>{hi ? "कंपनी से ऑर्डर" : "ORDER FROM COMPANY"}</small>
          <h2>{hi ? "नया कंपनी ऑर्डर" : "New Company order"}</h2>
        </div>
        <div className={styles.brandToggle}>
          {brands.map((b) => (
            <button key={b} type="button" data-active={b === brand} onClick={() => setBrand(b)}>
              {b.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={styles.productGrid}>
          {visible.map((item) => (
            <article key={item.skuId} className={styles.productCard} data-unavailable={item.unavailable}>
              <strong>{item.productName}</strong>
              <small>{item.packDescription}</small>
              {item.unitsPerOrderUnit > 1 && (
                <small style={{ color: "#5a5a6e" }}>
                  {hi ? `1 ${item.orderUnit} = ${item.unitsPerOrderUnit} पीस — ${item.rateBasis}` : `1 ${item.orderUnit} = ${item.unitsPerOrderUnit} pcs — ${item.rateBasis}`}
                </small>
              )}
              {item.unavailable ? (
                <small style={{ color: "#a61f2a", fontWeight: 800 }}>{hi ? "मूल्य कॉन्फ़िगर नहीं" : "Price not configured yet"}</small>
              ) : (
                <span className="rate">₹{item.rate!.toFixed(2)} / {item.orderUnit}</span>
              )}
              {item.scheme && <small className="scheme">{item.scheme}</small>}
              {cartQuantity(item.skuId) > 0 && (
                <small style={{ color: "#177245", fontWeight: 800 }}>
                  {hi ? `कार्ट में: ${cartQuantity(item.skuId)} ${item.orderUnit}` : `In cart: ${cartQuantity(item.skuId)} ${item.orderUnit}`}
                </small>
              )}
              <div className="addRow">
                <input
                  type="number"
                  min={1}
                  step="1"
                  disabled={item.unavailable}
                  value={qtyDraft[item.skuId] ?? 1}
                  onChange={(e) => setQtyDraft((q) => ({ ...q, [item.skuId]: Number(e.target.value) }))}
                  aria-label={hi ? "मात्रा" : "Quantity"}
                />
                <button
                  type="button"
                  disabled={item.unavailable}
                  data-added={justAddedSkuId === item.skuId}
                  onClick={() => addToCart(item.skuId)}
                  aria-live="polite"
                >
                  {justAddedSkuId === item.skuId ? (hi ? "जोड़ा गया ✓" : "ADDED ✓") : hi ? "ऑर्डर में जोड़ें" : "ADD TO ORDER"}
                </button>
              </div>
            </article>
          ))}
          {!visible.length && <p className={styles.emptyHint}>{hi ? "इस ब्रांड में कोई सक्रिय उत्पाद नहीं।" : "No active products for this brand."}</p>}
        </div>
      </section>

      {cartWithDetail.length > 0 && (
        <section className={styles.panel}>
          <div>
            <small>{hi ? "समीक्षा" : "REVIEW"}</small>
            <h2>{hi ? "ऑर्डर कार्ट" : "Review cart"}</h2>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{hi ? "उत्पाद" : "Product"}</th>
                  <th>{hi ? "मात्रा" : "Qty"}</th>
                  <th>{hi ? "इकाई" : "Unit"}</th>
                  <th>{hi ? "दर (GST सहित)" : "Rate Incl GST"}</th>
                  <th>{hi ? "कुल" : "Line Gross"}</th>
                  <th>{hi ? "स्कीम" : "Scheme"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cartWithDetail.map((l) => (
                  <tr key={l.skuId}>
                    <td>{l.item!.productName}</td>
                    <td>{l.quantity}</td>
                    <td>{l.item!.orderUnit}</td>
                    <td>₹{(l.item!.rate ?? 0).toFixed(2)}</td>
                    <td>₹{((l.item!.rate ?? 0) * l.quantity).toFixed(2)}</td>
                    <td>{l.item!.scheme ?? "—"}</td>
                    <td>
                      <button type="button" onClick={() => setCart((c) => c.filter((x) => x.skuId !== l.skuId))}>
                        {hi ? "हटाएँ" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.cardTotal} style={{ gridColumn: "1/-1" }}>
            {hi ? "अनुमानित कुल (GST सहित, कोई अतिरिक्त GST नहीं)" : "Estimated total (GST-inclusive, no GST added on top)"}: ₹{estimatedTotal.toFixed(2)}
          </p>
          <button
            type="button"
            disabled={busy}
            className={styles.primaryBig}
            style={{ gridColumn: "1/-1" }}
            onClick={() => {
              setBusy(true);
              setError("");
              void post("company-order", {
                superStockistId,
                lines: cart,
                idempotencyKey: key(),
              })
                .then((order) => {
                  setSubmitted({ id: order.id, orderNumber: order.orderNumber, total: Number(order.total) });
                  router.refresh();
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not submit order"))
                .finally(() => setBusy(false));
            }}
          >
            {hi ? "कंपनी ऑर्डर दर्ज करें" : "PLACE COMPANY ORDER"}
          </button>
          {error && <p role="status" className={styles.cardError} style={{ gridColumn: "1/-1" }}>{error}</p>}
        </section>
      )}

      {recentOrders.length > 0 && (
        <section id="recent-company-orders">
          <h2>{hi ? "हाल के कंपनी ऑर्डर" : "Recent Company orders"}</h2>
          {recentOrders.map((o) => (
            <article key={o.id} className={styles.orderCard}>
              <header>
                <div>
                  <strong>{o.orderNumber}</strong>
                  <small>₹{o.total.toFixed(2)} · {o.placedAt}</small>
                </div>
                <span className={styles.badge}>
                  {hi ? { PAYMENT_REQUIRED: "भुगतान आवश्यक", PROOF_SUBMITTED: "प्रमाण जमा", VERIFIED: "सत्यापित", DISPATCHED: "डिस्पैच" }[o.status] : o.status.replace("_", " ")}
                </span>
              </header>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
