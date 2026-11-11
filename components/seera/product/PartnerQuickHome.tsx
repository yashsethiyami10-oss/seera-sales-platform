import Link from "@/components/seera/foundation/PortalLink";
import type { PartnerSnapshot } from "@/lib/sales-distribution/partner-insight-service";
import { ProtectedData } from "./ProtectedData";
import styles from "./PartnerQuickHome.module.css";

// Distributor / Super Stockist home, top of the page: four big tap targets for the daily jobs,
// then "how is my business doing" in plain numbers. Customer names are shown for working, never
// offered as a download (ProtectedData blocks copy / print / save on this block).

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export function PartnerQuickHome({ language, portal, snapshot, permissions }: { language: "EN" | "HI"; portal: "distributor" | "super-stockist"; snapshot: PartnerSnapshot | null; permissions: Set<string> }) {
  const hi = language === "HI";
  const base = `/portal/${portal}`;
  const actions =
    portal === "distributor"
      ? [
          { href: `${base}/replenishment`, icon: "🛒", en: "Order from S.S.", hiL: "S.S. से ऑर्डर", subEn: "Repeat last order in 2 taps", subHi: "2 टैप में पिछला ऑर्डर", tone: "primary", perm: "distributor_replenishment:create" },
          { href: `${base}/fulfilment`, icon: "📦", en: "Retailer orders", hiL: "रिटेलर ऑर्डर", subEn: "Accept & deliver", subHi: "स्वीकार और डिलीवर", tone: "", perm: "distributor_orders:fulfil" },
          { href: `${base}/inventory`, icon: "▦", en: "My stock", hiL: "मेरा स्टॉक", subEn: "What’s low, what’s out", subHi: "क्या कम, क्या खत्म", tone: "", perm: "distributor_inventory:view" },
          { href: `${base}/credit`, icon: "₹", en: "Money", hiL: "पैसा", subEn: "Outstanding & payments", subHi: "बकाया और भुगतान", tone: "", perm: "distributor_credit:view" },
        ]
      : [
          { href: `${base}/company-orders`, icon: "🛒", en: "Order from Company", hiL: "कंपनी से ऑर्डर", subEn: "Repeat last order in 2 taps", subHi: "2 टैप में पिछला ऑर्डर", tone: "primary", perm: "company_replenishment:create" },
          { href: `${base}/distributor-orders`, icon: "📦", en: "Distributor orders", hiL: "वितरक ऑर्डर", subEn: "Accept & dispatch", subHi: "स्वीकार और डिस्पैच", tone: "", perm: "super_stockist_orders:view" },
          { href: `${base}/inventory`, icon: "▦", en: "My stock", hiL: "मेरा स्टॉक", subEn: "What’s low, what’s out", subHi: "क्या कम, क्या खत्म", tone: "", perm: "super_stockist_inventory:view" },
          { href: `${base}/outstanding`, icon: "₹", en: "Money", hiL: "पैसा", subEn: "Who owes what", subHi: "किसका कितना बकाया", tone: "", perm: "ledger:view" },
        ];
  const visible = actions.filter((a) => permissions.has(a.perm) || permissions.has("system:super_admin"));
  const customerWord = portal === "distributor" ? (hi ? "रिटेलर" : "retailers") : hi ? "वितरक" : "distributors";
  return (
    <section className={styles.home}>
      <div className={styles.actions}>
        {visible.map((a) => (
          <Link key={a.href} href={a.href} className={styles.action3d} data-tone={a.tone || undefined}>
            <b aria-hidden>{a.icon}</b>
            <span>{hi ? a.hiL : a.en}</span>
            <small>{hi ? a.subHi : a.subEn}</small>
          </Link>
        ))}
      </div>
      {snapshot && (
        <>
          <div className={styles.kpis}>
            <article data-tone="main">
              <small>{hi ? "इस महीने की बिक्री" : "Sales this month"}</small>
              <strong>{inr(snapshot.month.value)}</strong>
              <span>
                {snapshot.growthPct === null
                  ? hi ? `${snapshot.month.orders} ऑर्डर` : `${snapshot.month.orders} orders`
                  : snapshot.growthPct >= 0
                    ? `▲ ${snapshot.growthPct}% ${hi ? "पिछले महीने से" : "vs last month"}`
                    : `▼ ${Math.abs(snapshot.growthPct)}% ${hi ? "पिछले महीने से" : "vs last month"}`}
              </span>
            </article>
            <article>
              <small>{hi ? "आज" : "Today"}</small>
              <strong>{inr(snapshot.today.value)}</strong>
              <span>{snapshot.today.orders} {hi ? "ऑर्डर" : "orders"}</span>
            </article>
            <article>
              <small>{hi ? "पिछला महीना (पूरा)" : "Last month (full)"}</small>
              <strong>{inr(snapshot.lastMonth.full)}</strong>
              <span>{hi ? "इसी तारीख तक" : "same date"} {inr(snapshot.lastMonth.toDate)}</span>
            </article>
            <article>
              <small>{hi ? `इस महीने खरीदने वाले ${customerWord}` : `Buying ${customerWord} this month`}</small>
              <strong>{snapshot.month.activeCustomers}<em> / {snapshot.customers90d}</em></strong>
              <span>{hi ? "90 दिन में कुल" : "of active in 90 days"}</span>
            </article>
          </div>
          <ProtectedData language={language} className={styles.lists}>
            <div>
              <h3>{hi ? `इस महीने के टॉप ${customerWord}` : `Top ${customerWord} this month`}</h3>
              {snapshot.topCustomers.length ? (
                <ol>
                  {snapshot.topCustomers.map((c) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <b>{inr(c.value)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{hi ? "इस महीने अभी कोई बिक्री नहीं।" : "No sales yet this month."}</p>
              )}
            </div>
            <div>
              <h3>{hi ? `30+ दिन से चुप ${customerWord} (${snapshot.quietCount})` : `Quiet for 30+ days (${snapshot.quietCount})`}</h3>
              {snapshot.quietCustomers.length ? (
                <ol>
                  {snapshot.quietCustomers.map((c) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <b>{c.days} {hi ? "दिन" : "days"}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{hi ? "सब सक्रिय हैं — बढ़िया!" : "Everyone is ordering — great!"}</p>
              )}
            </div>
          </ProtectedData>
        </>
      )}
    </section>
  );
}
