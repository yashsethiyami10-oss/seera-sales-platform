import { notFound, redirect } from "next/navigation";
import { authorize } from "@/lib/foundation/authorization-service";
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
    const bilingualPortals = ["founder-admin", "accounts", "sales-manager", "sales-executive", "distributor", "super-stockist"] as const;
    const experience = bilingualPortals.includes(portal as never) ? localizedPortal(language, portal as BilingualPortal) : undefined;
    const requestedPeriod=(await searchParams).period as TimePreset|undefined;const period=requestedPeriod&&PERIODS.has(requestedPeriod)?requestedPeriod:"FINANCIAL_YEAR";
    const analytics=experience?await getDashboard(prisma,user.id,portal as AnalyticsPortal,period):undefined;
    return <main lang={language === "HI" ? "hi" : "en"} style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px", fontFamily: 'system-ui, "Noto Sans Devanagari", "Mangal", sans-serif' }} data-portal={portal} data-language={language}>
      <LanguageSelector initialLanguage={language} labels={{ language: translate(language, "language"), english: translate(language, "english"), hindi: translate(language, "hindi") }} />
      <p>{translate(language, "protectedPortal")}</p><h1>{experience?.title ?? messages[portal]}</h1><p>{translate(language, "authenticatedAs")}: {user.name ?? user.email}.</p>
      {experience ? <><p>{experience.dashboard}</p><nav aria-label={`${experience.title} navigation`}><ul>{experience.navigation.map((item) => <li key={item}>{item}</li>)}</ul></nav><small>{experience.terminology}</small>{portal==="sales-executive"&&<OfflineStatus language={language}/>} {analytics&&<Phase10Dashboard data={analytics} language={language}/>} {["accounts","sales-manager","founder-admin","distributor","super-stockist"].includes(portal)&&<PhaseCompletionPanel portal={portal} language={language}/>}</> : <p>{translate(language, "reserved")}</p>}
    </main>;
  } catch (error) {
    if (error instanceof FoundationError && error.status === 401) redirect(`/login?next=/portal/${portal}`);
    const disabled=error instanceof FoundationError&&error.code==="PORTAL_DISABLED";return <main lang={language === "HI" ? "hi" : "en"} style={{maxWidth:760,margin:"0 auto",padding:"72px 24px",fontFamily:'system-ui, "Noto Sans Devanagari", "Mangal", sans-serif'}}><h1>{translate(language,disabled?"unavailable":"accessDenied")}</h1><p>{translate(language,disabled?"disabledMessage":"deniedMessage")}</p></main>;
  }
}
