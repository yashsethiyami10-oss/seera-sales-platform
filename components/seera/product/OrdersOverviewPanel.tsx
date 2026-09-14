import Link from "next/link";
import type { OrderBucket, OrderRow } from "@/lib/sales-distribution/orders-overview-service";
import styles from "./OrdersOverviewPanel.module.css";

const money = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const BUCKET_LABEL: Record<OrderBucket, { en: string; hi: string; tone: string }> = {
  PENDING: { en: "Pending", hi: "लंबित", tone: "warning" },
  PROCESSING: { en: "Processing", hi: "प्रोसेसिंग में", tone: "info" },
  DISPATCHED: { en: "Dispatched", hi: "डिस्पैच किया गया", tone: "analytical" },
  DELIVERED: { en: "Delivered", hi: "डिलीवर किया गया", tone: "success" },
  CANCELLED: { en: "Cancelled", hi: "रद्द", tone: "danger" },
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", AWAITING_PAYMENT: "Awaiting payment", PAYMENT_UNDER_REVIEW: "Payment under review", CONFIRMED: "Confirmed", SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged", PARTIAL_ACCEPTED: "Partially accepted", ACCEPTED: "Accepted", HELD: "On hold", ALLOCATED: "Allocated", DISPATCH_READY: "Ready to dispatch",
  DISPATCHED: "Dispatched", PARTIAL_DELIVERED: "Partially delivered", DELIVERED: "Delivered", CLOSED: "Closed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

export function OrdersOverviewPanel({
  language, base, q, activeBucket, showCreateInvoice,
  data,
}: {
  language: "EN" | "HI";
  base: string;
  q: string;
  activeBucket?: OrderBucket;
  showCreateInvoice?: boolean;
  data: { rows: OrderRow[]; totalOrders: number; totalValue: number; todayCount: number; todayValue: number; buckets: Record<OrderBucket, number>; page: number; hasMore: boolean };
}) {
  const hi = language === "HI";
  return (
    <div className={styles.wrap}>
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{hi ? "आज ऑर्डर" : "TODAY'S ORDERS"}</span>
          <strong className={styles.kpiValue}>{data.todayCount}</strong>
          <span className={styles.kpiSub}>{money(data.todayValue)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{hi ? "कुल मूल्य" : "TOTAL VALUE"}</span>
          <strong className={styles.kpiValue}>{money(data.totalValue)}</strong>
          <span className={styles.kpiSub}>{data.totalOrders} {hi ? "ऑर्डर" : "orders"}</span>
        </div>
        {(Object.keys(BUCKET_LABEL) as OrderBucket[]).map((b) => (
          <Link key={b} href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(activeBucket === b ? {} : { status: b }) }).toString()}`} className={styles.kpiCard} data-active={activeBucket === b} data-tone={BUCKET_LABEL[b].tone}>
            <span className={styles.kpiLabel}>{hi ? BUCKET_LABEL[b].hi : BUCKET_LABEL[b].en}</span>
            <strong className={styles.kpiValue}>{data.buckets[b]}</strong>
            <span className={styles.kpiSub}>{activeBucket === b ? (hi ? "फ़िल्टर हटाएं ✕" : "Clear filter ✕") : (hi ? "फ़िल्टर करें →" : "Filter →")}</span>
          </Link>
        ))}
      </div>

      <div className={styles.toolbar}>
        <form method="get" className={styles.searchForm}>
          {activeBucket && <input type="hidden" name="status" value={activeBucket} />}
          <input type="text" name="q" defaultValue={q} placeholder={hi ? "ग्राहक, ऑर्डर # या फ़ोन खोजें" : "Search customer, order # or phone"} />
          <button type="submit">{hi ? "खोजें" : "Search"}</button>
        </form>
        {showCreateInvoice && <Link href="finance-os?open=invoice" className={styles.createInvoice}>{hi ? "+ चालान बनाएं" : "+ CREATE INVOICE"}</Link>}
      </div>

      {data.rows.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>{hi ? "कोई ऑर्डर नहीं मिला" : "No orders found"}</strong>
          <p>{q || activeBucket ? (hi ? "अपनी खोज/फ़िल्टर बदलकर पुनः प्रयास करें।" : "Try a different search or filter.") : (hi ? "अभी तक कोई ऑर्डर दर्ज नहीं है।" : "No orders recorded yet.")}</p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{hi ? "ग्राहक" : "Customer"}</th>
                  <th>{hi ? "ऑर्डर" : "Order"}</th>
                  <th>{hi ? "राशि" : "Amount"}</th>
                  <th>{hi ? "स्थिति" : "Status"}</th>
                  <th>{hi ? "दिनांक" : "Date"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className={styles.cardRow}>
                    <td data-label={hi ? "ग्राहक" : "Customer"}><strong>{r.customerName}</strong>{r.salespersonName && <div className={styles.rowSub}>{r.salespersonName}</div>}</td>
                    <td data-label={hi ? "ऑर्डर" : "Order"}>{r.orderNumber}<div className={styles.rowSub}>{r.itemCount} {hi ? "आइटम" : "items"}</div></td>
                    <td data-label={hi ? "राशि" : "Amount"}>{money(r.amount)}</td>
                    <td data-label={hi ? "स्थिति" : "Status"}><span className={styles.statusPill} data-tone={BUCKET_LABEL[r.bucket].tone}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td data-label={hi ? "दिनांक" : "Date"}>{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                    <td><Link href={`${base}/${r.id}`} className={styles.viewLink}>{hi ? "देखें" : "VIEW ORDER"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.page > 1 || data.hasMore) && (
            <div className={styles.pagination}>
              {data.page > 1 && <Link href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(activeBucket ? { status: activeBucket } : {}), page: String(data.page - 1) }).toString()}`}>{hi ? "← पिछला" : "← Previous"}</Link>}
              {data.hasMore && <Link href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(activeBucket ? { status: activeBucket } : {}), page: String(data.page + 1) }).toString()}`}>{hi ? "अगला →" : "Next →"}</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
