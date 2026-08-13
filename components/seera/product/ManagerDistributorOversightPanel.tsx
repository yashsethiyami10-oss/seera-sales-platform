import styles from "./WorkflowActions.module.css";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;

export type DistributorSnapshot = {
  distributor: { id: string; name: string; code: string; territory: string | null; status: string | null; lastActivity: string | null };
  orders: { pending: { id: string; orderNumber: string; retailer: string; total: number; placedAt: string }[]; pendingCount: number; acceptedCount: number; partialCount: number; rejectedCount: number };
  deliveries: { pending: { id: string; orderNumber: string; retailer: string; status: string }[]; pendingCount: number };
  remainingQtyExceptions: { id: string; orderNumber: string; retailer: string; remaining: number }[];
  ssOrders: { id: string; orderNumber: string; superStockist: string; total: number; status: string; placedAt: string }[];
  stock: { skuId: string; productName: string; brand: string; available: number; reserved: number; incoming: number }[];
  money: { outstanding: number; current: number; overdue: number; availableCredit: number | null; lastPayment: { amount: number; postedAt: string } | null };
  exceptions: {
    returns: { id: string; requestNumber: string; status: string; quantity: number; condition: string; reason: string }[];
    claims: { id: string; claimNumber: string; type: string; status: string }[];
    shortReceipts: { id: string; orderNumber: string; status: string }[];
  };
};

export function ManagerDistributorOversightPanel({
  language,
  base,
  distributors,
  selectedDistributorId,
  snapshot,
}: {
  language: "EN" | "HI";
  base: string;
  distributors: { value: string; label: string }[];
  selectedDistributorId?: string;
  snapshot: DistributorSnapshot | null;
}) {
  const hi = language === "HI";
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(hi ? "hi-IN" : "en-IN") : "—");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वितरक" : "DISTRIBUTORS"}</small>
        <h2>{hi ? "वितरक चुनें" : "Choose a distributor"}</h2>
      </div>
      <form method="get" action={base}>
        <label>
          {hi ? "वितरक" : "Distributor"}
          <select name="distributorId" defaultValue={selectedDistributorId ?? ""} required>
            <option value="">{hi ? "नाम से खोजें" : "Search by name"}</option>
            {distributors.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {!distributors.length && (
          <p className={styles.emptyHint}>
            {hi ? "इस टीम की कोई रिटेलर मैप वितरक से जुड़ी नहीं है।" : "No retailer on this team is mapped to a distributor yet."}
          </p>
        )}
        <button>{hi ? "देखें" : "View"}</button>
      </form>
      {selectedDistributorId && !snapshot && (
        <p className={styles.emptyHint}>{hi ? "इस वितरक के लिए डेटा लोड नहीं हो सका।" : "Could not load this distributor."}</p>
      )}
      {snapshot && (
        <div className={styles.notice} data-ok="true" style={{ gridColumn: "1/-1" }}>
          <p>
            <strong>{snapshot.distributor.name}</strong> · {snapshot.distributor.code}
            <br />
            <small>
              {snapshot.distributor.territory ?? (hi ? "क्षेत्र निर्दिष्ट नहीं" : "No territory recorded")} · {snapshot.distributor.status ?? "—"} ·{" "}
              {hi ? "अंतिम गतिविधि" : "Last activity"}: {fmtDate(snapshot.distributor.lastActivity)}
            </small>
          </p>

          <h3>{hi ? "खुदरा ऑर्डर" : "Retailer orders"}</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
            <div><dt>{hi ? "लंबित निर्णय" : "Pending decision"}</dt><dd>{snapshot.orders.pendingCount}</dd></div>
            <div><dt>{hi ? "स्वीकृत" : "Accepted"}</dt><dd>{snapshot.orders.acceptedCount}</dd></div>
            <div><dt>{hi ? "आंशिक" : "Partial"}</dt><dd>{snapshot.orders.partialCount}</dd></div>
            <div><dt>{hi ? "अस्वीकृत" : "Rejected"}</dt><dd>{snapshot.orders.rejectedCount}</dd></div>
            <div><dt>{hi ? "लंबित डिलीवरी" : "Pending deliveries"}</dt><dd>{snapshot.deliveries.pendingCount}</dd></div>
          </dl>
          {snapshot.orders.pending.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>{hi ? "रिटेलर" : "Retailer"}</th><th>{hi ? "ऑर्डर" : "Order"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "समय" : "Placed"}</th></tr></thead>
                <tbody>
                  {snapshot.orders.pending.slice(0, 10).map((o) => (
                    <tr key={o.id}><td>{o.retailer}</td><td>{o.orderNumber}</td><td>{money(o.total)}</td><td>{fmtDate(o.placedAt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {snapshot.remainingQtyExceptions.length > 0 && (
            <>
              <h3>{hi ? "शेष मात्रा अपवाद" : "Remaining quantity exceptions"}</h3>
              <ul className={styles.list}>
                {snapshot.remainingQtyExceptions.map((o) => (
                  <li key={o.id}>{o.retailer} · {o.orderNumber} · {hi ? "शेष" : "remaining"}: {o.remaining}</li>
                ))}
              </ul>
            </>
          )}

          <h3>{hi ? "वितरक → S.S. ऑर्डर" : "Distributor → S.S. orders"}</h3>
          {snapshot.ssOrders.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>S.S.</th><th>{hi ? "ऑर्डर" : "Order"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "स्थिति" : "Status"}</th><th>{hi ? "समय" : "Placed"}</th></tr></thead>
                <tbody>
                  {snapshot.ssOrders.slice(0, 10).map((o) => (
                    <tr key={o.id}><td>{o.superStockist}</td><td>{o.orderNumber}</td><td>{money(o.total)}</td><td><span className={styles.badge}>{o.status}</span></td><td>{fmtDate(o.placedAt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyHint}>{hi ? "कोई S.S. ऑर्डर नहीं।" : "No S.S. orders yet."}</p>
          )}

          <h3>{hi ? "स्टॉक" : "Stock"}</h3>
          {snapshot.stock.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>{hi ? "उत्पाद" : "Product"}</th><th>{hi ? "उपलब्ध" : "Available"}</th><th>{hi ? "आरक्षित" : "Reserved"}</th><th>{hi ? "आ रहा है" : "Incoming"}</th></tr></thead>
                <tbody>
                  {snapshot.stock.map((s) => (
                    <tr key={s.skuId} data-short={s.available === 0}>
                      <td><span className={styles.badge}>{s.brand === "Seera" ? "SEERA" : "MUV"}</span> {s.productName}</td>
                      <td>{s.available}</td><td>{s.reserved}</td><td>{s.incoming}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyHint}>{hi ? "कोई स्टॉक गतिविधि दर्ज नहीं।" : "No stock movement recorded yet."}</p>
          )}

          <h3>{hi ? "पैसा" : "Money"}</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
            <div><dt>{hi ? "बकाया" : "Outstanding"}</dt><dd>{money(snapshot.money.outstanding)}</dd></div>
            <div><dt>{hi ? "अतिदेय" : "Overdue"}</dt><dd>{money(snapshot.money.overdue)}</dd></div>
            <div><dt>{hi ? "उपलब्ध क्रेडिट" : "Available credit"}</dt><dd>{snapshot.money.availableCredit == null ? "—" : money(snapshot.money.availableCredit)}</dd></div>
            <div><dt>{hi ? "अंतिम भुगतान" : "Last payment"}</dt><dd>{snapshot.money.lastPayment ? `${money(snapshot.money.lastPayment.amount)} · ${fmtDate(snapshot.money.lastPayment.postedAt)}` : "—"}</dd></div>
          </dl>

          <h3>{hi ? "अपवाद" : "Exceptions"}</h3>
          {snapshot.exceptions.returns.length === 0 && snapshot.exceptions.claims.length === 0 && snapshot.exceptions.shortReceipts.length === 0 ? (
            <p className={styles.emptyHint}>{hi ? "कोई खुला अपवाद नहीं।" : "No open exceptions."}</p>
          ) : (
            <ul className={styles.list}>
              {snapshot.exceptions.returns.map((r) => (
                <li key={r.id}>{hi ? "वापसी" : "Return"} {r.requestNumber} · {r.condition} × {r.quantity} · {r.status}</li>
              ))}
              {snapshot.exceptions.claims.map((c) => (
                <li key={c.id}>{hi ? "दावा" : "Claim"} {c.claimNumber} · {c.type} · {c.status}</li>
              ))}
              {snapshot.exceptions.shortReceipts.map((s) => (
                <li key={s.id}>{hi ? "कम प्राप्ति" : "Short receipt"} {s.orderNumber} · {s.status}</li>
              ))}
            </ul>
          )}
          <p className={styles.emptyHint}>
            {hi ? "यह दृश्य केवल पर्यवेक्षण के लिए है — कोई राशि या स्टॉक यहाँ से संपादित नहीं किया जा सकता।" : "This is a supervisory read-only view — no balance or stock can be edited from here."}
          </p>
        </div>
      )}
    </section>
  );
}
