import Link from "next/link";
import styles from "./ProductSurface.module.css";
import journeyStyles from "./FieldJourney.module.css";

type Summary = {
  cards: {
    distributorOrdersWaiting: number;
    dispatchPending: number;
    incomingFromCompany: number;
    lowStock: number;
    creditAlerts: number;
    companyOrdersAwaitingPayment: number;
    ownOverdueToCompany: number;
  };
  attention: { code: string; title: string; deepLink: string }[];
};

export function SuperStockistDashboardSummary({ language, summary, portal }: { language: "EN" | "HI"; summary: Summary; portal: string }) {
  const hi = language === "HI";
  const cards: { label: string; value: string; href: string }[] = [
    { label: hi ? "वितरक ऑर्डर लंबित" : "Distributor orders waiting", value: String(summary.cards.distributorOrdersWaiting), href: "distributor-orders" },
    { label: hi ? "डिस्पैच लंबित" : "Dispatch pending", value: String(summary.cards.dispatchPending), href: "dispatch" },
    { label: hi ? "कंपनी से आ रहा है" : "Incoming from Company", value: String(summary.cards.incomingFromCompany), href: "receipts" },
    { label: hi ? "कम स्टॉक" : "Low stock", value: String(summary.cards.lowStock), href: "inventory" },
    { label: hi ? "क्रेडिट अलर्ट" : "Credit alerts", value: String(summary.cards.creditAlerts), href: "credit" },
    { label: hi ? "कंपनी ऑर्डर / भुगतान" : "Company order / payment", value: String(summary.cards.companyOrdersAwaitingPayment), href: "company-orders" },
    { label: hi ? "कंपनी को आपका अतिदेय" : "Your overdue to Company", value: `₹${summary.cards.ownOverdueToCompany.toLocaleString("en-IN")}`, href: "outstanding" },
  ];
  return (
    <section className={styles.panel} style={{ marginBottom: 18 }}>
      <div>
        <small>{hi ? "आज" : "TODAY"}</small>
        <h2>{hi ? "सुपर स्टॉकिस्ट डैशबोर्ड" : "Super Stockist dashboard"}</h2>
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
