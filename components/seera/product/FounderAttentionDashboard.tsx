import Link from "next/link";
import styles from "./ProductSurface.module.css";
import journeyStyles from "./FieldJourney.module.css";

type Summary = {
  cards: {
    companyOrdersAwaitingProof: number;
    companyOrdersAwaitingVerification: number;
    companyOrdersReadyForDispatch: number;
    companyOrdersAwaitingSsReceipt: number;
    activeDistributorsMissingCreditTerm: number;
    unmappedExecutives: number;
    skusMissingTaxConfig: number;
    deadLetteredCommunications: number;
    creditExtensionsPending: number;
    networkStockExceptions: number;
  };
  attention: { code: string; title: string; deepLink: string }[];
};

export function FounderAttentionDashboard({ language, summary, portal }: { language: "EN" | "HI"; summary: Summary; portal: string }) {
  const hi = language === "HI";
  const cards: { label: string; value: string; href: string }[] = [
    { label: hi ? "अग्रिम प्रमाण लंबित" : "Awaiting advance proof", value: String(summary.cards.companyOrdersAwaitingProof), href: "orders" },
    { label: hi ? "लेखा सत्यापन लंबित" : "Awaiting Accounts verification", value: String(summary.cards.companyOrdersAwaitingVerification), href: "payments" },
    { label: hi ? "डिस्पैच हेतु तैयार" : "Ready for dispatch", value: String(summary.cards.companyOrdersReadyForDispatch), href: "orders" },
    { label: hi ? "S.S. प्राप्ति लंबित" : "Awaiting S.S. receipt", value: String(summary.cards.companyOrdersAwaitingSsReceipt), href: "orders" },
    { label: hi ? "क्रेडिट शर्तें गुम" : "Distributors missing credit terms", value: String(summary.cards.activeDistributorsMissingCreditTerm), href: "distributors" },
    { label: hi ? "अनमैप्ड एग्जीक्यूटिव" : "Executives unmapped to a Manager", value: String(summary.cards.unmappedExecutives), href: "field-force" },
    { label: hi ? "GST कॉन्फ़िग गुम" : "SKUs missing GST config", value: String(summary.cards.skusMissingTaxConfig), href: "masters" },
    { label: hi ? "संचार विफल" : "Communications dead-lettered", value: String(summary.cards.deadLetteredCommunications), href: "notifications" },
    { label: hi ? "नेटवर्क स्टॉक अपवाद" : "Network stock exceptions", value: String(summary.cards.networkStockExceptions), href: "network-stock" },
  ];
  return (
    <section className={styles.panel} style={{ marginBottom: 18 }}>
      <div>
        <small>{hi ? "आज" : "TODAY"}</small>
        <h2>{hi ? "संस्थापक ध्यान डैशबोर्ड" : "Founder attention dashboard"}</h2>
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
