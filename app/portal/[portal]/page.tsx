import { notFound, redirect } from "next/navigation";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { isSeeraPortalKey, SEERA_PORTALS } from "@/lib/foundation/portal-registry";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { prisma } from "@/lib/database/client";
import { unstable_noStore as noStore } from "next/cache";
import { LanguageSelector } from "@/components/seera/LanguageSelector";
import { localizedPortal, normalizeLanguage, translate, type BilingualPortal, type UiLanguage } from "@/lib/sales-distribution/localization";
import { PhaseCompletionPanel } from "@/components/seera/PhaseCompletionPanel";
import { Phase10Dashboard } from "@/components/seera/phase-10/Phase10Dashboard";
import { getDashboard } from "@/lib/phase-10/dashboard-service";
import type { AnalyticsPortal } from "@/lib/phase-10/scope";
import type { TimePreset } from "@/lib/phase-10/time-intelligence";
import { OfflineStatus } from "@/components/seera/phase-11/OfflineStatus";
import styles from "./portal.module.css";

const messages: Record<string, string> = {
  "founder-admin": "Seera Admin Foundation", "company-admin": "Seera Admin Foundation",
  accounts: "Seera Accounts Portal — financial workflows arrive in Phase 8.",
  "sales-manager": "Seera Sales Manager Portal — team workflows arrive in Phase 3.",
  "sales-executive": "Seera Sales Executive Portal — field workflows arrive in Phase 3.",
  distributor: "Seera Distributor Portal — operational workflows arrive in Phase 4.",
  "super-stockist": "Seera Super Stockist Portal — workflows arrive in Phase 5.",
  retailer: "Seera Retailer Portal — workflows arrive in a later governed phase.",
};
const PERIODS=new Set<TimePreset>(["TODAY","YESTERDAY","THIS_WEEK","LAST_WEEK","THIS_MONTH","LAST_MONTH","QUARTER","YTD","FINANCIAL_YEAR"]);
export default async function PortalShell({ params,searchParams }: { params: Promise<{ portal: string }>;searchParams:Promise<{period?:string}> }) {
  noStore();
  const { portal } = await params; if (!isSeeraPortalKey(portal)) notFound();
  let language: UiLanguage = "EN";
  try {
    const { user } = await resolveRequestIdentity(); const definition = SEERA_PORTALS[portal];
    language = normalizeLanguage(user.preferredLanguage);
    await authorize(prisma, { actorId: user.id, permission: definition.requiredPermission, ...(definition.featureFlag ? { featureFlag: definition.featureFlag } : {}) });
    const permissions=portal==="distributor"?await effectivePermissions(prisma,user.id):undefined,deliveryOnly=Boolean(permissions?.has("distributor_delivery:execute")&&!permissions.has("distributor_orders:view"));
    const bilingualPortals = ["founder-admin", "accounts", "sales-manager", "sales-executive", "distributor", "super-stockist"] as const;
    let experience = bilingualPortals.includes(portal as never) ? localizedPortal(language, portal as BilingualPortal) : undefined;
    if(deliveryOnly)experience=language==="HI"?{title:"सीरा डिलीवरी पोर्टल",dashboard:"मेरी अधिकृत डिलीवरी और प्राप्ति",terminology:"डिलीवरी संचालन",navigation:["आज की डिलीवरी","मार्ग","प्राप्ति प्रमाण","लंबित डिलीवरी","सूचनाएँ"]}:{title:"Seera Delivery Portal",dashboard:"My authorized deliveries and receipts",terminology:"Delivery operations",navigation:["Today’s Deliveries","Route","Proof of Delivery","Pending Deliveries","Notifications"]};
    const requestedPeriod=(await searchParams).period as TimePreset|undefined;const period=requestedPeriod&&PERIODS.has(requestedPeriod)?requestedPeriod:"FINANCIAL_YEAR";
    let analytics:Awaited<ReturnType<typeof getDashboard>>|undefined,analyticsUnavailable=false;
    if(experience&&!deliveryOnly)try{analytics=await getDashboard(prisma,user.id,portal as AnalyticsPortal,period);}catch(error){analyticsUnavailable=true;console.error("[SEERA] portal analytics unavailable",{portal,errorName:error instanceof Error?error.name:"UnknownError"});}
    return <main lang={language === "HI" ? "hi" : "en"} className={styles.shell} data-portal={portal} data-language={language}>
      <section className={styles.hero}><div className={styles.topbar}><div><p className={styles.eyebrow}>{translate(language, "protectedPortal")}</p><h1 className={styles.title}>{experience?.title ?? messages[portal]}</h1><p className={styles.identity}>{translate(language, "authenticatedAs")}: {user.name ?? user.email}</p></div><LanguageSelector initialLanguage={language} labels={{ language: translate(language, "language"), english: translate(language, "english"), hindi: translate(language, "hindi") }} /></div>
      {experience ? <><p className={styles.summary}>{experience.dashboard}</p><nav className={styles.nav} aria-label={`${experience.title} navigation`}><ul>{experience.navigation.map((item) => <li key={item}>{item}</li>)}</ul></nav><small className={styles.terminology}>{experience.terminology}</small></> : <p>{translate(language, "reserved")}</p>}</section>
      {experience&&<div className={styles.content}>{portal==="sales-executive"&&<OfflineStatus language={language}/>} {analytics&&<Phase10Dashboard data={analytics} language={language}/>} {analyticsUnavailable&&<p role="status">{language==="HI"?"विश्लेषण अभी उपलब्ध नहीं है। कृपया पुनः प्रयास करें।":"Analytics is temporarily unavailable. Please retry."}</p>} {!deliveryOnly&&["accounts","sales-manager","founder-admin","distributor","super-stockist"].includes(portal)&&<PhaseCompletionPanel portal={portal} language={language}/>}</div>}
    </main>;
  } catch (error) {
    if (error instanceof FoundationError && error.status === 401) redirect(`/login?next=/portal/${portal}`);
    const disabled=error instanceof FoundationError&&error.code==="PORTAL_DISABLED";return <main lang={language === "HI" ? "hi" : "en"} style={{maxWidth:760,margin:"0 auto",padding:"72px 24px",fontFamily:'system-ui, "Noto Sans Devanagari", "Mangal", sans-serif'}}><h1>{translate(language,disabled?"unavailable":"accessDenied")}</h1><p>{translate(language,disabled?"disabledMessage":"deniedMessage")}</p></main>;
  }
}
