/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 1.
 *
 * The authoritative, machine-readable declaration of which bounded
 * business module owns which routes, permission keys, and library
 * directories. This is a GOVERNANCE artifact, not a runtime dependency —
 * nothing in the live request path imports this file. It exists so
 * ownership can be verified by a permanent test (`scripts/verify-sales-os-
 * block1.ts`) instead of only living in a document that drifts silently
 * out of date.
 *
 * Block 1 is an audit + governance phase, not a physical migration.
 * Every module below currently lives in the SAME `app/`/`lib/`/`actions/`
 * tree it always has — this registry labels the existing code by its real
 * bounded context; it does not move a single file. Physical separation
 * (actually relocating files into per-module directories) is a distinct,
 * separately-authorized future block, once this ownership map itself has
 * been reviewed and approved — moving code before the boundaries are
 * confirmed correct would risk exactly the "no behaviour change" /
 * "no redesign" constraints this phase must not violate.
 *
 * Frozen and explicitly out of scope for the whole Sales OS Separation
 * initiative (per the Phase 10.0 brief): the AI Gateway
 * (`lib/gateway/*` — Provider Adapter, Knowledge API, Knowledge
 * Publisher, Commerce/Customer Intelligence, Conversation Runtime,
 * Observability, Security, Production Rollout) and the customer-facing
 * storefront/CMS/checkout. Neither is modeled as a module below; both
 * are listed in `FROZEN_OUT_OF_SCOPE` purely so the route-ownership
 * cross-check (Part D) has an explicit answer for "why isn't this route
 * assigned to a module" rather than silently ignoring it.
 */

export type ModuleStatus =
  /** Real, cohesive, independently-identifiable bounded context today. */
  | "ACTIVE"
  /** Exists and functions, but is fragmented across multiple disjoint
   * surfaces, or duplicates another module's logic — a real module, with
   * a real boundary problem already documented in the audit. */
  | "ACTIVE_FRAGMENTED"
  /** Not a distinct module in the codebase today — the target name from
   * the Phase 10.0 brief maps onto pieces scattered across other
   * modules; would need to be assembled net-new, not extracted. */
  | "NOT_YET_EXTRACTED"
  /** A real, shared, cross-module dependency rather than a bounded
   * business module in its own right. */
  | "SHARED_CORE";

export type ModuleId =
  | "crm-core"
  | "founder-os"
  | "institutional-sales-os"
  | "finance-os"
  | "warehouse-os"
  | "manufacturing-os"
  | "network-os"
  | "customer-support-os"
  | "analytics-os"
  | "marketing-os"
  | "sales-ai-assistant"
  | "order-management-os"
  | "master-data-os"
  | "shared-platform-core";

export type ModuleDefinition = {
  id: ModuleId;
  name: string;
  status: ModuleStatus;
  /** One-line description of the real, current boundary — not the
   * aspirational one. */
  summary: string;
  /** Route path prefixes this module owns. A route matching more than
   * one module's prefix list across the whole registry is a real
   * ownership conflict the permanent test must catch. */
  routePrefixes: string[];
  /** Prisma model name prefixes/exact names this module's data belongs
   * to. Purely documentary — not used for runtime filtering. */
  dataModels: string[];
  /** `lib/*` directories or files primarily implementing this module's
   * business logic. */
  libPaths: string[];
  /** `actions/*.ts` files this module's mutations/reads go through. */
  actionFiles: string[];
  /** `PERMISSIONS.*` key prefixes (from `lib/sales/constants.ts`) this
   * module's access control is expressed with. */
  permissionPrefixes: string[];
  /** Known, audited boundary issues — kept here (not just in a doc) so
   * the permanent test can assert the count never silently grows. */
  knownIssues: string[];
};

export const MODULES: ModuleDefinition[] = [
  {
    id: "crm-core",
    name: "CRM Core (Sales OS)",
    status: "ACTIVE",
    summary:
      "The core Opportunity/Quotation/SalesInquiry/Customer pipeline. 'Sales Manager OS' and 'Sales Officer OS' from the Phase 10.0 brief are NOT separate bounded modules today — they are two permission-grant profiles (SalesRole rows 'Sales Manager'/'Sales Officer') over this exact same code, differentiated only by which PERMISSIONS keys are granted, never by a role-name branch in business logic. Their only module-specific artifact is a thin dashboard redirect target each (/dashboard/sales-manager, /dashboard/sales-officer).",
    routePrefixes: [
      "/dashboard", "/dashboard/sales-manager", "/dashboard/sales-officer",
      "/sales/inquiries", "/sales/opportunities", "/sales/quotations", "/sales/commerce",
      "/sales/leads", "/sales/customers", "/sales/intelligence", "/sales/loyalty",
      "/sales/calendar", "/sales/assignments", "/sales/queues", "/sales/institutional",
      "/sales/support", "/sales/reports", "/sales/organization", "/sales/territories",
      "/sales/channels", "/sales/audit",
      "/api/sales",
    ],
    dataModels: [
      "Opportunity", "OpportunityStageHistory", "OpportunityActivity", "OpportunityTask", "OpportunityNote", "OpportunityAttachment",
      "Quotation", "QuotationVersion", "QuotationLineItem", "QuotationApprovalRequest",
      "SalesInquiry", "SalesTimelineEvent", "SalesChannel", "LeadSource", "AssignmentQueue",
      "Customer", "CustomerClassificationHistory", "Territory", "SalesRole", "SalesPermission", "SalesRolePermission",
    ],
    libPaths: [
      "lib/sales/authorization.ts", "lib/sales/audit.ts", "lib/sales/constants.ts", "lib/sales/navigation.ts", "lib/sales/extensions.ts",
      "lib/opportunity", "lib/quotation", "lib/sales-channel", "lib/commerce", "lib/growth",
    ],
    actionFiles: [
      "actions/opportunities.ts", "actions/quotations.ts", "actions/sales-inquiries.ts",
      "actions/sales-organization.ts", "actions/sales-channels.ts", "actions/territories.ts", "actions/growth.ts",
    ],
    permissionPrefixes: [
      "DASHBOARD_", "INQUIRIES_", "OPPORTUNITIES_", "OPPORTUNITY_", "QUOTATIONS_", "QUOTATION_",
      "COMMERCE_", "CUSTOMERS_", "LEADS_", "INTELLIGENCE_", "LOYALTY_", "TERRITORIES_",
      "SALES_CHANNELS_", "LEAD_SOURCES_", "USERS_", "ROLES_", "PERMISSIONS_", "AUDIT_",
      "REPORTS_", "SEGMENTS_", "INSTITUTIONAL_MANAGE", "SUPPORT_MANAGE",
    ],
    knownIssues: [
      "lib/sales/sales-intelligence-service.ts and actions/sales-intelligence.ts live under the CRM Core directory name but implement Institutional Sales OS logic (query InstOpportunity, gated by INST_OPPORTUNITIES_* permissions) — misplaced module, not CRM Core's own logic.",
      "Two independent createTerritory implementations exist (actions/sales-organization.ts and actions/territories.ts) for the identical operation.",
      "actions/inquiries.ts (BusinessInquiry model, lib/rbac-gated) and actions/sales-inquiries.ts (SalesInquiry model, lib/sales-gated) are a naming collision on the word 'inquiry' across two unrelated models/auth systems.",
      "Three independent pipeline-value/conversion-rate calculations exist across lib/opportunity/reporting.ts, actions/inst-opportunities.ts, and lib/founder-os/kpi-engine.ts.",
    ],
  },
  {
    id: "founder-os",
    name: "Founder OS",
    status: "ACTIVE_FRAGMENTED",
    summary:
      "A real, substantial KPI/alert/decision/notification system (lib/founder-os/*, 26 files) — but reachable through FOUR disjoint, non-cross-linked surfaces (/dashboard/founder, /os/sales's isFounder branch, /admin/analytics, /sales/reports), none of which link to the others, and two of which (dashboard-service.ts's getFounderDashboard vs. actions/inst-dashboards.ts's getFounderDashboard) share an identical function name while computing entirely different numbers.",
    routePrefixes: ["/dashboard/founder"],
    dataModels: [
      "FounderAlert", "FounderNotification", "FounderWidgetDefinition", "FounderWidgetPreference",
      "FounderSavedView", "FounderDashboardLayout", "FounderSavedReport", "FounderWorkspacePreference",
    ],
    libPaths: ["lib/founder-os"],
    actionFiles: ["actions/founder-os.ts"],
    permissionPrefixes: ["FOUNDER_OS_"],
    knownIssues: [
      "No unifying navigation/shell: a Founder must know 4 separate URLs to see 4 non-overlapping 'Founder' views backed by different code and different data-fetch layers.",
      "ENTERPRISE_FOUNDER_OS_ENABLED feature flag is seeded DISABLED — /dashboard/founder is reachable by URL but the real dashboard-service.ts logic behind it is gated off by default.",
      "getFounderDashboard() exists twice (lib/founder-os/dashboard-service.ts and actions/inst-dashboards.ts) with the same name, different data, different permission gate.",
    ],
  },
  {
    id: "institutional-sales-os",
    name: "Institutional Sales OS",
    status: "ACTIVE",
    summary:
      "A fully separate CRM pipeline (Lead -> Opportunity -> Visit/Sample -> Quotation -> Order) for institutional/bulk accounts, with its own Inst* Prisma models and its own app/os/sales/* route tree — but NOT independently authorized: every actions/inst-*.ts file authenticates through the same getSalesPrincipal()/requirePermission() as CRM Core, and audits through the same SalesAuditLog.",
    routePrefixes: ["/os/sales"],
    dataModels: [
      "InstLead", "InstOpportunity", "InstOpportunityProduct", "InstVisit", "InstSurvey", "InstConsumptionEstimate",
      "InstSample", "InstFollowUp", "InstQuotation", "InstQuotationVersion", "InstQuotationLineItem",
      "InstTask", "InstDailyPlan", "InstExpense", "InstRoute", "InstTarget", "InstNote", "InstAttachment",
      "SalesIntelligenceSnapshot", "BusinessOrder", "BusinessOrderItem",
    ],
    libPaths: ["lib/inst-sales"],
    actionFiles: [
      "actions/inst-leads.ts", "actions/inst-opportunities.ts", "actions/inst-visits.ts", "actions/inst-samples.ts",
      "actions/inst-followups.ts", "actions/inst-tasks.ts", "actions/inst-planner.ts", "actions/inst-expenses.ts",
      "actions/inst-dashboards.ts", "actions/inst-reports.ts", "actions/inst-shared.ts", "actions/inst-notifications.ts",
      "actions/inst-quotations.ts",
    ],
    permissionPrefixes: ["INST_"],
    knownIssues: [
      "'Institutional' is used for two unrelated things in this codebase: an inquiry-classification flag inside CRM Core (app/sales/institutional AND app/dashboard/institutional, model InstitutionalInquiryDetail — both correctly owned by crm-core, not this module) and this entire separate pipeline (Inst* models, app/os/sales/*) — they share no data. This registry deliberately assigns /sales/institutional and /dashboard/institutional to crm-core, not here, even though the word 'institutional' appears in both.",
      "No independent auth/audit boundary: extracting this module would require either sharing lib/sales/authorization.ts+audit.ts as Shared Platform Core, or duplicating them.",
    ],
  },
  {
    id: "finance-os",
    name: "Finance OS",
    status: "ACTIVE",
    summary:
      "General ledger, AR/AP, banking, budgets, fixed assets, tax, credit control — a genuinely cohesive, well-factored module (lib/enterprise-finance/*, ~30 files). Exposed through two independent UI shells (/finance/* and /os/finance/*) over the identical backend — duplicated presentation, not duplicated logic.",
    routePrefixes: ["/finance", "/os/finance"],
    dataModels: [
      "FinanceAccount", "FinanceJournal", "FinanceJournalLine", "FinanceLedgerEntry", "FinanceReceivableInvoice",
      "FinanceVendorBill", "FinanceCustomerAccount", "FinanceVendorAccount", "FinanceBankAccount", "FinanceBudget",
      "FinanceFixedAsset", "FinanceExpenseClaim", "FinanceTaxRate", "FinanceFiscalYear", "FinanceFiscalPeriod",
      "FinanceCreditNote", "FinanceDebitNote", "FinanceCashAccount", "FinanceCollectionCase", "FinanceConfiguration",
    ],
    libPaths: ["lib/enterprise-finance"],
    actionFiles: ["actions/finance.ts"],
    permissionPrefixes: ["FINANCE_"],
    knownIssues: [
      "/finance/[entity]/page.tsx reads lib/enterprise-finance/* services directly, bypassing actions/finance.ts entirely for reads — two independent call paths into the same backend.",
      "The storefront's own commerce invoicing (lib/commerce/services.ts's generateInvoice/recordPayment, CommercialInvoice/CommercePayment models) is a fully separate, unconnected D2C finance system — no recordFinanceEvent call bridges it to this module.",
    ],
  },
  {
    id: "warehouse-os",
    name: "Warehouse OS",
    status: "ACTIVE_FRAGMENTED",
    summary:
      "TWO parallel, unsynced ledgers for physical stock movement: the older Warehouse/StockLedgerEntry/InventoryReservation/InventoryAllocation models (serving D2C order fulfillment via lib/commerce/services.ts and B2B fulfillment via actions/operations.ts) and the newer EnterpriseWarehouseZone/Bin/Movement models (serving the Enterprise track). They share the old Warehouse table as physical-location identity and the Inventory/StockHistory sellable-stock table, but StockLedgerEntry and EnterpriseWarehouseMovement never cross-read or sync.",
    routePrefixes: ["/enterprise/warehouses"],
    dataModels: [
      "Warehouse", "StockLedgerEntry", "InventoryReservation", "InventoryAllocation", "InventoryDamageRecord",
      "EnterpriseWarehouseZone", "EnterpriseWarehouseBin", "EnterpriseWarehouseMovement",
    ],
    libPaths: ["lib/enterprise/warehouse-service.ts", "lib/enterprise/finished-goods-service.ts"],
    actionFiles: ["actions/enterprise.ts", "actions/operations.ts"],
    permissionPrefixes: ["ENTERPRISE_WAREHOUSE_", "WAREHOUSE_", "INVENTORY_ALLOCATE"],
    knownIssues: [
      "createWarehouseMovement (the one shared write helper) is called from exactly one place codebase-wide (actions/enterprise.ts's manual adjustment action). Manufacturing (operations-services.ts), Procurement (procurement-service.ts), and the Manufacturing-to-Warehouse bridge (finished-goods-service.ts) each independently re-implement the identical two-table write inline instead of calling it — three unreconciled copies of 'write a warehouse movement.'",
      "Two full parallel warehouse ledgers (old StockLedgerEntry vs. new EnterpriseWarehouseMovement) exist with no bridging/sync code between them.",
    ],
  },
  {
    id: "manufacturing-os",
    name: "Manufacturing OS",
    status: "ACTIVE",
    summary:
      "Formula/BOM, Production Orders, Batches, Quality inspections — a single, unified backend (lib/enterprise/operations-services.ts) with no legacy predecessor to reconcile against (actions/production.ts is an unrelated deployment-health module, confirmed a false lead by name only). Exposed through two UI shells (/enterprise/* and /os/manufacturing/*) that both call the identical lib functions.",
    routePrefixes: ["/enterprise/manufacturing", "/enterprise/formulas", "/enterprise/batches", "/enterprise/quality", "/enterprise/vendors", "/enterprise/procurement", "/enterprise/planning", "/enterprise/reports", "/enterprise", "/os/manufacturing", "/os/suppliers"],
    dataModels: [
      "EnterpriseFormula", "EnterpriseFormulaRevision", "EnterpriseFormulaIngredient", "EnterpriseProductionOrder",
      "EnterpriseProductionPlan", "EnterpriseBatch", "EnterpriseBatchStatusHistory", "EnterpriseInspection",
      "EnterpriseInspectionPlan", "EnterpriseQualityDecision", "EnterpriseVendor", "EnterprisePurchaseRequisition",
      "EnterprisePurchaseOrder", "EnterpriseGoodsReceipt", "EnterprisePlanningSnapshot",
    ],
    libPaths: ["lib/enterprise/operations-services.ts", "lib/enterprise/vendor-service.ts", "lib/enterprise/procurement-service.ts", "lib/enterprise/planning-reporting.ts", "lib/enterprise/context.ts", "lib/enterprise/governance.ts", "lib/enterprise/search.ts", "lib/enterprise/ai-adapter.ts"],
    actionFiles: ["actions/enterprise.ts", "actions/manufacturing.ts"],
    permissionPrefixes: ["ENTERPRISE_VENDOR_", "ENTERPRISE_PROCUREMENT_", "ENTERPRISE_FORMULA_", "ENTERPRISE_PRODUCTION_", "ENTERPRISE_BATCH_", "ENTERPRISE_QUALITY_", "ENTERPRISE_PLANNING_", "ENTERPRISE_REPORTING_"],
    knownIssues: [
      "actions/enterprise.ts (/enterprise/*) and actions/manufacturing.ts (/os/manufacturing/*) are two independently-maintained action-layer wrappers over the identical lib/enterprise/operations-services.ts functions — duplicated wrapper code, not duplicated business logic.",
      "lib/enterprise/* mixes Manufacturing, Procurement, Quality, and Planning in the same directory/files (e.g. operations-services.ts implements both Manufacturing's createBatch and Quality's recordQualityDecision) — no sub-boundary within this module today.",
    ],
  },
  {
    id: "network-os",
    name: "Network / Partner OS",
    status: "ACTIVE",
    summary:
      "Franchise/distributor/dealer partner management, agreements, commissions, territories, partner portal — a real, cohesive bounded module (lib/enterprise-network/*, ~13 files) not named in the Phase 10.0 target module list but genuinely distinct from every named module; flagged here so it isn't silently dropped from the ownership map.",
    routePrefixes: ["/network"],
    dataModels: ["NetworkPartner", "NetworkAgreement", "NetworkClaim", "NetworkTerritory", "NetworkCommissionRun", "NetworkRoyaltyRun", "NetworkSupportCase", "NetworkTrainingProgram"],
    libPaths: ["lib/enterprise-network"],
    actionFiles: [],
    permissionPrefixes: ["NETWORK_"],
    knownIssues: [
      "Not named in the Phase 10.0 brief's target module list — needs an explicit Founder decision on whether it's folded into another module or recognized as its own (recommended: its own, given its size and cohesion).",
    ],
  },
  {
    id: "customer-support-os",
    name: "Customer Support OS",
    status: "ACTIVE",
    summary:
      "Ticketing, SLA, knowledge base, FAQ, CSAT/NPS — a real, cohesive module (lib/support/*, 12 files) authorized through requireSupportPrincipal -> requireEnterprisePrincipal (the Enterprise principal, not lib/sales/authorization.ts directly). Fully independent of the confusingly-named /sales/support 'Support Work Queue' (a CRM Core page listing assigned Customer rows, no ticket involvement) and of the storefront's own static FAQ page.",
    routePrefixes: ["/os/support"],
    dataModels: [
      "SupportTicket", "SupportTicketLink", "SupportReturnRequest", "SupportRefundRequest", "SupportMessage",
      "SupportTicketNote", "SupportAttachment", "SupportFollowUp", "SupportDepartment", "SupportSlaPolicy",
      "SupportEscalationRule", "SupportEscalation", "SupportFeedback", "SupportCsatResponse", "SupportNpsResponse",
      "SupportKbCategory", "SupportKbArticle", "SupportFaq", "SupportResolutionTemplate",
    ],
    libPaths: ["lib/support"],
    actionFiles: ["actions/support.ts"],
    permissionPrefixes: ["SUPPORT_TICKETS_", "SUPPORT_KB_", "SUPPORT_FAQ_", "SUPPORT_SLA_", "SUPPORT_ESCALATION_", "SUPPORT_DEPARTMENTS_", "SUPPORT_REPORTS_"],
    knownIssues: [
      "Two unrelated 'Support' permission/role concepts coexist by explicit prior design: legacy SUPPORT_MANAGE (CRM Core's assigned-customers queue) vs. this module's SUPPORT_TICKETS_*/SUPPORT_KB_* namespace — documented as intentional non-reuse in-schema, but a real source of confusion for anyone reading permission names alone.",
      "The internal staff MUV AI assistant (lib/muv-ai/tools.ts) can read and create SupportTicket rows directly — a real, working cross-module dependency to track once boundaries are enforced.",
    ],
  },
  {
    id: "analytics-os",
    name: "Analytics OS",
    status: "ACTIVE_FRAGMENTED",
    summary:
      "lib/analytics.ts (Phase 15) is the intended single source of truth for revenue/order/customer/inventory/coupon KPIs, consumed by /admin/analytics. app/admin/page.tsx (Phase 13A Overview) independently hand-rolls overlapping calculations instead of calling it. Founder OS's kpi-engine.ts correctly reuses lib/analytics.ts for what it can, then adds its own aggregates for what it can't.",
    routePrefixes: ["/admin/analytics"],
    dataModels: [],
    libPaths: ["lib/analytics.ts"],
    actionFiles: [],
    permissionPrefixes: [],
    knownIssues: [
      "app/admin/page.tsx duplicates a week-over-week revenue comparison and a low-stock query that lib/analytics.ts's getGrowthComparison/getInventoryIntelligence already generalize — acknowledged in-code as intentional ('alongside... not a replacement'), but still two independently-maintained calculations of overlapping metrics.",
      "No fine-grained permission system of its own — gated only by the site-wide requireStaff()/ADMIN|STAFF role, a different axis entirely from every other module's SalesPermission-based access control.",
    ],
  },
  {
    id: "marketing-os",
    name: "Marketing OS",
    status: "NOT_YET_EXTRACTED",
    summary:
      "No distinct Marketing module exists. 'Marketing' in the admin nav is just Coupon CRUD. Homepage/AnnouncementBar content lives in the CMS module (explicitly frozen, out of scope). Segmentation/loyalty/referral logic (lib/growth/*) surfaces inside CRM Core (/sales/loyalty, /sales/intelligence). A real Marketing OS would need to be assembled net-new from these pieces, not extracted from an existing cohesive module.",
    routePrefixes: ["/admin/marketing"],
    dataModels: ["Coupon"],
    libPaths: [],
    actionFiles: ["actions/coupons.ts"],
    permissionPrefixes: [],
    knownIssues: [
      "Not a real bounded module today — this entry exists only to give /admin/marketing a documented owner in the route map, and to record that building a real Marketing OS is new scope, not a boundary-cleanup.",
    ],
  },
  {
    id: "sales-ai-assistant",
    name: "Sales AI Assistant (internal, staff-facing)",
    status: "ACTIVE",
    summary:
      "The internal, staff-facing conversational assistant surfaced at /sales/ai/* (lib/muv-ai/*). This is NOT the frozen customer-facing AI Gateway (lib/gateway/*) — it is a separate, older system, in scope for the Sales OS Separation, that calls into Founder OS and Customer Support OS services directly as 'tools.'",
    routePrefixes: ["/sales/ai"],
    dataModels: ["AiConversation", "AiSession", "AiKnowledgeRecord", "AiConfiguration"],
    libPaths: ["lib/muv-ai"],
    actionFiles: ["actions/muv-ai.ts"],
    permissionPrefixes: ["AI_"],
    knownIssues: [
      "lib/muv-ai/security.ts reimplements the identical 'isFounder || permissions.has(key)' check from lib/sales/authorization.ts by hand in at least 6 places instead of calling the shared function — a third independent copy of the same authorization logic (a second copy is requireEnterprisePrincipal, which does correctly delegate).",
    ],
  },
  {
    id: "order-management-os",
    name: "Order Management OS",
    status: "ACTIVE",
    summary:
      "Not named in the Phase 10.0 brief's target module list, but a real, distinct concern in both the code and the MUV OS shell's own navigation grouping ('Order Management'): the D2C Order and BusinessOrder fulfillment views (/os/orders, /os/orders/direct/[id], /os/orders/business/[id]) plus the CONFIRMED -> Operations Queue -> Reserve Stock -> Assign Warehouse workflow (/os/operations, Milestone 5). This is the module the Block 1 security fix (app/os/orders/direct/[id]/page.tsx) belongs to.",
    routePrefixes: ["/os/orders", "/os/operations"],
    dataModels: ["Order", "OrderItem", "BusinessOrder", "BusinessOrderItem", "InventoryReservation"],
    libPaths: [],
    actionFiles: ["actions/order-mgmt.ts", "actions/operations.ts"],
    permissionPrefixes: ["ORDER_MGMT_", "BUSINESS_ORDERS_", "BUSINESS_OPS_"],
    knownIssues: [
      "actions/operations.ts is a genuine cross-module coupling: it is also declared under warehouse-os's actionFiles, because listOperationsQueue()/its reservation-assignment functions read Inventory and write InventoryReservation directly rather than calling a Warehouse OS service function — the Operations Queue workflow and Warehouse OS share one file instead of one calling the other through a boundary.",
      "Not named in the Phase 10.0 brief's target module list — like Network OS, this is a real bounded concern discovered during the audit rather than assembled from the brief; flagged for an explicit Founder decision on whether it stays independent or folds into CRM Core.",
    ],
  },
  {
    id: "master-data-os",
    name: "Master Data OS",
    status: "ACTIVE_FRAGMENTED",
    summary:
      "The MUV OS shell's 'Master Data' nav group (/os/customers, /os/employees, /os/masters, /os/territories) — shared reference-data screens (customers, staff, generic lookup masters, sales territories) consumed across other modules. Two of its four routes are a second, independent route tree over data another module already owns and edits: /os/customers duplicates CRM Core's own /sales/customers, and /os/territories duplicates CRM Core's /sales/territories (same Territory model, same TERRITORIES_ permission prefix) — not a clean, self-contained module, a documented fragmentation.",
    routePrefixes: ["/os/customers", "/os/employees", "/os/masters", "/os/territories"],
    dataModels: ["Customer", "Territory", "Employee"],
    libPaths: [],
    actionFiles: ["actions/master-data.ts", "actions/customers.ts", "actions/employees.ts", "actions/territories.ts"],
    permissionPrefixes: ["MASTER_DATA_", "CUSTOMERS_", "EMPLOYEES_", "TERRITORIES_"],
    knownIssues: [
      "/os/customers (this module) and /sales/customers (crm-core) are two independent route trees over the same Customer model and the same CUSTOMERS_VIEW_ALL/CUSTOMERS_VIEW_ASSIGNED/CUSTOMERS_MANAGE permissions — not a boundary conflict this test can flag automatically (they're gated by the identical permission, so no permission-leakage exists), but a real duplicated-UI finding for Part B.",
      "/os/territories (this module) and /sales/territories (crm-core) are the same duplication pattern over the Territory model — see crm-core's own knownIssues entry noting two independent createTerritory implementations.",
      "Not named in the Phase 10.0 brief's target module list — flagged, like Network OS and Order Management OS, as a real bounded concern found during the audit.",
    ],
  },
  {
    id: "shared-platform-core",
    name: "Shared Platform Core",
    status: "SHARED_CORE",
    summary:
      "Block 3, Part A: the Block 2 isolation plan is implemented. lib/platform-core/{authorization,constants,audit,context,governance}.ts is now the real, canonical home for this code — consumed by 182+ files across every module above (Founder OS, Institutional Sales OS, Finance OS, Network OS, Customer Support OS, Manufacturing OS, Sales AI Assistant). The 5 original paths (lib/sales/authorization.ts, lib/sales/constants.ts, lib/sales/audit.ts, lib/enterprise/context.ts, lib/enterprise/governance.ts) are now permanent one-line re-export shims (`export * from \"@/lib/platform-core/...\"`) — every pre-existing import keeps working unchanged; new code should import from lib/platform-core/* directly.",
    routePrefixes: [],
    dataModels: ["User", "SalesAuditLog"],
    libPaths: [
      "lib/rbac.ts",
      "lib/platform-core/authorization.ts", "lib/platform-core/constants.ts", "lib/platform-core/audit.ts",
      "lib/platform-core/context.ts", "lib/platform-core/governance.ts",
      "lib/sales/authorization.ts", "lib/sales/constants.ts", "lib/sales/audit.ts",
      "lib/enterprise/context.ts", "lib/enterprise/governance.ts",
      "components/enterprise-shell/EnterpriseShell.tsx", "components/os-shell",
    ],
    actionFiles: [],
    permissionPrefixes: [],
    knownIssues: [
      "This is the real dependency every other module's independence claim runs into — see summary. Isolated into lib/platform-core/* in Block 3 per Founder decision 5; the 182-file fan-in itself is unchanged (isolation gives it a stable home, it does not reduce how many files depend on it).",
      "lib/sales/authorization.ts, lib/sales/constants.ts, lib/sales/audit.ts, lib/enterprise/context.ts, and lib/enterprise/governance.ts are now permanent compatibility shims, not the canonical source — kept in this list because they are still real, still-imported files, not because they still hold the implementation.",
    ],
  },
];

/** Routes and route-prefixes that are explicitly OUT of scope for the
 * Sales OS Separation entirely — listed so the route audit can say
 * "intentionally unowned by this initiative" instead of "orphan." */
export const FROZEN_OUT_OF_SCOPE: { name: string; routePrefixes: string[]; reason: string }[] = [
  { name: "AI Gateway", routePrefixes: [], reason: "lib/gateway/* (Provider Adapter, Knowledge API, Knowledge Publisher, Commerce/Customer Intelligence, Conversation Runtime, Observability, Security, Production Rollout) is frozen for this entire initiative per the Phase 10.0 brief." },
  { name: "Storefront / CMS / Checkout / Admin catalog", routePrefixes: ["/(storefront)", "/admin/products", "/admin/orders", "/admin/customers", "/admin/inventory", "/admin/media", "/admin/cms", "/admin/returns", "/admin/settings", "/admin/inquiries", "/account", "/(auth)"], reason: "Explicitly frozen: Hero, Homepage, CMS, Website, Storefront, Product pages, Checkout, AI prompts." },
  { name: "Admin overview", routePrefixes: ["/admin"], reason: "Legacy Phase 13A Overview dashboard — storefront/admin-catalog-adjacent, not part of the Sales OS being separated." },
];

/**
 * Longest-prefix-match ownership, the same rule any router uses to
 * resolve a nested route to its most specific handler: a shared parent
 * hub (e.g. "/dashboard") legitimately has children owned by other
 * modules (e.g. "/dashboard/founder") without that being a real
 * ownership conflict — only the single longest-matching declared prefix
 * "wins" a given concrete route. A genuine conflict is two modules
 * declaring the exact same prefix length for the same route (see
 * `scripts/verify-sales-os-block1.ts`'s ownership check, which asserts
 * this function never returns more than one module for any known route).
 */
export function findModulesForRoute(pathname: string): ModuleDefinition[] {
  let bestLength = -1;
  let winners: ModuleDefinition[] = [];
  for (const m of MODULES) {
    for (const prefix of m.routePrefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (prefix.length > bestLength) {
          bestLength = prefix.length;
          winners = [m];
        } else if (prefix.length === bestLength && !winners.includes(m)) {
          winners.push(m);
        }
      }
    }
  }
  return winners;
}

export function findModulesForPermissionKey(permissionKey: string): ModuleDefinition[] {
  const upperKey = permissionKey.toUpperCase();
  return MODULES.filter((m) => m.permissionPrefixes.some((prefix) => upperKey.startsWith(prefix)));
}
