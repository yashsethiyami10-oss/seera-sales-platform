import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { LanguageSelector } from "@/components/seera/LanguageSelector";
import { OfflineStatus } from "@/components/seera/phase-11/OfflineStatus";
import { Phase10Dashboard } from "@/components/seera/phase-10/Phase10Dashboard";
import { ProductHome } from "@/components/seera/product/ProductHome";
import { ManagerDashboardSummary } from "@/components/seera/product/ManagerDashboardSummary";
import { managerDashboardSummary } from "@/lib/sales-distribution/manager-service";
import { SuperStockistDashboardSummary } from "@/components/seera/product/SuperStockistDashboardSummary";
import { superStockistDashboardSummary } from "@/lib/sales-distribution/super-stockist-easy-mode-service";
import { DistributorDashboardSummary } from "@/components/seera/product/DistributorDashboardSummary";
import { distributorDashboardSummary } from "@/lib/sales-distribution/distributor-easy-mode-service";
import { AccountsDashboardSummary } from "@/components/seera/product/AccountsDashboardSummary";
import { accountsDashboardSummary } from "@/lib/sales-distribution/financial-service";
import { FounderAttentionDashboard } from "@/components/seera/product/FounderAttentionDashboard";
import { founderAttentionDashboard } from "@/lib/sales-distribution/founder-service";
import { prisma } from "@/lib/database/client";
import {
  authorize,
  effectivePermissions,
} from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import {
  isSeeraPortalKey,
  SEERA_PORTALS,
} from "@/lib/foundation/portal-registry";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { getDashboard } from "@/lib/phase-10/dashboard-service";
import type { AnalyticsPortal } from "@/lib/phase-10/scope";
import type { TimePreset } from "@/lib/phase-10/time-intelligence";
import {
  localizedPortal,
  normalizeLanguage,
  translate,
  type BilingualPortal,
  type UiLanguage,
} from "@/lib/sales-distribution/localization";
import styles from "./portal.module.css";

const messages: Record<string, { EN: string; HI: string }> = {
  "founder-admin": {
    EN: "Seera Founder command centre",
    HI: "सीरा संस्थापक नियंत्रण केंद्र",
  },
  "company-admin": { EN: "Company administration", HI: "कंपनी प्रशासन" },
  accounts: { EN: "Finance workbench", HI: "वित्त कार्यक्षेत्र" },
  "sales-manager": {
    EN: "Field leadership and team execution",
    HI: "फील्ड नेतृत्व और टीम निष्पादन",
  },
  "sales-executive": { EN: "Today’s field work", HI: "आज का फील्ड कार्य" },
  distributor: { EN: "Distributor operations", HI: "वितरक संचालन" },
  "super-stockist": {
    EN: "Super Stockist operations",
    HI: "सुपर स्टॉकिस्ट संचालन",
  },
  retailer: { EN: "Retailer account", HI: "रिटेलर खाता" },
};
const PERIODS = new Set<TimePreset>([
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "QUARTER",
  "YTD",
  "FINANCIAL_YEAR",
]);
const ANALYTICS_PORTALS = new Set<AnalyticsPortal>([
  "founder-admin",
  "company-admin",
  "accounts",
  "sales-manager",
  "sales-executive",
  "distributor",
  "super-stockist",
]);

export default async function PortalShell({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  noStore();
  const { portal } = await params;
  if (!isSeeraPortalKey(portal)) notFound();
  let language: UiLanguage = "EN";
  try {
    const { user } = await resolveRequestIdentity();
    const definition = SEERA_PORTALS[portal];
    language = normalizeLanguage(user.preferredLanguage);
    await authorize(prisma, {
      actorId: user.id,
      permission: definition.requiredPermission,
      ...(definition.featureFlag
        ? { featureFlag: definition.featureFlag }
        : {}),
    });
    const permissions = await effectivePermissions(prisma, user.id);
    const deliveryOnly = Boolean(
      portal === "distributor" &&
      permissions.has("distributor_delivery:execute") &&
      !permissions.has("distributor_orders:view"),
    );
    const bilingualPortals = [
      "founder-admin",
      "accounts",
      "sales-manager",
      "sales-executive",
      "distributor",
      "super-stockist",
    ] as const;
    let experience = bilingualPortals.includes(portal as never)
      ? localizedPortal(language, portal as BilingualPortal)
      : undefined;
    if (deliveryOnly)
      experience =
        language === "HI"
          ? {
              title: "सीरा डिलीवरी पोर्टल",
              dashboard: "मेरी अधिकृत डिलीवरी और प्राप्ति",
              terminology: "डिलीवरी संचालन",
              navigation: [
                "आज की डिलीवरी",
                "मार्ग",
                "प्राप्ति प्रमाण",
                "लंबित डिलीवरी",
                "सूचनाएँ",
              ],
            }
          : {
              title: "Seera Delivery Portal",
              dashboard: "My authorized deliveries and receipts",
              terminology: "Delivery operations",
              navigation: [
                "Today’s Deliveries",
                "Route",
                "Proof of Delivery",
                "Pending Deliveries",
                "Notifications",
              ],
            };
    const requestedPeriod = (await searchParams).period as
      TimePreset | undefined;
    const period =
      requestedPeriod && PERIODS.has(requestedPeriod)
        ? requestedPeriod
        : "FINANCIAL_YEAR";
    let analytics: Awaited<ReturnType<typeof getDashboard>> | undefined;
    let analyticsUnavailable = false;
    if (ANALYTICS_PORTALS.has(portal as AnalyticsPortal) && !deliveryOnly)
      try {
        analytics = await getDashboard(
          prisma,
          user.id,
          portal as AnalyticsPortal,
          period,
        );
      } catch (error) {
        analyticsUnavailable = true;
        console.error("[SEERA] portal analytics unavailable", {
          portal,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    let managerSummary: Awaited<ReturnType<typeof managerDashboardSummary>> | null = null;
    let assignableDistributors: { value: string; label: string }[] = [];
    if (portal === "sales-manager" && permissions.has("manager_team:view"))
      try {
        managerSummary = await managerDashboardSummary(prisma, user.id);
        if (managerSummary.unassignedOrders.length > 0) {
          const active = await prisma.seeraPartner.findMany({
            where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
            select: { id: true, legalName: true, tradeName: true, code: true },
            orderBy: { legalName: "asc" },
            take: 200,
          });
          assignableDistributors = active.map((d) => ({ value: d.id, label: `${d.tradeName ?? d.legalName} · ${d.code}` }));
        }
      } catch (error) {
        console.error("[SEERA] manager dashboard summary unavailable", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    let superStockistSummary: Awaited<ReturnType<typeof superStockistDashboardSummary>> | null = null;
    if (portal === "super-stockist" && permissions.has("super_stockist_orders:view"))
      try {
        const link = await prisma.seeraPartyUser.findFirst({
          where: { userId: user.id, active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
          select: { partnerId: true },
        });
        if (link) superStockistSummary = await superStockistDashboardSummary(prisma, user.id, link.partnerId);
      } catch (error) {
        console.error("[SEERA] super stockist dashboard summary unavailable", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    let distributorSummary: Awaited<ReturnType<typeof distributorDashboardSummary>> | null = null;
    if (portal === "distributor" && permissions.has("distributor_orders:view") && !deliveryOnly)
      try {
        const link = await prisma.seeraPartyUser.findFirst({
          where: { userId: user.id, active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
          select: { partnerId: true },
        });
        if (link) distributorSummary = await distributorDashboardSummary(prisma, user.id, link.partnerId);
      } catch (error) {
        console.error("[SEERA] distributor dashboard summary unavailable", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    let accountsSummary: Awaited<ReturnType<typeof accountsDashboardSummary>> | null = null;
    if (portal === "accounts" && permissions.has("finance_dashboard:view"))
      try {
        accountsSummary = await accountsDashboardSummary(prisma, user.id);
      } catch (error) {
        console.error("[SEERA] accounts dashboard summary unavailable", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    let founderSummary: Awaited<ReturnType<typeof founderAttentionDashboard>> | null = null;
    if (portal === "founder-admin" && permissions.has("portal:admin"))
      try {
        founderSummary = await founderAttentionDashboard(prisma, user.id);
      } catch (error) {
        console.error("[SEERA] founder attention dashboard unavailable", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    const title = experience?.title ?? messages[portal]?.[language] ?? "Seera";
    return (
      <main
        lang={language === "HI" ? "hi" : "en"}
        className={styles.shell}
        data-portal={portal}
        data-language={language}
      >
        <section className={styles.hero}>
          <div className={styles.topbar}>
            <div>
              <p className={styles.eyebrow}>
                {translate(language, "protectedPortal")}
              </p>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.identity}>
                {translate(language, "authenticatedAs")}:{" "}
                {user.name ?? user.email}
              </p>
            </div>
            <LanguageSelector
              initialLanguage={language}
              labels={{
                language: translate(language, "language"),
                english: translate(language, "english"),
                hindi: translate(language, "hindi"),
              }}
            />
          </div>
          {experience ? (
            <>
              <p className={styles.summary}>{experience.dashboard}</p>
              <small className={styles.terminology}>
                {experience.terminology}
              </small>
            </>
          ) : (
            <p>
              {language === "HI"
                ? "आपकी भूमिका के लिए सुरक्षित कार्यक्षेत्र।"
                : "A governed workspace for your role."}
            </p>
          )}
        </section>
        <div className={styles.content}>
          {["sales-executive", "distributor", "super-stockist"].includes(portal) && (
            <OfflineStatus language={language} />
          )}
          {managerSummary && (
            <ManagerDashboardSummary language={language} summary={managerSummary} portal={portal} mappedDistributors={assignableDistributors} />
          )}
          {superStockistSummary && (
            <SuperStockistDashboardSummary language={language} summary={superStockistSummary} portal={portal} />
          )}
          {distributorSummary && (
            <DistributorDashboardSummary language={language} summary={distributorSummary} portal={portal} />
          )}
          {accountsSummary && (
            <AccountsDashboardSummary language={language} summary={accountsSummary} portal={portal} />
          )}
          {founderSummary && (
            <FounderAttentionDashboard language={language} summary={founderSummary} portal={portal} />
          )}
          {analytics && (
            <Phase10Dashboard data={analytics} language={language} />
          )}
          {analyticsUnavailable && (
            <p role="status">
              {language === "HI"
                ? "विश्लेषण अभी उपलब्ध नहीं है। कृपया पुनः प्रयास करें।"
                : "Analytics is temporarily unavailable. Please retry."}
            </p>
          )}
          <ProductHome
            portal={portal}
            permissions={permissions}
            language={language}
          />
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof FoundationError && error.status === 401)
      redirect(`/login?next=/portal/${portal}`);
    const disabled =
      error instanceof FoundationError && error.code === "PORTAL_DISABLED";
    return (
      <main
        lang={language === "HI" ? "hi" : "en"}
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "72px 24px",
          fontFamily: 'system-ui, "Noto Sans Devanagari", "Mangal", sans-serif',
        }}
      >
        <h1>
          {translate(language, disabled ? "unavailable" : "accessDenied")}
        </h1>
        <p>
          {translate(language, disabled ? "disabledMessage" : "deniedMessage")}
        </p>
      </main>
    );
  }
}
