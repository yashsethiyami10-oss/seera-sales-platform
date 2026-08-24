import Link from "next/link";
import workspaceStyles from "@/components/seera/foundation/Workspace.module.css";
import type { PrismaClient, UiLanguage } from "@prisma/client";
import { analyticsScope, type AnalyticsPortal } from "@/lib/phase-10/scope";
import type { SurfaceItem } from "@/lib/foundation/product-surface";
import { surfaceLabel } from "@/lib/foundation/product-surface";
import { FoundationError } from "@/lib/foundation/errors";
import { operationalLog } from "@/lib/foundation/logger";
// A scope/not-found rejection from a service function is a real, expected outcome (a stale query
// param, cross-portal snooping) and safe to render as "nothing selected". Anything else — a Prisma
// connection/timeout error, a genuine bug — must propagate to the page's error boundary instead of
// being silently swallowed as if the data were simply empty (see CLAUDE.md/Correction Pass #2 item 11:
// infrastructure failures must never render as fake zero data).
function ifExpectedNotFound<T>(e: unknown): T | null {
  if (e instanceof FoundationError && (e.status === 403 || e.status === 404)) return null;
  throw e;
}
import { EmptyState, PageHeading } from "@/components/seera/foundation/States";
import styles from "./ProductSurface.module.css";
import { WorkflowActions } from "./WorkflowActions";
import { FieldJourney } from "./FieldJourney";
import { DistributionActions } from "./DistributionActions";
import { DistributorOrderCards } from "./DistributorOrderCards";
import { retailerOrderLineAvailability, distributorStockSummary } from "@/lib/sales-distribution/distributor-easy-mode-service";
import { SuperStockistOrderCards } from "./SuperStockistOrderCards";
import { AddDistributorPanel } from "./AddDistributorPanel";
import { RatanBulkOnboardPanel } from "./RatanBulkOnboardPanel";
import { CreateSuperStockistPanel } from "./CreateSuperStockistPanel";
import { CreateCompanyDirectPartnerPanel } from "./CreateCompanyDirectPartnerPanel";
import { CompanyDirectEligibilityPanel } from "./CompanyDirectEligibilityPanel";
import { MoneyDeskPanel } from "./MoneyDeskPanel";
import { TerritoryBeatManagementPanel } from "./TerritoryBeatManagementPanel";
import { CreditPolicyPanel } from "./CreditPolicyPanel";
import { CompanyOrderDispatchPanel } from "./CompanyOrderDispatchPanel";
import { DistributorMoneyPanel } from "./DistributorMoneyPanel";
import { IncomingStockCards } from "./IncomingStockCards";
import { OrderFromSSWizard } from "./OrderFromSSWizard";
import { CompanyOrderWizard, type CompanyCatalogItem } from "./CompanyOrderWizard";
import { COMPANY_ORDER_UNIT_OVERRIDES, DEFAULT_MUV_ORDER_UNIT, activeSchemeNotesForSkus, activeRetailerCatalog, companyOrderLineMultiplier } from "@/lib/sales-distribution/company-order-catalog";
import { formatAddress, priceModeForBrand, deriveInclusiveTax, deriveExclusiveTax } from "@/lib/sales-distribution/document-lines";
import { distributorOrderLineAvailability, superStockistStockSummary, distributorReceiptStatus } from "@/lib/sales-distribution/super-stockist-easy-mode-service";
import { PaymentProofReviewActions } from "./PaymentProofReviewActions";
import { PartnerFinanceActions } from "./PartnerFinanceActions";
import { DocumentActions } from "./DocumentActions";
import { RetailerOrderActions } from "./RetailerOrderActions";
import { ApprovalActions, MasterActions } from "./GovernedActions";
import { FinanceControlActions } from "./FinanceControlActions";
import { ManagerFieldActions } from "./ManagerFieldActions";
import { BeatPlannerActions } from "./BeatPlannerActions";
import { UnmappedRetailersPanel } from "./UnmappedRetailersPanel";
import { RetailerCleanupPanel } from "./RetailerCleanupPanel";
import { unmappedRetailers, retailerCleanupOverview } from "@/lib/sales-distribution/retailer-lifecycle-service";
import { resolveManagerOperationalScope, resolveExecutiveOperationalScope } from "@/lib/sales-distribution/scope";
import { FieldForceAssignmentPanel } from "./FieldForceAssignmentPanel";
import { AssignDistributorToExecutivePanel } from "./AssignDistributorToExecutivePanel";
import { CompleteFieldForceSetupPanel } from "./CompleteFieldForceSetupPanel";
import { TeamTaClaimsPanel } from "./ManagerTaClaimActions";
import { TravelPolicyActions } from "./TravelPolicyActions";
import { TravelAdjustmentActions } from "./TravelAdjustmentActions";
import { ProspectPipelineActions } from "./ProspectPipelineActions";
import { geographySuggestions, managerBeatPlans, GEOGRAPHY_TYPES, activeManagerTeamAssignments, activeExecutiveDistributorAssignments, territoriesAndBeats, activeExecutiveTerritoryAssignments } from "@/lib/sales-distribution/operational-service";
import { companyDirectEligibilityRoster } from "@/lib/sales-distribution/distributor-management-service";
import { moneyDeskHome, moneyDeskSupportingData } from "@/lib/finance/money-desk-service";
import { MONEY_DESK_PURPOSE_CODES, purposeDefinition } from "@/lib/finance/money-desk-registry";
import { DeliveryActions } from "./DeliveryActions";
import { documentSelectorData } from "@/lib/sales-distribution/document-portal-service";
import { invoiceNumberingStatus } from "@/lib/sales-distribution/billing-service";
import { InvoiceNumberingPanel } from "./InvoiceNumberingPanel";
import { distributorCreditPosition, superStockistDistributorCreditOverview, superStockistCreditExtensionHistory, creditPositionFor, superStockistDistributorCollectionsSnapshot, founderDistributorCreditOversight } from "@/lib/sales-distribution/credit-service";
import { ledgerReadModel, partyOutstanding } from "@/lib/sales-distribution/financial-service";
import { deriveDistributorPurchaseRate } from "@/lib/sales-distribution/distributor-pricing";
import { financeWorkspaceData } from "@/lib/finance/founder-workspace-data";
import { FinanceWorkspacePanel } from "./FinanceWorkspacePanel";
import { manufacturingWorkspaceData } from "@/lib/manufacturing/workspace-data";
import { ManufacturingWorkspacePanel } from "./ManufacturingWorkspacePanel";
import {
  executiveDashboard,
  executiveBeat,
  executiveTargetProgress,
  executiveDeliveredSales,
  executiveDsr,
  executiveDsrHistory,
  executiveDistributorFollowUp,
} from "@/lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "@/lib/sales-distribution/scope";
import { managerDsrRollup, managerDsrDetail, managerTeamScorecard, managerAlerts, managerDeliveredSales, jointWorkLinkedActivity, managerSalesAttribution, managerDashboardSummary, managerEndDaySummary, prospectTimeline, teamSyncStatus, managerMappedDistributors, managerDistributorCollectionsSnapshot, managerDistributorSnapshot } from "@/lib/sales-distribution/manager-service";
import { CollectionsPanel } from "./CollectionsPanel";
import { ManagerDistributorOversightPanel } from "./ManagerDistributorOversightPanel";
import { teamTaClaimsForVerification } from "@/lib/sales-distribution/travel-lifecycle-service";
import { accountsTravelClaims, travelReport } from "@/lib/sales-distribution/travel-claim-service";
import { listOfflineQueue } from "@/lib/phase-11/offline-sync-service";
import { IssueInstructionActions, RespondInstructionActions } from "./InstructionActions";
import { SyncRetryButton } from "./SyncRetryButton";
import { executiveTaDaMonthlySummary } from "@/lib/sales-distribution/field-travel-service";
import { QuotationActions } from "./QuotationActions";
import { BillingActions } from "./BillingActions";
import { ReturnsActions } from "./ReturnsActions";
import { AttendanceCorrectionActions } from "./AttendanceCorrectionActions";

type Row = {
  id: string;
  primary: string;
  secondary?: string;
  status?: string;
  metric?: string;
  date?: Date | null;
};
const DETAIL_KINDS = new Set([
  "orders",
  "partners",
  "retailers",
  "inventory",
  "deliveries",
  "documents",
  "finance",
  "travel",
  "audit",
]);
const money = (value: unknown) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
// P1 21-Aug UX fix (Manager Distributor Oversight/Collections dropdowns): disambiguate same-name
// distributors and give the Manager a location cue without a second lookup — addresses is a free-
// form Json blob (see document-lines.ts's formatAddress for the same defensive-extraction
// convention), so this only appends a city when the field genuinely has one, never a blank suffix.
const distributorLabel = (d: { legalName: string; tradeName: string | null; code: string; addresses?: unknown }) => {
  const city = d.addresses && typeof d.addresses === "object" ? (d.addresses as { city?: unknown }).city : undefined;
  const base = `${d.tradeName ?? d.legalName} · ${d.code}`;
  return typeof city === "string" && city.trim() ? `${base} — ${city.trim()}` : base;
};
const date = (value: Date | null | undefined, language: UiLanguage) =>
  value ? value.toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN") : "—";
const scopePortal = (portal: string): AnalyticsPortal =>
  portal === "auditor"
    ? "founder-admin"
    : portal === "company-admin"
      ? "company-admin"
      : (portal as AnalyticsPortal);

function CreditPanel({
  language,
  title,
  positions,
}: {
  language: UiLanguage;
  title: string;
  positions: { label: string; position: Awaited<ReturnType<typeof distributorCreditPosition>> }[];
}) {
  const hi = language === "HI";
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "क्रेडिट" : "CREDIT"}</small>
        <h2>{title}</h2>
      </div>
      {positions.length === 0 && (
        <p className={styles.readOnly}>
          {hi ? "कोई सक्रिय पक्ष उपलब्ध नहीं है।" : "No active party is available."}
        </p>
      )}
      {positions.map(({ label, position }) => (
        <div key={label}>
          <h3>{label}</h3>
          {!position.terms ? (
            <p className={styles.readOnly}>
              {hi
                ? "इस पक्ष के लिए कोई क्रेडिट शर्तें कॉन्फ़िगर नहीं हैं।"
                : "No credit terms are configured for this party."}
            </p>
          ) : (
            <dl className={styles.detail}>
              <div>
                <dt>{hi ? "क्रेडिट सीमा" : "Credit limit"}</dt>
                <dd>{money(position.terms.creditLimit)}</dd>
              </div>
              <div>
                <dt>{hi ? "बकाया एक्सपोज़र" : "Outstanding exposure"}</dt>
                <dd>{money(position.outstanding)}</dd>
              </div>
              <div>
                <dt>{hi ? "उपलब्ध क्रेडिट" : "Available credit"}</dt>
                <dd>{money(position.decision?.availableCredit ?? 0)}</dd>
              </div>
              <div>
                <dt>{hi ? "स्थिति" : "Status"}</dt>
                <dd>
                  <span className={styles.badge}>{position.decision?.decision ?? "—"}</span>
                </dd>
              </div>
              <div>
                <dt>{hi ? "क्रेडिट दिन" : "Credit days"}</dt>
                <dd>{position.terms.creditDays}</dd>
              </div>
              <div>
                <dt>{hi ? "वादा तिथि" : "Promised date"}</dt>
                <dd>{position.promisedPaymentDate ? date(position.promisedPaymentDate, language) : "—"}</dd>
              </div>
              <div>
                <dt>{hi ? "स्वीकृत विस्तार तक" : "Approved extension until"}</dt>
                <dd>{position.formalExtensionUntil ? date(position.formalExtensionUntil, language) : "—"}</dd>
              </div>
              <div>
                <dt>{hi ? "लंबित विस्तार अनुरोध" : "Pending extension request"}</dt>
                <dd>{position.pendingExtension ? `${hi ? "तक" : "until"} ${date(position.pendingExtension.extensionUntil, language)}` : "—"}</dd>
              </div>
            </dl>
          )}
          {position.openOrders.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{hi ? "ऑर्डर" : "Order"}</th>
                    <th>{hi ? "राशि" : "Amount"}</th>
                    <th>{hi ? "स्थिति" : "Status"}</th>
                    <th>{hi ? "देय तिथि" : "Due date"}</th>
                    <th>{hi ? "आयु" : "Ageing"}</th>
                  </tr>
                </thead>
                <tbody>
                  {position.openOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{money(order.total)}</td>
                      <td>
                        <span className={styles.badge}>{order.status}</span>
                      </td>
                      <td>{order.originalDueDate ? date(order.originalDueDate, language) : "—"}</td>
                      <td>
                        <span className={styles.badge}>{order.ageingBucket}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function LedgerPanel({
  language,
  title,
  ledgers,
}: {
  language: UiLanguage;
  title: string;
  ledgers: { label: string; ledger: Awaited<ReturnType<typeof ledgerReadModel>> }[];
}) {
  const hi = language === "HI";
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "खाता" : "LEDGER"}</small>
        <h2>{title}</h2>
      </div>
      {ledgers.map(({ label, ledger }) => (
        <div key={label}>
          <h3>{label}</h3>
          <dl className={styles.detail}>
            <div>
              <dt>{hi ? "शेष राशि" : "Balance"}</dt>
              <dd>{money(ledger.balance)}</dd>
            </div>
            <div>
              <dt>{hi ? "कुल बकाया" : "Total outstanding"}</dt>
              <dd>{money(ledger.outstandingTotal)}</dd>
            </div>
            <div>
              <dt>{hi ? "अग्रिम / अनुपयुक्त राशि" : "Advances / unapplied"}</dt>
              <dd>{money(ledger.advancesAndUnapplied)}</dd>
            </div>
          </dl>
          {ledger.outstanding.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{hi ? "दस्तावेज़" : "Document"}</th>
                    <th>{hi ? "राशि" : "Amount"}</th>
                    <th>{hi ? "देय तिथि" : "Due date"}</th>
                    <th>{hi ? "वादा तिथि" : "Promised date"}</th>
                    <th>{hi ? "आयु" : "Ageing"}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.outstanding.map((item) => (
                    <tr key={item.documentId}>
                      <td>{item.documentNumber ?? "—"}</td>
                      <td>{money(item.amount)}</td>
                      <td>{date(item.originalDueDate, language)}</td>
                      <td>{item.promisedPaymentDate ? date(item.promisedPaymentDate, language) : "—"}</td>
                      <td>
                        <span className={styles.badge}>{item.ageingBucket}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ledger.transactions.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{hi ? "प्रविष्टि" : "Entry"}</th>
                    <th>{hi ? "प्रकार" : "Type"}</th>
                    <th>{hi ? "राशि" : "Amount"}</th>
                    <th>{hi ? "स्थिति" : "Status"}</th>
                    <th>{hi ? "तिथि" : "Date"}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.slice(0, 50).map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.entryNumber}</td>
                      <td>{entry.type}</td>
                      <td>{money(entry.amount)}</td>
                      <td>
                        <span className={styles.badge}>{entry.status}</span>
                      </td>
                      <td>{date(entry.postedAt ?? entry.createdAt, language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function DeliveredSalesPanel({
  language,
  rows,
}: {
  language: UiLanguage;
  rows: Awaited<ReturnType<typeof executiveDeliveredSales>>;
}) {
  const hi = language === "HI";
  if (rows.length === 0)
    return (
      <p className={styles.readOnly}>
        {hi ? "अभी तक कोई बुक किया गया ऑर्डर नहीं है।" : "No orders booked yet."}
      </p>
    );
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>{hi ? "ऑर्डर" : "Order"}</th>
            <th>{hi ? "दुकान" : "Retailer"}</th>
            <th>{hi ? "वितरक" : "Distributor"}</th>
            <th>{hi ? "बुक मूल्य" : "Booked"}</th>
            <th>{hi ? "योग्य वितरित" : "Eligible delivered"}</th>
            <th>{hi ? "स्थिति" : "Status"}</th>
            <th>{hi ? "दिनांक" : "Date"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.orderNumber}</td>
              <td>{row.retailer}</td>
              <td>{row.distributor}</td>
              <td>{money(row.booked)}</td>
              <td>{money(row.eligibleCreditedAmount)}</td>
              <td>
                <span className={styles.badge}>{row.status}</span>
              </td>
              <td>{row.date.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManagerDeliveredSalesPanel({
  language,
  base,
  query,
  data,
  executives,
  distributors,
}: {
  language: UiLanguage;
  base: string;
  query: Record<string, string | undefined>;
  data: Awaited<ReturnType<typeof managerDeliveredSales>>;
  executives: { value: string; label: string }[];
  distributors: { value: string; label: string }[];
}) {
  const hi = language === "HI";
  return (
    <>
      <section className={styles.toolbar}>
        <form method="get">
          <label>
            <span>{hi ? "कार्यकारी" : "Executive"}</span>
            <select name="executiveId" defaultValue={query.executiveId ?? ""}>
              <option value="">{hi ? "सभी" : "All"}</option>
              {executives.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{hi ? "वितरक" : "Distributor"}</span>
            <select name="distributorId" defaultValue={query.distributorId ?? ""}>
              <option value="">{hi ? "सभी" : "All"}</option>
              {distributors.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{hi ? "से" : "From"}</span>
            <input type="date" name="dateFrom" defaultValue={query.dateFrom ?? ""} />
          </label>
          <label>
            <span>{hi ? "तक" : "To"}</span>
            <input type="date" name="dateTo" defaultValue={query.dateTo ?? ""} />
          </label>
          <button>{hi ? "फ़िल्टर लागू करें" : "Apply filters"}</button>
        </form>
        <Link href={base} className={styles.scope}>
          {hi ? "फ़िल्टर साफ़ करें" : "Clear filters"}
        </Link>
      </section>
      <section className={styles.toolbar}>
        <span>{hi ? "बुक कुल" : "Total booked"}: {money(data.totals.bookedValue)}</span>
        <span>{hi ? "योग्य वितरित कुल" : "Total eligible delivered"}: {money(data.totals.eligibleDeliveredValue)}</span>
        <span>{hi ? "अस्वीकृत मात्रा" : "Refused qty"}: {data.totals.refusedQty}</span>
        <span>{hi ? "वापसी मात्रा" : "Returned qty"}: {data.totals.returnedQty}</span>
      </section>
      <section className={styles.toolbar}>
        <span>{hi ? "टीम एग्जीक्यूटिव" : "Team (Executives)"}: {money(data.attribution.team.eligibleDeliveredValue)} ({data.attribution.team.orderCount})</span>
        <span>{hi ? "मैनेजर स्वयं" : "Manager own"}: {money(data.attribution.managerOwn.eligibleDeliveredValue)} ({data.attribution.managerOwn.orderCount})</span>
        <span>{hi ? "कुल क्षेत्र" : "Territory total"}: {money(data.attribution.territory.eligibleDeliveredValue)} ({data.attribution.territory.orderCount})</span>
      </section>
      {data.rows.length === 0 ? (
        <p className={styles.readOnly}>
          {hi ? "इस फ़िल्टर से कोई ऑर्डर नहीं मिला।" : "No orders match this filter."}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "ऑर्डर" : "Order"}</th>
                <th>{hi ? "कार्यकारी" : "Executive"}</th>
                <th>{hi ? "दुकान" : "Retailer"}</th>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "बुक मात्रा/मूल्य" : "Booked qty/value"}</th>
                <th>{hi ? "वितरित मात्रा" : "Delivered qty"}</th>
                <th>{hi ? "आंशिक" : "Partial"}</th>
                <th>{hi ? "अस्वीकृत / वापसी" : "Refused / returned"}</th>
                <th>{hi ? "योग्य वितरित मूल्य" : "Eligible delivered value"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "दिनांक" : "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`${base}/${row.id}`}>{row.orderNumber}</Link>
                  </td>
                  <td>{row.executive}</td>
                  <td>{row.retailer}</td>
                  <td>{row.distributor}</td>
                  <td>
                    {row.bookedQty} · {money(row.bookedValue)}
                  </td>
                  <td>{row.deliveredQty}</td>
                  <td>{row.partial ? (hi ? "हाँ" : "Yes") : "—"}</td>
                  <td>
                    {row.refusedQty} / {row.returnedQty}
                  </td>
                  <td>{money(row.eligibleDeliveredValue)}</td>
                  <td>
                    <span className={styles.badge}>{row.status}</span>
                  </td>
                  <td>{row.date.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TargetProgressPanel({
  language,
  progress,
  distributorNames,
}: {
  language: UiLanguage;
  progress: Awaited<ReturnType<typeof executiveTargetProgress>>;
  distributorNames: Map<string, string>;
}) {
  const hi = language === "HI";
  if (!progress.target)
    return (
      <p className={styles.readOnly}>
        {hi ? "इस अवधि के लिए कोई लक्ष्य निर्धारित नहीं है।" : "No target has been set for this period."}
      </p>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "लक्ष्य प्रगति" : "TARGET PROGRESS"}</small>
        <h2>
          {progress.periodStart.toLocaleDateString(hi ? "hi-IN" : "en-IN")} –{" "}
          {progress.periodEnd.toLocaleDateString(hi ? "hi-IN" : "en-IN")}
        </h2>
      </div>
      <dl className={styles.detail}>
        <div>
          <dt>{hi ? "लक्ष्य" : "Target"}</dt>
          <dd>{money(progress.target.targetValue)}</dd>
        </div>
        <div>
          <dt>{hi ? "बुक किया गया" : "Booked"}</dt>
          <dd>{money(progress.booked)}</dd>
        </div>
        <div>
          <dt>{hi ? "योग्य वितरित" : "Eligible delivered"}</dt>
          <dd>{money(progress.delivered)}</dd>
        </div>
        <div>
          <dt>{hi ? "शेष" : "Remaining"}</dt>
          <dd>{money(progress.remaining)}</dd>
        </div>
        <div>
          <dt>{hi ? "उपलब्धि %" : "Achievement %"}</dt>
          <dd>{progress.achievementPct}%</dd>
        </div>
        <div>
          <dt>{hi ? "शेष दिन" : "Days remaining"}</dt>
          <dd>{progress.daysRemaining}</dd>
        </div>
        <div>
          <dt>{hi ? "आवश्यक दैनिक दर" : "Required daily run rate"}</dt>
          <dd>{money(progress.requiredDailyRunRate)}</dd>
        </div>
      </dl>
      {progress.distributorContribution.length > 0 && (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "योग्य वितरित मूल्य" : "Eligible delivered value"}</th>
              </tr>
            </thead>
            <tbody>
              {progress.distributorContribution.map((c) => (
                <tr key={c.distributorId}>
                  <td>{distributorNames.get(c.distributorId) ?? (hi ? "अमैप्ड" : "Unmapped")}</td>
                  <td>{money(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TeamScorecardPanel({
  language,
  scorecard,
  dsrBase,
  syncStatus,
}: {
  language: UiLanguage;
  scorecard: Awaited<ReturnType<typeof managerTeamScorecard>>;
  dsrBase?: string;
  syncStatus?: Awaited<ReturnType<typeof teamSyncStatus>>;
}) {
  const hi = language === "HI";
  const syncByEmployee = new Map((syncStatus ?? []).map((s) => [s.employeeId, s]));
  const syncLabel = (status: "SYNCED" | "PENDING_SYNC" | "SYNC_ERROR") =>
    status === "SYNCED"
      ? hi
        ? "सिंक हुआ"
        : "Synced"
      : status === "PENDING_SYNC"
        ? hi
          ? "सिंक लंबित"
          : "Pending sync"
        : hi
          ? "सिंक त्रुटि"
          : "Sync error";
  if (scorecard.length === 0)
    return (
      <p className={styles.readOnly}>
        {hi ? "इस टीम में कोई कार्यकारी सौंपा नहीं गया है।" : "No Executives are assigned to this team."}
      </p>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "टीम कमांड सेंटर" : "TEAM COMMAND CENTER"}</small>
        <h2>{hi ? "पिछले 30 दिनों का प्रदर्शन" : "Last 30 days' performance"}</h2>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "कार्यकारी" : "Executive"}</th>
              <th>{hi ? "सिंक" : "Sync"}</th>
              <th>{hi ? "कार्य दिवस" : "Days worked"}</th>
              <th>{hi ? "उपलब्धि" : "Achievement"}</th>
              <th>{hi ? "योजनाबद्ध / देखे गए" : "Planned / visited"}</th>
              <th>{hi ? "उत्पादक" : "Productive"}</th>
              <th>{hi ? "ऑर्डर / बुक" : "Orders / booked"}</th>
              <th>{hi ? "योग्य वितरित" : "Net eligible"}</th>
              <th>{hi ? "नए ग्राहक" : "New customers"}</th>
              <th>{hi ? "वितरक संभावना" : "Distributor prospects"}</th>
              <th>{hi ? "फ़ोटो अनुपालन" : "Photo compliance"}</th>
              <th>{hi ? "बीट अनुपालन" : "Beat compliance"}</th>
              <th>{hi ? "दिन प्रारंभ अनुपालन" : "Start-day compliance"}</th>
              <th>{hi ? "दिन समाप्ति अनुपालन" : "End-day compliance"}</th>
              <th>{hi ? "दूरी" : "Distance"}</th>
              <th>{hi ? "औसत उत्पादक कॉल/दिन" : "Avg productive calls/day"}</th>
              <th>{hi ? "फॉलो-अप बकाया" : "Follow-up backlog"}</th>
              <th>{hi ? "लंबित TA" : "TA pending"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scorecard.map((row) => (
              <tr key={row.employeeId}>
                <td>
                  <strong>{row.employeeName}</strong>
                  <br />
                  <span className={styles.badge}>{row.status}</span>
                </td>
                <td>
                  {(() => {
                    const sync = syncByEmployee.get(row.employeeId);
                    if (!sync) return "—";
                    return (
                      <>
                        <span className={styles.badge} data-tone={sync.status === "SYNC_ERROR" ? "error" : sync.status === "PENDING_SYNC" ? "warn" : "ok"}>
                          {syncLabel(sync.status)}
                        </span>
                        {(sync.pendingCount > 0 || sync.failedCount > 0) && (
                          <div>
                            {sync.failedCount > 0 ? `${sync.failedCount} ${hi ? "विफल" : "failed"}` : ""}
                            {sync.failedCount > 0 && sync.pendingCount > 0 ? " · " : ""}
                            {sync.pendingCount > 0 ? `${sync.pendingCount} ${hi ? "लंबित" : "pending"}` : ""}
                          </div>
                        )}
                        <div>{sync.lastSyncedAt ? date(sync.lastSyncedAt, language) : hi ? "कभी नहीं" : "Never"}</div>
                      </>
                    );
                  })()}
                </td>
                <td>{row.daysWorked30}</td>
                <td>
                  {row.achievementPct === null
                    ? "—"
                    : `${row.achievementPct}% (${money(row.achievedValue)} / ${money(row.targetValue)})`}
                </td>
                <td>{row.planned30} / {row.visited30}</td>
                <td>{row.productive30}</td>
                <td>{row.orders30} / {money(row.bookedValue30)}</td>
                <td>{money(row.eligibleDeliveredValue30)}</td>
                <td>{row.newCustomers30}</td>
                <td>{row.distributorProspects30}</td>
                <td>{row.photoCompliancePct == null ? "—" : `${row.photoCompliancePct}%`}</td>
                <td>{row.beatCompliancePct == null ? "—" : `${row.beatCompliancePct}%`}</td>
                <td>{row.startDayCompliancePct == null ? "—" : `${row.startDayCompliancePct}%`}</td>
                <td>{row.endDayCompliancePct == null ? "—" : `${row.endDayCompliancePct}%`}</td>
                <td>{row.distance30Km} km</td>
                <td>{row.avgProductiveCallsPerDay}</td>
                <td>
                  {row.followUpBacklog}
                  {row.overdueFollowUps ? ` (${row.overdueFollowUps} overdue)` : ""}
                </td>
                <td>
                  {row.taPendingCount ? `${row.taPendingCount} · ${money(row.taPendingAmount)}` : "—"}
                </td>
                <td>{dsrBase && <Link href={`${dsrBase}?employeeId=${row.employeeId}`}>{hi ? "दिन देखें" : "View days"}</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManagerDsrRollupPanel({
  language,
  base,
  query,
  rollup,
  detail,
  geographies,
  distributors,
}: {
  language: UiLanguage;
  base: string;
  query: Record<string, string | undefined>;
  rollup: Awaited<ReturnType<typeof managerDsrRollup>>;
  detail: Awaited<ReturnType<typeof managerDsrDetail>> | null;
  geographies: { value: string; label: string }[];
  distributors: { value: string; label: string }[];
}) {
  const hi = language === "HI";
  const qs = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      date: query.date,
      employeeId: query.employeeId,
      geographyId: query.geographyId,
      distributorId: query.distributorId,
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return params.toString();
  };
  const time = (value: Date | null) =>
    value ? value.toLocaleTimeString(hi ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <>
      <section className={styles.toolbar}>
        <form method="get">
          <label>
            <span>{hi ? "दिनांक" : "Date"}</span>
            <input type="date" name="date" defaultValue={query.date ?? ""} />
          </label>
          <label>
            <span>{hi ? "कार्यकारी" : "Executive"}</span>
            <select name="employeeId" defaultValue={query.employeeId ?? ""}>
              <option value="">{hi ? "सभी" : "All"}</option>
              {rollup.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{hi ? "क्षेत्र" : "Area"}</span>
            <select name="geographyId" defaultValue={query.geographyId ?? ""}>
              <option value="">{hi ? "सभी" : "All"}</option>
              {geographies.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{hi ? "वितरक" : "Distributor"}</span>
            <select name="distributorId" defaultValue={query.distributorId ?? ""}>
              <option value="">{hi ? "सभी" : "All"}</option>
              {distributors.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button>{hi ? "फ़िल्टर लागू करें" : "Apply filters"}</button>
        </form>
        <Link href={base} className={styles.scope}>
          {hi ? "फ़िल्टर साफ़ करें" : "Clear filters"}
        </Link>
      </section>
      {rollup.rows.length === 0 ? (
        <p className={styles.readOnly}>
          {hi ? "इस फ़िल्टर से कोई फ़ील्ड दिवस नहीं मिला।" : "No field days match this filter."}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "कार्यकारी" : "Executive"}</th>
                <th>{hi ? "दिनांक" : "Date"}</th>
                <th>{hi ? "प्रारंभ / समाप्त" : "Start / End"}</th>
                <th>{hi ? "क्षेत्र" : "Area"}</th>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "योजनाबद्ध" : "Planned"}</th>
                <th>{hi ? "देखे गए" : "Visited"}</th>
                <th>{hi ? "उत्पादक" : "Productive"}</th>
                <th>{hi ? "छोड़े गए" : "Skipped"}</th>
                <th>{hi ? "ऑर्डर / मूल्य" : "Orders / Value"}</th>
                <th>{hi ? "योग्य वितरित" : "Eligible delivered"}</th>
                <th>{hi ? "भुगतान संदर्भ" : "Payment refs"}</th>
                <th>{hi ? "नए रिटेलर" : "New retailers"}</th>
                <th>{hi ? "संभावनाएँ" : "Prospects"}</th>
                <th>{hi ? "फ़ोटो अनुपालन" : "Photo compliance"}</th>
                <th>{hi ? "फॉलो-अप" : "Follow-ups"}</th>
                <th>{hi ? "समस्याएँ" : "Issues"}</th>
                <th>TA</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {rollup.rows.map((row) => (
                <tr key={row.workSessionId} style={row.workSessionId === detail?.session.id ? { background: "#fff5f0" } : undefined}>
                  <td>
                    <Link href={`${base}?${qs({ session: row.workSessionId })}`}>{row.employeeName}</Link>
                  </td>
                  <td>{row.date.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</td>
                  <td>
                    {time(row.startedAt)} – {time(row.endedAt)}
                  </td>
                  <td>{row.area ?? "—"}</td>
                  <td>{row.distributor ?? "—"}</td>
                  <td>{row.planned}</td>
                  <td>{row.visited}</td>
                  <td>{row.productive}</td>
                  <td>{row.skipped}</td>
                  <td>
                    {row.orders} · {money(row.bookedValue)}
                  </td>
                  <td>{money(row.linkedEligibleValue)}</td>
                  <td>
                    {row.paymentReferences} · {money(row.paymentAmount)}
                  </td>
                  <td>{row.newRetailers}</td>
                  <td>{row.prospects}</td>
                  <td>
                    {row.photosCaptured}
                    {row.photoExceptions ? ` (${row.photoExceptions} exc.)` : ""}
                  </td>
                  <td>{row.followUps}</td>
                  <td>{row.issues.length + row.marketIssues || "—"}</td>
                  <td>{row.ta ? `${row.ta.status} · ${money(row.ta.totalClaimed)}` : "—"}</td>
                  <td>
                    <span className={styles.badge}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <section className={styles.panel}>
          <div>
            <small>{hi ? "रिटेलर-स्तरीय विवरण" : "RETAILER-LEVEL DETAIL"}</small>
            <h2>
              {hi ? "फ़ील्ड दिवस विवरण" : "Field day detail"} ·{" "}
              {detail.session.startedAt.toLocaleDateString(hi ? "hi-IN" : "en-IN")}
            </h2>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{hi ? "दुकान" : "Shop"}</th>
                  <th>{hi ? "वितरक" : "Distributor"}</th>
                  <th>{hi ? "ऑर्डर" : "Order"}</th>
                  <th>{hi ? "मूल्य" : "Value"}</th>
                  <th>{hi ? "योग्य वितरित" : "Eligible delivered"}</th>
                  <th>{hi ? "परिणाम" : "Outcome"}</th>
                  <th>{hi ? "फॉलो-अप" : "Follow-up"}</th>
                  <th>{hi ? "फ़ोटो" : "Photos"}</th>
                  <th>{hi ? "समस्या" : "Issue"}</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((row) => (
                  <tr key={row.visitId}>
                    <td>{row.shop}</td>
                    <td>{row.distributor ?? "—"}</td>
                    <td>{row.orderNumber ?? "—"}</td>
                    <td>{money(row.bookedValue)}</td>
                    <td>{money(row.linkedEligibleValue)}</td>
                    <td>
                      <span className={styles.badge}>{row.outcome}</span>
                    </td>
                    <td>{row.followUpAt ? date(row.followUpAt, language) : "—"}</td>
                    <td>{row.photos}</td>
                    <td>{row.issue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ReportsPanel({
  language,
  stats,
  tables,
}: {
  language: UiLanguage;
  stats: { label: string; value: string }[];
  tables: { title: string; columns: string[]; rows: (string | number)[][] }[];
}) {
  const hi = language === "HI";
  return (
    <>
      <section className={styles.panel}>
        <div>
          <small>{hi ? "रिपोर्ट" : "REPORTS"}</small>
          <h2>{hi ? "इस माह का सारांश" : "This month's summary"}</h2>
        </div>
        <dl className={styles.detail}>
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {tables.map((t) => (
        <section className={styles.panel} key={t.title}>
          <div>
            <small>{hi ? "विवरण" : "DETAIL"}</small>
            <h2>{t.title}</h2>
          </div>
          {t.rows.length === 0 ? (
            <p className={styles.readOnly}>{hi ? "कोई डेटा उपलब्ध नहीं है।" : "No data available."}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {t.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function SyncStatusPanel({
  language,
  operations,
}: {
  language: UiLanguage;
  operations: Awaited<ReturnType<typeof listOfflineQueue>>;
}) {
  const hi = language === "HI";
  const count = (status: string) => operations.filter((o) => o.status === status).length;
  const outstanding = operations.filter((o) => o.status !== "SYNCED");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "ऑफ़लाइन और सिंक" : "OFFLINE & SYNC"}</small>
        <h2>{hi ? "सिंक स्थिति" : "Sync status"}</h2>
      </div>
      <dl className={styles.detail}>
        <div>
          <dt>{hi ? "सिंक हुआ" : "Synced"}</dt>
          <dd>{count("SYNCED")}</dd>
        </div>
        <div>
          <dt>{hi ? "लंबित" : "Pending"}</dt>
          <dd>{count("PENDING") + count("SYNCING")}</dd>
        </div>
        <div>
          <dt>{hi ? "विफल" : "Failed"}</dt>
          <dd>{count("FAILED")}</dd>
        </div>
        <div>
          <dt>{hi ? "टकराव" : "Conflict"}</dt>
          <dd>{count("CONFLICT")}</dd>
        </div>
      </dl>
      <SyncRetryButton language={language} />
      {outstanding.length > 0 && (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "प्रकार" : "Entity"}</th>
                <th>{hi ? "कार्रवाई" : "Action"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "पुनः प्रयास" : "Retries"}</th>
                <th>{hi ? "त्रुटि" : "Error"}</th>
                <th>{hi ? "समय" : "Time"}</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((o) => (
                <tr key={o.id}>
                  <td>{o.entityType}</td>
                  <td>{o.actionType}</td>
                  <td>
                    <span className={styles.badge}>{o.status}</span>
                  </td>
                  <td>{o.retryCount}</td>
                  <td>{o.lastErrorCode ?? o.conflictClass ?? "—"}</td>
                  <td>{o.localCreatedAt.toLocaleString(hi ? "hi-IN" : "en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AlertsPanel({
  language,
  alerts,
}: {
  language: UiLanguage;
  alerts: Awaited<ReturnType<typeof managerAlerts>>;
}) {
  const hi = language === "HI";
  if (alerts.length === 0)
    return (
      <p className={styles.readOnly}>
        {hi ? "इस समय कोई सक्रिय चेतावनी नहीं है।" : "No active alerts right now."}
      </p>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "चेतावनी" : "ALERTS"}</small>
        <h2>
          {alerts.filter((a) => a.severity === "HIGH").length} {hi ? "उच्च" : "high"} ·{" "}
          {alerts.filter((a) => a.severity === "NORMAL").length} {hi ? "सामान्य" : "normal"}
        </h2>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "गंभीरता" : "Severity"}</th>
              <th>{hi ? "प्रकार" : "Type"}</th>
              <th>{hi ? "विवरण" : "Detail"}</th>
              <th>{hi ? "समय" : "Time"}</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={`${a.code}-${i}`}>
                <td>
                  <span className={styles.badge} style={a.severity === "HIGH" ? { background: "#f8d7da", color: "#a61f2a" } : undefined}>
                    {a.severity}
                  </span>
                </td>
                <td>{a.title}</td>
                <td>{a.detail}</td>
                <td>{a.occurredAt.toLocaleString(hi ? "hi-IN" : "en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistributorFollowUpPanel({
  language,
  entries,
}: {
  language: UiLanguage;
  entries: Awaited<ReturnType<typeof executiveDistributorFollowUp>>;
}) {
  const hi = language === "HI";
  if (entries.length === 0) return null;
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वितरक भुगतान" : "DISTRIBUTOR PAYMENTS"}</small>
        <h2>{hi ? "फॉलो-अप के लिए वितरक" : "Distributors to follow up"}</h2>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "वितरक" : "Distributor"}</th>
              <th>{hi ? "बकाया" : "Outstanding"}</th>
              <th>{hi ? "देय तिथि" : "Due date"}</th>
              <th>{hi ? "वादा" : "Promised"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.distributor.id}>
                <td>{entry.distributor.tradeName ?? entry.distributor.legalName}</td>
                <td>₹{entry.outstanding.toLocaleString("en-IN")}</td>
                <td>
                  {entry.originalDueDate
                    ? entry.originalDueDate.toLocaleDateString(hi ? "hi-IN" : "en-IN")
                    : "—"}
                </td>
                <td>
                  {entry.promiseDate
                    ? entry.promiseDate.toLocaleDateString(hi ? "hi-IN" : "en-IN")
                    : "—"}
                </td>
                <td>
                  <span className={styles.badge}>{entry.overdue ? "OVERDUE" : "ON TRACK"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DsrPanel({
  language,
  base,
  query,
  range,
  dsr,
  history,
  selectedSessionId,
}: {
  language: UiLanguage;
  base: string;
  query: Record<string, string | undefined>;
  range: string;
  dsr: Awaited<ReturnType<typeof executiveDsr>> | null;
  history: Awaited<ReturnType<typeof executiveDsrHistory>>;
  selectedSessionId: string | undefined;
}) {
  const hi = language === "HI";
  const RANGE_LABELS: Record<string, [string, string]> = {
    today: ["Today", "आज"],
    yesterday: ["Yesterday", "कल"],
    week: ["This week", "इस सप्ताह"],
    month: ["This month", "इस माह"],
  };
  const rangeLink = (value: string) => `${base}?range=${value}`;
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "दैनिक बिक्री रिपोर्ट / कार्य इतिहास" : "DAILY SALES REPORT / WORK HISTORY"}</small>
        <h2>{hi ? "डीएसआर और कार्य इतिहास" : "DSR & work history"}</h2>
      </div>
      <div className={styles.actions}>
        {Object.entries(RANGE_LABELS).map(([value, [en, hiLabel]]) => (
          <Link key={value} href={rangeLink(value)} aria-current={range === value ? "page" : undefined}>
            {hi ? hiLabel : en}
          </Link>
        ))}
      </div>
      <form className={styles.toolbar} action={base}>
        <input type="hidden" name="range" value="custom" />
        <label>
          {hi ? "से" : "From"}
          <input type="date" name="from" defaultValue={query.from ?? ""} />
        </label>
        <label>
          {hi ? "तक" : "To"}
          <input type="date" name="to" defaultValue={query.to ?? ""} />
        </label>
        <button type="submit">{hi ? "कस्टम सीमा लागू करें" : "Apply custom range"}</button>
      </form>
      {!dsr ? (
        <p className={styles.readOnly}>
          {hi ? "आज कोई कार्य सत्र दर्ज नहीं हुआ।" : "No work session recorded today."}
        </p>
      ) : (
        <>
          <dl className={styles.statGrid}>
            <div>
              <dt>{hi ? "योजनाबद्ध" : "Planned"}</dt>
              <dd>{dsr.planned}</dd>
            </div>
            <div>
              <dt>{hi ? "देखे गए" : "Visited"}</dt>
              <dd>{dsr.visited}</dd>
            </div>
            <div>
              <dt>{hi ? "उत्पादक" : "Productive"}</dt>
              <dd>{dsr.productive}</dd>
            </div>
            <div>
              <dt>{hi ? "छोड़े गए" : "Skipped"}</dt>
              <dd>{dsr.skipped}</dd>
            </div>
            <div>
              <dt>{hi ? "अनियोजित जोड़े गए" : "Unplanned added"}</dt>
              <dd>{dsr.unplannedAdded}</dd>
            </div>
            <div>
              <dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt>
              <dd>{dsr.distributorProspects}</dd>
            </div>
            <div>
              <dt>{hi ? "ऑर्डर" : "Orders"}</dt>
              <dd>{dsr.orders}</dd>
            </div>
            <div>
              <dt>{hi ? "बुक मूल्य" : "Booked value"}</dt>
              <dd>₹{dsr.bookedValue.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "योग्य वितरित मूल्य" : "Eligible delivered value"}</dt>
              <dd>₹{dsr.linkedEligibleValue.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "फ़ोटो" : "Photos"}</dt>
              <dd>{dsr.photos}</dd>
            </div>
            <div>
              <dt>{hi ? "दूरी तय की गई" : "Distance travelled"}</dt>
              <dd>{dsr.distanceTravelledKm != null ? `${dsr.distanceTravelledKm.toFixed(1)} km` : hi ? "अभी उपलब्ध नहीं" : "Not yet available"}</dd>
            </div>
            <div>
              <dt>{hi ? "GPS स्थिति" : "GPS status"}</dt>
              <dd>
                {dsr.gps.startInsideGeofence === false || dsr.gps.returnedToHq === false || dsr.gps.visitExceptions > 0
                  ? hi
                    ? `अपवाद (${dsr.gps.visitExceptions})`
                    : `Exceptions (${dsr.gps.visitExceptions})`
                  : hi
                    ? "सामान्य"
                    : "Normal"}
              </dd>
            </div>
          </dl>
          <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
            <table>
              <thead>
                <tr>
                  <th>{hi ? "दुकान" : "Shop"}</th>
                  <th>{hi ? "ऑर्डर" : "Order"}</th>
                  <th>{hi ? "मूल्य" : "Value"}</th>
                  <th>{hi ? "परिणाम" : "Outcome"}</th>
                  <th>{hi ? "फॉलो-अप" : "Follow-up"}</th>
                </tr>
              </thead>
              <tbody>
                {dsr.rows.map((row) => (
                  <tr key={row.visitId}>
                    <td>{row.shop}</td>
                    <td>{row.orderNumber ?? "—"}</td>
                    <td>₹{row.bookedValue.toLocaleString("en-IN")}</td>
                    <td>
                      <span className={styles.badge}>{row.outcome}</span>
                    </td>
                    <td>{row.followUpAt ? date(row.followUpAt, language) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={`${styles.cardList} ${styles.mobileOnly}`}>
            {dsr.rows.map((row) => (
              <li key={row.visitId} className={styles.cardListItem}>
                <strong>{row.shop}</strong>
                <span className={styles.badge}>{row.outcome}</span>
                <p>
                  {row.orderNumber ? `${row.orderNumber} · ₹${row.bookedValue.toLocaleString("en-IN")}` : hi ? "कोई ऑर्डर नहीं" : "No order"}
                </p>
                {row.followUpAt && <p>{hi ? "फॉलो-अप" : "Follow-up"}: {date(row.followUpAt, language)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h3>{hi ? "पिछले कार्य दिवस" : "Past work days"}</h3>
          <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
            <table>
              <thead>
                <tr>
                  <th>{hi ? "तिथि" : "Date"}</th>
                  <th>{hi ? "प्रारंभ" : "Start"}</th>
                  <th>{hi ? "समाप्त" : "End"}</th>
                  <th>{hi ? "देखे गए" : "Visited"}</th>
                  <th>{hi ? "ऑर्डर" : "Orders"}</th>
                  <th>{hi ? "बुक मूल्य" : "Booked value"}</th>
                  <th>{hi ? "नए ग्राहक" : "New customers"}</th>
                  <th>{hi ? "फ़ोटो" : "Photos"}</th>
                  <th>{hi ? "स्थिति" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((day) => (
                  <tr key={day.session.id} data-active={day.session.id === selectedSessionId}>
                    <td>
                      <Link href={`${base}?${new URLSearchParams({ ...(query as Record<string, string>), session: day.session.id }).toString()}`}>
                        {day.session.startedAt.toLocaleDateString(hi ? "hi-IN" : "en-IN")}
                      </Link>
                    </td>
                    <td>{day.session.startedAt.toLocaleTimeString(hi ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{day.session.endedAt ? day.session.endedAt.toLocaleTimeString(hi ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{day.visited}</td>
                    <td>{day.orders}</td>
                    <td>₹{day.bookedValue.toLocaleString("en-IN")}</td>
                    <td>{day.newRetailers}</td>
                    <td>{day.photos}</td>
                    <td>
                      <span className={styles.badge}>{day.session.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={`${styles.cardList} ${styles.mobileOnly}`}>
            {history.map((day) => (
              <li key={day.session.id} className={styles.cardListItem} data-active={day.session.id === selectedSessionId}>
                <Link href={`${base}?${new URLSearchParams({ ...(query as Record<string, string>), session: day.session.id }).toString()}`}>
                  <strong>{day.session.startedAt.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</strong>
                </Link>
                <span className={styles.badge}>{day.session.status}</span>
                <p>
                  {hi ? "देखे गए" : "Visited"} {day.visited} · {hi ? "ऑर्डर" : "Orders"} {day.orders} · ₹
                  {day.bookedValue.toLocaleString("en-IN")}
                </p>
                <p>
                  {hi ? "नए ग्राहक" : "New customers"} {day.newRetailers} · {hi ? "फ़ोटो" : "Photos"} {day.photos}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TaDaSummaryPanel({
  language,
  summary,
}: {
  language: UiLanguage;
  summary: Awaited<ReturnType<typeof executiveTaDaMonthlySummary>>;
}) {
  const hi = language === "HI";
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "यात्रा भत्ता और दैनिक भत्ता" : "TRAVEL & DAILY ALLOWANCE"}</small>
        <h2>{hi ? "मेरी यात्रा (इस माह)" : "My Travel (this month)"}</h2>
      </div>
      <p className={styles.readOnly}>
        {summary.ratePerKm == null
          ? hi ? "GPS चेकपॉइंट दूरी उपलब्ध है। TA नीति कॉन्फ़िगर नहीं है।" : "Estimated GPS checkpoint distance is available. TA policy not configured."
          : hi
            ? `GPS चेकपॉइंट से अनुमानित दूरी। दर: ₹${summary.ratePerKm}/किमी, ₹${summary.dailyAllowance}/दिन।`
            : `Estimated travel distance from GPS checkpoints (not actual road distance). Rate: ₹${summary.ratePerKm}/km, ₹${summary.dailyAllowance}/day.`}
      </p>
      <dl className={styles.statGrid}>
        <div>
          <dt>{hi ? "योग्य दिन" : "Eligible days"}</dt>
          <dd>{summary.totals.eligibleDays}</dd>
        </div>
        <div>
          <dt>{hi ? "कुल टीए" : "Total TA"}</dt>
          <dd>{summary.totals.taAmount == null ? (hi ? "नीति नहीं" : "Policy not configured") : `₹${summary.totals.taAmount.toLocaleString("en-IN")}`}</dd>
        </div>
        <div>
          <dt>{hi ? "कुल डीए" : "Total DA"}</dt>
          <dd>{summary.totals.daAmount == null ? "—" : `₹${summary.totals.daAmount.toLocaleString("en-IN")}`}</dd>
        </div>
        <div>
          <dt>{hi ? "कुल टीए+डीए" : "Total TA+DA"}</dt>
          <dd>{summary.totals.totalTaDa == null ? "—" : `₹${summary.totals.totalTaDa.toLocaleString("en-IN")}`}</dd>
        </div>
      </dl>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "दिनांक" : "Date"}</th>
              <th>{hi ? "प्रारंभ / समाप्त" : "Start / End"}</th>
              <th>{hi ? "विज़िट" : "Visits"}</th>
              <th>{hi ? "दूरी (किमी)" : "Distance (km)"}</th>
              <th>{hi ? "योग्य किमी" : "Eligible km"}</th>
              <th>{hi ? "ड्यूटी" : "Duty type"}</th>
              <th>{hi ? "टीए दर" : "TA rate"}</th>
              <th>{hi ? "टीए" : "TA"}</th>
              <th>{hi ? "डीए योग्य" : "DA eligible"}</th>
              <th>{hi ? "डीए" : "DA"}</th>
              <th>{hi ? "HQ प्रारंभ / वापसी" : "HQ start / return"}</th>
              <th>{hi ? "अपवाद" : "Exceptions"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.sessionId}>
                <td>{row.date.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</td>
                <td>{row.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} / {row.endTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "—"}</td>
                <td>{row.visits}</td>
                <td>{row.gpsDistanceKm.toFixed(1)}</td>
                <td>{row.eligibleDistanceKm.toFixed(1)}</td>
                <td>{row.dutyType}</td>
                <td>{row.taRatePerKm == null ? "—" : `₹${row.taRatePerKm}/km`}</td>
                <td>{row.taAmount == null ? "—" : `₹${row.taAmount.toLocaleString("en-IN")}`}</td>
                <td>{row.daEligible ? (hi ? "हाँ" : "Yes") : hi ? "नहीं" : "No"}</td>
                <td>{row.daStatus === "NOT_APPLICABLE" ? (hi ? "लागू नहीं" : "Not applicable") : row.daStatus === "POLICY_NOT_CONFIGURED" ? (hi ? "नीति लंबित" : "Policy not configured") : row.daAmount == null ? "—" : `₹${row.daAmount.toLocaleString("en-IN")}`}</td>
                <td>
                  {row.hqStart == null ? "—" : row.hqStart ? "✓" : "!"} /{" "}
                  {row.hqReturn == null ? "—" : row.hqReturn ? "✓" : "!"}
                </td>
                <td>{row.exceptions.length ? row.exceptions.join(", ") : "—"}</td>
                <td>{row.status}{row.gpsReviewRequired ? " · GPS REVIEW" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.rows.length === 0 && (
        <p className={styles.readOnly}>
          {hi ? "इस माह अभी तक कोई कार्य दिवस दर्ज नहीं हुआ।" : "No work days recorded yet this month."}
        </p>
      )}
      <TravelAdjustmentActions language={language} records={summary.rows.filter((row) => row.claimId && ["RETURNED", "TRAVEL_REVIEW_REQUIRED", "MANAGER_REJECTED"].includes(row.status)).map((row) => ({ claimId: row.claimId!, date: row.date.toISOString(), calculatedKm: row.gpsDistanceKm, requestedKm: row.eligibleDistanceKm, status: row.status }))} />
    </section>
  );
}

function TravelReportPanel({ language, report }: { language: "EN" | "HI"; report: Awaited<ReturnType<typeof travelReport>> }) {
  const hi = language === "HI";
  return <section className={styles.section}>
    <div><small>{hi ? "यात्रा और टीए रिपोर्ट" : "TRAVEL & TA REPORT"}</small><h2>{hi ? "अधिकृत सारांश" : "Authoritative summary"}</h2></div>
    <form method="get" className={styles.filters} style={{ gridColumn: "1/-1" }}><label>{hi ? "से" : "From"}<input type="date" name="from" /></label><label>{hi ? "तक" : "To"}<input type="date" name="to" /></label><label>{hi ? "कर्मचारी" : "Employee"}<select name="employee"><option value="">{hi ? "सभी" : "All"}</option>{report.rows.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.employeeName}</option>)}</select></label><label>{hi ? "प्रबंधक" : "Manager"}<select name="manager"><option value="">{hi ? "सभी" : "All"}</option>{[...new Map(report.rows.filter((row) => row.managerId).map((row) => [row.managerId!, row.managerName ?? row.managerId!])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>{hi ? "भूमिका" : "Role"}<select name="role"><option value="">{hi ? "सभी" : "All"}</option><option>SALES_EXECUTIVE</option><option>SALES_MANAGER</option></select></label><label>{hi ? "स्थिति" : "Status"}<select name="status"><option value="">{hi ? "सभी" : "All"}</option><option>READY_FOR_REVIEW</option><option>TRAVEL_REVIEW_REQUIRED</option><option>SENT_TO_ACCOUNTS</option><option>PAID</option><option>MANAGER_REJECTED</option><option>RETURNED</option></select></label><button>{hi ? "लागू करें" : "Apply"}</button></form>
    <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}><table><thead><tr>
      <th>{hi ? "कर्मचारी" : "Employee"}</th><th>{hi ? "भूमिका" : "Role"}</th><th>{hi ? "प्रबंधक" : "Manager"}</th><th>HQ</th><th>{hi ? "कार्य दिवस" : "Working days"}</th><th>{hi ? "यात्रा दिवस" : "Travel days"}</th><th>{hi ? "विज़िट" : "Visits"}</th><th>{hi ? "गणना किमी" : "Calculated km"}</th><th>{hi ? "योग्य किमी" : "Eligible km"}</th><th>{hi ? "स्थानीय" : "Local days"}</th><th>{hi ? "बाहरी" : "Outstation days"}</th><th>TA</th><th>DA</th><th>{hi ? "कुल स्वीकृत" : "Total approved"}</th><th>{hi ? "अकाउंट्स" : "Sent to Accounts"}</th><th>{hi ? "भुगतान" : "Paid"}</th><th>{hi ? "लंबित" : "Pending"}</th><th>{hi ? "अपवाद" : "Exceptions"}</th>
    </tr></thead><tbody>{report.rows.map((row) => <tr key={row.employeeId}><td>{row.employeeName}</td><td>{row.role}</td><td>{row.managerName ?? "—"}</td><td>{row.headquarters ?? "—"}</td><td>{row.workingDays}</td><td>{row.travelDays}</td><td>{row.visits}</td><td>{row.calculatedKm.toFixed(1)}</td><td>{row.eligibleKm.toFixed(1)}</td><td>{row.localHqDays}</td><td>{row.outstationDays}</td><td>₹{row.taAmount.toLocaleString("en-IN")}</td><td>₹{row.daAmount.toLocaleString("en-IN")}</td><td>₹{row.totalApproved.toLocaleString("en-IN")}</td><td>₹{row.sentToAccounts.toLocaleString("en-IN")}</td><td>₹{row.paid.toLocaleString("en-IN")}</td><td>₹{row.pending.toLocaleString("en-IN")}</td><td>{row.exceptions}</td></tr>)}</tbody></table></div>
  </section>;
}

function AccountsTravelHistory({ language, claims }: { language: "EN" | "HI"; claims: Awaited<ReturnType<typeof accountsTravelClaims>> }) {
  const hi = language === "HI";
  return <section className={styles.section}><div><small>{hi ? "अकाउंट्स यात्रा" : "ACCOUNTS TRAVEL"}</small><h2>{hi ? "लंबित भुगतान और इतिहास" : "Pending payment and history"}</h2></div><div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}><table><thead><tr><th>{hi ? "दावा" : "Claim"}</th><th>{hi ? "कर्मचारी" : "Employee"}</th><th>{hi ? "दिनांक" : "Date"}</th><th>{hi ? "ड्यूटी" : "Duty"}</th><th>{hi ? "गणना किमी" : "Calculated km"}</th><th>{hi ? "योग्य किमी" : "Eligible km"}</th><th>{hi ? "टीए दर" : "TA rate"}</th><th>TA</th><th>DA</th><th>{hi ? "कुल" : "Total"}</th><th>{hi ? "स्थिति" : "Status"}</th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td>{claim.claimNumber}</td><td>{claim.employeeId}</td><td>{claim.claimDate.toLocaleDateString(hi ? "hi-IN" : "en-IN")}</td><td>{claim.dutyType}</td><td>{Number(claim.originalDistanceKm).toFixed(1)}</td><td>{Number(claim.approvedDistanceKm ?? claim.claimedDistanceKm).toFixed(1)}</td><td>{claim.taRatePerKm == null ? "—" : `₹${Number(claim.taRatePerKm)}/km`}</td><td>{claim.taAmount == null ? "—" : `₹${Number(claim.taAmount).toLocaleString("en-IN")}`}</td><td>{claim.daStatus === "NOT_APPLICABLE" ? "Not applicable" : claim.daStatus === "POLICY_NOT_CONFIGURED" ? "Policy not configured" : claim.daAmount == null ? "—" : `₹${Number(claim.daAmount).toLocaleString("en-IN")}`}</td><td>{claim.totalApproved == null ? "—" : `₹${Number(claim.totalApproved).toLocaleString("en-IN")}`}</td><td>{claim.status}</td></tr>)}</tbody></table></div></section>;
}

function BeatRoutePanel({
  language,
  range,
  base,
  beat,
}: {
  language: UiLanguage;
  range: "today" | "tomorrow" | "week";
  base: string;
  beat: Awaited<ReturnType<typeof executiveBeat>>;
}) {
  const hi = language === "HI";
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "बीट और मार्ग" : "BEAT & ROUTE"}</small>
        <h2>{hi ? "मार्ग योजना" : "Route plan"}</h2>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {(["today", "tomorrow", "week"] as const).map((tab) => (
          <Link
            key={tab}
            href={`${base}?range=${tab}`}
            className={styles.badge}
            style={range === tab ? { background: "#b4232d", color: "#fff" } : undefined}
          >
            {tab === "today"
              ? hi
                ? "आज"
                : "Today"
              : tab === "tomorrow"
                ? hi
                  ? "कल"
                  : "Tomorrow"
                : hi
                  ? "यह सप्ताह"
                  : "This week"}
          </Link>
        ))}
      </div>
      {/* Final Master Revision (Beat/Route add-on, 22-Aug): these are three genuinely different
          conditions and must read differently — "no plan published at all" is not the same fact
          as "a real published plan resolves to zero retailers" (a real, distinct data gap the
          Manager needs to know about), and neither is the same as "retailers found." Previously
          the no-plan and zero-retailer messages could both render at once, and a published plan
          with zero resolved retailers was indistinguishable from no plan ever existing. */}
      {!beat.hasPublishedPlan ? (
        <p className={styles.readOnly}>
          {hi
            ? "इस दिन के लिए कोई मार्ग निर्दिष्ट नहीं किया गया है।"
            : "No route has been assigned for this day."}
        </p>
      ) : beat.retailers.length === 0 ? (
        <p className={styles.readOnly}>
          {hi
            ? "प्रकाशित योजना में कोई खुदरा विक्रेता निर्दिष्ट नहीं है।"
            : "Published plan has no retailers assigned."}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "दुकान" : "Shop"}</th>
                <th>{hi ? "स्वामी / मोबाइल" : "Owner / mobile"}</th>
                <th>{hi ? "फॉलो-अप" : "Follow-up"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {beat.retailers.map((retailer) => (
                <tr key={retailer.id}>
                  <td>{retailer.businessName}</td>
                  <td>
                    {retailer.ownerName ?? "—"} · {retailer.mobile ?? "—"}
                  </td>
                  <td>{retailer.followUpAt ? date(retailer.followUpAt, language) : "—"}</td>
                  <td>
                    <span className={styles.badge}>{retailer.visitStatus ?? "PLANNED"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {range === "today" && (
        <Link href="/portal/sales-executive/today" className={styles.badge}>
          {hi ? "आज की टैब पर चेक-इन करें" : "Check in from the Today tab"}
        </Link>
      )}
    </section>
  );
}

async function rowsFor(
  db: PrismaClient,
  userId: string,
  portal: string,
  item: SurfaceItem,
  q: string,
  skip: number,
): Promise<Row[]> {
  const scope = await analyticsScope(db, userId, scopePortal(portal));
  const party = scope.partyIds,
    employees = scope.employeeIds,
    retailerIds = scope.retailerIds,
    take = 30;
  if (item.kind === "employee")
    return (
      await db.seeraEmployeeDocument.findMany({
        where: {
          employeeId: userId,
          type: item.slug === "my-salary" ? "SALARY_SLIP" : "POLICY",
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.title,
      secondary: x.periodLabel ?? "—",
      status: "ISSUED",
      date: x.createdAt,
    }));
  if (item.kind === "orders")
    return (
      await db.seeraSalesOrder.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { orderNumber: { contains: q, mode: "insensitive" } },
                  { notes: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(party
            ? {
                OR: [
                  { buyerPartnerId: { in: party } },
                  { sellerPartnerId: { in: party } },
                ],
              }
            : {}),
          ...(employees ? { salespersonId: { in: employees } } : {}),
          ...(retailerIds ? { retailerId: { in: retailerIds } } : {}),
        },
        include: {
          buyerPartner: { select: { legalName: true } },
          sellerPartner: { select: { legalName: true } },
          _count: { select: { lines: true, deliveries: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.orderNumber,
      secondary: `${x.sellerPartner?.legalName ?? "Company / party"} → ${x.buyerPartner?.legalName ?? "Retailer / party"} · ${x._count.lines} items`,
      status: x.status,
      metric: money(x.total),
      date: x.createdAt,
    }));
  if (item.kind === "partners")
    return (
      await db.seeraPartner.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { legalName: { contains: q, mode: "insensitive" } },
                  { tradeName: { contains: q, mode: "insensitive" } },
                  { code: { contains: q, mode: "insensitive" } },
                  { primaryContact: { path: ["mobile"], string_contains: q } },
                ],
              }
            : {}),
          ...(item.slug === "super-stockists"
            ? { type: "SUPER_STOCKIST" }
            : item.slug === "distributors"
              ? { type: "DISTRIBUTOR" }
              : {}),
          ...(portal === "super-stockist" && item.slug === "distributors" && party
            ? { assignedSuperStockistId: { in: party } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => {
      // Firm names are not unique across towns (e.g. two "Sahu Kirana" distributors in different
      // towns) — disambiguate the primary display line with Town whenever the freeform addresses
      // JSON has one, per the {line, area, city, state, pincode} convention formatAddress() already
      // relies on elsewhere in this codebase, rather than forcing readers to decode the partner code.
      const city = (x.addresses as { city?: string } | null)?.city;
      const firm = x.tradeName ?? x.legalName;
      return {
        id: x.id,
        primary: city ? `${firm} — ${city}` : firm,
        secondary: `${x.code} · ${x.type}`,
        status: x.lifecycle,
        date: x.updatedAt,
      };
    });
  if (item.kind === "retailers")
    return (
      await db.seeraRetailer.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { businessName: { contains: q, mode: "insensitive" } },
                  { code: { contains: q, mode: "insensitive" } },
                  { mobile: { contains: q } },
                ],
              }
            : {}),
          ...(party ? { distributorId: { in: party } } : {}),
          ...(employees ? { salespersonId: { in: employees } } : {}),
        },
        orderBy: item.slug === "new-retailers" ? { createdAt: "desc" } : { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.businessName,
      secondary: `${x.code} · ${x.shopType ?? "Unclassified"}${x.source === "UNPLANNED_FIELD_ADDED" ? " · Field-added" : ""}`,
      status: x.lifecycle,
      date: item.slug === "new-retailers" ? x.createdAt : x.updatedAt,
    }));
  if (item.kind === "inventory" && item.slug === "stock-reconciliation")
    return (
      await db.seeraStockReconciliation.findMany({
        where: {
          ...(party ? { partyId: { in: party } } : {}),
          ...(q ? { reason: { contains: q, mode: "insensitive" } } : {}),
        },
        include: { lines: { select: { variance: true } } },
        orderBy: { periodEnd: "desc" },
        skip,
        take,
      })
    ).map((x) => {
      const variance = x.lines.reduce((sum, line) => sum + Number(line.variance), 0);
      return {
        id: x.id,
        primary: `${x.partyType} · ${x.periodEnd.toLocaleDateString("en-IN")}`,
        secondary: `${x.lines.length} SKU · net variance ${variance}`,
        status: x.status,
        metric: String(variance),
        date: x.createdAt,
      };
    });
  if (item.kind === "finance" && item.slug === "collections" && portal === "sales-executive") {
    const entries = await db.seeraCollectionEntry.findMany({
      where: {
        ...(employees ? { actorId: { in: employees } } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: "insensitive" } },
                { invoiceRef: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { collectedAt: "desc" },
      skip,
      take,
    });
    const retailerNames = new Map(
      (
        await db.seeraRetailer.findMany({
          where: { id: { in: entries.map((x) => x.retailerId) } },
          select: { id: true, businessName: true },
        })
      ).map((x) => [x.id, x.businessName]),
    );
    return entries.map((x) => ({
      id: x.id,
      primary: retailerNames.get(x.retailerId) ?? x.retailerId,
      secondary: `${x.paymentMode} · ${x.reference ?? x.invoiceRef ?? "—"}`,
      status: x.remarks ?? "Recorded",
      metric: money(Number(x.amount)),
      date: x.collectedAt,
    }));
  }
  if (item.kind === "finance" && item.slug === "collections")
    return (
      await db.seeraPaymentPromise.findMany({
        where: {
          order: { sellerPartnerId: { in: party ?? [] } },
          ...(q ? { reason: { contains: q, mode: "insensitive" } } : {}),
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              buyerPartner: { select: { legalName: true, tradeName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.order.orderNumber,
      secondary: `${x.order.buyerPartner?.tradeName ?? x.order.buyerPartner?.legalName ?? "Distributor"} · promised ${x.promisedPaymentDate.toLocaleDateString("en-IN")}`,
      status: x.reason,
      date: x.createdAt,
    }));
  if (item.kind === "inventory")
    return (
      await db.seeraInventoryMovement.findMany({
        where: {
          ...(party ? { partyId: { in: party } } : {}),
          ...(q
            ? {
                OR: [
                  { sourceType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                  { sku: { code: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: { sku: { select: { code: true, productName: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: `${x.sku.code} · ${x.sku.productName}`,
      secondary: `${x.type} · ${x.direction} · ${x.reason}`,
      status: x.partyType,
      metric: String(x.quantity),
      date: x.occurredAt,
    }));
  if (item.kind === "deliveries")
    return (
      await db.seeraDelivery.findMany({
        where: {
          ...(party
            ? {
                order: {
                  OR: [
                    { buyerPartnerId: { in: party } },
                    { sellerPartnerId: { in: party } },
                  ],
                },
              }
            : {}),
          ...(q
            ? {
                OR: [
                  {
                    order: {
                      orderNumber: { contains: q, mode: "insensitive" },
                    },
                  },
                  { receiverName: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              retailer: { select: { businessName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.order.orderNumber,
      secondary: x.order.retailer?.businessName ?? x.receiverName ?? "Delivery",
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "documents")
    return (
      await db.seeraCommercialDocument.findMany({
        where: {
          ...(party
            ? { OR: [{ issuerId: { in: party } }, { buyerId: { in: party } }] }
            : {}),
          ...(item.slug === "quotations"
            ? { type: "QUOTATION_DOCUMENT" as const }
            : item.slug === "billing"
              ? {
                  type: {
                    in: [
                      "TAX_INVOICE",
                      "NON_TAX_INVOICE",
                      "PRO_FORMA_INVOICE",
                      "DELIVERY_CHALLAN",
                      "CREDIT_NOTE",
                      "DEBIT_NOTE",
                    ] as const,
                  },
                }
              : {}),
          ...(q
            ? {
                OR: [{ documentNumber: { contains: q, mode: "insensitive" } }],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.documentNumber ?? `${x.type} draft`,
      secondary: `${x.issuerType} → ${x.buyerType}`,
      status: x.status,
      metric: money(x.grandTotal),
      date: x.issuedAt ?? x.createdAt,
    }));
  if (item.kind === "finance") {
    if (
      [
        "payments",
        "receipts",
        "payment-inbox",
        "allocations",
        "reconciliation",
      ].includes(item.slug)
    )
      return (
        await db.seeraPaymentRecord.findMany({
          where: {
            ...(party
              ? { OR: [{ payerId: { in: party } }, { payeeId: { in: party } }] }
              : {}),
            ...(q
              ? {
                  OR: [
                    { paymentNumber: { contains: q, mode: "insensitive" } },
                    { reference: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        })
      ).map((x) => ({
        id: x.id,
        primary: x.paymentNumber,
        secondary: `${x.paymentMode} · ${x.reference}`,
        status: x.status,
        metric: money(x.amountClaimed),
        date: x.paymentDate,
      }));
    return (
      await db.seeraFinancialEntry.findMany({
        where: {
          ...(party
            ? {
                OR: [
                  { debitPartyId: { in: party } },
                  { creditPartyId: { in: party } },
                ],
              }
            : {}),
          ...(q
            ? {
                OR: [
                  { entryNumber: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.entryNumber,
      secondary: `${x.type} · ${x.reason}`,
      status: x.status,
      metric: money(x.amount),
      date: x.postedAt ?? x.createdAt,
    }));
  }
  if (item.kind === "field") {
    if (item.slug === "photo-compliance")
      return (
        await db.seeraVisitPhoto.findMany({
          where: {
            deletedAt: null,
            ...(employees ? { actorId: { in: employees } } : {}),
            ...(q ? { photoType: { contains: q, mode: "insensitive" } } : {}),
          },
          include: { visit: { include: { retailer: { select: { businessName: true } } } } },
          orderBy: { capturedAt: "desc" },
          skip,
          take,
        })
      ).map((x) => ({
        id: x.id,
        primary: x.visit.retailer?.businessName ?? "Field photo",
        secondary: x.photoType,
        status: x.deletedAt ? "REMOVED" : "RECORDED",
        date: x.capturedAt,
      }));
    if (item.slug === "partner-visits") {
      const visits = await db.seeraVisit.findMany({
        where: {
          partnerId: { not: null },
          ...(employees ? { workSession: { employeeId: { in: employees } } } : {}),
          ...(q ? { notes: { contains: q, mode: "insensitive" } } : {}),
        },
        include: { workSession: { select: { employeeRole: true } } },
        orderBy: { checkedInAt: "desc" },
        skip,
        take,
      });
      const partnerNames = new Map(
        (
          await db.seeraPartner.findMany({
            where: { id: { in: visits.map((v) => v.partnerId!).filter(Boolean) } },
            select: { id: true, legalName: true, tradeName: true },
          })
        ).map((p) => [p.id, p.tradeName ?? p.legalName]),
      );
      return visits.map((x) => ({
        id: x.id,
        primary: partnerNames.get(x.partnerId!) ?? `${x.partnerType} visit`,
        secondary: `${x.partnerType} · ${x.workSession.employeeRole}`,
        status: x.outcome,
        date: x.checkedInAt,
      }));
    }
    if (["visits", "retailing", "joint-working"].includes(item.slug))
      return (
        await db.seeraVisit.findMany({
          where: {
            retailerId: { not: null },
            ...(employees
              ? { workSession: { employeeId: { in: employees } } }
              : {}),
            ...(q
              ? {
                  OR: [
                    { notes: { contains: q, mode: "insensitive" } },
                    {
                      retailer: {
                        businessName: { contains: q, mode: "insensitive" },
                      },
                    },
                  ],
                }
              : {}),
          },
          include: {
            retailer: { select: { businessName: true } },
            workSession: { select: { employeeRole: true } },
          },
          orderBy: { checkedInAt: "desc" },
          skip,
          take,
        })
      ).map((x) => ({
        id: x.id,
        primary: x.retailer?.businessName ?? "Retailer visit",
        secondary: x.workSession.employeeRole,
        status: x.outcome,
        date: x.checkedInAt,
      }));
    return (
      await db.seeraWorkSession.findMany({
        where: {
          ...(employees ? { employeeId: { in: employees } } : {}),
          ...(q ? { remarks: { contains: q, mode: "insensitive" } } : {}),
        },
        orderBy: { startedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.employeeRole.replaceAll("_", " "),
      secondary: x.workingType,
      status: x.status,
      date: x.startedAt,
    }));
  }
  if (item.kind === "team")
    return (
      await db.user.findMany({
        where: {
          ...(employees ? { id: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          roleAssignments: {
            where: { status: "ACTIVE" },
            include: { role: true },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.name ?? x.email,
      secondary: x.roleAssignments.map((a) => a.role.name).join(", "),
      status: x.status,
      date: x.updatedAt,
    }));
  if (item.kind === "instructions")
    return (
      await db.seeraManagerInstruction.findMany({
        where: {
          ...(portal === "sales-manager" ? { managerId: userId } : { assignedEmployeeId: userId }),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { body: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.title,
      secondary: x.priority,
      status: x.status,
      date: x.dueAt ?? x.createdAt,
    }));
  if (item.kind === "prospects")
    return (
      await db.seeraProspect.findMany({
        where: {
          ...(employees ? { ownerEmployeeId: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { businessName: { contains: q, mode: "insensitive" } },
                  { normalizedMobile: { contains: q } },
                  { areaId: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.businessName,
      secondary: `${x.normalizedMobile} · ${x.areaId ?? "—"}`,
      status: x.status,
      date: x.updatedAt,
    }));
  if (item.kind === "approvals" && item.slug === "credit-exceptions") {
    // Founder/Admin UAT correction (P0, global audit): credit-extension requests
    // (requestCreditExtension) live in their own SeeraCreditExtension model, never mirrored into
    // the generic SeeraApprovalItem table the "approvals" kind normally reads — so this nav item
    // (already present, permission-gated correctly on credit_extension:approve) always rendered an
    // empty list. This reads the real model instead.
    const extensions = await db.seeraCreditExtension.findMany({
      where: q ? { reason: { contains: q, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
    const orders = extensions.length
      ? await db.seeraSalesOrder.findMany({
          where: { id: { in: extensions.map((e) => e.orderId) } },
          select: { id: true, orderNumber: true, total: true, sellerPartner: { select: { legalName: true, tradeName: true } } },
        })
      : [];
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    return extensions.map((e) => {
      const order = orderMap.get(e.orderId);
      return {
        id: e.id,
        primary: order?.orderNumber ?? e.orderId,
        secondary: `${order?.sellerPartner?.tradeName ?? order?.sellerPartner?.legalName ?? "Super Stockist"} · until ${e.extensionUntil.toLocaleDateString("en-IN")}`,
        status: e.status,
        metric: order ? money(order.total) : undefined,
        date: e.createdAt,
      };
    });
  }
  if (item.kind === "approvals")
    return (
      await db.seeraApprovalItem.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { entityType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.entityType,
      secondary: x.reason ?? x.type,
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "claims")
    return (
      await db.seeraClaim.findMany({
        where: {
          ...(party ? { claimantId: { in: party } } : {}),
          ...(q
            ? {
                OR: [
                  { claimNumber: { contains: q, mode: "insensitive" } },
                  { type: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.claimNumber,
      secondary: `${x.claimantType} → ${x.againstPartyType}`,
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "travel")
    return (
      await db.seeraTaClaim.findMany({
        where: {
          ...(employees ? { employeeId: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { claimNumber: { contains: q, mode: "insensitive" } },
                  { remarks: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.claimNumber,
      secondary: x.vehicleType,
      status: x.status,
      metric: money(x.totalApproved ?? x.totalClaimed),
      date: x.claimDate,
    }));
  // "Territories & beats" shares item.kind==="masters" with the product/SKU nav item (same broad
  // master:manage gate), but it is a distinct slug over a distinct model (SeeraGeographyNode, not
  // SeeraSku) — must be checked first or it silently falls through to the SKU list below (final UI
  // reachability audit fix: this nav item previously showed the product catalog instead of
  // Territory/Beat data).
  if (item.slug === "territories")
    return (
      await db.seeraGeographyNode.findMany({
        where: {
          level: { in: ["TERRITORY", "BEAT"] },
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { code: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ level: "asc" }, { name: "asc" }],
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.name,
      secondary: `${x.level} · ${x.code}`,
      status: x.status,
      date: x.updatedAt,
    }));
  if (item.kind === "masters")
    return (
      await db.seeraSku.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: "insensitive" } },
                  { productName: { contains: q, mode: "insensitive" } },
                  { category: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { productName: "asc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.productName,
      secondary: `${x.code} · ${x.packSize} ${x.unitType}`,
      status: x.status,
      metric: money(x.mrp),
      date: x.updatedAt,
    }));
  if (item.kind === "audit")
    return (
      await db.auditLog.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { action: { contains: q, mode: "insensitive" } },
                  { entityType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.action,
      secondary: `${x.actor?.name ?? x.actor?.email ?? "System"} · ${x.entityType}`,
      status: x.outcome,
      date: x.occurredAt,
    }));
  if (item.kind === "automation" || item.kind === "analytics")
    return (
      await db.seeraInsight.findMany({
        where: {
          recipientId: userId,
          ...(q
            ? {
                OR: [
                  { ruleCode: { contains: q, mode: "insensitive" } },
                  { explanationKey: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { generatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.ruleCode.replaceAll("_", " "),
      secondary: x.explanationKey,
      status: x.status,
      metric: x.severity,
      date: x.generatedAt,
    }));
  return [];
}

export async function OperationalWorkspace({
  db,
  userId,
  portal,
  item,
  language,
  query,
  permissions,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  item: SurfaceItem;
  language: UiLanguage;
  query: Record<string, string | undefined>;
  permissions: Set<string>;
}) {
  const q = (query.q ?? "").trim(),
    page = Math.max(1, Number(query.page) || 1),
    hi = language === "HI",
    base = `/portal/${portal}/${item.slug}`;
  let workflow: React.ReactNode = null;
  // PERFORMANCE (P0, Add Customer / every router.refresh()): rowsFor("today") always ran here
  // eagerly, unconditionally, even though the sales-executive "today" branch below never reads
  // its result (FieldJourney is a fully self-contained UI for that page, built from
  // dashboardData/beat/etc.) — a genuinely dead seeraWorkSession.findMany + analyticsScope() call
  // on every single action (every action ends in router.refresh(), which re-runs this whole
  // function). Computed lazily now, right before it's actually rendered, and skipped entirely for
  // "today" — see the toolbar/table section near the end of this function.
  let rows: Awaited<ReturnType<typeof rowsFor>> = [];
  // Founder visual UAT fix: a governed "+ Add X" creation panel used to render as a body block
  // below the page title — real and reachable once the nesting bug above was fixed, but not what
  // the Founder meant by "obvious + ADD action, top-right of the header". List-page create panels
  // set this instead of `workflow` so PageHeading's own `action` slot renders them beside the
  // title, matching the existing Users list page's "+ Add User" placement pattern.
  let headerAction: React.ReactNode = null;
  if (portal === "sales-executive" && item.slug === "today") {
    const now = new Date();
    // dashboardData, beat, distributorFollowUp and skus are all independent reads — only the
    // active-visit lookup depends on dashboardData's session, so it runs after. This turns 5
    // sequential round trips into 2, which is most of what "the portal feels slow after every
    // action" was — every action ends in router.refresh(), which re-runs this exact loader.
    // Catalog is served from a short TTL cache (activeRetailerCatalog, PERFORMANCE PHASE 2) instead
    // of a fresh DB round trip on every router.refresh() — see that function's comment. No invented
    // fallback to `mrp` here: a SKU with no approved governed price (e.g. Seera's field catalog,
    // pending a Founder-approved price list) pre-fills the Executive's Rate field with nothing
    // rather than a fabricated number — they type the real rate themselves.
    // PERFORMANCE PHASE 3: workingDistributor/visit used to run as two MORE sequential awaits
    // after this batch (3 stages total) even though neither depends on anything in it — only on
    // the session, which dashboardData.session already carries but isn't known until this batch
    // resolves. A small redundant session lookup (sessionForContext, cheap/indexed, same filter
    // executiveDashboard already uses internally) is folded into THIS batch instead, so
    // workingDistributor/visit can run in their own single follow-up Promise.all — 2 stages total.
    const [dashboardData, beat, distributorFollowUp, skus, authorizedDistributors, sessionForContext, executiveScope] = await Promise.all([
      executiveDashboard(db, userId, now),
      executiveBeat(db, userId, "today", now),
      executiveDistributorFollowUp(db, userId, now),
      activeRetailerCatalog(db, now),
      executiveAuthorizedDistributors(db, userId),
      db.seeraWorkSession.findFirst({
        where: { employeeId: userId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: { id: true, workingDistributorId: true },
      }),
      // Final Production Closure (23-Aug), P0-12: this Executive's own authoritative Territory
      // scope — resolved once here, then used to fetch ONLY the Beats within it below (never every
      // Beat globally, which is exactly how a Bhilwara Executive's Add Customer form could offer
      // Jhansi Beats before). Empty (no Territory ever assigned) is an explicit empty list.
      resolveExecutiveOperationalScope(db, userId),
    ]);
    const session = dashboardData.session;
    // Final Retailer Cleanup + Handover (22-Aug), scoped by P0-12: real, existing, ACTIVE Beat
    // nodes WITHIN this Executive's own authorized Territory scope only.
    const beatNodes = executiveScope.unrestricted
      ? await db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE" }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" }, take: 300 })
      : await db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE", id: { in: executiveScope.beatIds } }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
    // Firm Name — Town labels (spec: never show an ambiguous firm name alone — two of the Ratan
    // distributors are both literally "Sahu Kirana", distinguishable only by town).
    const distributorLabel = (d: { legalName: string; tradeName: string | null; addresses: unknown }) => {
      const city = (d.addresses as { city?: string } | null)?.city;
      const firm = d.tradeName ?? d.legalName;
      return city ? `${firm} — ${city}` : firm;
    };
    const distributorOptions = authorizedDistributors.map((d) => ({ value: d.id, label: distributorLabel(d) }));
    const beatTerritoryIds = [...new Set(beatNodes.map((b) => b.parentId).filter((x): x is string => Boolean(x)))];
    const beatTerritories = beatTerritoryIds.length
      ? await db.seeraGeographyNode.findMany({ where: { id: { in: beatTerritoryIds } }, select: { id: true, name: true } })
      : [];
    const beatTerritoryName = new Map(beatTerritories.map((t) => [t.id, t.name]));
    const beatOptions = beatNodes.map((b) => ({
      value: b.id,
      label: b.parentId && beatTerritoryName.has(b.parentId) ? `${b.name} (${beatTerritoryName.get(b.parentId)})` : b.name,
      territoryId: b.parentId ?? "",
    }));
    const [workingDistributor, visit] = await Promise.all([
      sessionForContext?.workingDistributorId
        ? db.seeraPartner.findUnique({
            where: { id: sessionForContext.workingDistributorId },
            select: { legalName: true, tradeName: true, addresses: true },
          })
        : Promise.resolve(null),
      sessionForContext
        ? db.seeraVisit.findFirst({
            where: { workSessionId: sessionForContext.id, checkedOutAt: null },
            include: {
              retailer: { select: { businessName: true, mobile: true, distributorId: true, address: true } },
              photos: { where: { deletedAt: null }, orderBy: { capturedAt: "desc" } },
              _count: { select: { orders: true } },
            },
          })
        : Promise.resolve(null),
    ]);
    workflow = (
      <>
      <FieldJourney
        language={language}
        dashboard={{
          employeeName: dashboardData.employee?.name ?? dashboardData.employee?.email ?? "—",
          employeeCode: userId.slice(-8).toUpperCase(),
          manager: null,
          territory: null,
          workingDistributorLabel: workingDistributor ? distributorLabel(workingDistributor) : null,
          dayStatus: dashboardData.dayStatus as "NOT_STARTED" | "ACTIVE" | "ENDED",
          target: dashboardData.target,
          today: dashboardData.today,
        }}
        distributorOptions={distributorOptions}
        beatOptions={beatOptions}
        session={
          session
            ? {
                id: session.id,
                startedAt: session.startedAt.toISOString(),
                workingType: session.workingType,
                workingDistributorId: session.workingDistributorId,
              }
            : undefined
        }
        visit={
          visit?.retailerId
            ? {
                id: visit.id,
                retailerId: visit.retailerId,
                retailerName: visit.retailer?.businessName ?? "Retailer",
                retailerMobile: visit.retailer?.mobile ?? null,
                retailerArea:
                  (() => {
                    const address = visit.retailer?.address as { area?: string; city?: string } | null;
                    return address?.area ?? address?.city ?? null;
                  })(),
                distributorId: visit.retailer?.distributorId ?? null,
                checkedInAt: visit.checkedInAt.toISOString(),
                orderCount: visit._count.orders,
                photos: visit.photos.map((p) => ({
                  id: p.id,
                  photoType: p.photoType,
                  capturedAt: p.capturedAt.toISOString(),
                  secureUrl: p.secureUrl,
                })),
              }
            : undefined
        }
        beatRetailers={beat.retailers.map((r) => ({
          id: r.id,
          businessName: r.businessName,
          ownerName: r.ownerName,
          mobile: r.mobile,
          distributorId: r.distributorId,
          followUpAt: r.followUpAt,
          visitStatus: r.visitStatus,
        }))}
        hasPublishedPlan={beat.hasPublishedPlan}
        skus={skus.map((x) => ({
          id: x.id,
          brand: x.brand,
          productName: x.productName,
          packLabel: `${x.packSize} ${x.unitType}`,
          // No invented fallback to `mrp` here: a SKU with no approved governed price (e.g.
          // Seera's field catalog, pending a Founder-approved price list) pre-fills the
          // Executive's Rate field with nothing rather than a fabricated number — they type the
          // real rate themselves. Only a SKU with a real active price version (today: the
          // Founder-approved MUV catalog) gets pre-filled.
          price: x.prices[0] ? money(x.prices[0].amount) : "—",
          rate: Number(x.prices[0]?.amount ?? 0),
          unitsPerCase: x.unitsPerCase,
          caseUnit: x.unitsPerCase > 1 ? (x.unitType === "g" ? "BOX" : x.unitType === "kg" ? "BAG" : null) : null,
        }))}
      />
      <DistributorFollowUpPanel language={language} entries={distributorFollowUp} />
      </>
    );
  } else if (portal === "sales-executive" && item.slug === "targets") {
    const progress = await executiveTargetProgress(db, userId);
    const distributorIds = progress.distributorContribution
      .map((c) => c.distributorId)
      .filter((id) => id !== "unmapped");
    const distributors = distributorIds.length
      ? await db.seeraPartner.findMany({
          where: { id: { in: distributorIds } },
          select: { id: true, legalName: true, tradeName: true },
        })
      : [];
    workflow = (
      <TargetProgressPanel
        language={language}
        progress={progress}
        distributorNames={new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]))}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "delivered-sales") {
    const deliveredData = await managerDeliveredSales(db, userId, {
      executiveId: query.executiveId || undefined,
      distributorId: query.distributorId || undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      skip: (page - 1) * 30,
      take: 30,
    });
    const team = await db.seeraAssignment.findMany({
      where: {
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        targetId: userId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const [dsExecutives, dsDistributors] = await Promise.all([
      db.user.findMany({
        where: { id: { in: [userId, ...team.map((x) => x.subjectId)] }, status: "ACTIVE" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      db.seeraPartner.findMany({
        where: { type: "DISTRIBUTOR" },
        select: { id: true, legalName: true, tradeName: true },
        orderBy: { legalName: "asc" },
        take: 250,
      }),
    ]);
    workflow = (
      <ManagerDeliveredSalesPanel
        language={language}
        base={base}
        query={query}
        data={deliveredData}
        executives={dsExecutives.map((e) => ({ value: e.id, label: e.name ?? e.email }))}
        distributors={dsDistributors.map((d) => ({ value: d.id, label: d.tradeName ?? d.legalName }))}
      />
    );
  } else if (portal === "sales-executive" && item.slug === "sync") {
    const operations = await listOfflineQueue(db, userId);
    workflow = <SyncStatusPanel language={language} operations={operations} />;
  } else if (portal === "sales-executive" && item.slug === "delivered-sales") {
    const deliveredRows = await executiveDeliveredSales(db, userId, { skip: (page - 1) * 30, take: 30 });
    workflow = <DeliveredSalesPanel language={language} rows={deliveredRows} />;
  } else if (portal === "sales-executive" && item.slug === "ta-expenses") {
    // Founder decision: the Executive never manually enters a TA/DA claim (Founder-UAT, 2026-08-10).
    // This is a read-only view of the GPS-derived, governed ₹/km + ₹/day calculation — no submit form.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const summary = await executiveTaDaMonthlySummary(db, userId, userId, monthStart, monthEnd);
    workflow = <TaDaSummaryPanel language={language} summary={summary} />;
  } else if (portal === "sales-executive" && item.slug === "beat") {
    const range = (["today", "tomorrow", "week"].includes(query.range ?? "")
      ? query.range
      : "today") as "today" | "tomorrow" | "week";
    const beat = await executiveBeat(db, userId, range);
    workflow = <BeatRoutePanel language={language} range={range} base={base} beat={beat} />;
  } else if (portal === "sales-executive" && item.slug === "dsr") {
    const dsrNow = new Date();
    const range = (query.range ?? "month") as "today" | "yesterday" | "week" | "month" | "custom";
    const startOfToday = new Date(dsrNow.getFullYear(), dsrNow.getMonth(), dsrNow.getDate());
    const rangeBounds: Record<string, [Date, Date]> = {
      today: [startOfToday, new Date(startOfToday.getTime() + 86_400_000)],
      yesterday: [new Date(startOfToday.getTime() - 86_400_000), startOfToday],
      week: [new Date(startOfToday.getTime() - 6 * 86_400_000), new Date(startOfToday.getTime() + 86_400_000)],
      month: [new Date(startOfToday.getTime() - 30 * 86_400_000), new Date(startOfToday.getTime() + 86_400_000)],
    };
    const [from, to]: [Date, Date] =
      range === "custom" && query.from
        ? [new Date(query.from), query.to ? new Date(new Date(query.to).getTime() + 86_400_000) : new Date()]
        : (rangeBounds[range] ?? rangeBounds.month!);
    const [activeSession, history] = await Promise.all([
      db.seeraWorkSession.findFirst({
        where: { employeeId: userId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
      }),
      executiveDsrHistory(db, userId, { from, to }),
    ]);
    const selectedSessionId = query.session || activeSession?.id || history[0]?.session.id;
    const dsr = selectedSessionId
      ? await executiveDsr(db, userId, selectedSessionId).catch((e) => ifExpectedNotFound<Awaited<ReturnType<typeof executiveDsr>>>(e))
      : null;
    workflow = (
      <DsrPanel
        language={language}
        base={base}
        query={query}
        range={range}
        dsr={dsr}
        history={history}
        selectedSessionId={selectedSessionId}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "my-day") {
    const active = await db.seeraWorkSession.findFirst({
      where: { employeeId: userId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    const summary = active ? await managerEndDaySummary(db, userId, active.id) : null;
    workflow = (
      <WorkflowActions
        kind="manager-day"
        language={language}
        activeId={active?.id}
        endDaySummary={
          summary
            ? {
                workingType: summary.workingType,
                executivesWorkedWith: summary.executivesWorkedWith,
                retailerVisits: summary.retailerVisits,
                distributorVisits: summary.distributorVisits,
                superStockistVisits: summary.superStockistVisits,
                distributorProspects: summary.distributorProspects,
                ordersCount: summary.ordersCount,
                bookedValue: summary.bookedValue,
                photos: summary.photos,
                followUps: summary.followUps,
                distanceKm: summary.distanceKm,
              }
            : null
        }
      />
    );
  } else if (portal === "sales-manager" && item.slug === "beat-planner" && permissions.has("network:manage")) {
    // Reads both "MANAGER_TEAM" and legacy "TEAM" for consistency with the other three team-scope
    // reads in this file (delivered-sales, instructions) — final audit fix, was the only one of the
    // four narrowed to a single literal value.
    const assignments = await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: userId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, select: { subjectId: true } });
    // Final Production Closure (23-Aug): root cause of Awdhesh (Jhansi) seeing Bhilwara
    // distributors — this screen used to query Territory/Beat suggestions via the completely
    // unscoped geographySuggestions() and distributors via a raw global findMany with no
    // geography filter at all. resolveManagerOperationalScope is the one authoritative resolver
    // (lib/sales-distribution/scope.ts) every Manager-facing geography read must now go through —
    // empty scope (no Territory ever assigned to this Manager/their team) means an explicitly
    // empty list here, never a fallback to "show everything".
    const managerScope = await resolveManagerOperationalScope(db, userId);
    const [executives, territoryNodes, beatNodesScoped, places, distributorPartners, plans, unmapped, beatNodesForAssignment] = await Promise.all([
      db.user.findMany({ where: { id: { in: assignments.map((x) => x.subjectId) }, status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      managerScope.unrestricted
        ? db.seeraGeographyNode.findMany({ where: { level: "TERRITORY", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 })
        : db.seeraGeographyNode.findMany({ where: { level: "TERRITORY", status: "ACTIVE", id: { in: managerScope.territoryIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      managerScope.unrestricted
        ? db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 })
        : db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE", id: { in: managerScope.beatIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.seeraGeographyNode.findMany({ where: { level: { in: [...GEOGRAPHY_TYPES] }, status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" }, take: 300 }),
      managerScope.unrestricted
        ? db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" }, take: 250 })
        : db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE", id: { in: managerScope.distributorIds } }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" } }),
      managerBeatPlans(db, userId),
      unmappedRetailers(db, userId),
      managerScope.unrestricted
        ? db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE" }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" }, take: 300 })
        : db.seeraGeographyNode.findMany({ where: { level: "BEAT", status: "ACTIVE", id: { in: managerScope.beatIds } }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } }),
    ]);
    const territories = territoryNodes;
    const beats = beatNodesScoped;
    const distributors = distributorPartners;
    const unmappedBeatTerritoryIds = [...new Set(beatNodesForAssignment.map((b) => b.parentId).filter((x): x is string => Boolean(x)))];
    const unmappedBeatTerritories = unmappedBeatTerritoryIds.length
      ? await db.seeraGeographyNode.findMany({ where: { id: { in: unmappedBeatTerritoryIds } }, select: { id: true, name: true } })
      : [];
    const unmappedBeatTerritoryName = new Map(unmappedBeatTerritories.map((t) => [t.id, t.name]));
    const unmappedBeatOptions = beatNodesForAssignment.map((b) => ({
      value: b.id,
      label: b.parentId && unmappedBeatTerritoryName.has(b.parentId) ? `${b.name} (${unmappedBeatTerritoryName.get(b.parentId)})` : b.name,
      territoryId: b.parentId ?? "",
    }));
    workflow = (
      <BeatPlannerActions
        language={language}
        executives={executives.map((x) => ({ value: x.id, label: x.name ?? x.email }))}
        territorySuggestions={territories.map((t) => t.name)}
        beatSuggestions={beats.map((b) => b.name)}
        geographySuggestions={[...new Set(places.map((p) => p.name))]}
        distributors={distributors.map((d) => ({ value: d.id, label: d.tradeName ?? d.legalName }))}
        plans={plans.map((p) => ({
          id: p.id,
          employeeName: p.employeeName,
          territoryName: p.territoryName,
          beatName: p.beatName,
          geographyName: p.geographyName,
          geographyType: p.geographyType,
          distributorId: p.distributorId,
          distributorNameSnapshot: p.distributorNameSnapshot,
          dayOfWeek: p.dayOfWeek,
          effectiveFrom: p.effectiveFrom.toISOString(),
          effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString() : null,
          status: p.status,
          retailerCount: p.retailerCount,
          notes: p.notes,
          isFuture: p.isFuture,
        }))}
      />
    );
    workflow = (
      <>
        {workflow}
        <UnmappedRetailersPanel language={language} retailers={unmapped} beatSuggestions={unmappedBeatOptions} />
      </>
    );
  } else if (portal === "sales-manager" && item.slug === "team-review") {
    const [scorecard, syncStatus] = await Promise.all([managerTeamScorecard(db, userId), teamSyncStatus(db, userId)]);
    workflow = <TeamScorecardPanel language={language} scorecard={scorecard} dsrBase={`/portal/${portal}/dsr`} syncStatus={syncStatus} />;
  } else if (portal === "sales-manager" && item.slug === "alerts") {
    const alerts = await managerAlerts(db, userId);
    workflow = <AlertsPanel language={language} alerts={alerts} />;
  } else if (portal === "sales-manager" && item.slug === "instructions") {
    const team = await db.seeraAssignment.findMany({
      where: {
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        targetId: userId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const executives = await db.user.findMany({
      where: { id: { in: team.map((x) => x.subjectId) }, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    workflow = (
      <IssueInstructionActions
        language={language}
        executives={executives.map((x) => ({ value: x.id, label: x.name ?? x.email }))}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "attendance" && permissions.has("network:manage")) {
    const team = await db.seeraAssignment.findMany({
      where: {
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        targetId: userId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const employeeIds = [userId, ...team.map((x) => x.subjectId)];
    const [sessions, users] = await Promise.all([
      db.seeraWorkSession.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: { startedAt: "desc" },
        take: 60,
      }),
      db.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, email: true } }),
    ]);
    const [visitCounts, corrections] = await Promise.all([
      db.seeraVisit.groupBy({ by: ["workSessionId"], where: { workSessionId: { in: sessions.map((s) => s.id) } }, _count: { id: true } }),
      db.auditLog.findMany({ where: { entityType: "SeeraWorkSession", entityId: { in: sessions.map((s) => s.id) }, action: "attendance.corrected" }, select: { entityId: true } }),
    ]);
    const visitCountFor = new Map(visitCounts.map((v) => [v.workSessionId, v._count.id]));
    const correctedIds = new Set(corrections.map((c) => c.entityId));
    const nameFor = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    workflow = (
      <AttendanceCorrectionActions
        language={language}
        sessions={sessions.map((s) => ({
          value: s.id,
          label: `${nameFor.get(s.employeeId) ?? "Employee"} · ${s.startedAt.toLocaleDateString("en-IN")} · ${s.status}`,
          employeeName: nameFor.get(s.employeeId) ?? "Employee",
          date: s.startedAt.toISOString(),
          status: s.status,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt ? s.endedAt.toISOString() : null,
          startGps: s.startLatitude != null,
          endGps: s.endLatitude != null,
          activityCount: visitCountFor.get(s.id) ?? 0,
          alreadyCorrected: correctedIds.has(s.id),
        }))}
      />
    );
  } else if (portal === "sales-executive" && item.slug === "instructions") {
    const instructions = await db.seeraManagerInstruction.findMany({
      where: { assignedEmployeeId: userId },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 50,
    });
    workflow = (
      <RespondInstructionActions
        language={language}
        instructions={instructions.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
          priority: i.priority,
          status: i.status,
          dueAt: i.dueAt ? i.dueAt.toISOString() : null,
          acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
        }))}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "dsr") {
    const rollup = await managerDsrRollup(db, userId, {
      date: query.date ? new Date(query.date) : undefined,
      employeeId: query.employeeId || undefined,
      geographyId: query.geographyId || undefined,
      distributorId: query.distributorId || undefined,
      skip: (page - 1) * 30,
      take: 30,
    });
    const detail = query.session
      ? await managerDsrDetail(db, userId, query.session).catch((e) => ifExpectedNotFound<Awaited<ReturnType<typeof managerDsrDetail>>>(e))
      : null;
    const [dsrGeographies, dsrDistributors] = await Promise.all([
      db.seeraGeographyNode.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, level: true },
        orderBy: [{ level: "asc" }, { name: "asc" }],
        take: 250,
      }),
      db.seeraPartner.findMany({
        where: { type: "DISTRIBUTOR" },
        select: { id: true, legalName: true, tradeName: true },
        orderBy: { legalName: "asc" },
        take: 250,
      }),
    ]);
    workflow = (
      <ManagerDsrRollupPanel
        language={language}
        base={base}
        query={query}
        rollup={rollup}
        detail={detail}
        geographies={dsrGeographies.map((g) => ({ value: g.id, label: `${g.name} · ${g.level}` }))}
        distributors={dsrDistributors.map((d) => ({ value: d.id, label: d.tradeName ?? d.legalName }))}
      />
    );
  } else if (
    portal === "sales-manager" &&
    ["distributor-search", "prospects"].includes(item.slug)
  ) {
    const prospects = await db.seeraProspect.findMany({
      where: { ownerEmployeeId: userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    workflow = (
      <>
        <WorkflowActions kind="prospect" language={language} />
        <ProspectPipelineActions
          language={language}
          prospects={prospects.map((p) => ({
            id: p.id,
            businessName: p.businessName,
            normalizedMobile: p.normalizedMobile,
            prospectType: p.prospectType,
            stage: p.stage,
            followUpAt: p.followUpAt ? p.followUpAt.toISOString() : null,
            notes: p.notes,
          }))}
        />
      </>
    );
  } else if (portal === "sales-executive" && item.slug === "prospects") {
    workflow = (
      <WorkflowActions
        kind="prospect"
        language={language}
        prospectEndpoint="/api/field/operations"
        prospectAction="create-prospect"
      />
    );
  } else if (
    portal === "sales-manager" &&
    item.slug === "retailing" &&
    permissions.has("manager_field:operate")
  ) {
    // Any active Manager field day can do Manager Retailing — workingType is reporting metadata,
    // not a gate (see activeManagerFieldSession()'s own comment in manager-service.ts, which this
    // query previously contradicted). Restricting to workingType RETAILING/MARKET_WORKING here
    // meant a Manager who started the day as DISTRIBUTOR_VISIT, TEAM_REVIEW, etc. — a perfectly
    // normal choice — got `session: null`, so `sessionId` silently became `undefined`, which
    // JSON.stringify drops entirely from the request body, which Zod then rejects as a missing
    // required field: the actual root cause of "Request validation failed" on this screen.
    // team doesn't depend on session/visit (and retailers doesn't depend on session/visit either,
    // only on team) — these were 4 sequential round trips for no reason; now 2 rounds of 2.
    const [session, team] = await Promise.all([
      db.seeraWorkSession.findFirst({
        where: {
          employeeId: userId,
          employeeRole: "SALES_MANAGER",
          status: "ACTIVE",
        },
        orderBy: { startedAt: "desc" },
      }),
      db.seeraAssignment.findMany({
        where: {
          assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
          targetId: userId,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        select: { subjectId: true },
      }),
    ]);
    const [visit, retailers] = await Promise.all([
      session
        ? db.seeraVisit.findFirst({
            where: { workSessionId: session.id, checkedOutAt: null },
          })
        : Promise.resolve(null),
      db.seeraRetailer.findMany({
        where: {
          lifecycle: "ACTIVE",
          salespersonId: { in: [userId, ...team.map((x) => x.subjectId)] },
        },
        select: { id: true, businessName: true, code: true },
        orderBy: { businessName: "asc" },
        take: 150,
      }),
    ]);
    const now = new Date();
    const [skus, retailingDistributors] = await Promise.all([
      // Same catalog rule as the Sales Executive selector (see its own query's comment): no longer
      // requires an active DISTRIBUTOR_TO_RETAILER price version to appear here. Manager Retailing
      // Correction Pass #2 traced the Founder's "wrong/legacy product data" report to exactly this
      // mismatch — the Founder-approved 9-item Seera catalog has no governed price yet (Rate is
      // typed manually by the Manager), so requiring a priced tier hid every real product and left
      // only the old demo fixture SKUs (which do have a legacy price row) visible.
      db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        include: {
          prices: {
            where: {
              tier: "DISTRIBUTOR_TO_RETAILER",
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
        orderBy: { productName: "asc" },
        take: 200,
      }),
      db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" }, take: 250 }),
    ]);
    workflow = (
      <ManagerFieldActions
        kind="retailing"
        language={language}
        sessionId={session?.id}
        activeVisit={visit?.id}
        retailers={retailers.map((x) => ({
          value: x.id,
          label: x.businessName,
          meta: x.code,
        }))}
        distributors={retailingDistributors.map((d) => ({ value: d.id, label: d.tradeName ?? d.legalName }))}
        skus={skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName} (${x.packSize.toString()} ${x.unitType})`,
          brand: x.brand,
          meta: String(x.prices[0]?.amount ?? x.mrp),
          unit: x.unitType,
        }))}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "partner-visits") {
    // Same root cause as the Manager Retailing session lookup above — no workingType gate; any
    // active Manager session (Distributor Visit, Super Stockist Visit, etc. — all the natural
    // choices for a day meant for partner visits) counts.
    const session = await db.seeraWorkSession.findFirst({
      where: {
        employeeId: userId,
        employeeRole: "SALES_MANAGER",
        status: "ACTIVE",
      },
      orderBy: { startedAt: "desc" },
    });
    const visit = session
      ? await db.seeraVisit.findFirst({
          // A field-added ("+ Add new party") Distributor/S.S. visit is created with `prospectId`
          // set and `partnerId` null (see managerPartnerCheckIn's comment — it's a governed
          // SeeraProspect, not a full commercial Partner, until later Activated). Checking only
          // `partnerId: { not: null }` here meant that specific, most-common "create and
          // continue" path could never find its own just-created visit as active — the screen
          // never advanced past the selector even though check-in had actually succeeded.
          where: { workSessionId: session.id, checkedOutAt: null, OR: [{ partnerId: { not: null } }, { prospectId: { not: null } }] },
        })
      : null;
    const partners = await db.seeraPartner.findMany({
      where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, lifecycle: "ACTIVE" },
      select: { id: true, tradeName: true, legalName: true, code: true, type: true },
      orderBy: { legalName: "asc" },
      take: 200,
    });
    workflow = (
      <ManagerFieldActions
        kind="partner"
        language={language}
        sessionId={session?.id}
        activeVisit={visit?.id}
        partners={partners.map((x) => ({
          value: `${x.id}::${x.type}`,
          label: x.tradeName ?? x.legalName,
          meta: `${x.type} · ${x.code}`,
        }))}
      />
    );
  } else if (
    portal === "sales-manager" &&
    item.slug === "joint-working" &&
    permissions.has("joint_work:participate")
  ) {
    const joint = await db.seeraJointWork.findFirst({
      where: { managerId: userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    const assignments = await db.seeraAssignment.findMany({
      where: {
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        targetId: userId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const executives = await db.user.findMany({
      where: {
        id: { in: assignments.map((x) => x.subjectId) },
        status: "ACTIVE",
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const linked = joint ? await jointWorkLinkedActivity(db, userId, joint.id) : null;
    const jointExecutive = joint ? executives.find((e) => e.id === joint.salesExecutiveId) : null;
    const executiveSync = await teamSyncStatus(db, userId);
    const syncByExecutive = new Map(executiveSync.map((s) => [s.employeeId, s]));
    const syncMeta = (status: "SYNCED" | "PENDING_SYNC" | "SYNC_ERROR") =>
      status === "SYNCED" ? undefined : status === "PENDING_SYNC" ? (hi ? "सिंक लंबित" : "sync pending") : hi ? "सिंक त्रुटि" : "sync error";
    const jointSync = jointExecutive ? syncByExecutive.get(jointExecutive.id) : undefined;
    workflow = (
      <ManagerFieldActions
        kind="joint"
        language={language}
        activeJoint={joint?.id}
        jointExecutiveName={jointExecutive?.name ?? jointExecutive?.email}
        linkedActivity={linked ?? undefined}
        jointExecutiveSyncNote={
          jointSync && jointSync.status !== "SYNCED"
            ? hi
              ? `ध्यान दें: इस एग्जीक्यूटिव के ${jointSync.pendingCount + jointSync.failedCount} आइटम सिंक होना बाकी हैं — नीचे दी गई गतिविधि अधूरी हो सकती है।`
              : `Note: this Executive has ${jointSync.pendingCount + jointSync.failedCount} item(s) still syncing — the activity below may be incomplete.`
            : undefined
        }
        executives={executives.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
          meta: syncMeta(syncByExecutive.get(x.id)?.status ?? "SYNCED"),
        }))}
      />
    );
  } else if (portal === "founder-admin" && item.slug === "ta-expenses") {
    const reportTo = query.to ? new Date(query.to) : new Date();
    const reportFrom = query.from ? new Date(query.from) : new Date(reportTo.getFullYear(), reportTo.getMonth(), 1);
    const [report, travelEmployees, travelGeographies] = await Promise.all([
      travelReport(db, userId, { scope: "ORGANIZATION", from: reportFrom, to: reportTo, employeeId: query.employee || undefined, managerId: query.manager || undefined, role: query.role || undefined, status: query.status || undefined }),
      db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      db.seeraGeographyNode.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, level: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
    ]);
    workflow = <><TravelPolicyActions language={language} employees={travelEmployees.map((employee) => ({ id: employee.id, label: employee.name ?? employee.email }))} geographies={travelGeographies.map((geography) => ({ id: geography.id, label: `${geography.level} · ${geography.name}` }))} /><TravelReportPanel language={language} report={report} /></>;
  } else if (
    portal === "accounts" &&
    ["payments", "payment-inbox", "reconciliation"].includes(item.slug)
  ) {
    const payments = await db.seeraPaymentRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const proofs=item.slug==="payment-inbox"&&permissions.has("payment_proof:review")?await db.seeraPaymentProof.findMany({where:{status:{notIn:["VERIFIED","REJECTED"]}},include:{order:{select:{orderNumber:true,total:true}}},orderBy:{submittedAt:"asc"},take:50}):[];
    workflow = <><WorkflowActions kind="finance-payment" language={language} options={payments.map((x) => ({value:x.id,label:x.paymentNumber,meta:`${x.status} · ${money(x.amountClaimed)}`}))}/>{item.slug==="payment-inbox"&&<PaymentProofReviewActions language={language} options={proofs.map((x)=>({value:x.id,label:x.order.orderNumber,meta:`${x.status} · ${money(x.amount)} / ${money(x.order.total)}`}))}/>}</>;
  } else if (
    portal === "accounts" &&
    item.slug === "company-order-dispatch" &&
    permissions.has("company_replenishment:dispatch")
  ) {
    // Founder decision (S.S. 95% pass, section 13-14): a CONFIRMED (advance payment verified)
    // Company order previously had no dispatch path at all — dispatchCompanyOrder closes that gap;
    // this is where an Accounts user actually triggers it.
    const confirmedOrders = await db.seeraSalesOrder.findMany({
      where: { type: "COMPANY_REPLENISHMENT", status: "CONFIRMED" },
      include: { buyerPartner: { select: { legalName: true, tradeName: true } }, paymentProofs: { where: { status: "VERIFIED" }, orderBy: { reviewedAt: "desc" }, take: 1 } },
      orderBy: { submittedAt: "asc" },
      take: 50,
    });
    workflow = (
      <CompanyOrderDispatchPanel
        language={language}
        orders={confirmedOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          superStockist: o.buyerPartner?.tradeName ?? o.buyerPartner?.legalName ?? "Super Stockist",
          total: Number(o.total),
          verifiedAt: o.paymentProofs[0]?.reviewedAt ? o.paymentProofs[0].reviewedAt.toISOString() : null,
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "allocations" &&
    permissions.has("payment:allocate")
  ) {
    const payments = await db.seeraPaymentRecord.findMany({
      where: {
        status: { in: ["VERIFIED", "PARTIALLY_MATCHED", "ADVANCE_HELD"] },
        unappliedAmount: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const documents = await db.seeraCommercialDocument.findMany({
      where: {
        status: "ISSUED",
        type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    workflow = (
      <FinanceControlActions
        kind="allocate"
        language={language}
        primary={payments.map((x) => ({
          value: x.id,
          label: x.paymentNumber,
          meta: money(x.unappliedAmount),
        }))}
        secondary={documents.map((x) => ({
          value: x.id,
          label: x.documentNumber,
          meta: money(x.grandTotal),
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "reversals" &&
    permissions.has("ledger:reverse")
  ) {
    const entries = await db.seeraFinancialEntry.findMany({
      where: { status: "POSTED", originalEntryId: null },
      orderBy: { postedAt: "desc" },
      take: 50,
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: { some: { permission: { code: "ledger:reverse" } } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    workflow = (
      <FinanceControlActions
        kind="reverse"
        language={language}
        primary={entries.map((x) => ({
          value: x.id,
          label: x.entryNumber,
          meta: money(x.amount),
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "credit-exceptions" &&
    permissions.has("credit_extension:approve")
  ) {
    // Founder/Admin UAT correction (P0, global audit): decideCreditExtension had zero API/UI
    // wiring — a Super Stockist could request a credit extension (canRequestExtension below) but
    // Accounts had no way to approve/reject it. Mirrors the reversals/claims decision panels above.
    const pending = await db.seeraCreditExtension.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const pendingOrders = pending.length
      ? await db.seeraSalesOrder.findMany({
          where: { id: { in: pending.map((e) => e.orderId) } },
          select: { id: true, orderNumber: true, total: true, sellerPartner: { select: { legalName: true, tradeName: true } } },
        })
      : [];
    const pendingOrderMap = new Map(pendingOrders.map((o) => [o.id, o]));
    workflow = (
      <FinanceControlActions
        kind="decide-credit-extension"
        language={language}
        primary={pending.map((e) => {
          const order = pendingOrderMap.get(e.orderId);
          return {
            value: e.id,
            label: order?.orderNumber ?? e.orderId,
            meta: `${order?.sellerPartner?.tradeName ?? order?.sellerPartner?.legalName ?? "Super Stockist"} · until ${e.extensionUntil.toLocaleDateString("en-IN")}${order ? ` · ${money(order.total)}` : ""}`,
          };
        })}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "claims" &&
    permissions.has("claim_settlement:manage")
  ) {
    const settled = await db.seeraClaimSettlement.findMany({
      select: { claimId: true },
    });
    const claims = await db.seeraClaim.findMany({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        id: { notIn: settled.map((x) => x.claimId) },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: {
                some: { permission: { code: "claim_settlement:manage" } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    workflow = (
      <FinanceControlActions
        kind="settle-claim"
        language={language}
        primary={claims.map((x) => ({
          value: x.id,
          label: x.claimNumber,
          meta: x.type,
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "ta-expenses" &&
    permissions.has("ta_claim:approve")
  ) {
    const claims = await db.seeraTaClaim.findMany({
      where: { status: "SENT_TO_ACCOUNTS", employeeId: { not: userId } },
      orderBy: { claimDate: "asc" },
      take: 50,
    });
    const employees = await db.user.findMany({
      where: { id: { in: claims.map((x) => x.employeeId) } },
      select: { id: true, name: true, email: true },
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: {
                some: { permission: { code: "ta_claim:approve" } },
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 50,
    });
    const company = await db.seeraBillingProfile.findFirst({
      where: {
        ownerType: "COMPANY",
        authorizedBilling: true,
        verificationStatus: "VERIFIED",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { ownerId: true },
    });
    const history = await accountsTravelClaims(db, userId, "HISTORY");
    workflow = company ? (
      <><FinanceControlActions
        kind="approve-ta"
        language={language}
        primary={claims.map((x) => ({
          value: x.id,
          label: x.claimNumber,
          meta: money(x.totalApproved),
        }))}
        secondary={employees.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
        companyId={company.ownerId}
      /><AccountsTravelHistory language={language} claims={history} /></>
    ) : <AccountsTravelHistory language={language} claims={history} />;
  } else if (
    portal === "accounts" &&
    ["outstanding", "ageing"].includes(item.slug) &&
    permissions.has("finance_dashboard:view")
  ) {
    // Final UI reachability audit fix: these two nav items previously had no portal==="accounts"
    // branch at all, so they fell through to the generic rowsFor kind==="finance" list — raw,
    // unfiltered SeeraFinancialEntry rows with no party grouping or ageing buckets. Reuses the same
    // partyOutstanding/ledgerReadModel + LedgerPanel the Distributor/S.S. portals already render
    // their own ageing view with (line ~4617 above), just company-wide across every party with an
    // open invoice instead of the acting user's own party.
    const now = new Date();
    const outstandingDocs = await db.seeraCommercialDocument.findMany({
      where: { status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] } },
      select: { buyerType: true, buyerId: true },
    });
    const distinctParties = new Map<string, { partyType: string; partyId: string }>();
    for (const doc of outstandingDocs) distinctParties.set(`${doc.buyerType}:${doc.buyerId}`, { partyType: doc.buyerType, partyId: doc.buyerId });
    const partnerIds = [...distinctParties.values()].filter((p) => p.partyType === "DISTRIBUTOR" || p.partyType === "SUPER_STOCKIST").map((p) => p.partyId);
    const retailerIds = [...distinctParties.values()].filter((p) => p.partyType === "RETAILER").map((p) => p.partyId);
    const [partnerNames, retailerNames] = await Promise.all([
      partnerIds.length ? db.seeraPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, tradeName: true, legalName: true } }) : [],
      retailerIds.length ? db.seeraRetailer.findMany({ where: { id: { in: retailerIds } }, select: { id: true, businessName: true } }) : [],
    ]);
    const partnerNameById = new Map(partnerNames.map((p) => [p.id, p.tradeName ?? p.legalName]));
    const retailerNameById = new Map(retailerNames.map((r) => [r.id, r.businessName]));
    const ledgers = await Promise.all(
      [...distinctParties.values()].map(async ({ partyType, partyId }) => ({
        label: partnerNameById.get(partyId) ?? retailerNameById.get(partyId) ?? partyId,
        ledger: await ledgerReadModel(db, userId, { partyType, partyId, asOf: now }),
      })),
    );
    workflow = (
      <LedgerPanel
        language={language}
        title={hi ? "बकाया चालान और आयु — सभी पक्ष" : "Outstanding invoices and ageing — all parties"}
        ledgers={ledgers}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "ta-verification") {
    const reportTo = query.to ? new Date(query.to) : new Date();
    const reportFrom = query.from ? new Date(query.from) : new Date(reportTo.getFullYear(), reportTo.getMonth(), 1);
    const [claims, report] = await Promise.all([
      teamTaClaimsForVerification(db, userId),
      travelReport(db, userId, { scope: "TEAM", from: reportFrom, to: reportTo, employeeId: query.employee || undefined, status: query.status || undefined }),
    ]);
    workflow = (
      <><TeamTaClaimsPanel language={language} claims={claims.map((x) => ({
          id: x.id,
          claimNumber: x.claimNumber,
          claimDate: x.claimDate.toISOString(),
          vehicleType: x.vehicleType,
          claimedDistanceKm: Number(x.claimedDistanceKm),
          totalClaimed: Number(x.totalClaimed),
          status: x.status,
          purpose: x.purpose,
          hotelStay: x.hotelStay,
          hotelAmount: Number(x.hotelAmount ?? 0),
          employeeName: x.employeeName,
          dutyType: x.dutyType,
          daStatus: x.daStatus,
        }))}/><TravelReportPanel language={language} report={report} /></>
    );
  } else if (portal === "sales-manager" && item.slug === "my-ta") {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const summary = await executiveTaDaMonthlySummary(db, userId, userId, monthStart, monthEnd);
    workflow = <TaDaSummaryPanel language={language} summary={summary} />;
  } else if (
    portal === "sales-manager" &&
    item.slug === "collections" &&
    permissions.has("payment_promise:create")
  ) {
    const mappedDistributors = await managerMappedDistributors(db, userId);
    const selectedDistributorId = query.distributorId || undefined;
    const snapshot = selectedDistributorId
      ? await managerDistributorCollectionsSnapshot(db, userId, selectedDistributorId).catch((e) =>
          ifExpectedNotFound<Awaited<ReturnType<typeof managerDistributorCollectionsSnapshot>>>(e),
        )
      : null;
    workflow = (
      <CollectionsPanel
        language={language}
        base={`/portal/${portal}/${item.slug}`}
        selectedDistributorId={selectedDistributorId}
        distributors={mappedDistributors.map((d) => ({ value: d.id, label: distributorLabel(d) }))}
        snapshot={
          snapshot
            ? {
                distributorName: snapshot.distributor.tradeName ?? snapshot.distributor.legalName,
                outstanding: snapshot.outstanding,
                current: snapshot.current,
                overdue: snapshot.overdue,
                oldestDueDate: snapshot.oldestDueDate ? snapshot.oldestDueDate.toISOString() : null,
                lastPayment: snapshot.lastPayment
                  ? { amount: snapshot.lastPayment.amount, postedAt: snapshot.lastPayment.postedAt!.toISOString() }
                  : null,
                promisedPaymentDate: snapshot.promisedPaymentDate ? snapshot.promisedPaymentDate.toISOString() : null,
                creditStatus: snapshot.decision?.decision ?? null,
                availableCredit: snapshot.availableCredit,
                oldestOpenOrderId: snapshot.openOrders[0]?.id ?? null,
                recentLedger: snapshot.recentLedger.map((e) => ({ ...e, postedAt: e.postedAt ? e.postedAt.toISOString() : null })),
              }
            : null
        }
      />
    );
  } else if (
    portal === "sales-manager" &&
    item.slug === "distributor-oversight" &&
    permissions.has("network:manage")
  ) {
    // Manager Distributor Oversight (Founder sections 21-28): a dedicated screen, separate from
    // Team Review, reading the exact same canonical rows the Distributor's own portal writes via
    // managerDistributorSnapshot's mappedDistributorsFor() scope.
    const mappedDistributors = await managerMappedDistributors(db, userId);
    const selectedDistributorId = query.distributorId || undefined;
    const snapshot = selectedDistributorId
      ? await managerDistributorSnapshot(db, userId, selectedDistributorId).catch((e) =>
          ifExpectedNotFound<Awaited<ReturnType<typeof managerDistributorSnapshot>>>(e),
        )
      : null;
    workflow = (
      <ManagerDistributorOversightPanel
        language={language}
        base={`/portal/${portal}/${item.slug}`}
        selectedDistributorId={selectedDistributorId}
        distributors={mappedDistributors.map((d) => ({ value: d.id, label: distributorLabel(d) }))}
        snapshot={
          snapshot
            ? {
                distributor: {
                  ...snapshot.distributor,
                  lastActivity: snapshot.distributor.lastActivity ? snapshot.distributor.lastActivity.toISOString() : null,
                },
                orders: {
                  ...snapshot.orders,
                  pending: snapshot.orders.pending.map((o) => ({ ...o, placedAt: o.placedAt.toISOString() })),
                },
                deliveries: snapshot.deliveries,
                remainingQtyExceptions: snapshot.remainingQtyExceptions,
                ssOrders: snapshot.ssOrders.map((o) => ({ ...o, placedAt: o.placedAt.toISOString() })),
                stock: snapshot.stock,
                money: {
                  outstanding: snapshot.money.outstanding,
                  current: snapshot.money.current,
                  overdue: snapshot.money.overdue,
                  availableCredit: snapshot.money.availableCredit,
                  lastPayment: snapshot.money.lastPayment
                    ? { amount: Number(snapshot.money.lastPayment.amount), postedAt: snapshot.money.lastPayment.postedAt!.toISOString() }
                    : null,
                },
                exceptions: snapshot.exceptions,
              }
            : null
        }
      />
    );
  } else if (
    item.slug === "quotations" &&
    ["distributor", "super-stockist"].includes(portal) &&
    (permissions.has("document:issue") || permissions.has("document:create"))
  ) {
    const data = await documentSelectorData(db, userId, portal);
    const quotations = await db.seeraCommercialDocument.findMany({
      where: {
        type: "QUOTATION_DOCUMENT",
        issuerId: { in: data.profiles.map((x) => x.ownerId) },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    workflow = (
      <QuotationActions
        language={language}
        issuerType={portal === "distributor" ? "DISTRIBUTOR" : "SUPER_STOCKIST"}
        issuers={data.profiles.map((x) => ({ value: x.ownerId, label: `${x.legalName}${x.gstin ? ` · ${x.gstin}` : ""}` }))}
        buyers={[
          ...data.partners.map((x) => ({ value: x.id, label: x.tradeName ?? x.legalName, type: "DISTRIBUTOR" as const })),
          ...data.retailers.map((x) => ({ value: x.id, label: x.businessName, type: "RETAILER" as const })),
        ]}
        skus={data.skus.map((x) => ({
          value: x.id,
          label: `${x.productName} (${x.packSize.toString()} ${x.unitType})`,
          rate: Number(x.prices[0]?.amount ?? x.mrp),
          taxRate: x.taxRate == null ? null : Number(x.taxRate),
          brand: x.brand,
          unitsPerCase: x.unitsPerCase,
          caseUnit: x.unitsPerCase > 1 ? (x.unitType === "g" ? "BOX" : x.unitType === "kg" ? "BAG" : null) : null,
        }))}
        quotations={quotations.map((q) => ({
          id: q.id,
          documentNumber: q.documentNumber,
          status: q.status,
          buyerLabel: (q.buyerSnapshot as { legalName?: string } | null)?.legalName ?? "Buyer",
          buyerType: q.buyerType,
          buyerId: q.buyerId,
          grandTotal: Number(q.grandTotal),
          validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : undefined,
          lines: (q.lineSnapshot as unknown as { productNameSnapshot?: string; hsnSnapshot?: string; quantity: number; rate: number; taxRate: number; lineTotal: number; priceMode?: "GST_INCLUSIVE" | "GST_EXCLUSIVE" }[] | null ?? []).map((l) => ({
            skuId: "",
            productNameSnapshot: l.productNameSnapshot ?? "",
            hsn: l.hsnSnapshot,
            quantity: l.quantity,
            rate: l.rate,
            discountPct: 0,
            taxRate: l.taxRate,
            lineTotal: l.lineTotal,
            priceMode: l.priceMode ?? "GST_INCLUSIVE",
          })),
        }))}
      />
    );
  } else if (
    item.slug === "billing" &&
    ["distributor", "super-stockist"].includes(portal) &&
    (permissions.has("document:issue") || permissions.has("document:create"))
  ) {
    const data = await documentSelectorData(db, userId, portal);
    const orderType = portal === "distributor" ? "RETAILER_ORDER" : "DISTRIBUTOR_REPLENISHMENT";
    const recentOrders = await db.seeraSalesOrder.findMany({
      where: {
        sellerPartnerId: { in: data.profiles.map((x) => x.ownerId) },
        type: orderType,
        status: { in: ["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"] },
      },
      include: {
        retailer: { select: { businessName: true } },
        buyerPartner: { select: { legalName: true, tradeName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const documents = await db.seeraCommercialDocument.findMany({
      where: {
        issuerId: { in: data.profiles.map((x) => x.ownerId) },
        type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "PRO_FORMA_INVOICE", "DELIVERY_CHALLAN", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Billing/Quotation Finalization (23-Aug): per-invoice already-credited total, so BillingActions
    // can show "remaining eligible credit" before a Credit Note is even drafted — same aggregate
    // billing-service.ts's assertWithinRemainingCredit enforces server-side at draft/issue time.
    const creditedByOriginal = await db.seeraCommercialDocument.groupBy({
      by: ["originalDocumentId"],
      where: { originalDocumentId: { in: documents.map((d) => d.id) }, type: "CREDIT_NOTE", status: "ISSUED" },
      _sum: { grandTotal: true },
    });
    const creditedMap = new Map(creditedByOriginal.map((c) => [c.originalDocumentId as string, Number(c._sum.grandTotal ?? 0)]));
    workflow = (
      <BillingActions
        language={language}
        issuerType={portal === "distributor" ? "DISTRIBUTOR" : "SUPER_STOCKIST"}
        issuers={data.profiles.map((x) => ({ value: x.ownerId, label: `${x.legalName}${x.gstin ? ` · ${x.gstin}` : ""}` }))}
        buyers={
          portal === "distributor"
            ? data.retailers.map((x) => ({ value: x.id, label: x.businessName, type: "RETAILER" as const }))
            : data.partners.map((x) => ({ value: x.id, label: x.tradeName ?? x.legalName, type: "DISTRIBUTOR" as const }))
        }
        skus={data.skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName}`,
          rate: Number(x.prices[0]?.amount ?? x.mrp),
          taxRate: x.taxRate == null ? null : Number(x.taxRate),
          brand: x.brand,
          unitsPerCase: x.unitsPerCase,
          caseUnit: x.unitsPerCase > 1 ? (x.unitType === "g" ? "BOX" : x.unitType === "kg" ? "BAG" : null) : null,
        }))}
        orders={recentOrders.map((o) => ({
          value: o.id,
          label: `${o.orderNumber} · ${o.retailer?.businessName ?? o.buyerPartner?.tradeName ?? o.buyerPartner?.legalName ?? "Buyer"}`,
        }))}
        documents={documents.map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          type: d.type,
          status: d.status,
          buyerLabel: (d.buyerSnapshot as { legalName?: string } | null)?.legalName ?? "Buyer",
          buyerType: d.buyerType,
          buyerId: d.buyerId,
          grandTotal: Number(d.grandTotal),
          cgstTotal: Number(d.cgstTotal),
          sgstTotal: Number(d.sgstTotal),
          igstTotal: Number(d.igstTotal),
          creditedTotal: creditedMap.get(d.id) ?? 0,
        }))}
      />
    );
  } else if (
    item.slug === "billing-profile" &&
    ["distributor", "super-stockist"].includes(portal) &&
    (permissions.has("document:issue") || permissions.has("document:create"))
  ) {
    // Final Retailer Cleanup + Handover (Part 14, 22-Aug): "S.S. must not need Founder/Admin 360
    // for routine work" — invoice numbering is routine (it changes as their physical book
    // progresses) and is now reachable directly from their own portal nav via requireIssuerScope's
    // self-service party-membership check. Initial legal/GST billing-profile VERIFICATION stays a
    // one-time Founder/Admin step (creates a real legal identity record, not routine adjustment) —
    // shown here read-only with a clear "contact Founder/Admin" message when not yet verified.
    const ownerType = portal === "distributor" ? "DISTRIBUTOR" : "SUPER_STOCKIST";
    const data = await documentSelectorData(db, userId, portal);
    const ownerId = data.profiles[0]?.ownerId;
    const [profile, numbering] = ownerId
      ? await Promise.all([
          db.seeraBillingProfile.findFirst({
            where: { ownerType, ownerId, verificationStatus: "VERIFIED", effectiveTo: null },
            orderBy: { effectiveFrom: "desc" },
          }),
          invoiceNumberingStatus(db, userId, { ownerType, ownerId, documentType: "TAX_INVOICE" }).catch(() => null),
        ])
      : [null, null];
    workflow = (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "बिलिंग प्रोफ़ाइल" : "BILLING PROFILE"}</small>
          <h2>{hi ? "आपकी कानूनी बिलिंग पहचान" : "Your legal billing identity"}</h2>
        </div>
        {!profile ? (
          <p className={styles.emptyHint}>
            {hi
              ? "आपकी बिलिंग प्रोफ़ाइल अभी सत्यापित नहीं है — कृपया Founder/Admin से संपर्क करें।"
              : "Your billing profile is not verified yet — please contact Founder/Admin to complete verification."}
          </p>
        ) : (
          <dl className={styles.detail}>
            <div><dt>{hi ? "कानूनी नाम" : "Legal name"}</dt><dd>{profile.legalName}</dd></div>
            <div><dt>{hi ? "GST स्थिति" : "GST status"}</dt><dd>{profile.gstRegistered ? `${hi ? "पंजीकृत" : "Registered"} · ${profile.gstin}` : hi ? "अपंजीकृत" : "Unregistered"}</dd></div>
            <div><dt>{hi ? "राज्य" : "State"}</dt><dd>{profile.state} ({profile.stateCode})</dd></div>
          </dl>
        )}
        {profile && ownerId && numbering && (
          <InvoiceNumberingPanel language={language} ownerType={ownerType} ownerId={ownerId} status={numbering} />
        )}
      </section>
    );
  } else if (
    ["documents", "billing"].includes(item.slug) &&
    (permissions.has("document:issue") ||
      permissions.has("document:upload") ||
      permissions.has("system:super_admin"))
  ) {
    const data = await documentSelectorData(db, userId, portal);
    workflow = (
      <DocumentActions
        language={language}
        portal={portal}
        canIssue={data.mayIssue}
        canUpload={data.mayUpload}
        canPostLedger={
          permissions.has("ledger:post") ||
          permissions.has("system:super_admin")
        }
        mode={
          item.slug === "billing"
            ? "BILLING"
            : "ALL"
        }
        issuers={data.profiles.map((x) => ({
          id: x.ownerId,
          type: x.ownerType,
          label: `${x.legalName}${x.gstin ? ` · ${x.gstin}` : ""}`,
          snapshot: {
            legalName: x.legalName,
            tradeName: x.tradeName ?? undefined,
            gstin: x.gstin ?? undefined,
            address: formatAddress(x.registeredAddress),
            state: x.state,
            stateCode: x.stateCode,
          },
        }))}
        buyers={[
          ...data.partners.map((x) => ({
            id: x.id,
            type: x.type,
            label: x.tradeName ?? x.legalName,
            snapshot: {
              legalName: x.legalName,
              tradeName: x.tradeName ?? undefined,
              gstin: x.gstin ?? undefined,
              address: formatAddress(x.addresses),
            },
          })),
          ...data.retailers.map((x) => ({
            id: x.id,
            type: "RETAILER",
            label: x.businessName,
            snapshot: {
              legalName: x.businessName,
              tradeName: x.businessName,
              gstin: x.gstin ?? undefined,
              address: formatAddress(x.address),
            },
          })),
        ]}
        skus={data.skus.map((x) => ({
          id: x.id,
          label: `${x.code} · ${x.productName}`,
          hsn: x.hsn ?? undefined,
          unit: x.unitType,
          rate: Number(x.prices[0]?.amount ?? x.mrp),
          taxRate: x.taxRate == null ? null : Number(x.taxRate),
        }))}
      />
    );
  } else if (
    item.kind === "approvals" &&
    (permissions.has("approval:decide") ||
      permissions.has("manager_approval:decide"))
  ) {
    const roleCodes = await db.userRoleAssignment.findMany({
      where: { userId, status: "ACTIVE" },
      select: { role: { select: { code: true } } },
    });
    const approvals = await db.seeraApprovalItem.findMany({
      where: permissions.has("system:super_admin")
        ? { status: "PENDING" }
        : {
            status: "PENDING",
            assignedRoleCode: { in: roleCodes.map((x) => x.role.code) },
          },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const requesters = await db.user.findMany({
      where: { id: { in: [...new Set(approvals.map((x) => x.requestedById))] } },
      select: { id: true, name: true, email: true },
    });
    const requesterName = new Map(requesters.map((u) => [u.id, u.name ?? u.email]));
    workflow = (
      <ApprovalActions
        language={language}
        approvals={approvals.map((x) => ({
          value: x.id,
          label: `${x.type} · ${x.entityType} — ${requesterName.get(x.requestedById) ?? "Unknown"} · ${x.createdAt.toLocaleDateString("en-IN")}`,
          meta: `${x.reason ?? x.status} · ${JSON.stringify(x.request).slice(0, 140)}`,
        }))}
      />
    );
  } else if (
    item.kind === "masters" &&
    item.slug === "masters" &&
    permissions.has("master:manage")
  ) {
    const skus = await db.seeraSku.findMany({
      orderBy: { productName: "asc" },
      take: 200,
    });
    // RUN 2B resume: browsable Active/History price list — the CHANGE PRICE action above was
    // previously the only way to see anything, with no view of what's currently active or what was
    // superseded. ACTIVE rows still covering "now" first, then history (INACTIVE / closed) newest
    // first, so a Founder can actually see what they're about to change before submitting the form.
    const now = new Date();
    const priceVersions = await db.seeraPriceVersion.findMany({
      include: { sku: { select: { code: true, productName: true, brand: true, taxRate: true } } },
      orderBy: [{ effectiveFrom: "desc" }],
      take: 100,
    });
    workflow = (
      <MasterActions
        language={language}
        skus={skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName}`,
        }))}
        priceVersions={priceVersions.map((p) => {
          const priceMode = priceModeForBrand(p.sku.brand);
          const taxRate = p.sku.taxRate != null ? Number(p.sku.taxRate) : null;
          const amount = Number(p.amount);
          const { taxableValue, taxAmount } =
            taxRate == null
              ? { taxableValue: amount, taxAmount: 0 }
              : priceMode === "GST_INCLUSIVE"
                ? deriveInclusiveTax(amount, taxRate)
                : deriveExclusiveTax(amount, taxRate);
          return {
            id: p.id,
            skuLabel: `${p.sku.code} · ${p.sku.productName}`,
            tier: p.tier,
            amount,
            status: p.status,
            isCurrentlyActive: p.status === "ACTIVE" && p.effectiveFrom <= now && (!p.effectiveTo || p.effectiveTo > now),
            effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10),
            effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString().slice(0, 10) : null,
            marginType: p.marginType,
            marginValue: p.marginValue ? Number(p.marginValue) : null,
            priceMode,
            taxRate,
            taxableValuePreview: taxableValue,
            grossValuePreview: priceMode === "GST_INCLUSIVE" ? amount : taxableValue + taxAmount,
          };
        })}
        unconfiguredGstSkuCount={skus.filter((s) => s.status === "ACTIVE" && (s.taxRate == null || !s.hsn)).length}
      />
    );
  } else if (item.slug === "retailer-cleanup" && permissions.has("master:manage")) {
    const cleanup = await retailerCleanupOverview(db, userId);
    workflow = (
      <RetailerCleanupPanel
        language={language}
        retailers={cleanup.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    );
  } else if (
    portal === "retailer" &&
    ["orders", "reorder"].includes(item.slug)
  ) {
    const now = new Date();
    const assignments = await db.seeraAssignment.findMany({
      where: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: userId,
        targetType: "RETAILER",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { targetId: true },
    });
    const retailers = await db.seeraRetailer.findMany({
      where: {
        id: { in: assignments.map((x) => x.targetId) },
        lifecycle: "ACTIVE",
      },
      select: { id: true, businessName: true, code: true },
      orderBy: { businessName: "asc" },
    });
    const skus = await db.seeraSku.findMany({
      where: {
        status: "ACTIVE",
        prices: {
          some: {
            tier: "DISTRIBUTOR_TO_RETAILER",
            status: "ACTIVE",
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        },
      },
      include: {
        prices: {
          where: {
            tier: "DISTRIBUTOR_TO_RETAILER",
            status: "ACTIVE",
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
      orderBy: { productName: "asc" },
      take: 200,
    });
    workflow = (
      <RetailerOrderActions
        language={language}
        retailers={retailers.map((x) => ({
          value: x.id,
          label: x.businessName,
          meta: x.code,
        }))}
        skus={skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName}`,
          meta: money(x.prices[0]?.amount ?? x.mrp),
        }))}
      />
    );
  } else if (
    portal === "founder-admin" &&
    item.slug === "super-stockists" &&
    permissions.has("network:manage")
  ) {
    // Founder/Admin UAT correction (P0, section 4): "+ Add Super Stockist" reachable directly
    // from Founder/Admin's own Super Stockists list. The generic partner list below
    // (item.kind==="partners") already renders every S.S.; this panel only adds the create
    // affordance above it, mirroring the S.S. portal's own "Add Distributor" placement.
    // Founder visual UAT fix: this branch and the "distributors" one below it were previously
    // nested INSIDE the `["distributor","super-stockist"].includes(portal)` block further down —
    // syntactically valid but unreachable for portal==="founder-admin", since that outer
    // condition is false for the Founder. The code existed and even compiled/built cleanly, but
    // never rendered — moved out to this top-level branch so it actually executes.
    headerAction = <CreateSuperStockistPanel language={language} redirectBase={base} />;
  } else if (
    portal === "founder-admin" &&
    item.slug === "distributors" &&
    permissions.has("network:manage")
  ) {
    // Founder/Admin UAT correction (P0, section 4): "+ Add Distributor" reachable directly from
    // Founder/Admin's own Distributors list, with a real searchable Super Stockist selector
    // (founderMode inside AddDistributorPanel) instead of a raw Partner ID.
    const founderSuperStockists = await db.seeraPartner.findMany({
      where: { type: "SUPER_STOCKIST", lifecycle: { not: "CLOSED" } },
      select: { id: true, tradeName: true, legalName: true, code: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    // Founder-authorized one-time Ratan Products & Traders batch (see RatanBulkOnboardPanel) —
    // auto-hides once all 10 distributors under that specific S.S. exist, so this one-time action
    // disappears on its own after successful use instead of needing a manual follow-up deploy.
    const ratanSuperStockist = founderSuperStockists.find((s) => s.legalName === "M/s Ratan Products & Traders");
    const ratanDistributorCount = ratanSuperStockist
      ? await db.seeraPartner.count({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ratanSuperStockist.id } })
      : 0;
    headerAction = (
      <>
        {ratanSuperStockist && ratanDistributorCount < 10 && <RatanBulkOnboardPanel language={language} />}
        <AddDistributorPanel
          language={language}
          superStockists={founderSuperStockists.map((s) => ({
            value: s.id,
            label: `${s.tradeName ?? s.legalName} · ${s.code}`,
          }))}
          redirectBase={base}
        />
        {/* Part B (Manoj hybrid territory): same slot as "+ Add Distributor" — Company Direct is
            just another supplying entity, created once (singleton, safe to re-render this button
            forever). */}
        <CreateCompanyDirectPartnerPanel language={language} />
      </>
    );
  } else if (
    portal === "founder-admin" &&
    item.slug === "territories" &&
    (permissions.has("master:manage") || permissions.has("system:super_admin"))
  ) {
    // Bhilwara/Manoj onboarding gap fix: the read path (rowsFor above) and the underlying
    // SeeraGeographyNode model already existed — what was missing was a direct Founder/Admin
    // create action; the only prior write path (createBeatPlan) buries Territory/Beat creation
    // inside a full Sales Manager journey-plan flow. Same governed-error pattern as finance-os/
    // money-desk above.
    try {
      const [territoryData, assignmentData] = await Promise.all([territoriesAndBeats(db, userId), activeExecutiveTerritoryAssignments(db, userId)]);
      workflow = (
        <TerritoryBeatManagementPanel
          language={language}
          territories={territoryData.map((t) => ({
            id: t.territory.id,
            name: t.territory.name,
            code: t.territory.code,
            status: t.territory.status,
            headquarters: (t.territory.metadata as { headquarters?: string } | null)?.headquarters ?? "",
            state: (t.territory.metadata as { state?: string } | null)?.state ?? "",
            beats: t.beats.map((b) => ({ id: b.id, name: b.name, code: b.code, status: b.status })),
          }))}
          fieldUsers={assignmentData.fieldUsers}
          assignments={assignmentData.assignments.map((a) => ({ ...a, effectiveFrom: a.effectiveFrom.toISOString() }))}
        />
      );
    } catch (error) {
      const incidentId = crypto.randomUUID();
      operationalLog("error", "territories.load_failed", { incidentId, actorId: userId, errorName: error instanceof Error ? error.name : "unknown" });
      workflow = (
        <EmptyState
          title="Territories data is temporarily unavailable"
          description={`Something went wrong loading this screen. Please try again. If this keeps happening, share Error ID ${incidentId} with your Admin.`}
        />
      );
    }
  } else if (
    portal === "founder-admin" &&
    item.slug === "field-force" &&
    (permissions.has("user:create") || permissions.has("system:super_admin"))
  ) {
    // Founder visual UAT fix: "Field force" (Sales Managers + Sales Executives) had the same
    // missing-CTA problem as Super Stockists/Distributors — Founder could browse the list but had
    // no visible create action anywhere. Reuses the existing, already-correctly-permissioned
    // "+ Add User" flow (role picker included) instead of building a parallel Manager/Executive
    // -specific form — a Sales Manager or Sales Executive is just a User with that role assigned.
    headerAction = (
      <Link className={workspaceStyles.button} href={`/portal/${portal}/users/new`}>
        {hi ? "+ उपयोगकर्ता जोड़ें" : "+ ADD USER"}
      </Link>
    );
    // Field-Force hierarchy (Founder UAT fix): a user having the SALES_EXECUTIVE role was never
    // enough to place them under a Manager — see FieldForceAssignmentPanel's own comment for the
    // full chain of screens this was silently breaking.
    if (permissions.has("network:manage")) {
      const [teamData, distributorScopeData] = await Promise.all([
        activeManagerTeamAssignments(db, userId),
        activeExecutiveDistributorAssignments(db, userId),
      ]);
      // Auto-hide gate for the one-time combined setup button (same self-hiding pattern as
      // RatanBulkOnboardPanel) — only render it while the sole active Manager/Executive pairing is
      // unambiguous AND (the Manager assignment is missing OR fewer than all 10 Ratan Distributors
      // are assigned).
      const ratanSuperStockist = await db.seeraPartner.findFirst({ where: { type: "SUPER_STOCKIST", legalName: "M/s Ratan Products & Traders", lifecycle: "ACTIVE" } });
      const ratanDistributorIds = ratanSuperStockist
        ? (await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ratanSuperStockist.id, lifecycle: "ACTIVE" }, select: { id: true } })).map((d) => d.id)
        : [];
      const soleActiveExecutiveId = teamData.executives.length === 1 ? teamData.executives[0]!.value : null;
      const soleActiveManagerId = teamData.managers.length === 1 ? teamData.managers[0]!.value : null;
      const managerAssignmentExists =
        soleActiveExecutiveId != null &&
        soleActiveManagerId != null &&
        teamData.assignments.some((a) => a.executiveId === soleActiveExecutiveId && a.managerId === soleActiveManagerId);
      const alreadyAssignedRatanCount = soleActiveExecutiveId
        ? distributorScopeData.assignments.filter((a) => a.executiveId === soleActiveExecutiveId && ratanDistributorIds.includes(a.distributorId)).length
        : 0;
      const showCompleteSetup =
        ratanDistributorIds.length === 10 &&
        soleActiveExecutiveId &&
        soleActiveManagerId &&
        (!managerAssignmentExists || alreadyAssignedRatanCount < 10);
      workflow = (
        <>
          <FieldForceAssignmentPanel
            language={language}
            executives={teamData.executives}
            managers={teamData.managers}
            assignments={teamData.assignments.map((a) => ({ ...a, effectiveFrom: a.effectiveFrom.toISOString() }))}
          />
          <AssignDistributorToExecutivePanel
            language={language}
            executives={distributorScopeData.executives}
            distributors={distributorScopeData.distributors}
            assignments={distributorScopeData.assignments.map((a) => ({ ...a, effectiveFrom: a.effectiveFrom.toISOString() }))}
          />
          {showCompleteSetup && <CompleteFieldForceSetupPanel language={language} />}
        </>
      );
    }
    // Company Direct governance (GAP-004 addendum): Founder/Admin-only (master:manage — narrowed
    // off SALES_HEAD per GAP-003) toggle for exactly which Sales Manager/Executive may operate
    // Company Direct business at all. Same "Field force" slot as the reporting-line panels above,
    // since this is the same category of governed field-force capability.
    if (permissions.has("master:manage") || permissions.has("system:super_admin")) {
      const roster = await companyDirectEligibilityRoster(db, userId);
      workflow = (
        <>
          {workflow}
          <CompanyDirectEligibilityPanel language={language} roster={roster} />
        </>
      );
    }
  } else if (
    portal === "founder-admin" &&
    item.slug === "distributor-credit" &&
    permissions.has("finance_dashboard:view")
  ) {
    // STAGE 13: Founder gets read-only, network-wide Distributor credit oversight — deliberately
    // no CreditPolicyPanel (edit form) here; credit terms remain S.S.-governed (see the "credit"
    // slug under the super-stockist portal branch below, gated on partner_credit:enforce).
    const overview = await founderDistributorCreditOversight(db, userId);
    const positions = overview.map((entry) => ({
      label: `${entry.distributor.tradeName ?? entry.distributor.legalName} · ${entry.superStockist ? (entry.superStockist.tradeName ?? entry.superStockist.legalName) : (hi ? "अनसाइन किया गया" : "Unassigned")}`,
      position: entry.position,
    }));
    workflow = (
      <CreditPanel
        language={language}
        title={hi ? "नेटवर्क-व्यापी वितरक क्रेडिट (केवल-पठन)" : "Network-wide Distributor credit (read-only)"}
        positions={positions}
      />
    );
  } else if ((portal === "founder-admin" || portal === "accounts") && item.slug === "finance-os") {
    // financeWorkspaceData() runs during server render, not via a client fetch — anything it
    // throws bypasses the governed API-error architecture (apiFailure/safeError) entirely and
    // used to fall through to the generic, contextless app/error.tsx boundary ("Data temporarily
    // unavailable", live production bug). Catching it here keeps the governed-error contract
    // (what's unavailable, why, an Error ID matching the server log) on this specific screen.
    try {
      const financeData = await financeWorkspaceData(db, userId);
      workflow = <FinanceWorkspacePanel portal={portal} data={financeData} />;
    } catch (error) {
      const incidentId = crypto.randomUUID();
      operationalLog("error", "finance_workspace.load_failed", { incidentId, actorId: userId, errorName: error instanceof Error ? error.name : "unknown" });
      workflow = (
        <EmptyState
          title="Finance data is temporarily unavailable"
          description={`Something went wrong loading this screen. Please try again. If this keeps happening, share Error ID ${incidentId} with your Admin.`}
        />
      );
    }
  } else if ((portal === "founder-admin" || portal === "accounts") && item.slug === "money-desk") {
    // Same governed-error pattern as finance-os above — Money Desk's own reads must never fall
    // through to the generic, contextless error boundary either.
    try {
      const [home, supporting] = await Promise.all([moneyDeskHome(db, userId), moneyDeskSupportingData(db, userId)]);
      const purposes = MONEY_DESK_PURPOSE_CODES.map((code) => {
        const def = purposeDefinition(code);
        return { code: def.code, label: def.label, hindiLabel: def.hindiLabel, group: def.group, allowedDirections: def.allowedDirections, requiredFields: def.requiredFields, optionalFields: def.optionalFields, documentPolicy: def.documentPolicy, description: def.description };
      });
      workflow = <MoneyDeskPanel language={language} purposes={purposes} supporting={supporting} home={home as never} />;
    } catch (error) {
      const incidentId = crypto.randomUUID();
      operationalLog("error", "money_desk.load_failed", { incidentId, actorId: userId, errorName: error instanceof Error ? error.name : "unknown" });
      workflow = (
        <EmptyState
          title="Money Desk data is temporarily unavailable"
          description={`Something went wrong loading this screen. Please try again. If this keeps happening, share Error ID ${incidentId} with your Admin.`}
        />
      );
    }
  } else if ((portal === "founder-admin" || portal === "manufacturing") && item.slug === "manufacturing-os") {
    const mfgData = await manufacturingWorkspaceData(db, userId);
    workflow = <ManufacturingWorkspacePanel portal={portal} data={mfgData} />;
  } else if (["distributor", "super-stockist"].includes(portal)) {
    const partyType =
        portal === "distributor" ? "DISTRIBUTOR" : "SUPER_STOCKIST",
      // P0-2 root-cause fix: this list previously only checked SeeraPartyUser.active + partner
      // type — but requirePartyMembership (called internally by several of the functions this
      // `parties` list feeds into, e.g. distributorCreditPosition/retailerOrderLineAvailability)
      // additionally requires partner.lifecycle==="ACTIVE" and a live effectiveFrom/effectiveTo
      // membership window. A partner on a real SUSPENDED/DEACTIVATED/CLOSED credit/compliance hold
      // — or a membership whose window has simply lapsed — still showed up here, so the page
      // rendered as if access were fine right up until a downstream call threw PARTY_SCOPE_DENIED
      // uncaught. Matching the same criteria up front means a Distributor/S.S. user in that state
      // now correctly sees "no active party" instead of a half-working page that crashes on some
      // tabs but not others.
      now = new Date(),
      links = await db.seeraPartyUser.findMany({
        where: {
          userId,
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          partner: { type: partyType, lifecycle: "ACTIVE" },
        },
        include: { partner: true },
      }),
      parties = links.map((x) => ({
        value: x.partner.id,
        label: x.partner.tradeName ?? x.partner.legalName,
        meta: x.partner.code,
      }));
    if(item.slug==="payments"&&portal==="super-stockist"&&permissions.has("payment_proof:create")&&parties[0]){
      // RUN 2B Section 12: Payments was one ambiguous mixed form. "Pay Company" (outbound, S.S.→
      // Company) and "Receive from Distributor" (inbound context, S.S. as payee) are different
      // directions with different governance — the latter has no self-verification capability by
      // design (payment:review/ledger:post are Accounts-only, never granted to SUPER_STOCKIST_*),
      // so this tab reuses the same distributor-first Collections read model (outstanding/overdue/
      // credit/open orders) plus the existing reminder/promise actions rather than inventing a new
      // self-serve "record a received payment" mutation this pass wasn't asked to design.
      const tab = query.tab === "receive" ? "receive" : "pay";
      const tabs = (
        <div className={styles.brandToggle} style={{ gridColumn: "1/-1" }}>
          <a href={`/portal/${portal}/${item.slug}?tab=pay`}><button type="button" data-active={tab === "pay"}>{hi ? "कंपनी को भुगतान करें" : "PAY COMPANY"}</button></a>
          <a href={`/portal/${portal}/${item.slug}?tab=receive`}><button type="button" data-active={tab === "receive"}>{hi ? "वितरक से प्राप्त करें" : "RECEIVE FROM DISTRIBUTOR"}</button></a>
        </div>
      );
      if (tab === "receive") {
        const ssId = parties[0].value;
        const overview = await superStockistDistributorCreditOverview(db, userId, ssId);
        const selectedDistributorId = query.distributorId || undefined;
        const snapshot = selectedDistributorId
          ? await superStockistDistributorCollectionsSnapshot(db, userId, ssId, selectedDistributorId).catch((e) =>
              ifExpectedNotFound<Awaited<ReturnType<typeof superStockistDistributorCollectionsSnapshot>>>(e),
            )
          : null;
        // GENERATE RECEIPT (RUN 2B resume Section — receipt-generation gap): verified/posted
        // payments from the selected Distributor, each contextually offering a receipt action —
        // idempotencyKey is deterministic (`receipt-${payment.id}`) so re-clicking after issue is
        // safe and just surfaces the same already-issued receipt rather than duplicating it.
        const verifiedPayments = selectedDistributorId
          ? await db.seeraPaymentRecord.findMany({
              where: { payeeType: "SUPER_STOCKIST", payeeId: ssId, payerType: "DISTRIBUTOR", payerId: selectedDistributorId, status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } },
              orderBy: { paymentDate: "desc" },
              take: 20,
            })
          : [];
        const receiptDocs = verifiedPayments.length
          ? await db.seeraCommercialDocument.findMany({ where: { idempotencyKey: { in: verifiedPayments.map((p) => `receipt-${p.id}`) } }, select: { idempotencyKey: true, id: true, documentNumber: true } })
          : [];
        const receiptByPaymentId = new Map(receiptDocs.map((d) => [d.idempotencyKey!.replace("receipt-", ""), d]));
        workflow = (
          <div className={styles.cardStack}>
            {tabs}
            <CollectionsPanel
              language={language}
              base={`/portal/${portal}/${item.slug}?tab=receive`}
              selectedDistributorId={selectedDistributorId}
              selectedDistributorPartnerId={selectedDistributorId}
              superStockistId={ssId}
              distributors={overview.map((o) => ({ value: o.distributor.id, label: `${o.distributor.tradeName ?? o.distributor.legalName} · ${o.distributor.code}` }))}
              snapshot={
                snapshot
                  ? {
                      distributorName: snapshot.distributor.tradeName ?? snapshot.distributor.legalName,
                      outstanding: snapshot.outstanding,
                      current: snapshot.current,
                      overdue: snapshot.overdue,
                      oldestDueDate: snapshot.oldestDueDate ? snapshot.oldestDueDate.toISOString() : null,
                      lastPayment: snapshot.lastPayment ? { amount: snapshot.lastPayment.amount, postedAt: snapshot.lastPayment.postedAt!.toISOString() } : null,
                      promisedPaymentDate: snapshot.promisedPaymentDate ? snapshot.promisedPaymentDate.toISOString() : null,
                      creditStatus: snapshot.decision?.decision ?? null,
                      availableCredit: snapshot.availableCredit,
                      oldestOpenOrderId: snapshot.openOrders[0]?.id ?? null,
                      recentLedger: snapshot.recentLedger.map((e) => ({ ...e, postedAt: e.postedAt ? e.postedAt.toISOString() : null })),
                    }
                  : null
              }
              verifiedPayments={verifiedPayments.map((p) => ({
                id: p.id,
                paymentNumber: p.paymentNumber,
                amount: Number(p.amountMatched),
                reference: p.reference,
                paymentMode: p.paymentMode,
                paymentDate: p.paymentDate.toISOString(),
                receiptDocumentId: receiptByPaymentId.get(p.id)?.id ?? null,
                receiptDocumentNumber: receiptByPaymentId.get(p.id)?.documentNumber ?? null,
              }))}
            />
          </div>
        );
      } else {
        workflow = (
          <div className={styles.cardStack}>
            {tabs}
            <PartnerFinanceActions kind="payment" language={language} partnerType={partyType} parties={parties} />
          </div>
        );
      }
    } else if(item.slug==="payments"&&permissions.has("payment_proof:create")){
      workflow=<PartnerFinanceActions kind="payment" language={language} partnerType={partyType} parties={parties}/>;
    } else if(item.slug==="claims"&&permissions.has("distributor_claims:manage")){
      workflow=<PartnerFinanceActions kind="claim" language={language} partnerType={partyType} parties={parties}/>;
    } else if (["deliveries","delivery","pending","route"].includes(item.slug)) {
      // "pending"/"route" (the delivery-only reduced portal's other two nav items) previously fell
      // through to the generic read-only rowsFor kind==="deliveries" list with no outcome buttons —
      // a dead end for a delivery-only user. There's no distinct route-sequencing data model to draw
      // on (final audit finding), so all three slugs now share the same actionable PENDING/
      // RESCHEDULED delivery list rather than leaving two of them unactionable.
      const deliveries=await db.seeraDelivery.findMany({where:{status:{in:["PENDING","RESCHEDULED"]},order:{sellerPartnerId:{in:parties.map((x)=>x.value)}}},include:{order:{include:{lines:true,retailer:{select:{businessName:true}},buyerPartner:{select:{legalName:true,tradeName:true}}}}},orderBy:{createdAt:"asc"},take:50});
      workflow=<DeliveryActions language={language} deliveries={deliveries.map((delivery)=>({id:delivery.id,label:`${delivery.order.orderNumber} · ${delivery.order.retailer?.businessName ?? delivery.order.buyerPartner?.tradeName ?? delivery.order.buyerPartner?.legalName ?? "Recipient"}`,lines:delivery.order.lines.map((line)=>({id:line.id,label:`${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,remaining:Math.max(0,Number(line.dispatchedQuantity)-Number(line.deliveredQuantity)-Number(line.refusedQuantity)-Number(line.returnedQuantity))}))}))}/>;
    } else if (
      portal === "distributor" &&
      item.slug === "fulfilment" &&
      permissions.has("distributor_orders:fulfil")
    ) {
      // Distributor Easy Mode (Founder decision): ACCEPT/PARTIAL/REJECT and the delivery outcome
      // live on the SAME card, one screen — no separate Allocate/Dispatch/Deliveries navigation for
      // the normal daily flow. Every mutation still goes through the unmodified, enterprise-grade
      // acceptAndPrepareRetailerOrder/deliverRemainingRetailerOrder/recordEasyDeliveryOutcome
      // orchestration (distributor-easy-mode-service.ts) — this block only fetches what those cards
      // need to render.
      const distributorIds = parties.map((x) => x.value);
      const [pendingOrders, awaitingDeliveries, remainingSource] = await Promise.all([
        db.seeraSalesOrder.findMany({
          where: { sellerPartnerId: { in: distributorIds }, type: "RETAILER_ORDER", status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] } },
          include: { lines: true, retailer: { select: { businessName: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        db.seeraDelivery.findMany({
          where: { status: { in: ["PENDING", "RESCHEDULED"] }, order: { sellerPartnerId: { in: distributorIds }, type: "RETAILER_ORDER" } },
          include: { order: { include: { lines: true, retailer: { select: { businessName: true } } } } },
          orderBy: { createdAt: "asc" },
          take: 50,
        }),
        // Stage 1C fix: acceptAndPrepareRetailerOrder (easy mode) always auto-allocates+dispatches a
        // PARTIAL_ACCEPT in the same call, so the order never lingers at PARTIAL_ACCEPTED the way
        // this query originally assumed — it was structurally impossible for a real partial order's
        // leftover balance to ever appear here. The per-line `.filter(line=>line.remaining>0)` below
        // already excludes any order that's fully accepted, so broadening the status set is safe.
        db.seeraSalesOrder.findMany({
          where: { sellerPartnerId: { in: distributorIds }, type: "RETAILER_ORDER", status: { in: ["PARTIAL_ACCEPTED", "ALLOCATED", "DISPATCH_READY", "DISPATCHED", "PARTIAL_DELIVERED"] } },
          include: { lines: true, retailer: { select: { businessName: true } } },
          orderBy: { createdAt: "asc" },
          take: 50,
        }),
      ]);
      const salespersonIds = [...new Set(pendingOrders.map((o) => o.salespersonId).filter((x): x is string => Boolean(x)))];
      const salespeople = salespersonIds.length
        ? await db.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, email: true } })
        : [];
      const salespersonName = new Map(salespeople.map((u) => [u.id, u.name ?? u.email]));
      const pending = await Promise.all(
        pendingOrders.map(async (order) => {
          // P0-2 defensive fix: requirePartyMembership (inside retailerOrderLineAvailability)
          // checks partner.lifecycle/effectiveTo window; the `parties` list above does not — so a
          // Distributor partner that goes SUSPENDED/DEACTIVATED/CLOSED (a real, normal
          // credit/compliance-hold state) throws PARTY_SCOPE_DENIED here, uncaught, taking down the
          // entire Orders list with the generic "Data temporarily unavailable" boundary. One order's
          // stock-availability lookup failing must never break the whole list — degrade that one
          // order to "no tracked stock data" instead (ACCEPT still works exactly as it already does
          // for a Distributor with zero recorded stock, per the stockless-fulfilment fix).
          const availability = await retailerOrderLineAvailability(db, userId, order.sellerPartnerId!, order.id).catch(() => [] as Awaited<ReturnType<typeof retailerOrderLineAvailability>>);
          const availableFor = (lineId: string) => availability.find((a) => a.lineId === lineId)?.available ?? 0;
          const trackedFor = (lineId: string) => availability.find((a) => a.lineId === lineId)?.tracked ?? false;
          return {
            id: order.id,
            distributorId: order.sellerPartnerId!,
            orderNumber: order.orderNumber,
            retailer: order.retailer?.businessName ?? "Retailer",
            placedAt: order.createdAt.toLocaleString(language === "HI" ? "hi-IN" : "en-IN"),
            salesExecutive: order.salespersonId ? (salespersonName.get(order.salespersonId) ?? null) : null,
            cashOrCredit: order.commercialPaymentType ?? "CREDIT",
            orderTotal: Number(order.total),
            lines: order.lines.map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              unit: line.packSnapshot,
              ordered: Number(line.orderedQuantity),
              available: availableFor(line.id),
              tracked: trackedFor(line.id),
              rate: Number(line.priceSnapshot),
              lineTotal: Number(line.lineTotal),
            })),
          };
        }),
      );
      const awaitingDelivery = awaitingDeliveries.map((delivery) => ({
        deliveryId: delivery.id,
        orderNumber: delivery.order.orderNumber,
        retailer: delivery.order.retailer?.businessName ?? "Retailer",
        lines: delivery.order.lines
          .map((line) => ({
            id: line.id,
            label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
            remaining: Math.max(0, Number(line.dispatchedQuantity) - Number(line.deliveredQuantity) - Number(line.refusedQuantity) - Number(line.returnedQuantity)),
          }))
          .filter((line) => line.remaining > 0),
      })).filter((order) => order.lines.length > 0);
      const remaining = remainingSource
        .map((order) => ({
          id: order.id,
          distributorId: order.sellerPartnerId!,
          orderNumber: order.orderNumber,
          retailer: order.retailer?.businessName ?? "Retailer",
          lines: order.lines
            .map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              remaining: Math.max(0, Number(line.orderedQuantity) - Number(line.acceptedQuantity) - Number(line.cancelledQuantity)),
            }))
            .filter((line) => line.remaining > 0),
        }))
        .filter((order) => order.lines.length > 0);
      workflow = <DistributorOrderCards language={language} pending={pending} awaitingDelivery={awaitingDelivery} remaining={remaining} />;
    } else if (portal === "super-stockist" && ["allocation","dispatch"].includes(item.slug) && permissions.has("super_stockist_orders:fulfil")) {
      const status=item.slug==="allocation"?["ACCEPTED","PARTIAL_ACCEPTED"]:["ALLOCATED","DISPATCH_READY"];
      const orders=await db.seeraSalesOrder.findMany({where:{sellerPartnerId:{in:parties.map((x)=>x.value)},type:"DISTRIBUTOR_REPLENISHMENT",status:{in:status as ("ACCEPTED"|"PARTIAL_ACCEPTED"|"ALLOCATED"|"DISPATCH_READY")[]}},include:{lines:true,buyerPartner:{select:{legalName:true,tradeName:true}}},orderBy:{createdAt:"asc"},take:50});
      // RUN 2B resume Section 8 P0: business-readable option — Distributor / Date / Value / Status
      // first, Order No. only as a secondary trailing detail (never the primary way this list reads),
      // since a raw order-number-first list was the Founder's explicit complaint about this selector.
      workflow=<DistributionActions kind={item.slug==="allocation"?"allocate":"dispatch"} language={language} partyType="SUPER_STOCKIST" parties={parties} orders={orders.map((x)=>({id:x.id,label:`${x.buyerPartner?.tradeName ?? x.buyerPartner?.legalName ?? "Distributor"} · ${x.createdAt.toLocaleDateString(language==="HI"?"hi-IN":"en-IN")} · ${money(x.total)} · ${x.status} · #${x.orderNumber}`,partnerId:x.sellerPartnerId!,lines:x.lines.map((line)=>({id:line.id,label:`${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,ordered:Number(item.slug==="allocation"?line.acceptedQuantity:line.allocatedQuantity)}))}))}/>;
    } else if (
      ((portal === "distributor" && item.slug === "incoming-stock") ||
        (portal === "super-stockist" && item.slug === "receipts")) &&
      permissions.has(
        portal === "distributor"
          ? "distributor_inventory:adjust"
          : "super_stockist_inventory:adjust",
      )
    ) {
      const orderType =
        portal === "distributor" ? "DISTRIBUTOR_REPLENISHMENT" : "COMPANY_REPLENISHMENT";
      const incoming = await db.seeraSalesOrder.findMany({
        where: {
          buyerPartnerId: { in: parties.map((x) => x.value) },
          type: orderType,
          status: { in: ["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"] },
        },
        include: {
          lines: true,
          sellerPartner: { select: { legalName: true, tradeName: true } },
        },
        orderBy: { dispatchedAt: "asc" },
        take: 50,
      });
      const received = incoming.length
        ? await db.seeraInventoryMovement.groupBy({
            by: ["sourceId", "skuId"],
            where: {
              partyType,
              partyId: { in: parties.map((x) => x.value) },
              sourceType: "IncomingReceipt",
              direction: "IN",
              sourceId: { in: incoming.map((x) => x.id) },
            },
            _sum: { quantity: true },
          })
        : [];
      const receivedFor = (orderId: string, skuId: string) =>
        Number(
          received.find((x) => x.sourceId === orderId && x.skuId === skuId)
            ?._sum.quantity ?? 0,
        );
      // Incoming Stock consignment cards (Founder section 23) — shared between Distributor
      // (from S.S.) and Super Stockist (from Company) since it's the exact same receipt mechanism
      // (receiveIncomingOrder) and card shape; built once here so S.S. never needs a duplicate
      // implementation in a later pass (Founder section 35).
      const pending = incoming
        .map((order) => ({
          id: order.id,
          from: order.sellerPartner?.tradeName ?? order.sellerPartner?.legalName ?? (portal === "distributor" ? "Super Stockist" : "Company"),
          orderNumber: order.orderNumber,
          dispatchedAt: order.dispatchedAt ? order.dispatchedAt.toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN") : null,
          partnerId: order.buyerPartnerId!,
          lines: order.lines
            .map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              sent: Number(line.dispatchedQuantity) - receivedFor(order.id, line.skuId),
            }))
            .filter((line) => line.sent > 0),
        }))
        .filter((order) => order.lines.length > 0);
      workflow = <IncomingStockCards language={language} orders={pending} partyType={partyType} />;
    } else if (
      portal === "distributor" &&
      item.slug === "replenishment" &&
      permissions.has("distributor_replenishment:create") &&
      parties[0]
    ) {
      // Order from S.S. wizard (Founder section 24): the assigned S.S. is shown, never chosen —
      // createDistributorReplenishment already auto-resolves it server-side from
      // distributor.assignedSuperStockistId. Every active SKU is shown (never silently hidden);
      // one with no resolvable price (governed SS_TO_DISTRIBUTOR row, or the Cake/Powder derived
      // formula — see distributor-pricing.ts, the same authoritative source
      // createDistributorReplenishment itself uses) is visible but disabled with a clear "price
      // not configured yet" reason, never an invented rate.
      const now = new Date();
      const [distributorPartner, allSkus, ssToDistributorPrices, companyToSsPrices, recentSsOrders] = await Promise.all([
        db.seeraPartner.findUnique({ where: { id: parties[0].value }, select: { assignedSuperStockistId: true } }),
        db.seeraSku.findMany({ where: { status: "ACTIVE" }, orderBy: [{ brand: "asc" }, { productName: "asc" }] }),
        db.seeraPriceVersion.findMany({
          where: { tier: "SS_TO_DISTRIBUTOR", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          select: { skuId: true, amount: true },
        }),
        db.seeraPriceVersion.findMany({
          where: { tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          select: { skuId: true, amount: true },
        }),
        db.seeraSalesOrder.findMany({
          where: { buyerPartnerId: parties[0].value, type: "DISTRIBUTOR_REPLENISHMENT" },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
      ]);
      const superStockist = distributorPartner?.assignedSuperStockistId
        ? await db.seeraPartner.findFirst({ where: { id: distributorPartner.assignedSuperStockistId, type: "SUPER_STOCKIST", lifecycle: "ACTIVE" }, select: { legalName: true, tradeName: true } })
        : null;
      const governedPriceBySkuId = new Map(ssToDistributorPrices.map((p) => [p.skuId, Number(p.amount)]));
      const companyToSsBySkuId = new Map(companyToSsPrices.map((p) => [p.skuId, Number(p.amount)]));
      const distributorRateFor = (sku: { id: string; code: string }): number | null => {
        const governed = governedPriceBySkuId.get(sku.id);
        if (governed != null) return governed;
        const base = companyToSsBySkuId.get(sku.id);
        return base == null ? null : deriveDistributorPurchaseRate({ skuCode: sku.code, ssRate: base });
      };
      const statusOf = (s: string): "REQUESTED" | "ACCEPTED" | "DISPATCHED" | "RECEIVED" =>
        ["SUBMITTED", "ACKNOWLEDGED", "HELD"].includes(s)
          ? "REQUESTED"
          : ["ACCEPTED", "PARTIAL_ACCEPTED", "ALLOCATED", "DISPATCH_READY"].includes(s)
            ? "ACCEPTED"
            : s === "DISPATCHED"
              ? "DISPATCHED"
              : "RECEIVED";
      workflow = (
        <OrderFromSSWizard
          language={language}
          distributorId={parties[0].value}
          superStockistName={superStockist ? (superStockist.tradeName ?? superStockist.legalName) : null}
          skus={allSkus.map((x) => {
            const rate = distributorRateFor(x);
            // P0-4 correction: this label previously said "Basic ... (+GST)" for every brand,
            // which is only true for GST_EXCLUSIVE SKUs (Seera). A GST_INCLUSIVE brand (MUV)
            // shows the same governed rate as its final price — GST is derived FROM it, never
            // added on top (createDistributorReplenishment already computes it this way via the
            // same priceModeForBrand call; this was purely a mislabeled display, not a math bug).
            const label =
              rate == null
                ? undefined
                : priceModeForBrand(x.brand) === "GST_INCLUSIVE"
                  ? `Rate ₹${rate.toFixed(2)} (Incl. GST)`
                  : `Basic ₹${rate.toFixed(2)} (+GST)`;
            return {
              value: x.id,
              label: `${x.productName} (${x.packSize.toString()} ${x.unitType})`,
              brand: x.brand,
              meta: label,
              unavailable: rate == null,
            };
          })}
          recentOrders={recentSsOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: statusOf(o.status),
            total: Number(o.total),
            placedAt: o.createdAt.toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN"),
          }))}
        />
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "distributor-orders" &&
      permissions.has("super_stockist_orders:fulfil")
    ) {
      // Super Stockist "Distributor Orders" primary workspace (Founder decision): business cards,
      // not a raw order-number dropdown — Distributor name/territory/credit status/stock
      // availability up front, ACCEPT/PARTIAL/REJECT on the same card. Allocation happens
      // automatically on accept (acceptAndAllocateDistributorOrder); Dispatch stays a distinct,
      // deliberately detailed next step (Founder: "DISPATCH must remain detailed").
      const superStockistIds = parties.map((x) => x.value);
      const orders = await db.seeraSalesOrder.findMany({
        where: { sellerPartnerId: { in: superStockistIds }, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] } },
        include: { lines: true, buyerPartner: { select: { legalName: true, tradeName: true, territoryIds: true } } },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      // Stage 1C fix: acceptAndAllocateDistributorOrder (easy mode) always auto-allocates a
      // PARTIAL_ACCEPT in the same call (order.status -> ALLOCATED), so it never lingers at
      // PARTIAL_ACCEPTED the way this query originally assumed — see the matching Distributor fix
      // above. The per-line `.filter(line=>line.ordered>0)` below already excludes fully-accepted
      // orders, so broadening the status set is safe.
      const remainingSource = await db.seeraSalesOrder.findMany({
        where: { sellerPartnerId: { in: superStockistIds }, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["PARTIAL_ACCEPTED", "ALLOCATED", "DISPATCH_READY", "DISPATCHED", "PARTIAL_DELIVERED"] } },
        include: { lines: true, buyerPartner: { select: { legalName: true, tradeName: true } } },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      const remainingOrders = remainingSource
        .map((x) => ({
          id: x.id,
          label: `${x.orderNumber} · ${x.buyerPartner?.tradeName ?? x.buyerPartner?.legalName ?? "Distributor"}`,
          partnerId: x.sellerPartnerId!,
          lines: x.lines
            .map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              ordered: Math.max(0, Number(line.orderedQuantity) - Number(line.acceptedQuantity) - Number(line.cancelledQuantity)),
            }))
            .filter((line) => line.ordered > 0),
        }))
        .filter((order) => order.lines.length > 0);
      const territoryIds = [...new Set(orders.flatMap((o) => o.buyerPartner?.territoryIds ?? []))];
      const territoryNames = territoryIds.length
        ? await db.seeraGeographyNode.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } })
        : [];
      const territoryName = new Map(territoryNames.map((t) => [t.id, t.name]));
      const pending = await Promise.all(
        orders.map(async (order) => {
          // P0-2 defensive fix: same class of risk as the Distributor-portal call sites above — a
          // party on a real SUSPENDED/DEACTIVATED/CLOSED lifecycle must degrade this one order's
          // row, never crash the whole S.S. Distributor-orders list.
          const [availability, position] = await Promise.all([
            distributorOrderLineAvailability(db, userId, order.sellerPartnerId!, order.id).catch(() => [] as Awaited<ReturnType<typeof distributorOrderLineAvailability>>),
            order.buyerPartnerId ? creditPositionFor(db, order.buyerPartnerId, new Date()).catch(() => null) : null,
          ]);
          const availableFor = (lineId: string) => availability.find((a) => a.lineId === lineId)?.available ?? 0;
          const trackedFor = (lineId: string) => availability.find((a) => a.lineId === lineId)?.tracked ?? false;
          return {
            id: order.id,
            superStockistId: order.sellerPartnerId!,
            orderNumber: order.orderNumber,
            distributor: order.buyerPartner?.tradeName ?? order.buyerPartner?.legalName ?? "Distributor",
            territory: order.buyerPartner?.territoryIds?.map((id) => territoryName.get(id)).filter(Boolean).join(", ") || null,
            placedAt: order.createdAt.toLocaleString(language === "HI" ? "hi-IN" : "en-IN"),
            cashOrCredit: order.commercialPaymentType ?? "CREDIT",
            orderTotal: Number(order.total),
            credit: {
              limit: position?.terms ? Number(position.terms.creditLimit) : 0,
              used: position?.outstanding ?? 0,
              available: position?.availableCredit ?? null,
              overdue: position?.overdue ?? 0,
              status: position?.decision?.decision ?? null,
            },
            lines: order.lines.map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              unit: line.packSnapshot,
              ordered: Number(line.orderedQuantity),
              available: availableFor(line.id),
              tracked: trackedFor(line.id),
              rate: Number(line.priceSnapshot),
              lineTotal: Number(line.lineTotal),
            })),
          };
        }),
      );
      workflow = (
        <>
          <SuperStockistOrderCards language={language} pending={pending} dispatchHref={`/portal/${portal}/dispatch`} />
          {remainingOrders.length > 0 && (
            <DistributionActions kind="remaining" language={language} partyType="SUPER_STOCKIST" parties={parties} orders={remainingOrders} />
          )}
        </>
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "distributors" &&
      permissions.has("distributor_credit:manage") &&
      parties[0]
    ) {
      // Founder decision (section 16-17): "+ Add Distributor" reachable from the S.S. portal
      // itself. The existing generic partner list below (item.kind==="partners") already renders
      // every Distributor mapped to this S.S. — this panel only adds the create affordance above it.
      // redirectBase matches the Founder/Admin path below so the S.S. lands on the new
      // Distributor's 360 page after creation instead of staying on the list (final audit fix).
      workflow = <AddDistributorPanel language={language} superStockistId={parties[0].value} redirectBase={base} />;
    } else if (
      portal === "super-stockist" &&
      item.slug === "collections" &&
      permissions.has("partner_credit:enforce") &&
      parties[0]
    ) {
      // Distributor-first Collections (Founder Phase S) — was a raw order-number-primary list
      // before this; now mirrors the same picker+snapshot+reminder pattern Manager's Collections
      // screen already uses, reading the exact same canonical creditPositionFor() truth.
      const ssId = parties[0].value;
      const overview = await superStockistDistributorCreditOverview(db, userId, ssId);
      const selectedDistributorId = query.distributorId || undefined;
      const snapshot = selectedDistributorId
        ? await superStockistDistributorCollectionsSnapshot(db, userId, ssId, selectedDistributorId).catch((e) =>
            ifExpectedNotFound<Awaited<ReturnType<typeof superStockistDistributorCollectionsSnapshot>>>(e),
          )
        : null;
      workflow = (
        <CollectionsPanel
          language={language}
          base={`/portal/${portal}/${item.slug}`}
          selectedDistributorId={selectedDistributorId}
          selectedDistributorPartnerId={selectedDistributorId}
          superStockistId={ssId}
          distributors={overview.map((o) => ({ value: o.distributor.id, label: `${o.distributor.tradeName ?? o.distributor.legalName} · ${o.distributor.code}` }))}
          snapshot={
            snapshot
              ? {
                  distributorName: snapshot.distributor.tradeName ?? snapshot.distributor.legalName,
                  outstanding: snapshot.outstanding,
                  current: snapshot.current,
                  overdue: snapshot.overdue,
                  oldestDueDate: snapshot.oldestDueDate ? snapshot.oldestDueDate.toISOString() : null,
                  lastPayment: snapshot.lastPayment ? { amount: snapshot.lastPayment.amount, postedAt: snapshot.lastPayment.postedAt!.toISOString() } : null,
                  promisedPaymentDate: snapshot.promisedPaymentDate ? snapshot.promisedPaymentDate.toISOString() : null,
                  creditStatus: snapshot.decision?.decision ?? null,
                  availableCredit: snapshot.availableCredit,
                  oldestOpenOrderId: snapshot.openOrders[0]?.id ?? null,
                  recentLedger: snapshot.recentLedger.map((e) => ({ ...e, postedAt: e.postedAt ? e.postedAt.toISOString() : null })),
                }
              : null
          }
        />
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "company-orders" &&
      permissions.has("company_replenishment:create") &&
      parties[0]
    ) {
      // Order from Company wizard (Founder Phase I): step flow, never a dense generic form. Every
      // active SKU is shown (never hidden for a missing governed price — flagged disabled with a
      // reason instead), and the generated Company Order Number is shown immediately after submit,
      // with SUBMIT PAYMENT PROOF as the very next visible action on the same screen.
      const now = new Date();
      const [allSkus, pricedVersions, recentCompanyOrders] = await Promise.all([
        db.seeraSku.findMany({ where: { status: "ACTIVE" }, orderBy: [{ brand: "asc" }, { productName: "asc" }] }),
        db.seeraPriceVersion.findMany({
          where: { tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          select: { skuId: true, amount: true },
        }),
        db.seeraSalesOrder.findMany({
          where: { buyerPartnerId: parties[0].value, type: "COMPANY_REPLENISHMENT" },
          include: { paymentProofs: { orderBy: { submittedAt: "desc" }, take: 1 } },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
      ]);
      const priceBySkuId = new Map(pricedVersions.map((p) => [p.skuId, Number(p.amount)]));
      const schemeNoteBySkuId = await activeSchemeNotesForSkus(db, allSkus.map((x) => x.id), "COMPANY_TO_SS_DISPLAY_ONLY", now);
      const statusOf = (o: (typeof recentCompanyOrders)[number]): "PAYMENT_REQUIRED" | "PROOF_SUBMITTED" | "VERIFIED" | "DISPATCHED" | "CANCELLED" => {
        // Final closure (23-Aug), Part 17: CANCELLED must be its own terminal bucket — without this
        // check a cancelled order fell through to the PAYMENT_REQUIRED default, showing "Payment
        // required" (and the Cancel Order button) for an order that's already cancelled.
        if (o.status === "CANCELLED") return "CANCELLED";
        if (["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"].includes(o.status)) return "DISPATCHED";
        if (o.status === "CONFIRMED") return "VERIFIED";
        const proof = o.paymentProofs[0];
        if (proof && ["SUBMITTED", "UNDER_REVIEW", "MATCHED", "PARTIALLY_MATCHED", "ADVANCE_HELD"].includes(proof.status)) return "PROOF_SUBMITTED";
        return "PAYMENT_REQUIRED";
      };
      const catalog: CompanyCatalogItem[] = allSkus.map((x) => {
        const override = COMPANY_ORDER_UNIT_OVERRIDES[x.code];
        const baseRate = priceBySkuId.get(x.id);
        // Same governed multiplier createCompanyOrder actually charges with (companyOrderLineMultiplier)
        // — the displayed rate and the real charged total can never disagree.
        const rate = baseRate != null ? baseRate * companyOrderLineMultiplier(x.code) : null;
        return {
          skuId: x.id,
          brand: x.brand,
          productName: x.productName,
          packDescription: `${x.packSize.toString()} ${x.unitType}`,
          orderUnit: override?.orderUnit ?? DEFAULT_MUV_ORDER_UNIT,
          unitsPerOrderUnit: override?.unitsPerOrderUnit ?? 1,
          rateBasis: override?.rateBasis ?? "Rate per piece",
          rate,
          scheme: schemeNoteBySkuId.get(x.id),
          unavailable: rate == null,
        };
      });
      workflow = (
        <CompanyOrderWizard
          language={language}
          superStockistId={parties[0].value}
          catalog={catalog}
          recentOrders={recentCompanyOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: statusOf(o),
            total: Number(o.total),
            placedAt: o.createdAt.toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN"),
          }))}
        />
      );
    } else if (item.slug === "stock-reconciliation") {
      const skus = await db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        orderBy: { productName: "asc" },
        take: 200,
      });
      workflow = (
        <DistributionActions
          kind="reconcile"
          language={language}
          partyType={partyType}
          parties={parties}
          skus={skus.map((x) => ({
            value: x.id,
            label: `${x.code} · ${x.productName}`,
          }))}
        />
      );
    } else if (
      item.slug === "inventory" &&
      permissions.has(
        portal === "distributor"
          ? "distributor_inventory:adjust"
          : "super_stockist_inventory:adjust",
      )
    ) {
      const skus = await db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        orderBy: { productName: "asc" },
        take: 200,
      });
      // Simple Stock page (Founder section 8): PRODUCT/AVAILABLE/RESERVED/INCOMING/PHYSICAL, one
      // row per active SKU, SEERA grouped before MUV. "Governed stock movement" below stays the
      // advanced/exception tool — this table is the primary daily-use view.
      let stockSummary: Awaited<ReturnType<typeof distributorStockSummary>> | null = null;
      if (portal === "distributor" && parties[0])
        try {
          stockSummary = await distributorStockSummary(db, userId, parties[0].value);
        } catch (e) {
          stockSummary = ifExpectedNotFound(e);
        }
      else if (portal === "super-stockist" && parties[0])
        try {
          stockSummary = await superStockistStockSummary(db, userId, parties[0].value);
        } catch (e) {
          stockSummary = ifExpectedNotFound(e);
        }
      // RUN 2B Section 18: brand tabs (default SEERA, never a mixed list by default) + a name
      // search, both query-param driven (?brand=seera|muv|all, ?q=) — the same GET-form pattern
      // already used elsewhere in this file (e.g. Collections' distributor picker), so no new
      // client component/state is needed for a server-rendered table.
      const stockBrand = query.brand === "muv" ? "muv" : query.brand === "all" ? "all" : "seera";
      const stockQuery = (query.q ?? "").trim().toLowerCase();
      const filteredStock = (stockSummary ?? []).filter(
        (row) =>
          (stockBrand === "all" || (stockBrand === "seera") === (row.brand === "Seera")) &&
          (!stockQuery || row.productName.toLowerCase().includes(stockQuery)),
      );
      workflow = (
        <>
          {stockSummary && (
            <section className={styles.panel}>
              <div>
                <small>{hi ? "स्टॉक" : "STOCK"}</small>
                <h2>{hi ? "उत्पाद-वार स्टॉक" : "Stock by product"}</h2>
              </div>
              <div className={styles.brandToggle} style={{ gridColumn: "1/-1" }}>
                <a href={`/portal/${portal}/${item.slug}?brand=seera${stockQuery ? `&q=${encodeURIComponent(stockQuery)}` : ""}`}><button type="button" data-active={stockBrand === "seera"}>SEERA</button></a>
                <a href={`/portal/${portal}/${item.slug}?brand=muv${stockQuery ? `&q=${encodeURIComponent(stockQuery)}` : ""}`}><button type="button" data-active={stockBrand === "muv"}>MUV</button></a>
                <a href={`/portal/${portal}/${item.slug}?brand=all${stockQuery ? `&q=${encodeURIComponent(stockQuery)}` : ""}`}><button type="button" data-active={stockBrand === "all"}>{hi ? "सभी" : "ALL"}</button></a>
              </div>
              <form method="get" action={`/portal/${portal}/${item.slug}`} style={{ gridColumn: "1/-1", display: "flex", gap: 8 }}>
                <input type="hidden" name="brand" value={stockBrand} />
                <input name="q" defaultValue={stockQuery} placeholder={hi ? "उत्पाद खोजें" : "Search product"} style={{ flex: 1, minHeight: 40, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 9 }} />
                <button type="submit">{hi ? "खोजें" : "Search"}</button>
              </form>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{hi ? "उत्पाद" : "Product"}</th>
                      <th>{hi ? "उपलब्ध" : "Available"}</th>
                      <th>{hi ? "आरक्षित" : "Reserved"}</th>
                      <th>{hi ? "आ रहा है" : "Incoming"}</th>
                      <th>{hi ? "भौतिक" : "Physical"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.length === 0 && (
                      <tr>
                        <td colSpan={5}>{hi ? "इस फ़िल्टर के लिए कोई उत्पाद नहीं।" : "No products for this filter."}</td>
                      </tr>
                    )}
                    {filteredStock.map((row) => (
                      <tr key={row.skuId}>
                        <td>
                          <span className={styles.badge}>{row.brand === "Seera" ? "SEERA" : "MUV"}</span> {row.productName} <small>({row.unit})</small>
                        </td>
                        <td>{row.available}</td>
                        <td>{row.reserved}</td>
                        <td>{row.incoming}</td>
                        <td>{row.physical ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <DistributionActions
            kind="movement"
            language={language}
            partyType={partyType}
            parties={parties}
            skus={skus.map((x) => ({
              value: x.id,
              label: `${x.code} · ${x.productName}`,
            }))}
          />
        </>
      );
    } else if (
      item.slug === "returns-damage" &&
      permissions.has(
        portal === "distributor"
          ? "distributor_inventory:adjust"
          : "super_stockist_inventory:adjust",
      )
    ) {
      const skus = await db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        orderBy: { productName: "asc" },
        take: 200,
      });
      const retailers =
        portal === "distributor"
          ? await db.seeraRetailer.findMany({
              where: { distributorId: { in: parties.map((x) => x.value) }, lifecycle: "ACTIVE" },
              orderBy: { businessName: "asc" },
              take: 250,
            })
          : [];
      const skuLabel = new Map(skus.map((x) => [x.id, `${x.code} · ${x.productName}`]));
      const requests = await db.seeraReturnRequest.findMany({
        where: { partyType, partyId: { in: parties.map((x) => x.value) } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const returnOrderType = portal === "distributor" ? "RETAILER_ORDER" : "DISTRIBUTOR_REPLENISHMENT";
      const returnableOrders = await db.seeraSalesOrder.findMany({
        where: {
          sellerPartnerId: { in: parties.map((x) => x.value) },
          type: returnOrderType,
          status: { in: ["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"] },
        },
        include: {
          retailer: { select: { businessName: true } },
          buyerPartner: { select: { legalName: true, tradeName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      workflow = (
        <ReturnsActions
          language={language}
          partyType={partyType}
          parties={parties}
          retailers={retailers.map((r) => ({ value: r.id, label: r.businessName }))}
          skus={skus.map((x) => ({ value: x.id, label: `${x.code} · ${x.productName}` }))}
          orders={returnableOrders.map((o) => ({
            value: o.id,
            label: `${o.orderNumber} · ${o.retailer?.businessName ?? o.buyerPartner?.tradeName ?? o.buyerPartner?.legalName ?? "Buyer"}`,
          }))}
          requests={requests.map((r) => ({
            id: r.id,
            requestNumber: r.requestNumber,
            skuLabel: skuLabel.get(r.skuId) ?? r.skuId,
            quantity: Number(r.quantity),
            condition: r.condition,
            reason: r.reason,
            status: r.status,
            creditNoteRequested: r.creditNoteRequested,
            createdBySelf: r.actorId === userId,
          }))}
        />
      );
    } else if (
      portal === "distributor" &&
      item.slug === "credit" &&
      permissions.has("distributor_credit:view") &&
      parties[0]
    ) {
      // Money consolidation (Founder section 25): Credit/Outstanding/Ledger/Payments merged into
      // one glanceable view for the normal daily case — the old separate Outstanding/Ledger/
      // Payments screens remain reachable under MORE for advanced use, unchanged.
      // P0-2 defensive fix: `parties` (above) doesn't filter partner.lifecycle/effectiveTo the way
      // requirePartyMembership (called inside distributorCreditPosition) does — a Distributor
      // partner on a real SUSPENDED/DEACTIVATED/CLOSED credit hold throws PARTY_SCOPE_DENIED here,
      // uncaught, previously taking down this whole tab with the generic "Data temporarily
      // unavailable" boundary instead of a governed, in-app message.
      const position = await distributorCreditPosition(db, userId, parties[0].value).catch((e) => ifExpectedNotFound<Awaited<ReturnType<typeof distributorCreditPosition>>>(e));
      if (!position) {
        workflow = (
          <EmptyState
            title={hi ? "खाता जानकारी अभी उपलब्ध नहीं है" : "Account information is not available right now"}
            description={hi ? "आपकी पार्टनर स्थिति की समीक्षा चल रही है — कृपया अपने Admin से संपर्क करें।" : "Your partner account status is under review — please contact your Admin."}
          />
        );
      } else {
      // Final UI reachability audit fix: the Distributor previously had no in-app signal that a
      // submitted payment was verified by Accounts or that their Super Stockist had generated a
      // receipt for it — this mirrors the same SeeraPaymentRecord + receipt-by-idempotencyKey
      // lookup the S.S. "Receive from Distributor" tab already uses (OperationalWorkspace.tsx,
      // portal==="super-stockist" tab==="receive" branch above), just read-only from the payer side.
      const latestPayment = await db.seeraPaymentRecord.findFirst({
        where: { payerType: "DISTRIBUTOR", payerId: parties[0].value },
        orderBy: { paymentDate: "desc" },
      });
      const latestReceipt =
        latestPayment && (["VERIFIED", "PARTIALLY_MATCHED"] as string[]).includes(latestPayment.status)
          ? await db.seeraCommercialDocument.findFirst({
              where: { idempotencyKey: `receipt-${latestPayment.id}` },
              select: { id: true, documentNumber: true },
            })
          : null;
      workflow = (
        <DistributorMoneyPanel
          language={language}
          distributorId={parties[0].value}
          snapshot={{
            outstanding: position.outstanding,
            current: position.current,
            overdue: position.overdue,
            oldestDueDate: position.oldestDueDate ? position.oldestDueDate.toISOString() : null,
            lastPayment: position.lastPayment ? { amount: position.lastPayment.amount, postedAt: position.lastPayment.postedAt!.toISOString() } : null,
            lastPaymentStatus: latestPayment?.status ?? null,
            receipt: latestReceipt ? { id: latestReceipt.id, documentNumber: latestReceipt.documentNumber } : null,
            promisedPaymentDate: position.promisedPaymentDate ? position.promisedPaymentDate.toISOString() : null,
            creditStatus: position.decision?.decision ?? null,
            availableCredit: position.availableCredit,
            creditLimit: position.terms ? Number(position.terms.creditLimit) : null,
            openOrders: position.openOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, total: o.total, originalDueDate: o.originalDueDate ? o.originalDueDate.toISOString() : null })),
          }}
        />
      );
      }
    } else if (
      portal === "distributor" &&
      item.slug === "outstanding" &&
      permissions.has("distributor_credit:view")
    ) {
      // P0-2 defensive fix: same PARTY_SCOPE_DENIED risk as the Money/Credit tab above (a party on
      // a real SUSPENDED/DEACTIVATED/CLOSED lifecycle) — skip that one party's row rather than
      // crash this whole multi-party list.
      const positionsRaw = await Promise.all(
        parties.map(async (party) => ({
          label: party.label,
          position: await distributorCreditPosition(db, userId, party.value).catch((e) => ifExpectedNotFound<Awaited<ReturnType<typeof distributorCreditPosition>>>(e)),
        })),
      );
      const positions = positionsRaw.filter((p): p is { label: string; position: NonNullable<typeof p.position> } => p.position != null);
      workflow = (
        <CreditPanel
          language={language}
          title={hi ? "बकाया ऑर्डर, आयु और वादा तिथियाँ" : "Outstanding orders, ageing and promised dates"}
          positions={positions}
        />
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "credit" &&
      permissions.has("partner_credit:enforce")
    ) {
      const overviews = await Promise.all(
        parties.map((party) => superStockistDistributorCreditOverview(db, userId, party.value)),
      );
      const positions = overviews.flat().map((entry) => ({
        label: entry.distributor.tradeName ?? entry.distributor.legalName,
        position: entry.position,
      }));
      const canRequestExtension = permissions.has("credit_extension:request");
      const [overdueOrders, extensionHistory] = canRequestExtension
        ? await Promise.all([
            db.seeraSalesOrder.findMany({
              where: {
                sellerPartnerId: { in: parties.map((x) => x.value) },
                type: "DISTRIBUTOR_REPLENISHMENT",
                status: { notIn: ["CLOSED", "CANCELLED", "REJECTED", "DRAFT"] },
                originalDueDate: { lt: new Date() },
              },
              include: { buyerPartner: { select: { legalName: true, tradeName: true } } },
              orderBy: { originalDueDate: "asc" },
              take: 50,
            }),
            Promise.all(parties.map((party) => superStockistCreditExtensionHistory(db, userId, party.value))).then(
              (lists) => lists.flat(),
            ),
          ])
        : [[], []];
      const canManageCredit = permissions.has("distributor_credit:manage");
      workflow = (
        <>
          <CreditPanel
            language={language}
            title={
              hi
                ? "आपके वितरकों की क्रेडिट स्थिति"
                : "Credit position of your distributors"
            }
            positions={positions}
          />
          {canManageCredit && (
            <CreditPolicyPanel
              language={language}
              superStockistId={parties[0]!.value}
              distributors={overviews.flat().map((entry) => ({ value: entry.distributor.id, label: `${entry.distributor.tradeName ?? entry.distributor.legalName} · ${entry.distributor.code}` }))}
            />
          )}
          {canRequestExtension && (
            <>
              <PartnerFinanceActions
                kind="extension"
                language={language}
                partnerType="SUPER_STOCKIST"
                parties={parties}
                orders={overdueOrders.map((order) => ({
                  id: order.id,
                  label: `${order.orderNumber} · ${order.buyerPartner?.tradeName ?? order.buyerPartner?.legalName ?? "Distributor"} · ${hi ? "मूल देय" : "original due"} ${order.originalDueDate ? date(order.originalDueDate, language) : "—"}`,
                  partnerId: order.sellerPartnerId!,
                }))}
              />
              {extensionHistory.length > 0 && (
                <section className={styles.panel}>
                  <div>
                    <small>{hi ? "इतिहास" : "HISTORY"}</small>
                    <h2>{hi ? "क्रेडिट एक्सटेंशन अनुरोध" : "Credit extension requests"}</h2>
                  </div>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>{hi ? "ऑर्डर" : "Order"}</th>
                          <th>{hi ? "मूल देय तिथि" : "Original due"}</th>
                          <th>{hi ? "अनुरोधित तिथि" : "Requested until"}</th>
                          <th>{hi ? "स्थिति" : "Status"}</th>
                          <th>{hi ? "दिनांक" : "Date"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extensionHistory.map((extension) => (
                          <tr key={extension.id}>
                            <td>{extension.order.orderNumber}</td>
                            <td>{date(extension.originalDueDate, language)}</td>
                            <td>{date(extension.extensionUntil, language)}</td>
                            <td>
                              <span className={styles.badge}>{extension.status}</span>
                            </td>
                            <td>{date(extension.createdAt, language)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      );
    } else if (
      ((portal === "distributor" && item.slug === "ledgers") ||
        (portal === "super-stockist" && ["outstanding", "ledger"].includes(item.slug))) &&
      permissions.has("ledger:view")
    ) {
      const ledgers = await Promise.all(
        parties.map(async (party) => ({
          label: party.label,
          ledger: await ledgerReadModel(db, userId, { partyType, partyId: party.value }),
        })),
      );
      workflow = (
        <LedgerPanel
          language={language}
          title={
            item.slug === "outstanding"
              ? hi
                ? "बकाया चालान और आयु"
                : "Outstanding invoices and ageing"
              : hi
                ? "खाता विवरण"
                : "Ledger statement"
          }
          ledgers={ledgers}
        />
      );
    } else if (item.slug === "reports") {
      const partyIds = parties.map((x) => x.value);
      const [orders, movements, outstandingByParty, openClaims] = await Promise.all([
        db.seeraSalesOrder.findMany({
          where: {
            OR: [
              { sellerPartnerId: { in: partyIds } },
              { buyerPartnerId: { in: partyIds } },
            ],
          },
          select: { status: true, total: true, createdAt: true },
        }),
        db.seeraInventoryMovement.findMany({
          where: { partyType, partyId: { in: partyIds } },
          include: { sku: { select: { code: true, productName: true } } },
        }),
        Promise.all(
          parties.map(async (party) => ({
            party,
            result: await partyOutstanding(db, partyType, party.value, new Date()),
          })),
        ),
        db.seeraClaim.count({
          where: {
            claimantType: partyType,
            claimantId: { in: partyIds },
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          },
        }),
      ]);
      const now = new Date();
      const bookedThisMonth = orders
        .filter(
          (o) =>
            o.createdAt.getMonth() === now.getMonth() &&
            o.createdAt.getFullYear() === now.getFullYear(),
        )
        .reduce((s, o) => s + Number(o.total), 0);
      const totalOutstanding = outstandingByParty.reduce(
        (s, x) => s + x.result.outstandingTotal,
        0,
      );
      const bySku = new Map<
        string,
        { code: string; name: string; onHand: number; reserved: number }
      >();
      for (const m of movements) {
        const entry = bySku.get(m.skuId) ?? {
          code: m.sku.code,
          name: m.sku.productName,
          onHand: 0,
          reserved: 0,
        };
        const qty = Number(m.quantity);
        if (m.direction === "IN") entry.onHand += qty;
        if (m.direction === "OUT") entry.onHand -= qty;
        if (m.direction === "RESERVE") entry.reserved += qty;
        if (m.direction === "RELEASE") entry.reserved -= qty;
        bySku.set(m.skuId, entry);
      }
      const stats = [
        {
          label: hi ? "इस माह बुक ऑर्डर" : "Booked this month",
          value: money(bookedThisMonth),
        },
        {
          label: hi ? "कुल बकाया" : "Total outstanding",
          value: money(totalOutstanding),
        },
        { label: hi ? "खुले दावे" : "Open claims", value: String(openClaims) },
      ];
      const tables = [
        {
          title: hi ? "स्टॉक सारांश" : "Stock summary",
          columns: [
            hi ? "एसकेयू" : "SKU",
            hi ? "उत्पाद" : "Product",
            hi ? "हाथ में" : "On hand",
            hi ? "आरक्षित" : "Reserved",
          ],
          rows: Array.from(bySku.values()).map((x) => [
            x.code,
            x.name,
            x.onHand,
            x.reserved,
          ]),
        },
        {
          title: hi ? "पार्टी अनुसार बकाया" : "Outstanding by party",
          columns: [
            hi ? "पार्टी" : "Party",
            hi ? "बकाया" : "Outstanding",
            hi ? "अग्रिम/असंबद्ध" : "Advances/unapplied",
          ],
          rows: outstandingByParty.map((x) => [
            x.party.label,
            money(x.result.outstandingTotal),
            money(x.result.advancesAndUnapplied),
          ]),
        },
      ];
      workflow = <ReportsPanel language={language} stats={stats} tables={tables} />;
    }
  }
  const executiveDescriptions: Record<string, [string, string]> = {
    today: ["Start your day, see who's next, and add a customer on the spot.", "अपना दिन शुरू करें, अगला ग्राहक देखें, और तुरंत ग्राहक जोड़ें।"],
    beat: ["Your planned route for today, tomorrow, and this week.", "आज, कल और इस सप्ताह के लिए आपका योजनाबद्ध मार्ग।"],
    retailers: ["Every shop you cover — planned and field-added.", "आपके द्वारा कवर की जाने वाली हर दुकान — योजनाबद्ध और फील्ड में जोड़ी गई।"],
    orders: ["Orders you've booked, with product, quantity, and value.", "आपके द्वारा बुक किए गए ऑर्डर, उत्पाद, मात्रा और मूल्य सहित।"],
    collections: ["Cash and payments collected from your retailers.", "आपके खुदरा विक्रेताओं से एकत्र नकद और भुगतान।"],
    prospects: ["Distributor leads you're developing in this territory.", "इस क्षेत्र में आप जिन वितरक संभावनाओं को विकसित कर रहे हैं।"],
    targets: ["How you're tracking against this month's target.", "इस माह के लक्ष्य के मुकाबले आपकी प्रगति।"],
    "delivered-sales": ["What was actually delivered against your booked orders.", "आपके बुक किए गए ऑर्डर के मुकाबले वास्तव में क्या वितरित हुआ।"],
    dsr: ["Your daily sales report — today and your work-day history.", "आपकी दैनिक बिक्री रिपोर्ट — आज और आपके कार्य-दिवस का इतिहास।"],
    instructions: ["Instructions from your manager that need your attention.", "आपके प्रबंधक के निर्देश जिन पर आपका ध्यान चाहिए।"],
    "ta-expenses": ["Your GPS-derived travel allowance and daily allowance — no manual entry needed.", "आपका GPS-आधारित यात्रा भत्ता और दैनिक भत्ता — मैन्युअल प्रविष्टि की आवश्यकता नहीं।"],
    "my-salary": ["Your payslips and salary documents.", "आपकी वेतन पर्ची और वेतन दस्तावेज़।"],
    "employment-policy": ["Your employment and field-work policy documents.", "आपकी रोजगार और फील्ड-कार्य नीति दस्तावेज़।"],
    sync: ["Actions saved offline and their sync status.", "ऑफ़लाइन सहेजी गई कार्रवाइयाँ और उनकी सिंक स्थिति।"],
  };
  const managerDescriptions: Record<string, [string, string]> = {
    dashboard: ["Your team's sales, today's status, and what needs attention.", "आपकी टीम की बिक्री, आज की स्थिति, और जिस पर ध्यान चाहिए।"],
    "my-day": ["Start and end your own field day, tracked the same way as your team's.", "अपना फील्ड दिन शुरू और समाप्त करें, आपकी टीम की तरह ही ट्रैक किया गया।"],
    "beat-planner": ["Plan and publish your team's field routes.", "अपनी टीम के फील्ड मार्गों की योजना बनाएँ और प्रकाशित करें।"],
    retailing: ["Your own retailer visits and orders — separate from your team's.", "आपकी अपनी रिटेलर विज़िट और ऑर्डर — आपकी टीम से अलग।"],
    "joint-working": ["Work alongside an Executive in market — they log the visit, you add coaching notes.", "बाज़ार में किसी अधिकारी के साथ काम करें — वे विज़िट दर्ज करते हैं, आप कोचिंग नोट्स जोड़ते हैं।"],
    "partner-visits": ["Record distributor and super-stockist field visits.", "वितरक और सुपर-स्टॉकिस्ट फील्ड विज़िट दर्ज करें।"],
    "distributor-search": ["Distributor leads you're developing, stage by stage.", "वितरक संभावनाएँ जिन्हें आप चरण दर चरण विकसित कर रहे हैं।"],
    collections: ["Follow up on distributor outstanding — no ledger edits here.", "वितरक बकाया पर फॉलो-अप करें — यहाँ कोई खाता संपादन नहीं।"],
    "team-review": ["Review daily and period performance of your team.", "अपनी टीम के दैनिक और अवधि प्रदर्शन की समीक्षा करें।"],
    team: ["Your team's profiles, territory, and status at a glance.", "आपकी टीम की प्रोफ़ाइल, क्षेत्र और स्थिति एक नज़र में।"],
    attendance: ["Your team's attendance and any corrections.", "आपकी टीम की उपस्थिति और कोई भी सुधार।"],
    "delivered-sales": ["Track actual delivered sales and exceptions.", "वास्तविक वितरित बिक्री और अपवादों को ट्रैक करें।"],
    "ta-verification": ["Verify your team's GPS-derived travel claims.", "अपनी टीम के GPS-आधारित यात्रा दावों को सत्यापित करें।"],
    "my-ta": ["Your own travel claims — distance is GPS-derived, not typed in.", "आपके अपने यात्रा दावे — दूरी GPS-आधारित है, टाइप की हुई नहीं।"],
    dsr: ["Day-by-day field activity for you and your team.", "आपके और आपकी टीम के लिए दिन-प्रतिदिन फील्ड गतिविधि।"],
    "new-retailers": ["Retailers your team added directly in the field.", "आपकी टीम द्वारा सीधे फील्ड में जोड़े गए रिटेलर।"],
    "photo-compliance": ["Visit-photo coverage across your team.", "आपकी टीम में विज़िट-फ़ोटो कवरेज।"],
    instructions: ["Instructions you've issued to your team.", "आपके द्वारा अपनी टीम को जारी किए गए निर्देश।"],
    approvals: ["Requests waiting on your decision, with full context.", "आपके निर्णय की प्रतीक्षा कर रहे अनुरोध, पूर्ण संदर्भ के साथ।"],
    alerts: ["Exceptions that need your attention.", "अपवाद जिन पर आपका ध्यान चाहिए।"],
  };
  const contextual =
    portal === "sales-executive"
      ? executiveDescriptions[item.slug]
      : portal === "sales-manager"
        ? managerDescriptions[item.slug]
        : undefined;
  const description = contextual
    ? hi
      ? contextual[1]
      : contextual[0]
    : hi
      ? "अधिकृत व्यावसायिक रिकॉर्ड, स्थिति और संबंधित कार्रवाई।"
      : "Authorized business records, status and related actions.";
  // The Executive's "today" page is a fully self-contained UI (FieldJourney, built from
  // dashboardData/beat/etc. above) — the generic search-toolbar + rows table below it was always
  // rendered anyway despite never having anything to show, and its rowsFor() call was a genuinely
  // wasted query on every action (every action ends in router.refresh()). Every other slug keeps
  // its existing behavior unchanged.
  const isExecutiveTodayPage = portal === "sales-executive" && item.slug === "today";
  if (!isExecutiveTodayPage) rows = await rowsFor(db, userId, portal, item, q, (page - 1) * 30);
  return (
    <>
      <PageHeading title={surfaceLabel(item, language)} description={description} action={headerAction || undefined} />
      {workflow}
      {!isExecutiveTodayPage && (
      <>
      <section className={styles.toolbar}>
        <form method="get">
          <label>
            <span>{hi ? "खोज" : "Search"}</span>
            <input
              name="q"
              defaultValue={q}
              placeholder={
                hi
                  ? "नाम, नंबर या स्थिति खोजें"
                  : "Search name, business number or status"
              }
            />
          </label>
          <button>{hi ? "फ़िल्टर लागू करें" : "Apply filter"}</button>
        </form>
        <span className={styles.scope}>
          {hi
            ? "आपके अधिकृत दायरे तक सीमित"
            : "Limited to your authorized scope"}
        </span>
      </section>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "रिकॉर्ड" : "Record"}</th>
                <th>{hi ? "विवरण" : "Details"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "मूल्य / मात्रा" : "Value / Qty"}</th>
                <th>{hi ? "दिनांक" : "Date"}</th>
                <th>{hi ? "कार्रवाई" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.primary}</strong>
                  </td>
                  <td>{row.secondary ?? "—"}</td>
                  <td>
                    <span className={styles.badge}>{row.status ?? "—"}</span>
                  </td>
                  <td>{row.metric ?? "—"}</td>
                  <td>{date(row.date, language)}</td>
                  <td>
                    {DETAIL_KINDS.has(item.kind) ? (
                      <Link href={`${base}/${row.id}`}>
                        {hi ? "विवरण खोलें" : "Open detail"}
                      </Link>
                    ) : (
                      <span className={styles.scope}>
                        {hi ? "कार्यस्थल में प्रबंधित" : "Managed in workspace"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            hi ? "इस दृश्य में कोई रिकॉर्ड नहीं है" : "No records in this view"
          }
          description={
            q
              ? hi
                ? "खोज बदलकर पुनः प्रयास करें।"
                : "Change the search and try again."
              : hi
                ? "आपके अधिकृत दायरे में रिकॉर्ड उपलब्ध होने पर यहाँ दिखाई देंगे।"
                : "Records will appear here when available in your authorized scope."
          }
        />
      )}
      <nav className={styles.pagination} aria-label="Pagination">
        {page > 1 && (
          <Link href={`${base}?page=${page - 1}&q=${encodeURIComponent(q)}`}>
            {hi ? "पिछला" : "Previous"}
          </Link>
        )}{" "}
        {rows.length === 30 && (
          <Link href={`${base}?page=${page + 1}&q=${encodeURIComponent(q)}`}>
            {hi ? "अगला" : "Next"}
          </Link>
        )}
      </nav>
      </>
      )}
    </>
  );
}
