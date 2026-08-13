import Link from "next/link";
import styles from "./ProductSurface.module.css";
import journeyStyles from "./FieldJourney.module.css";

type Summary = {
  cards: {
    companyProofsPending: number;
    partnerPaymentsPending: number;
    reconciliationExceptions: number;
    recentReversals30d: number;
    openClaimsUnsettled: number;
    totalReceivables: number;
    totalOverdue: number;
  };
  attention: { code: string; title: string; deepLink: string }[];
};

export function AccountsDashboardSummary({ language, summary, portal }: { language: "EN" | "HI"; summary: Summary; portal: string }) {
  const hi = language === "HI";
  const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
  const cards: { label: string; value: string; href: string }[] = [
    { label: hi ? "कंपनी भुगतान प्रमाण लंबित" : "Company payment proof pending", value: String(summary.cards.companyProofsPending), href: "payment-inbox" },
    { label: hi ? "साझेदार भुगतान लंबित" : "Partner payment pending", value: String(summary.cards.partnerPaymentsPending), href: "payments" },
    { label: hi ? "कुल प्राप्य" : "Total receivables", value: money(summary.cards.totalReceivables), href: "outstanding" },
    { label: hi ? "अतिदेय" : "Overdue", value: money(summary.cards.totalOverdue), href: "ageing" },
    { label: hi ? "मिलान अपवाद" : "Reconciliation exceptions", value: String(summary.cards.reconciliationExceptions), href: "reconciliation" },
    { label: hi ? "खुले दावे" : "Open claims", value: String(summary.cards.openClaimsUnsettled), href: "claims" },
    { label: hi ? "हाल के रिवर्सल (30 दिन)" : "Recent reversals (30d)", value: String(summary.cards.recentReversals30d), href: "reversals" },
  ];
  return (
    <section className={styles.panel} style={{ marginBottom: 18 }}>
      <div>
        <small>{hi ? "आज" : "TODAY"}</small>
        <h2>{hi ? "वित्तीय नियंत्रण डैशबोर्ड" : "Financial control dashboard"}</h2>
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
