/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 2.
 *
 * Module Validation + AI Readiness + Cross-Module Integrity.
 *
 * This file is strictly ADDITIVE to `lib/platform/module-registry.ts`,
 * which Block 1 froze — nothing here modifies a `MODULES` entry, a route
 * prefix, a permission prefix, or a data model assignment. It imports the
 * frozen registry and layers Block 2's own governance data on top of it,
 * keyed by the same `ModuleId`s, so a Block 2 check can never accidentally
 * alter a Block 1 fact.
 *
 * Like the registry, this is a governance artifact: nothing in the live
 * request path imports it. `scripts/verify-sales-os-block2.ts` is the
 * permanent test that keeps it honest.
 */

import { MODULES, type ModuleId } from "./module-registry";

/**
 * Action files two non-shared modules both declare in module-registry.ts's
 * (frozen) `actionFiles`, with the reason each is allowed. Kept HERE rather
 * than added to module-registry.ts's `knownIssues` because Block 1's
 * registry content is frozen for Block 2 — this is the Block-2-owned place
 * to document a Block-2-discovered duplicate without touching a single
 * frozen fact.
 */
export const DOCUMENTED_SHARED_ACTION_FILES: Record<string, string> = {
  "actions/enterprise.ts": "Shared by warehouse-os and manufacturing-os (Block 1 finding, unchanged) — both wrap lib/enterprise/* functions from the same action file rather than each having its own.",
  "actions/operations.ts": "Shared by warehouse-os and order-management-os (Block 1 finding, unchanged) — the Operations Queue workflow reads Inventory/writes InventoryReservation directly instead of calling a Warehouse OS service function through a boundary.",
  "actions/territories.ts": "Shared by crm-core and master-data-os in the frozen registry, but Block 2's grep evidence finds actions/territories.ts imported ONLY from /os/* pages (app/os/territories, app/os/customers/*, app/os/employees/[id], app/os/sales/leads/new, components/os-territories/TerritoryCreateForm.tsx) — never from any /sales/* page. /sales/territories/page.tsx (crm-core) reads Territory via a direct prisma.territory.findMany call with no action-file import at all. This suggests the frozen registry's attribution of actions/territories.ts to crm-core may be imprecise (crm-core's real territory-mutation entry point is more likely actions/sales-organization.ts's own createTerritory, per Block 1's own 'two independent createTerritory implementations' finding) — flagged for a Founder/registry-maintainer correction in a future block, not corrected here since module-registry.ts is frozen for Block 2.",
};

// ---------------------------------------------------------------------
// Part A/B — Public interface, entry/exit points, boundary validation
// ---------------------------------------------------------------------

export type PublicInterface = {
  /** The `"use server"` action files (or, for modules without their own
   * action files, the lib/* service functions) that are this module's only
   * sanctioned way IN. Anything not listed here that still mutates this
   * module's data is a boundary violation. */
  entryPoints: string[];
  /** Concrete, evidenced calls this module's own code makes INTO another
   * module's data or service layer. Each entry names the target module and
   * cites file:line evidence — no exit point is listed on guesswork. An
   * empty array is itself a finding (a module with no real integration). */
  exitPoints: { targetModule: ModuleId | "external"; description: string; evidence: string }[];
  /** True if outside code reaches into this module's Prisma models or
   * lib/* internals WITHOUT going through one of `entryPoints` — the
   * concrete signal of "hidden ownership" Part B asks to rule out. */
  hasUndocumentedInboundAccess: boolean;
};

export const PUBLIC_INTERFACES: Record<ModuleId, PublicInterface> = {
  "crm-core": {
    entryPoints: [
      "actions/opportunities.ts", "actions/quotations.ts", "actions/sales-inquiries.ts",
      "actions/sales-organization.ts", "actions/sales-channels.ts", "actions/territories.ts", "actions/growth.ts",
    ],
    exitPoints: [
      {
        targetModule: "institutional-sales-os",
        description: "lib/sales/sales-intelligence-service.ts / actions/sales-intelligence.ts, though filed under the crm-core directory name, query InstOpportunity directly instead of calling an Institutional Sales OS service function.",
        evidence: "Documented in crm-core's own knownIssues (Block 1) — a misplaced-module finding, re-confirmed, not re-investigated, in Block 2.",
      },
      {
        targetModule: "order-management-os",
        description: "CONFIRMED INTENTIONAL by explicit Founder ruling in Block 3 (Founder decision #1: 'CRM Quotation -> Order. Remain MANUAL. Do NOT automate.'). actions/quotations.ts's transitionQuotationAction -> lib/quotation/workflow.ts's transitionQuotation never creates an Order on ACCEPTED — it only writes a status row (and, for SENT/VIEWED/REJECTED, a follow-up task); only the separate Institutional Quotation pipeline (actions/inst-quotations.ts's acceptQuotation) is wired to createBusinessOrderCore. Block 2 flagged this as 'plausibly intentional, needs confirmation' — Block 3 closes that question: it is intentional, and must stay this way. No code was changed for this link.",
        evidence: "Block 2 agent trace of actions/quotations.ts, lib/quotation/workflow.ts, actions/inst-quotations.ts; Founder ruling recorded in Block 3's brief.",
      },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "founder-os": {
    entryPoints: ["actions/founder-os.ts"],
    exitPoints: [
      { targetModule: "crm-core", description: "kpi-engine.ts's getSalesPipelineSummary queries prisma.opportunity.aggregate/count directly (lines 115, 120) — bypasses CRM Core's own service layer entirely (no lib/opportunity/reporting.ts import). Quotation and SalesInquiry are not referenced anywhere in lib/founder-os.", evidence: "Block 2 agent trace of lib/founder-os/kpi-engine.ts, dashboard-service.ts." },
      { targetModule: "finance-os", description: "MIXED: getReceivablesAging/getPayablesAging/getBankPosition are called through Finance OS's own service layer (lib/enterprise-finance/ar-service.ts, ap-service.ts, banking-service.ts) — correctly delegated. But FinanceExpenseClaim totals (kpi-engine.ts lines 96-105) are queried via direct Prisma access, bypassing Finance OS's service layer for that one figure.", evidence: "Block 2 agent trace: kpi-engine.ts imports at lines 1-8." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "institutional-sales-os": {
    entryPoints: [
      "actions/inst-leads.ts", "actions/inst-opportunities.ts", "actions/inst-visits.ts", "actions/inst-samples.ts",
      "actions/inst-followups.ts", "actions/inst-tasks.ts", "actions/inst-planner.ts", "actions/inst-expenses.ts",
      "actions/inst-dashboards.ts", "actions/inst-reports.ts", "actions/inst-shared.ts", "actions/inst-notifications.ts",
      "actions/inst-quotations.ts",
    ],
    exitPoints: [
      { targetModule: "order-management-os", description: "acceptQuotation() (actions/inst-quotations.ts:235) runs one prisma.$transaction that flips the Opportunity to WON and calls createBusinessOrderCore(tx, {...}) (lib/business-orders/core.ts:59), which creates the BusinessOrder atomically in the same transaction.", evidence: "Block 2 agent trace of actions/inst-quotations.ts, lib/business-orders/core.ts." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "finance-os": {
    entryPoints: ["actions/finance.ts"],
    exitPoints: [],
    hasUndocumentedInboundAccess: false,
  },
  "warehouse-os": {
    entryPoints: ["actions/enterprise.ts", "actions/operations.ts"],
    exitPoints: [
      { targetModule: "manufacturing-os", description: "shares actions/enterprise.ts as an action-layer entry point with Manufacturing OS.", evidence: "module-registry.ts manufacturing-os.actionFiles / warehouse-os.actionFiles both list actions/enterprise.ts." },
      { targetModule: "order-management-os", description: "shares actions/operations.ts as an action-layer entry point with Order Management OS.", evidence: "module-registry.ts order-management-os.actionFiles / warehouse-os.actionFiles both list actions/operations.ts; order-management-os knownIssues documents the coupling." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "manufacturing-os": {
    entryPoints: ["actions/enterprise.ts", "actions/manufacturing.ts"],
    exitPoints: [
      { targetModule: "warehouse-os", description: "transferReleasedBatchToInventory (lib/enterprise/finished-goods-service.ts:22), called from actions/enterprise.ts:304, writes EnterpriseWarehouseMovement + StockLedgerEntry and upserts Inventory/StockHistory — a SEPARATE, manually-triggered action from batch QC release (recordQualityDecision only flips batch.status to RELEASED, it does not itself move stock). Procurement's receiveGoods (lib/enterprise/procurement-service.ts:216) writes the identical trio inline, in the same transaction, on goods receipt.", evidence: "Block 2 agent trace of lib/enterprise/operations-services.ts, finished-goods-service.ts, procurement-service.ts." },
      { targetModule: "finance-os", description: "receiveGoods calls recordFinanceEvent (lib/enterprise-finance/event-posting-service.ts) post-commit, fire-and-forget, which posts a generic GL journal (debit 1200/credit 2000, seeded FinanceEventPostingRule) via postSystemGeneratedJournalInTx. This is NOT a FinanceVendorBill/AP record — createAndPostVendorBill (lib/enterprise-finance/ap-service.ts:65) is a separate, manual action (actions/finance.ts:90) requiring a human-entered supplier invoice number. No automatic PO/Goods-Receipt -> Vendor-Bill linkage exists.", evidence: "Block 2 agent trace of lib/enterprise/procurement-service.ts:287, lib/enterprise-finance/event-posting-service.ts, actions/finance.ts:90." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "network-os": {
    entryPoints: [],
    exitPoints: [],
    hasUndocumentedInboundAccess: false,
  },
  "customer-support-os": {
    entryPoints: ["actions/support.ts"],
    exitPoints: [
      { targetModule: "master-data-os", description: "SupportTicket.customerId is existence-checked against Customer before create (lib/support/ticket-service.ts:43).", evidence: "Block 2 agent trace." },
      { targetModule: "order-management-os", description: "SupportTicket.orderId is stored but NEVER validated against the Order table at creation (lib/support/ticket-service.ts:30,55 — only Customer and SupportDepartment are existence-checked). SupportReturnRequest.orderId IS required by schema, but createReturnRequest/approveReturnRequest (lib/support/return-refund-warranty-service.ts:20-41) never call order-mgmt/orders code — no eligibility check, no order-status mutation. Refunds are the one real DIRECT_CALL: approveRefundRequest (same file, lines 87-123) checks order.paymentStatus then calls refundOrder (actions/orders.ts:484) -> processRefund (actions/payments.ts) -> createRazorpayRefund (lib/payments/razorpay.ts:118), and on success flips order.paymentStatus itself.", evidence: "Block 2 agent trace of lib/support/ticket-service.ts, return-refund-warranty-service.ts, actions/orders.ts, actions/payments.ts." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "analytics-os": {
    entryPoints: ["lib/analytics.ts"],
    exitPoints: [],
    hasUndocumentedInboundAccess: false,
  },
  "marketing-os": {
    entryPoints: ["actions/coupons.ts"],
    exitPoints: [
      { targetModule: "analytics-os", description: "getCouponPerformance() (lib/analytics.ts:364-389, under an explicit '// Marketing Intelligence' section header, line 361) queries Coupon + Order.groupBy to compute per-coupon orders/discount/revenue, consumed by app/admin/analytics/page.tsx. Zero connection exists to lib/growth/* (loyalty/segmentation) — a grep for 'Coupon' across every lib/growth/*.ts file returns no matches.", evidence: "Block 2 agent trace of lib/analytics.ts, lib/growth/*." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "sales-ai-assistant": {
    entryPoints: ["actions/muv-ai.ts"],
    exitPoints: [
      { targetModule: "founder-os", description: "lib/muv-ai/tools.ts calls Founder OS service functions directly as 'tools'.", evidence: "Documented in sales-ai-assistant's own knownIssues (Block 1)." },
      { targetModule: "customer-support-os", description: "lib/muv-ai/tools.ts can read and create SupportTicket rows directly.", evidence: "Documented in customer-support-os's own knownIssues (Block 1)." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "order-management-os": {
    entryPoints: ["actions/order-mgmt.ts", "actions/operations.ts"],
    exitPoints: [
      { targetModule: "warehouse-os", description: "shares actions/operations.ts. reserveInventoryAndAssignWarehouse (actions/operations.ts:116) creates InventoryReservation rows and assigns a Warehouse, but is called from nowhere in the order-creation/acceptance path — its only caller is components/os-orders/InventoryCheckPanel.tsx:32, a client 'Reserve Stock' button. A human must navigate to the order/Operations Queue and click it; nothing reserves stock automatically when an order is confirmed.", evidence: "Block 2 agent trace of actions/operations.ts, components/os-orders/InventoryCheckPanel.tsx." },
      { targetModule: "finance-os", description: "deliverBusinessOrder (actions/business-orders.ts:475) calls recordFinanceEvent (sourceEventAction: ORDER_DELIVERED) after the DISPATCHED->DELIVERED transition commits, posting a real GL journal via postSystemGeneratedJournalInTx. This only fires on DELIVERY, not on order creation or confirmation — no invoice/AR record exists for an order between creation and delivery. Fire-and-forget (.catch), so a Finance-posting failure does not fail the delivery transition.", evidence: "Block 2 agent trace of actions/business-orders.ts:475, lib/enterprise-finance/event-posting-service.ts." },
      { targetModule: "external", description: "Order fulfillment never creates a Shipment/ShipmentEvent row for BusinessOrder. The Shipment model (prisma/schema.prisma:1230) relates only to the D2C Order model via a unique orderId; its only creator, actions/shipping.ts:56's fulfillOrder, is never called from actions/business-orders.ts. dispatchBusinessOrder/recordBusinessOrderDispatch just write plain carrierName/trackingReference strings directly onto BusinessOrder — no Shipment row is ever created for a BusinessOrder.", evidence: "Block 2 agent trace of prisma/schema.prisma:1230, actions/shipping.ts:56, actions/business-orders.ts." },
    ],
    hasUndocumentedInboundAccess: false,
  },
  "master-data-os": {
    entryPoints: ["actions/master-data.ts", "actions/customers.ts", "actions/employees.ts", "actions/territories.ts"],
    exitPoints: [],
    hasUndocumentedInboundAccess: false,
  },
  "shared-platform-core": {
    entryPoints: ["lib/rbac.ts", "lib/sales/authorization.ts", "lib/sales/constants.ts", "lib/sales/audit.ts"],
    exitPoints: [],
    hasUndocumentedInboundAccess: false,
  },
};

// ---------------------------------------------------------------------
// Part C — Cross-module business flow integrity
// ---------------------------------------------------------------------

export type FlowLinkClassification = "DIRECT_CALL" | "EVENT_DRIVEN" | "MANUAL_STEP" | "NOT_CONNECTED";

export type FlowLink = {
  from: ModuleId;
  to: ModuleId | "external";
  description: string;
  classification: FlowLinkClassification;
  evidence: string;
  /** Part C's own instruction: "every dependency must be intentional." A
   * MANUAL_STEP or NOT_CONNECTED link is not automatically a defect — it
   * may be an intentional human checkpoint (e.g. approval gates). This
   * field records the audit's judgment, not just the mechanical fact. */
  intentional: boolean;
  intentionalityNote: string;
};

export type CrossModuleFlow = {
  name: string;
  steps: FlowLink[];
};

export const CROSS_MODULE_FLOWS: CrossModuleFlow[] = [
  {
    name: "CRM: Quotation -> Order -> Finance -> Warehouse -> Dispatch",
    steps: [
      {
        from: "crm-core", to: "order-management-os", description: "CRM Core's own Quotation acceptance becomes an Order",
        classification: "NOT_CONNECTED",
        evidence: "actions/quotations.ts's transitionQuotationAction -> lib/quotation/workflow.ts's transitionQuotation never creates an Order on ACCEPTED — only a status row (and a follow-up task for SENT/VIEWED/REJECTED).",
        intentional: true,
        intentionalityNote: "CONFIRMED INTENTIONAL by explicit Founder ruling in Block 3 (decision #1: 'Remain MANUAL. Do NOT automate.'). Block 2 had flagged this as 'plausibly intentional, needs confirmation'; Block 3 closes the question and leaves the code unchanged.",
      },
      {
        from: "order-management-os", to: "finance-os", description: "Order creation produces an invoice/AR entry",
        classification: "DIRECT_CALL",
        evidence: "Only on DELIVERY, not creation: deliverBusinessOrder (actions/business-orders.ts:475) calls recordFinanceEvent (ORDER_DELIVERED) post-commit, fire-and-forget, posting a real GL journal.",
        intentional: false,
        intentionalityNote: "A real gap, not just a naming mismatch: between order creation/confirmation and delivery there is no AR/invoice record in Finance OS at all — Finance OS cannot answer 'what do we expect to collect for open orders' from its own data.",
      },
      {
        from: "order-management-os", to: "warehouse-os", description: "Order confirmation reserves/allocates inventory",
        classification: "MANUAL_STEP",
        evidence: "reserveInventoryAndAssignWarehouse (actions/operations.ts:116) is called only from a client 'Reserve Stock' button (components/os-orders/InventoryCheckPanel.tsx:32) — never automatically from order creation or confirmation.",
        intentional: true,
        intentionalityNote: "Consistent with Milestone 5's own documented design (Operations Queue as a human-worked queue, not an automatic pipeline) — an intentional checkpoint, not an accidental gap.",
      },
      {
        from: "order-management-os", to: "external", description: "Fulfillment triggers a Shipment record",
        classification: "DIRECT_CALL",
        evidence: "FIXED in Block 3, Part D (Founder-approved integration #3): Shipment.orderId/provider relaxed to optional, Shipment.businessOrderId added (migration 20260809000000_business_order_shipment_integration, with a raw-SQL CHECK enforcing exactly one of orderId/businessOrderId is set). dispatchBusinessOrder (actions/business-orders.ts) now upserts a Shipment + ShipmentEvent(IN_TRANSIT) in the same transaction as the DISPATCHED transition; deliverBusinessOrder updates it to DELIVERED + a ShipmentEvent; amendBusinessOrderDispatchDelivery keeps courierName/awbNumber in sync on correction.",
        intentional: true,
        intentionalityNote: "provider intentionally stays null for BusinessOrder-linked shipments — SELF_DELIVERY/TRANSPORT dispatch methods have no real courier-API provider from lib/shipping/*; courierName/awbNumber (pre-existing free-text columns) carry that case instead, exactly matching how the plain fields worked before.",
      },
    ],
  },
  {
    name: "Institutional: Quotation -> Approval -> Order -> Delivery",
    steps: [
      { from: "institutional-sales-os", to: "institutional-sales-os", description: "InstQuotation approval workflow (internal to the module)", classification: "DIRECT_CALL", evidence: "actions/inst-quotations.ts implements its own InstQuotationVersion approval chain, entirely inside the module.", intentional: true, intentionalityNote: "Correctly self-contained — Institutional Sales OS owns its own approval pipeline end to end." },
      {
        from: "institutional-sales-os", to: "order-management-os", description: "Approved InstQuotation becomes a BusinessOrder",
        classification: "DIRECT_CALL",
        evidence: "acceptQuotation (actions/inst-quotations.ts:235) runs one prisma.$transaction that flips the linked Opportunity to WON and calls createBusinessOrderCore(tx, {...}) (lib/business-orders/core.ts:59) atomically in the same transaction.",
        intentional: true,
        intentionalityNote: "Correctly automated — the one flow in the whole audit where Quotation->Order is a real, atomic, transactional DIRECT_CALL rather than a manual step.",
      },
    ],
  },
  {
    name: "Warehouse: Inventory -> Manufacturing -> Procurement -> Finance",
    steps: [
      {
        from: "manufacturing-os", to: "warehouse-os", description: "Completed batch writes finished goods into Warehouse/Inventory",
        classification: "MANUAL_STEP",
        evidence: "recordQualityDecision (lib/enterprise/operations-services.ts:312) only flips EnterpriseBatch.status/qualityStatus to RELEASED. A separate function, transferReleasedBatchToInventory (lib/enterprise/finished-goods-service.ts:22), must then be explicitly called (actions/enterprise.ts:304) to actually write EnterpriseWarehouseMovement/StockLedgerEntry/Inventory — two distinct, separately permission-gated actions.",
        intentional: true,
        intentionalityNote: "A defensible manual QC gate (don't move stock until a human explicitly transfers a released batch) — but worth confirming a released batch can't be silently forgotten and left out of Inventory indefinitely.",
      },
      {
        from: "manufacturing-os", to: "warehouse-os", description: "Goods receipt from a Purchase Order writes into Warehouse inventory",
        classification: "DIRECT_CALL",
        evidence: "receiveGoods (lib/enterprise/procurement-service.ts:216) writes EnterpriseWarehouseMovement, StockLedgerEntry, and upserts Inventory/StockHistory inline, in the same transaction as the goods-receipt itself.",
        intentional: true,
        intentionalityNote: "Correctly atomic — no manual second step needed here, unlike the finished-goods case above.",
      },
      {
        from: "manufacturing-os", to: "finance-os", description: "Purchase Order / Goods Receipt produces a vendor bill / AP entry",
        classification: "DIRECT_CALL",
        evidence: "FIXED in Block 3, Part D (Founder-approved integration #2): receiveGoods (lib/enterprise/procurement-service.ts) now calls a new createVendorBillFromGoodsReceipt helper post-commit, which auto-provisions the vendor's FinanceVendorAccount if missing and calls createAndPostVendorBill with a system-generated supplierInvoiceNo (`SYSTEM-{goodsReceiptNumber}` — deterministic and unique, since the real supplier invoice document is not yet known at receipt time) and one line per accepted item against the same Raw Material (account code 1200) account the old generic journal used. Falls back to the pre-existing generic recordFinanceEvent GRNI journal ONLY if AP posting fails (e.g. FinanceConfiguration/AP control account not set up in this environment) — never both, so no liability is ever posted twice, and an unconfigured environment keeps its exact prior behavior.",
        intentional: true,
        intentionalityNote: "The supplierInvoiceNo is a system placeholder, not the real supplier document — Finance still needs a process to reconcile it against the real invoice when it arrives; that reconciliation step was not built (out of scope — Founder decision #2 asked for automatic bill CREATION, not a full three-way-match reconciliation workflow).",
      },
    ],
  },
  {
    name: "Support: Customer -> Orders -> Returns -> Resolution",
    steps: [
      { from: "customer-support-os", to: "master-data-os", description: "Ticket links to the shared Customer master", classification: "DIRECT_CALL", evidence: "prisma.customer.findUnique existence-check before ticket create (lib/support/ticket-service.ts:43).", intentional: true, intentionalityNote: "Correctly validated." },
      {
        from: "customer-support-os", to: "order-management-os", description: "Return/refund request references an Order",
        classification: "NOT_CONNECTED",
        evidence: "SupportTicket.orderId is optional and never validated against the Order table (ticket-service.ts:30,55). SupportReturnRequest.orderId is schema-required, but createReturnRequest/approveReturnRequest (return-refund-warranty-service.ts:20-41) never call order-mgmt/orders code at all — no eligibility check, no order-status mutation on a return.",
        intentional: false,
        intentionalityNote: "A real missing-validation finding (see Part F/I): a return can be approved with no automatic check that the referenced order is even eligible (e.g. delivered, within window), and approving one never updates the order's own status.",
      },
      {
        from: "customer-support-os", to: "external", description: "Refund resolution triggers a payment-gateway refund",
        classification: "DIRECT_CALL",
        evidence: "approveRefundRequest (return-refund-warranty-service.ts:87-123) checks order.paymentStatus, calls refundOrder (actions/orders.ts:484) -> processRefund (actions/payments.ts) -> createRazorpayRefund (lib/payments/razorpay.ts:118); on success flips order.paymentStatus itself. Institutional orders bridge through recordFinanceEvent instead of Razorpay.",
        intentional: true,
        intentionalityNote: "Correctly wired, synchronous, and the one part of the Support->Order chain that is NOT a gap.",
      },
    ],
  },
  {
    name: "Marketing: Customers -> Campaign -> Reports",
    steps: [
      { from: "marketing-os", to: "master-data-os", description: "Coupon eligibility keyed to Customer segments", classification: "NOT_CONNECTED", evidence: "A grep for 'Coupon' across every lib/growth/*.ts file (loyalty.ts, analytics.ts, extensions.ts, customer-intelligence.ts, repository.ts) returns zero matches — no segmentation/loyalty linkage exists.", intentional: false, intentionalityNote: "Consistent with Block 1's finding that no real Marketing module exists yet — this is the concrete evidence of that gap, not a new defect in an otherwise-real module." },
      { from: "marketing-os", to: "analytics-os", description: "Coupon usage rolled into a campaign-performance report", classification: "DIRECT_CALL", evidence: "getCouponPerformance() (lib/analytics.ts:364-389, under an explicit '// Marketing Intelligence' section, line 361) queries Coupon + Order.groupBy for per-coupon orders/discount/revenue, consumed by app/admin/analytics/page.tsx.", intentional: true, intentionalityNote: "Correction to a Block 2 initial assumption: this link IS connected — reporting exists, just inside lib/analytics.ts rather than a dedicated Marketing service, and scoped to individual coupon codes rather than a 'campaign' concept." },
    ],
  },
  {
    name: "Founder: Everything",
    steps: [
      { from: "founder-os", to: "crm-core", description: "KPI engine reads CRM Core Prisma models directly", classification: "DIRECT_CALL", evidence: "prisma.opportunity.aggregate/count (kpi-engine.ts:115,120) — no lib/opportunity/reporting.ts import at all. Quotation/SalesInquiry are never referenced.", intentional: false, intentionalityNote: "Bypasses CRM Core's own service layer entirely for this one figure — and duplicates it: getOpportunityDashboard (lib/opportunity/reporting.ts:4-20) already computes the identical open-pipeline/won-this-month numbers, WITH an opportunityScope() filter that kpi-engine.ts's re-implementation omits." },
      { from: "founder-os", to: "finance-os", description: "KPI engine reads Finance OS data", classification: "DIRECT_CALL", evidence: "MIXED: getReceivablesAging/getPayablesAging/getBankPosition correctly call through Finance OS's own ar-service.ts/ap-service.ts/banking-service.ts. Only FinanceExpenseClaim totals (kpi-engine.ts:96-105) bypass the service layer via direct Prisma.", intentional: true, intentionalityNote: "Mostly correct delegation — the one exception (expense claims) is a minor, isolated gap rather than the module's general pattern." },
      { from: "founder-os", to: "warehouse-os", description: "KPI engine reads Warehouse OS data", classification: "NOT_CONNECTED", evidence: "Zero references to Warehouse/StockLedgerEntry/Inventory anywhere in lib/founder-os/kpi-engine.ts or dashboard-service.ts.", intentional: false, intentionalityNote: "Corrects a Block 2 initial assumption — Founder OS's 'everything' does not yet include Warehouse OS at all. A real coverage gap for a Founder dashboard, not a boundary violation." },
      { from: "founder-os", to: "manufacturing-os", description: "KPI engine reads Manufacturing OS data", classification: "NOT_CONNECTED", evidence: "Zero references to any Enterprise* production model.", intentional: false, intentionalityNote: "Same coverage gap as Warehouse OS above." },
      { from: "founder-os", to: "institutional-sales-os", description: "KPI engine reads Institutional Sales OS data", classification: "NOT_CONNECTED", evidence: "Zero references to any Inst* model.", intentional: false, intentionalityNote: "Same coverage gap — notable since Institutional is a major, real revenue pipeline." },
      { from: "founder-os", to: "customer-support-os", description: "KPI engine reads Customer Support OS data", classification: "NOT_CONNECTED", evidence: "Zero references to any Support* model.", intentional: false, intentionalityNote: "Same coverage gap." },
      { from: "founder-os", to: "network-os", description: "KPI engine reads Network OS data", classification: "NOT_CONNECTED", evidence: "Zero references to any Network* model.", intentional: false, intentionalityNote: "Same coverage gap." },
    ],
  },
];

// ---------------------------------------------------------------------
// Part D — Shared Platform Core: what belongs where (migration plan only)
// ---------------------------------------------------------------------

export type SharedCoreDisposition = "KEEP_SHARED" | "MOVE_INTO_MODULE" | "ISOLATE_AS_OWN_PACKAGE";

export const SHARED_PLATFORM_CORE_PLAN: {
  path: string;
  disposition: SharedCoreDisposition;
  reason: string;
}[] = [
  { path: "lib/sales/authorization.ts", disposition: "ISOLATE_AS_OWN_PACKAGE", reason: "IMPLEMENTED in Block 3, Part A: the real code now lives in lib/platform-core/authorization.ts; this path is a permanent re-export shim. 182-file fan-in across every module (Block 1 finding) is unchanged by design — isolation gives it a stable home, it does not reduce the fan-in itself. A true separate npm package (e.g. @muv/authz) was judged unnecessary redesign for a single-app repo with no existing monorepo tooling; directory-level isolation + shim achieves the same 'stable contract, not a sibling module's directory' goal without introducing new build infrastructure." },
  { path: "lib/sales/constants.ts", disposition: "ISOLATE_AS_OWN_PACKAGE", reason: "IMPLEMENTED in Block 3, Part A: moved to lib/platform-core/constants.ts alongside authorization.ts, as recommended (splitting them would only move the coupling, not remove it)." },
  { path: "lib/sales/audit.ts", disposition: "ISOLATE_AS_OWN_PACKAGE", reason: "IMPLEMENTED in Block 3, Part A: moved to lib/platform-core/audit.ts. Every module's mutations still append to the same SalesAuditLog through this file, now at its new canonical path." },
  { path: "lib/rbac.ts", disposition: "KEEP_SHARED", reason: "Site-wide User.role (ADMIN/STAFF/CUSTOMER) gate, a different, smaller axis than SalesRole permissions. Already minimal and stable; no fan-in problem to solve. Left at its original path — never part of this Block's isolation move." },
  { path: "lib/enterprise/context.ts", disposition: "ISOLATE_AS_OWN_PACKAGE", reason: "IMPLEMENTED in Block 3, Part A: moved to lib/platform-core/context.ts, out of Manufacturing OS's own lib/enterprise directory where it previously physically (and misleadingly) sat despite being shared infrastructure." },
  { path: "lib/enterprise/governance.ts", disposition: "ISOLATE_AS_OWN_PACKAGE", reason: "IMPLEMENTED in Block 3, Part A: moved to lib/platform-core/governance.ts alongside context.ts, same reasoning." },
  { path: "components/enterprise-shell/EnterpriseShell.tsx", disposition: "KEEP_SHARED", reason: "A generic, prop-driven shell (nav items supplied by each of its 5 callers) with no module-specific logic baked in — already correctly shared, nothing to isolate further." },
  { path: "components/os-shell", disposition: "KEEP_SHARED", reason: "Same reasoning as EnterpriseShell — the MUV OS shell is already a clean, generic presentation layer; module-specific behavior lives in each page, not the shell." },
  { path: "lib/sales/navigation.ts", disposition: "MOVE_INTO_MODULE", reason: "Nav entries are module-specific data (each entry names its own permission gate and target route) wrapped in one shared file only because CRM Core, Founder OS, and the Sales AI Assistant currently share one route tree (/dashboard, /sales/*). Once those modules have independent route trees (a Block 3+ physical-separation concern), this file's entries should split per-module; today it is correctly left alone since splitting it now would be exactly the 'massive relocation' this Part explicitly forbids." },
  { path: "lib/muv-ai/security.ts", disposition: "MOVE_INTO_MODULE", reason: "FIXED in Block 3, Part B: requireAiPermission/requireAiAdminPermission no longer re-implement the isFounder-bypass-or-permission-set-membership check inline — both now call lib/platform-core/authorization.ts's new principalHasPermission/principalHasAnyPermission (the same predicates requirePermission/requireAnyPermission/hasPermission themselves now delegate to). This file remains in lib/muv-ai/ (correctly module-owned) because it still holds AI-specific concerns (prompt-injection detection, rate limiting, org validation) — only the permission-boolean-logic duplication was the anti-pattern, and that is now retired." },
];

// ---------------------------------------------------------------------
// Part E — AI readiness (extension points only; no provider/Gateway work)
// ---------------------------------------------------------------------

export type AIReadinessProfile = {
  futureAiOwner: string;
  futurePermissionPrefix: string;
  futureEntryPoint: string;
  futureServiceInterface: string;
  futureToolNamespace: string;
  futureSecurityRequirement: string;
  futureObservabilityRequirement: string;
  futureGroundingSource: string;
};

const STANDARD_SECURITY_REQUIREMENT =
  "MUST call hasPermission()/requirePermission()/requireAnyPermission() from lib/sales/authorization.ts. MUST NOT hand-roll an isFounder or permission-set check locally — lib/muv-ai/security.ts's 6+ independent re-implementations of the identical check (Block 1 finding) is the anti-pattern this rule exists to prevent from spreading to any new module.";

const STANDARD_OBSERVABILITY_REQUIREMENT =
  "MUST append an entry to the existing SalesAuditLog via lib/sales/audit.ts's appendAuditLog for every AI-initiated read or write, exactly as every human-initiated action already does — no new/parallel audit trail. If a tool is ever exposed to the frozen customer-facing AI Gateway, it must additionally emit through the Gateway's existing (frozen) Observability layer rather than a module-local log.";

export const AI_READINESS_MATRIX: Record<ModuleId, AIReadinessProfile> = {
  "crm-core": {
    futureAiOwner: "Sales Manager / Sales Officer (via existing SalesRole grants, no new role)",
    futurePermissionPrefix: "AI_ (existing, currently dead — see Block 1's dead-permission list) scoped additionally by OPPORTUNITIES_/QUOTATIONS_/INQUIRIES_",
    futureEntryPoint: "lib/sales/ai-tools.ts (proposed, not created) — thin wrappers around actions/opportunities.ts / actions/quotations.ts / actions/sales-inquiries.ts's EXISTING exported functions, never new Prisma queries",
    futureServiceInterface: "actions/opportunities.ts, actions/quotations.ts, actions/sales-inquiries.ts (call through, do not duplicate)",
    futureToolNamespace: "crm.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Opportunity, Quotation, SalesInquiry, Customer (this module's own dataModels only)",
  },
  "founder-os": {
    futureAiOwner: "Founder (already Founder-bypassed by definition)",
    futurePermissionPrefix: "FOUNDER_OS_ (existing)",
    futureEntryPoint: "lib/founder-os/ai-tools.ts (proposed) — must call each owning module's OWN reporting function (lib/opportunity/reporting.ts, lib/enterprise/planning-reporting.ts, lib/enterprise-finance/* reporting) rather than re-querying Prisma directly, correcting the duplication pattern found in Block 1/2's kpi-engine.ts review",
    futureServiceInterface: "Each target module's own reporting/service layer — explicitly NOT direct Prisma access, since Founder OS is the one module whose whole purpose is cross-module aggregation and is therefore the highest-risk module for accidentally bypassing every other module's boundary",
    futureToolNamespace: "founder.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT + " Founder-bypass already applies at the human layer; an AI tool acting AS the Founder must still be scoped to read-only aggregation, never a write, given the breadth of data involved.",
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Cross-module — but only through each module's own service/reporting layer (see futureEntryPoint), never a Founder-OS-local re-implementation of another module's query.",
  },
  "institutional-sales-os": {
    futureAiOwner: "Institutional Sales Officer",
    futurePermissionPrefix: "INST_ (existing)",
    futureEntryPoint: "lib/inst-sales/ai-tools.ts (proposed) — wraps actions/inst-*.ts's existing exported functions",
    futureServiceInterface: "actions/inst-leads.ts, actions/inst-opportunities.ts, actions/inst-visits.ts, actions/inst-quotations.ts (call through)",
    futureToolNamespace: "institutional.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "InstLead, InstOpportunity, InstVisit, InstSample, InstQuotation (this module's own dataModels only)",
  },
  "finance-os": {
    futureAiOwner: "Finance role (SalesRole grant, scoped to FINANCE_* permissions)",
    futurePermissionPrefix: "FINANCE_ (existing)",
    futureEntryPoint: "lib/enterprise-finance/ai-tools.ts (proposed) — wraps existing service functions",
    futureServiceInterface: "lib/enterprise-finance/* (call through — NOT actions/finance.ts's own already-duplicated read path noted in Block 1, to avoid inheriting that duplication into the AI layer)",
    futureToolNamespace: "finance.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT + " Given financial data sensitivity, any write-capable tool (e.g. posting a journal entry) requires an explicit, separate, higher-bar permission from any read tool — do not reuse a single FINANCE_VIEW-equivalent grant for both.",
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "FinanceAccount, FinanceJournal, FinanceLedgerEntry, FinanceReceivableInvoice, FinanceVendorBill (this module's own dataModels only)",
  },
  "warehouse-os": {
    futureAiOwner: "Warehouse/Operations role",
    futurePermissionPrefix: "ENTERPRISE_WAREHOUSE_ / WAREHOUSE_ (existing)",
    futureEntryPoint: "lib/enterprise/warehouse-ai-tools.ts (proposed) — must call the existing createWarehouseMovement helper rather than writing StockLedgerEntry/EnterpriseWarehouseMovement rows directly, correcting the inline-write pattern Block 1 found in Manufacturing/Procurement/Finished-Goods code",
    futureServiceInterface: "lib/enterprise/warehouse-service.ts",
    futureToolNamespace: "warehouse.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Warehouse, StockLedgerEntry, Inventory (legacy ledger) — the AI layer must not read EnterpriseWarehouseMovement as if it were synced with the legacy ledger; the two-ledger split (Block 1 finding) must be resolved or explicitly surfaced before any AI tool aggregates 'available stock,' or it will silently answer from only one of the two unsynced ledgers.",
  },
  "manufacturing-os": {
    futureAiOwner: "Manufacturing/Quality role",
    futurePermissionPrefix: "ENTERPRISE_FORMULA_ / ENTERPRISE_PRODUCTION_ / ENTERPRISE_BATCH_ / ENTERPRISE_QUALITY_ (existing)",
    futureEntryPoint: "lib/enterprise/manufacturing-ai-tools.ts (proposed) — wraps operations-services.ts's existing exported functions",
    futureServiceInterface: "lib/enterprise/operations-services.ts, lib/enterprise/vendor-service.ts, lib/enterprise/procurement-service.ts",
    futureToolNamespace: "manufacturing.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "EnterpriseFormula, EnterpriseProductionOrder, EnterpriseBatch, EnterpriseInspection, EnterpriseVendor, EnterprisePurchaseOrder (this module's own dataModels only)",
  },
  "network-os": {
    futureAiOwner: "Network/Partner Manager role (does not exist as a SalesRole today — would need to be added, out of scope for Block 2)",
    futurePermissionPrefix: "NETWORK_ (existing)",
    futureEntryPoint: "lib/enterprise-network/ai-tools.ts (proposed)",
    futureServiceInterface: "lib/enterprise-network/* (13 files)",
    futureToolNamespace: "network.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "NetworkPartner, NetworkAgreement, NetworkClaim, NetworkCommissionRun (this module's own dataModels only)",
  },
  "customer-support-os": {
    futureAiOwner: "Customer Support role",
    futurePermissionPrefix: "SUPPORT_TICKETS_ / SUPPORT_KB_ (existing)",
    futureEntryPoint: "lib/support/ai-tools.ts (proposed) — replaces lib/muv-ai/tools.ts's current direct SupportTicket read/create access with a real, permission-checked entry point owned by this module",
    futureServiceInterface: "lib/support/* (call through, do not let the Sales AI Assistant keep bypassing this layer)",
    futureToolNamespace: "support.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT + " This module is the concrete example of the anti-pattern already happening today (lib/muv-ai/tools.ts reads/writes SupportTicket directly) — Block 3 should treat closing this specific gap as the first real test of the pattern, not a hypothetical.",
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "SupportTicket, SupportKbArticle, SupportFaq (this module's own dataModels only)",
  },
  "analytics-os": {
    futureAiOwner: "Staff with ADMIN/STAFF role (site-wide RBAC, not SalesRole-based — see Block 1 finding that this module has no SalesPermission of its own)",
    futurePermissionPrefix: "None today — would need a real SalesPermission family before an AI tool could be permission-scoped the same way as every other module",
    futureEntryPoint: "lib/analytics-ai-tools.ts (proposed)",
    futureServiceInterface: "lib/analytics.ts",
    futureToolNamespace: "analytics.*",
    futureSecurityRequirement: "Cannot yet meet the standard requirement above — lib/analytics.ts is gated only by requireStaff()/ADMIN|STAFF, a different axis than every other module's SalesPermission-based access. Introducing a real ANALYTICS_* permission family is a Block 3 prerequisite for this module's AI readiness, not a Block 2 action.",
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Aggregated read-only views over Order/Customer/Inventory/Coupon — no owned Prisma models of its own",
  },
  "marketing-os": {
    futureAiOwner: "Not applicable until a real Marketing module exists (status NOT_YET_EXTRACTED per Block 1) — AI readiness for Coupon CRUD alone is not a meaningful target",
    futurePermissionPrefix: "None declared",
    futureEntryPoint: "N/A",
    futureServiceInterface: "N/A",
    futureToolNamespace: "N/A",
    futureSecurityRequirement: "N/A until this module is assembled as real scope, per Block 1's finding that it is presently just Coupon CRUD",
    futureObservabilityRequirement: "N/A",
    futureGroundingSource: "N/A",
  },
  "sales-ai-assistant": {
    futureAiOwner: "This module IS the future AI owner for every other module above — its own readiness work is to stop calling other modules' internals directly and instead consume each module's future ai-tools.ts entry point once built",
    futurePermissionPrefix: "AI_ (existing, currently dead)",
    futureEntryPoint: "actions/muv-ai.ts (existing) — should be refactored in Block 3 to route every tool call through lib/sales/authorization.ts, retiring lib/muv-ai/security.ts's independent checks",
    futureServiceInterface: "Every other module's proposed ai-tools.ts, once built — not each module's raw service/Prisma layer",
    futureToolNamespace: "(consumes the namespaces above: crm.*, finance.*, warehouse.*, etc.)",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT + " This module is where the fix actually needs to land — see lib/muv-ai/security.ts in the Shared Platform Core migration plan.",
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Whatever each target module's future ai-tools.ts exposes — never a second, independent grounding path",
  },
  "order-management-os": {
    futureAiOwner: "Order Management / Operations role",
    futurePermissionPrefix: "ORDER_MGMT_ / BUSINESS_OPS_ (existing)",
    futureEntryPoint: "actions/order-mgmt-ai-tools.ts (proposed)",
    futureServiceInterface: "actions/order-mgmt.ts, actions/operations.ts",
    futureToolNamespace: "orders.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Order, OrderItem, BusinessOrder, BusinessOrderItem, InventoryReservation (this module's own dataModels only)",
  },
  "master-data-os": {
    futureAiOwner: "Staff with MASTER_DATA_MANAGE or the relevant CUSTOMERS_/TERRITORIES_/EMPLOYEES_ grant",
    futurePermissionPrefix: "MASTER_DATA_ / CUSTOMERS_ / EMPLOYEES_ / TERRITORIES_ (existing)",
    futureEntryPoint: "actions/master-data-ai-tools.ts (proposed)",
    futureServiceInterface: "actions/master-data.ts, actions/customers.ts, actions/employees.ts, actions/territories.ts",
    futureToolNamespace: "masterdata.*",
    futureSecurityRequirement: STANDARD_SECURITY_REQUIREMENT,
    futureObservabilityRequirement: STANDARD_OBSERVABILITY_REQUIREMENT,
    futureGroundingSource: "Customer, Territory, Employee — noting the /os/customers vs /sales/customers and /os/territories vs /sales/territories duplication (Block 1 finding) must be resolved before an AI tool can claim a single canonical read path for this data.",
  },
  "shared-platform-core": {
    futureAiOwner: "N/A — this is the enforcement mechanism every other module's AI tool must call through, not a module with its own AI surface",
    futurePermissionPrefix: "N/A",
    futureEntryPoint: "N/A",
    futureServiceInterface: "lib/sales/authorization.ts's requirePermission/requireAnyPermission/hasPermission ARE the security requirement referenced by every other module's futureSecurityRequirement above",
    futureToolNamespace: "N/A",
    futureSecurityRequirement: "N/A",
    futureObservabilityRequirement: "N/A",
    futureGroundingSource: "N/A",
  },
};

// ---------------------------------------------------------------------
// Part F — Data flow validation (producer/consumer/owner/duplication)
// ---------------------------------------------------------------------

export type DataFlow = {
  entity: string;
  producer: ModuleId | "external";
  consumers: ModuleId[];
  owner: ModuleId;
  duplication: string;
  deadFlow: string;
  missingValidation: string;
};

export const DATA_FLOWS: DataFlow[] = [
  {
    entity: "Orders",
    producer: "order-management-os",
    consumers: ["finance-os", "warehouse-os", "customer-support-os", "founder-os", "analytics-os"],
    owner: "order-management-os",
    duplication: "None found at the model level — a single Order/BusinessOrder pair of models. Presentation-level duplication only (see Master Data OS knownIssues for the unrelated Customer/Territory pattern).",
    deadFlow: "None found.",
    missingValidation: "Order creation/confirmation does not validate or reserve Warehouse OS inventory (inventory reservation is a manual, separately-triggered UI action — see Part C) and does not create a Finance OS AR record until delivery, not creation (see Part C) — an order can be confirmed with no automatic check that stock exists or that it has been reflected in Finance.",
  },
  {
    entity: "Customers",
    producer: "master-data-os",
    consumers: ["crm-core", "order-management-os", "customer-support-os", "founder-os", "marketing-os"],
    owner: "master-data-os",
    duplication: "Two independent route trees over the identical Customer model and identical CUSTOMERS_* permissions: /os/customers (Master Data OS) and /sales/customers (CRM Core). Same underlying data, two UIs — a real, already-documented (Block 1) duplication.",
    deadFlow: "marketing-os declares no actual read of Customer data despite Coupon logic being conceptually customer-scoped — see Part G.",
    missingValidation: "None found beyond the pre-existing duplication above.",
  },
  {
    entity: "Inventory",
    producer: "warehouse-os",
    consumers: ["order-management-os", "manufacturing-os", "founder-os"],
    owner: "warehouse-os",
    duplication: "Two full, unsynced ledgers: legacy Warehouse/StockLedgerEntry/InventoryReservation/InventoryAllocation vs. newer EnterpriseWarehouseZone/Bin/Movement (Block 1 finding, re-confirmed).",
    deadFlow: "EnterpriseWarehouseMovement has no confirmed consumer outside the writers themselves (finished-goods-service.ts, procurement-service.ts, actions/enterprise.ts's moveEnterpriseStock) — Founder OS's kpi-engine.ts confirmed (Block 2 trace) to read neither Warehouse nor EnterpriseWarehouse* models at all.",
    missingValidation: "No cross-ledger reconciliation check exists — 'available stock' can differ depending on which ledger a caller reads.",
  },
  {
    entity: "Products",
    producer: "crm-core",
    consumers: ["order-management-os", "warehouse-os", "manufacturing-os", "marketing-os"],
    owner: "crm-core",
    duplication: "None found — Product/ProductVariant are storefront-owned models (frozen, out of scope for this initiative) that every Sales OS module reads but none re-defines.",
    deadFlow: "None found.",
    missingValidation: "Out of scope — Product/ProductVariant belong to the frozen storefront/catalog, not the Sales OS.",
  },
  {
    entity: "Employees",
    producer: "master-data-os",
    consumers: ["crm-core", "founder-os"],
    owner: "master-data-os",
    duplication: "None found.",
    deadFlow: "None found.",
    missingValidation: "None found.",
  },
  {
    entity: "Territories",
    producer: "master-data-os",
    consumers: ["crm-core", "institutional-sales-os"],
    owner: "master-data-os",
    duplication: "Two independent createTerritory implementations (actions/sales-organization.ts and actions/territories.ts, both Block 1 findings under crm-core) plus the /os/territories vs /sales/territories route duplication noted above.",
    deadFlow: "None found.",
    missingValidation: "The two independent createTerritory implementations create a real risk of validation drift (one could accept input the other rejects) — flagged in Part I as technical debt.",
  },
  {
    entity: "Payments",
    producer: "external",
    consumers: ["order-management-os", "finance-os"],
    owner: "order-management-os",
    duplication: "Producer is Razorpay (external payment gateway, via lib/payments/razorpay.ts). The storefront's own commerce invoicing (lib/commerce/services.ts's recordPayment, CommercePayment model) is a fully separate, unconnected payment-record path from Finance OS's own FinanceReceivableInvoice/AR flow (Block 1 finding, re-confirmed).",
    deadFlow: "Confirmed in Block 2: Finance OS's only automatic touch on an order's payment lifecycle is deliverBusinessOrder's post-delivery recordFinanceEvent GL posting — it does not read or reconcile against Order.paymentStatus/CommercePayment at any point before delivery.",
    missingValidation: "No reconciliation check exists between the two payment records.",
  },
  {
    entity: "Invoices",
    producer: "finance-os",
    consumers: ["order-management-os", "founder-os"],
    owner: "finance-os",
    duplication: "lib/commerce/services.ts's own generateInvoice (storefront/D2C) vs. Finance OS's FinanceReceivableInvoice are two separate invoice concepts with no bridging code (Block 1 finding, re-confirmed).",
    deadFlow: "None found beyond the duplication above — each side is actively used within its own module, just never reconciled with the other.",
    missingValidation: "None found beyond the duplication above.",
  },
  {
    entity: "Manufacturing",
    producer: "manufacturing-os",
    consumers: ["warehouse-os", "finance-os", "founder-os"],
    owner: "manufacturing-os",
    duplication: "None found at the model level.",
    deadFlow: "None found.",
    missingValidation: "FIXED in Block 3, Part D: goods receipt now automatically creates and posts a real FinanceVendorBill (with a system-generated placeholder supplierInvoiceNo pending the real supplier document), falling back to the old generic GL-journal-only behavior only if AP posting isn't possible in a given environment.",
  },
  {
    entity: "Reports",
    producer: "analytics-os",
    consumers: ["founder-os"],
    owner: "analytics-os",
    duplication: "app/admin/page.tsx independently hand-rolls a week-over-week revenue comparison and a low-stock query that lib/analytics.ts's getGrowthComparison/getInventoryIntelligence already generalize (Block 1 finding, re-confirmed). Three independent pipeline-value/conversion-rate calculations exist across lib/opportunity/reporting.ts, actions/inst-opportunities.ts, and lib/founder-os/kpi-engine.ts (Block 1 finding, re-confirmed).",
    deadFlow: "None found.",
    missingValidation: "None found beyond the duplication above.",
  },
  {
    entity: "Notifications",
    producer: "crm-core",
    consumers: ["institutional-sales-os", "customer-support-os", "founder-os"],
    owner: "crm-core",
    duplication: "lib/messaging/index.ts is the single pluggable provider entry point (Twilio/MSG91/Interakt/WhatsApp) — no duplicate messaging path found. actions/inst-notifications.ts is Institutional Sales OS's own notification-scheduling logic layered on top of the same shared provider, not a competing implementation.",
    deadFlow: "None found.",
    missingValidation: "None found.",
  },
  {
    entity: "Audit Logs",
    producer: "shared-platform-core",
    consumers: ["crm-core", "founder-os", "institutional-sales-os", "manufacturing-os", "finance-os", "warehouse-os", "network-os", "order-management-os", "master-data-os"],
    owner: "shared-platform-core",
    duplication: "None found — lib/sales/audit.ts's SalesAuditLog is the one shared audit trail every module writes to. Customer Support OS and the Sales AI Assistant are the two modules least confirmed to always append to it — flagged for Block 3 verification, not confirmed as a gap here.",
    deadFlow: "None found.",
    missingValidation: "None found.",
  },
];

// ---------------------------------------------------------------------
// Part I — Technical debt (ranked)
// ---------------------------------------------------------------------

export type DebtSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type TechnicalDebtItem = {
  severity: DebtSeverity;
  title: string;
  modules: ModuleId[];
  description: string;
  /** Set only when a later Block actually fixed the item — the item stays
   * in this list as a historical record either way; Block 2 items are
   * never silently deleted just because Block 3 resolved them. */
  resolvedInBlock?: number;
};

export const TECHNICAL_DEBT: TechnicalDebtItem[] = [
  {
    severity: "CRITICAL",
    title: "lib/muv-ai/security.ts re-implements the Founder-bypass permission check independently, 6+ times",
    modules: ["sales-ai-assistant"],
    description: "A second, hand-maintained copy of the platform's single most security-sensitive branch. Any future change to Founder resolution or permission semantics in lib/sales/authorization.ts will not automatically apply here — highest-risk item precisely because it's security logic, not a business-logic duplication.",
    resolvedInBlock: 3,
  },
  {
    severity: "HIGH",
    title: "Two full, unsynced physical-stock ledgers (legacy Warehouse* vs. Enterprise Warehouse*)",
    modules: ["warehouse-os"],
    description: "No bridging/sync code exists. 'Available stock' can silently differ depending on which ledger a caller reads — a correctness risk for any future automation (including AI tools) that aggregates inventory.",
  },
  {
    severity: "HIGH",
    title: "actions/operations.ts is a single file shared, undivided, between Order Management OS and Warehouse OS",
    modules: ["order-management-os", "warehouse-os"],
    description: "The Operations Queue workflow reads Inventory and writes InventoryReservation directly instead of calling a Warehouse OS service function through a boundary — the clearest concrete example in the codebase of what 'no independent service boundary' looks like in practice.",
  },
  {
    severity: "HIGH",
    title: "Founder OS's kpi-engine.ts re-implements CRM Core's pipeline query WITHOUT the scope filter the original applies",
    modules: ["founder-os", "crm-core"],
    description: "getSalesPipelineSummary (kpi-engine.ts:113-129) independently re-queries prisma.opportunity for open-pipeline/won-this-month figures instead of calling the CRM module's own getOpportunityDashboard (lib/opportunity/reporting.ts:4-20), which already computes the identical numbers WITH an opportunityScope() filter applied. kpi-engine.ts's version has no scope filter at all. Currently low-risk in practice only because this function is gated behind the Founder-bypass (which is meant to see everything anyway) — but it is a live example of exactly the anti-pattern that makes duplicated cross-module queries dangerous: the two code paths will silently diverge the next time either one's business rule changes.",
    resolvedInBlock: 3,
  },
  {
    severity: "HIGH",
    title: "Founder OS has zero read coverage of Warehouse, Manufacturing, Institutional Sales, Customer Support, and Network OS",
    modules: ["founder-os"],
    description: "Confirmed via Block 2 code trace: lib/founder-os/kpi-engine.ts and dashboard-service.ts contain no reference at all to Warehouse/StockLedgerEntry/Inventory, any Enterprise* production model, any Inst* model, any Support* model, or any Network* model. For a module whose stated purpose is 'Founder -> Everything,' five of the platform's real business modules — including Institutional Sales, a major revenue pipeline — are currently invisible to it.",
    resolvedInBlock: 3,
  },
  {
    severity: "HIGH",
    title: "Goods Receipt automatically posts a generic GL journal but never a FinanceVendorBill — no automatic AP linkage",
    modules: ["manufacturing-os", "finance-os"],
    description: "receiveGoods (lib/enterprise/procurement-service.ts:216) fires recordFinanceEvent post-commit, which posts only a generic debit-1200/credit-2000 journal entry. The actual payable (FinanceVendorBill via createAndPostVendorBill, actions/finance.ts:90) requires a Finance user to separately, manually enter the supplier's invoice — there is no automatic PO/Goods-Receipt -> Vendor-Bill trigger. Goods can be received and reflected in inventory and the GL without a corresponding payable ever being created if that manual step is missed.",
    resolvedInBlock: 3,
  },
  {
    severity: "MEDIUM",
    title: "CRM Core's own Quotation acceptance never creates an Order — only the separate Institutional Quotation pipeline does",
    modules: ["crm-core", "order-management-os"],
    description: "actions/quotations.ts's transitionQuotationAction never calls order-creation code on ACCEPTED; only actions/inst-quotations.ts's acceptQuotation is wired to createBusinessOrderCore. CONFIRMED INTENTIONAL by explicit Founder ruling in Block 3 (decision #1: remain manual, do not automate) — recorded here as a permanently-closed question, not an open one.",
    resolvedInBlock: 3,
  },
  {
    severity: "MEDIUM",
    title: "Support return requests never validate order eligibility or update order status",
    modules: ["customer-support-os", "order-management-os"],
    description: "createReturnRequest/approveReturnRequest (lib/support/return-refund-warranty-service.ts) never call into order-mgmt/orders code — a return can be approved with no automatic check that the referenced order is delivered, within a return window, or otherwise eligible, and approving one never flips the order's own status. (Refund execution, by contrast, IS correctly wired end-to-end through actions/orders.ts/actions/payments.ts/Razorpay.)",
  },
  {
    severity: "MEDIUM",
    title: "SupportTicket.orderId is stored but never validated against the Order table",
    modules: ["customer-support-os", "order-management-os"],
    description: "lib/support/ticket-service.ts existence-checks Customer and SupportDepartment before creating a ticket, but not the optional orderId — a ticket can reference a non-existent or mistyped order id with no error.",
  },
  {
    severity: "MEDIUM",
    title: "BusinessOrder dispatch never creates a Shipment/ShipmentEvent row",
    modules: ["order-management-os"],
    description: "The Shipment model is D2C-Order-only (unique orderId FK); BusinessOrder dispatch (actions/business-orders.ts) writes plain carrierName/trackingReference strings directly onto itself instead. BusinessOrder fulfillment has no structured shipment-event timeline, unlike the D2C order track.",
    resolvedInBlock: 3,
  },
  {
    severity: "MEDIUM",
    title: "No automatic Finance OS record exists for an order between creation and delivery",
    modules: ["order-management-os", "finance-os"],
    description: "The only automatic Order->Finance link is deliverBusinessOrder's post-delivery recordFinanceEvent call. Finance OS cannot answer 'what do we expect to collect for currently-open orders' from its own data — that state exists only in Order Management OS until delivery.",
  },
  {
    severity: "MEDIUM",
    title: "Duplicate createTerritory implementations",
    modules: ["crm-core"],
    description: "actions/sales-organization.ts and actions/territories.ts both implement the identical operation — a validation-drift risk (one could diverge from the other silently) more than an ownership-boundary risk, since both are already inside the same module.",
  },
  {
    severity: "MEDIUM",
    title: "/os/customers vs /sales/customers and /os/territories vs /sales/territories — duplicated route trees over identical data",
    modules: ["master-data-os", "crm-core"],
    description: "Same permission gate on both sides (no leakage), but two independently-maintained UIs over one model each is real maintenance burden and a discoverability problem for staff.",
  },
  {
    severity: "MEDIUM",
    title: "Two unconnected payment/invoice systems (storefront commerce vs. Finance OS)",
    modules: ["order-management-os", "finance-os"],
    description: "lib/commerce/services.ts's generateInvoice/recordPayment and Finance OS's FinanceReceivableInvoice/AR flow have no bridging code — a D2C order's true financial state cannot be read from Finance OS alone.",
  },
  {
    severity: "MEDIUM",
    title: "Analytics OS has no SalesPermission family of its own",
    modules: ["analytics-os"],
    description: "Gated only by site-wide requireStaff()/ADMIN|STAFF — a different axis from every other module's fine-grained permission model, and a concrete blocker already recorded in this Block's AI Readiness Matrix.",
  },
  {
    severity: "LOW",
    title: "module-registry.ts's crm-core.actionFiles attribution of actions/territories.ts does not match actual import evidence",
    modules: ["crm-core", "master-data-os"],
    description: "Grep evidence (Block 2) finds actions/territories.ts imported only from /os/* pages, never any /sales/* page; /sales/territories/page.tsx reads Territory via direct Prisma, no action-file import at all. Likely a minor mis-attribution in the (frozen) Block 1 registry rather than a real architectural issue — documented in lib/platform/module-validation.ts's DOCUMENTED_SHARED_ACTION_FILES for a future registry-maintenance pass, not corrected now since module-registry.ts is frozen for Block 2.",
  },
  {
    severity: "LOW",
    title: "50 of 287 PERMISSIONS keys are dead (Block 1 finding, unchanged in Block 2)",
    modules: ["crm-core", "finance-os", "manufacturing-os", "institutional-sales-os", "customer-support-os", "sales-ai-assistant"],
    description: "Informational only per Block 1's own framing — not a correctness risk, but worth resolving before or during AI-tool buildout so dead keys aren't accidentally wired up as if they were live.",
  },
  {
    severity: "LOW",
    title: "Founder OS reachable only through 4 disjoint, non-cross-linked URLs",
    modules: ["founder-os"],
    description: "A navigation/discoverability gap (Block 1 finding, unchanged), not a data-integrity or security issue.",
  },
];

// ---------------------------------------------------------------------
// Block 3, Part E — Performance audit.
// ---------------------------------------------------------------------
// Scope was deliberately narrow per this Part's own instruction ("reduce
// unnecessary complexity only") — this is not a general perf-tuning pass.
// Findings are split into FIXED (a real, verified change landed this
// Block) and OBSERVED (a real pattern found, deliberately NOT changed,
// with the reason recorded so it isn't silently rediscovered or, worse,
// "fixed" by someone without this context).
export type PerformanceFinding = {
  status: "FIXED" | "OBSERVED_NOT_CHANGED";
  title: string;
  modules: ModuleId[];
  detail: string;
};

export const PERFORMANCE_AUDIT: PerformanceFinding[] = [
  {
    status: "FIXED",
    title: "Founder OS's kpi-engine.ts no longer duplicates CRM Core's opportunity-pipeline query",
    modules: ["founder-os", "crm-core"],
    detail: "getSalesPipelineSummary now calls lib/opportunity/reporting.ts's getOpportunityDashboard directly instead of re-running an unscoped prisma.opportunity aggregate — one fewer independently-maintained query, and the correctness fix (Block 2's HIGH-severity scope-filter gap) came for free with the same change.",
  },
  {
    status: "FIXED",
    title: "Authorization boolean logic (isFounder-bypass-or-permission-membership) now has exactly one implementation platform-wide",
    modules: ["shared-platform-core", "sales-ai-assistant"],
    detail: "lib/platform-core/authorization.ts's principalHasPermission/principalHasAnyPermission/principalHasAllPermissions are now the only place this check is written; requirePermission/requireAnyPermission/hasPermission and lib/muv-ai/security.ts's requireAiPermission/requireAiAdminPermission all delegate to them (Part B). Not a runtime-speed change (the check itself is a Set.has() either way) — the complexity reduction is maintainability: one code path to reason about instead of 3+.",
  },
  {
    status: "FIXED",
    title: "Shared Platform Core given one canonical physical home instead of two",
    modules: ["shared-platform-core"],
    detail: "lib/sales/{authorization,constants,audit}.ts and lib/enterprise/{context,governance}.ts are now thin re-export shims over lib/platform-core/* (Part A) — reduces 'which of these two files has the real code' ambiguity to zero, at build-time cost of one extra module resolution per import (negligible; Next.js already tree-shakes re-export-only modules).",
  },
  {
    status: "OBSERVED_NOT_CHANGED",
    title: "Several read paths fetch N related records via Promise.all(items.map(async ...)) instead of one batched findMany",
    modules: ["founder-os", "network-os", "crm-core"],
    detail: "lib/founder-os/comparison-engine.ts:55, lib/enterprise-network/enablement-service.ts:60, lib/enterprise-network/integration-service.ts:35, and lib/quotation/workflow.ts:21 each issue N parallel (not sequential — already Promise.all-wrapped) queries instead of 1 batched query. A real, safe optimization opportunity, but converting each requires touching business logic in 4 different files for an unmeasured gain on what are today small N counts — deferred rather than changed under this Block's 'reduce unnecessary complexity only' mandate (batching here would add Map-building code, which is the opposite of reducing complexity, in exchange for a query-count win that hasn't been shown to matter yet).",
  },
  {
    status: "OBSERVED_NOT_CHANGED",
    title: "Two independent createTerritory implementations (Block 1 finding) were not consolidated",
    modules: ["crm-core", "master-data-os"],
    detail: "actions/sales-organization.ts and actions/territories.ts each implement the same operation with potentially-diverging validation. Consolidating them means changing both call sites' behavior contracts (whichever one 'loses' changes what its callers experience) — real behavior-affecting business-logic work, not a performance or dead-code change, and MEDIUM- not HIGH-severity. Left for an explicit, separately-scoped future decision rather than merged opportunistically here.",
  },
];

// ---------------------------------------------------------------------
// Block 3, Part F — Permission cleanup review.
// ---------------------------------------------------------------------
// The instruction was explicit and conservative: "Remove ONLY permissions
// that are proven unused, unreachable, safe to delete. Never remove
// anything uncertain." All 50 of Block 1's dead PERMISSIONS keys (still
// 50 as of this Block — re-verified via npm run verify:sales-os-block1's
// live detector) were reviewed against that bar. RESULT: zero were
// removed. Every one of the 50 fails the "unreachable" test the same
// way: `prisma/seed.ts` actively GRANTS every one of these permission
// VALUES (the dot-string, e.g. "dashboard.all") to at least one real
// seeded SalesRole — they are not orphaned scaffolding from a removed
// feature, they are live, granted permissions with no enforcing code
// written yet. Deleting the PERMISSIONS constant would not break a build
// (seed.ts references the raw string, not the constant), but it would
// permanently sever the one place that string is named and explained,
// while the DB row granting it to a role would still exist — a real
// documentation/traceability loss for an uncertain, not proven, benefit.
export const PERMISSION_CLEANUP_REVIEW = {
  reviewedCount: 50,
  removedCount: 0,
  categories: [
    {
      label: "AI_* family (10 keys: AI_KNOWLEDGE_RETRIEVE, AI_KNOWLEDGE_MANAGE, AI_WORKFLOWS_USE, AI_RECOMMENDATIONS_VIEW, AI_AGENTS_MANAGE, AI_TOOLS_MANAGE, AI_USAGE_VIEW_OWN/TEAM/ALL, AI_EXPORT)",
      verdict: "KEEP — explicitly required",
      reason: "This Block's own Part E (AI Readiness Matrix) names these exact keys as the ones that should be wired up when each module's AI tool entry point is built. Deleting them now would delete the permission surface Part E just designed around.",
    },
    {
      label: "Quotation approval-tier and pricing-override keys (7: QUOTATIONS_VIEW/CREATE/APPROVE_STANDARD/APPROVE_STRATEGIC/BULK, QUOTATION_CONFIG_MANAGE, PRICING_OVERRIDE, PRICING_POLICIES_MANAGE)",
      verdict: "KEEP — plausible forward scaffolding",
      reason: "Read as a finer-grained approval-tier/pricing-governance model defined ahead of the enforcing code being written into actions/quotations.ts — the same benign 'model the permission first, enforce it as the feature ships' pattern the AI_* family is an acknowledged instance of. No evidence distinguishes these as abandoned rather than pending.",
    },
    {
      label: "Analytics visibility-scope keys (5: ANALYTICS_VIEW_ALL/TEAM/ASSIGNED/INSTITUTIONAL/SUPPORT)",
      verdict: "KEEP — matches a real, documented gap",
      reason: "Block 1/2 already found Analytics OS has no SalesPermission family of its own (gated only by site-wide ADMIN/STAFF) and flagged introducing one as a Block 3+ prerequisite for AI readiness. These 5 keys are very plausibly that exact not-yet-wired-up permission family, not dead code.",
    },
    {
      label: "Enterprise procurement/formula/batch/planning control keys (7: ENTERPRISE_PROCUREMENT_APPROVE, ENTERPRISE_RFQ_MANAGE, ENTERPRISE_QUOTATION_EVALUATE, ENTERPRISE_RETURN_MANAGE, ENTERPRISE_FORMULA_UPDATE_DRAFT, ENTERPRISE_BATCH_BLOCK/CLOSE, ENTERPRISE_PLANNING_OVERRIDE)",
      verdict: "KEEP — governance/exception controls, not routine-path permissions",
      reason: "These read as approval/override/exception-path controls (block a batch, override a plan, evaluate an RFQ) layered on top of Manufacturing OS's already-real, already-used operations-services.ts — the kind of permission that is granted to a role long before the specific exception UI that checks it gets built.",
    },
    {
      label: "Remaining individually-scoped keys (21: DASHBOARD_ALL, LEADS_ASSIGN, CRM_UPDATE, MEETINGS_MANAGE, PARTNERS_APPROVE, SALES_CHANNELS_VIEW, INQUIRIES_CREATE/REASSIGN, OPPORTUNITY_CONFIG_MANAGE, REPORTS_QUOTATIONS, WAREHOUSE_OPERATE, PAYMENTS_VOID, COMMERCE_BULK, COMMERCE_CONFIG_MANAGE, REPORTS_COMMERCE, KPI_CONFIG_MANAGE, REPORT_CONFIG_MANAGE, INST_TARGETS_MANAGE, SUPPORT_QA_REVIEW)",
      verdict: "KEEP — no individual proof of dead-vs-pending reached the 'safe to delete' bar",
      reason: "Each is granted to a real seeded role. None could be individually proven abandoned (vs. pending) without a Founder/product owner confirming intent feature-by-feature — exactly the 'uncertain' case this Part's own instruction says to never remove.",
    },
  ],
  recommendation: "Re-run npm run verify:sales-os-block1's live dead-permission detector periodically. A key is a much stronger deletion candidate once BOTH conditions hold: (a) still unreferenced in application code, AND (b) no longer granted to any active role in current (not seed-time) SalesRolePermission data — the second condition needs a live-DB check this static-analysis suite deliberately does not perform (see PROJECT scope notes), and is the responsible next gate before any future deletion.",
};

// ---------------------------------------------------------------------
// Block 3, Part G — Dead code review.
// ---------------------------------------------------------------------
// Same conservative bar as Part F: "Remove only proven dead code. Preserve
// future scaffolding." A file-level unimported-file scan across the 17
// Sales OS lib/* directories (155 files) initially flagged 31 candidates;
// a first-pass detector bug (it only checked "@/..." absolute imports,
// missing "./relative" imports entirely) accounted for 25 of those as
// false positives — re-checked against both import forms, 6 genuine
// candidates remained. RESULT: zero files removed.
export const DEAD_CODE_REVIEW = {
  filesScanned: 155,
  candidatesFound: 6,
  removedCount: 0,
  findings: [
    {
      files: ["lib/sales/extensions.ts", "lib/opportunity/extensions.ts", "lib/quotation/extensions.ts", "lib/commerce/extensions.ts", "lib/growth/extensions.ts"],
      verdict: "KEEP — explicitly documented future scaffolding, not dead code",
      reason: "lib/sales/extensions.ts's own text is unambiguous: \"Registration boundary only. Version 1 intentionally ships no extension logic.\" It defines a SalesExtension type/registry (dealer/distributor/franchise management, corporate sales, key-account management, sales analytics/operations, muv-ai) with every entry deliberately `enabled: false`. This is precisely the 'preserve future scaffolding' case this Part's own instruction names — a reserved namespace for known-future modules (several of which match Network OS and the Sales AI Assistant, both real modules this Block already worked on), not an abandoned file. The 4 sibling extensions.ts files follow the identical pattern.",
    },
    {
      files: ["lib/enterprise-network/index.ts"],
      verdict: "KEEP — reviewed, not deleted, despite genuinely zero references",
      reason: "A pure `export *` barrel over the module's 11 service files (domain, context, partner-service, governance-service, commercial-service, operations-service, policy-service, enablement-service, attribution-service, integration-service, ai-adapter). Confirmed zero consumers anywhere, including no directory-style `from \"@/lib/enterprise-network\"` import. Left in place rather than deleted: it implements no logic of its own (re-exports only, zero behavioral risk either way), and a barrel file existing ahead of a consumer that hasn't been written yet is at least as plausibly intentional forward-compatibility as it is leftover — the same 'provably dead vs. plausibly pending' uncertainty Part F's permission review reached, resolved the same conservative way.",
    },
  ],
};
