import Link from "@/components/seera/foundation/PortalLink";
import type { UiLanguage } from "@prisma/client";
import { surfaceItems, surfaceLabel } from "@/lib/foundation/product-surface";
import styles from "./ProductHome.module.css";

// One-line "what you do here" for the field-sales cards; anything unlisted keeps the generic line.
const HINTS: Record<string, [string, string]> = {
  today: ["Start your day, visit shops, book orders", "दिन शुरू करें, दुकान विज़िट करें, ऑर्डर लें"],
  "my-day": ["Start your day and work your own beat", "दिन शुरू करें और अपनी बीट पर काम करें"],
  beat: ["See today's route and planned shops", "आज का रूट और योजनाबद्ध दुकानें देखें"],
  "beat-planner": ["Plan and publish beats for your team", "टीम के लिए बीट बनाएं और प्रकाशित करें"],
  retailers: ["Find a shop, call or WhatsApp, see history", "दुकान खोजें, कॉल/व्हाट्सएप करें, इतिहास देखें"],
  orders: ["Track every order you booked", "अपने बुक किए हर ऑर्डर को ट्रैक करें"],
  collections: ["Record bank, UPI or cheque payments", "बैंक, UPI या चेक भुगतान दर्ज करें"],
  "market-survey": ["Capture competitor and shelf insights", "प्रतिस्पर्धी और शेल्फ़ जानकारी दर्ज करें"],
  prospects: ["Log new distributor leads", "नए वितरक लीड दर्ज करें"],
  "distributor-search": ["Log new distributor leads", "नए वितरक लीड दर्ज करें"],
  targets: ["How close you are to this month's target", "इस महीने के लक्ष्य से आप कितनी दूर हैं"],
  "delivered-sales": ["Orders actually delivered — counts for target", "वास्तव में डिलीवर ऑर्डर — लक्ष्य में गिने जाते हैं"],
  dsr: ["Daily sales report and past days", "दैनिक बिक्री रिपोर्ट और पिछले दिन"],
  team: ["Who is working, where, right now", "अभी कौन, कहाँ काम कर रहा है"],
  "team-review": ["Review each executive's day", "हर एग्जीक्यूटिव का दिन देखें"],
  approvals: ["Pending requests waiting for you", "आपकी मंज़ूरी के लिए लंबित अनुरोध"],
  attendance: ["Team attendance and corrections", "टीम उपस्थिति और सुधार"],
  "joint-working": ["Work a beat alongside an executive", "एग्जीक्यूटिव के साथ बीट पर काम करें"],
  "ta-expenses": ["Your travel allowance and claims", "आपका यात्रा भत्ता और दावे"],
  sync: ["Check offline orders waiting to upload", "अपलोड के लिए रुके ऑफ़लाइन ऑर्डर देखें"],
  instructions: ["Tasks and notes from your manager", "आपके मैनेजर के काम और निर्देश"],
};

export function ProductHome({
  portal,
  permissions,
  language,
}: {
  portal: string;
  permissions: Set<string>;
  language: UiLanguage;
}) {
  const hi = language === "HI",
    items = surfaceItems(portal, permissions).filter(
      (x) =>
        ![
          "profile",
          "notifications",
          "settings",
          "roles",
          "users",
          "system",
        ].includes(x.slug),
    ),
    // Field roles: the home page shows only daily-work and progress cards; personal/system pages
    // stay one tap away in the sidebar's "More" group so the home screen is not a wall of options.
    fieldRole = portal === "sales-executive" || portal === "sales-manager",
    cards = fieldRole ? items.filter((x) => x.group?.[0] !== "MORE") : items,
    startHref = portal === "sales-executive" ? `/portal/${portal}/today` : portal === "sales-manager" ? `/portal/${portal}/my-day` : null;
  return (
    <section className={styles.work}>
      {startHref && items.some((x) => startHref.endsWith(`/${x.slug}`)) && (
        <Link className={styles.startCta} href={startHref}>
          <span>
            <strong>{hi ? "आज का काम शुरू करें" : "Start today’s work"}</strong>
            <small>{hi ? "दिन शुरू → दुकान विज़िट → ऑर्डर → दिन समाप्त" : "Start day → Visit shops → Book orders → End day"}</small>
          </span>
          <i aria-hidden>→</i>
        </Link>
      )}
      <div>
        <p className={styles.eyebrow}>{hi ? "त्वरित पहुँच" : "QUICK ACCESS"}</p>
        <h2>{fieldRole ? (hi ? "आपके काम" : "Your work") : hi ? "आपका संचालन कार्यक्षेत्र" : "Your operating workspace"}</h2>
        <p>
          {fieldRole
            ? hi
              ? "जिस काम को करना है, उसका कार्ड दबाएँ।"
              : "Tap a card to open that part of your work."
            : hi
              ? "व्यावसायिक नाम, स्थिति और दायरे के साथ लाइव रिकॉर्ड खोलें।"
              : "Open live records with business names, statuses and your authorized scope."}
        </p>
      </div>
      <div className={styles.grid}>
        {cards.slice(0, 15).map((x) => (
          <Link key={x.slug} href={`/portal/${portal}/${x.slug}`}>
            <b aria-hidden>{x.icon}</b>
            <span>
              <strong>{surfaceLabel(x, language)}</strong>
              <small>
                {HINTS[x.slug]?.[hi ? 1 : 0] ?? (hi ? "अधिकृत कार्यक्षेत्र खोलें" : "Open authorized workspace")}
              </small>
            </span>
            <i aria-hidden>→</i>
          </Link>
        ))}
      </div>
    </section>
  );
}
