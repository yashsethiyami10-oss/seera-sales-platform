import Link from "next/link";
import styles from "./ProductSurface.module.css";
import journeyStyles from "./FieldJourney.module.css";

type Summary = {
  cards: {
    newOrders: number;
    pendingDeliveries: number;
    stockAlerts: number;
    incomingStock: number;
    outstanding: number;
    ssOrdersRequested: number;
  };
  attention: { code: string; title: string; deepLink: string }[];
};

const money = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function DistributorDashboardSummary({ language, summary, portal }: { language: "EN" | "HI"; summary: Summary; portal: string }) {
  const hi = language === "HI";
  const cards: { label: string; value: string; href: string }[] = [
    { label: hi ? "नए रिटेलर ऑर्डर" : "New retailer orders", value: String(summary.cards.newOrders), href: "fulfilment" },
    { label: hi ? "लंबित डिलीवरी" : "Pending deliveries", value: String(summary.cards.pendingDeliveries), href: "fulfilment" },
    { label: hi ? "स्टॉक अलर्ट" : "Stock alerts", value: String(summary.cards.stockAlerts), href: "inventory" },
    { label: hi ? "आने वाला स्टॉक" : "Incoming stock", value: String(summary.cards.incomingStock), href: "incoming-stock" },
    { label: hi ? "बकाया / क्रेडिट" : "Outstanding / credit", value: money(summary.cards.outstanding), href: "credit" },
    { label: hi ? "S.S. से ऑर्डर" : "Order from S.S.", value: String(summary.cards.ssOrdersRequested), href: "replenishment" },
  ];
  return (
    <section className={styles.panel} style={{ marginBottom: 18 }}>
      <div>
        <small>{hi ? "आज" : "TODAY"}</small>
        <h2>{hi ? "वितरक डैशबोर्ड" : "Distributor dashboard"}</h2>
      </div>
      <dl className={journeyStyles.statGrid} style={{ gridColumn: "1/-1" }}>
        {cards.map((c) => (
          <div key={c.label}>
            <dt>
              <Link href={`/portal/${portal}/${c.href}`}>{c.label}</Link>
            </dt>
            <dd>{c.value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <small>{hi ? "आज ध्यान देने योग्य" : "WHAT NEEDS YOUR ATTENTION TODAY"}</small>
      </div>
      {summary.attention.length ? (
        <ul style={{ gridColumn: "1/-1", display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {summary.attention.map((a) => (
            <li key={a.code} style={{ padding: 10, border: "1px solid #ead8d2", borderRadius: 9 }}>
              <Link href={`/portal/${portal}/${a.deepLink}`}>{a.title} →</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ gridColumn: "1/-1", margin: 0 }}>{hi ? "आज कुछ भी लंबित नहीं है।" : "Nothing is waiting today."}</p>
      )}
    </section>
  );
}
