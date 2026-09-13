import Link from "next/link";
import styles from "./FounderHomeToday.module.css";

// MASTER UX mission §1 — Founder Home's "WHAT IS HAPPENING TODAY" financial summary. Every figure
// here is read straight off moneyDeskHome()'s existing kpis/needsAttention/pendingApprovals —
// the SAME canonical read model MoneyDeskPanel itself renders — so this is presentation only, not
// a second Finance truth. "Money In/Out Today" transaction counts are derived client-side (server
// component here) from the same recentTransactions window moneyDeskHome() already returns (most
// recent 25) rather than a new query; on an unusually high-volume day this can undercount, which
// is an honest, disclosed limitation, not a fabricated number.
type MoneyDeskHome = {
  kpis: {
    cashBalance: number;
    bankBalance: number;
    totalCashBank: number;
    todayInflow: number;
    todayOutflow: number;
    receivablesTotal: number;
    payablesTotal: number;
  };
  needsAttention: unknown[];
  pendingApprovals: unknown[];
  recentTransactions: { date: string | Date; direction: string; status: string }[];
};

const money = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const isoDate = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

export function FounderHomeToday({ language, home, portal }: { language: "EN" | "HI"; home: MoneyDeskHome; portal: string }) {
  const hi = language === "HI";
  const today = isoDate(new Date());
  const isToday = (d: string | Date) => isoDate(new Date(d)) === today;
  const moneyInCount = home.recentTransactions.filter((t) => isToday(t.date) && t.status === "POSTED" && (t.direction === "CASH_IN" || t.direction === "BANK_IN")).length;
  const moneyOutCount = home.recentTransactions.filter((t) => isToday(t.date) && t.status === "POSTED" && (t.direction === "CASH_OUT" || t.direction === "BANK_OUT")).length;

  const cards: { label: { en: string; hi: string }; value: string; sub: { en: string; hi: string }; href: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }[] = [
    // Colors carry fixed meaning across the product (MASTER UX mission's design system): a negative
    // cash position is a real problem, not neutral information, so it must render in the danger
    // tone rather than the same blue used for a healthy balance.
    { label: { en: "CASH & BANK", hi: "नकद और बैंक" }, value: money(home.kpis.totalCashBank), sub: { en: "View accounts →", hi: "खाते देखें →" }, href: "money-desk", tone: home.kpis.totalCashBank < 0 ? "danger" : "info" },
    { label: { en: "MONEY IN TODAY", hi: "आज पैसा प्राप्त" }, value: money(home.kpis.todayInflow), sub: { en: `${moneyInCount} transaction${moneyInCount === 1 ? "" : "s"} →`, hi: `${moneyInCount} लेनदेन →` }, href: "money-desk", tone: "success" },
    { label: { en: "MONEY OUT TODAY", hi: "आज पैसा गया" }, value: money(home.kpis.todayOutflow), sub: { en: `${moneyOutCount} transaction${moneyOutCount === 1 ? "" : "s"} →`, hi: `${moneyOutCount} लेनदेन →` }, href: "money-desk", tone: "warning" },
    { label: { en: "RECEIVABLES", hi: "प्राप्य" }, value: money(home.kpis.receivablesTotal), sub: { en: "View parties →", hi: "पार्टियां देखें →" }, href: "finance-os", tone: "info" },
    { label: { en: "PAYABLES", hi: "देय" }, value: money(home.kpis.payablesTotal), sub: { en: "View vendors →", hi: "विक्रेता देखें →" }, href: "finance-os", tone: "neutral" },
    { label: { en: "PENDING DECISIONS", hi: "लंबित निर्णय" }, value: String(home.pendingApprovals.length), sub: { en: "Review →", hi: "समीक्षा करें →" }, href: "money-desk", tone: home.pendingApprovals.length > 0 ? "warning" : "success" },
    { label: { en: "NEEDS ATTENTION", hi: "ध्यान देने योग्य" }, value: String(home.needsAttention.length), sub: { en: "Resolve →", hi: "हल करें →" }, href: "money-desk", tone: home.needsAttention.length > 0 ? "danger" : "success" },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <small>{hi ? "आज" : "TODAY"}</small>
        <h2>{hi ? "आज क्या हो रहा है" : "What's happening today"}</h2>
      </div>
      <div className={styles.actions}>
        <Link href={`/portal/${portal}/money-desk?open=in`} className={styles.actionPrimary}>{hi ? "+ पैसा प्राप्त" : "+ MONEY IN"}</Link>
        <Link href={`/portal/${portal}/money-desk?open=out`} className={styles.actionSecondary}>{hi ? "− पैसा गया" : "− MONEY OUT"}</Link>
        <Link href={`/portal/${portal}/finance-os?open=invoice`} className={styles.actionSecondary}>{hi ? "+ चालान बनाएं" : "+ CREATE INVOICE"}</Link>
      </div>
      <div className={styles.grid}>
        {cards.map((c) => (
          <Link key={c.label.en} href={`/portal/${portal}/${c.href}`} className={styles.card} data-tone={c.tone}>
            <span className={styles.cardLabel}>{hi ? c.label.hi : c.label.en}</span>
            <strong className={styles.cardValue}>{c.value}</strong>
            <span className={styles.cardSub}>{hi ? c.sub.hi : c.sub.en}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
