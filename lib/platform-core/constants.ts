export const SALES_ROLES = {
  FOUNDER: "Founder",
  SALES_MANAGER: "Sales Manager",
  SALES_OFFICER: "Sales Officer",
  INSTITUTIONAL: "Institutional Sales Officer",
  SUPPORT: "Customer Support",
} as const;

export const RESERVED_SALES_ROLES = [
  "Corporate Sales", "Key Account Manager", "Dealer Development",
  "Distributor Development", "Franchise Development", "Sales Operations",
  "Sales Analytics",
] as const;

export const PERMISSIONS = {
  DASHBOARD_ALL: "dashboard.all",
  DASHBOARD_TEAM: "dashboard.team",
  DASHBOARD_ASSIGNED: "dashboard.assigned",
  DASHBOARD_INSTITUTIONAL: "dashboard.institutional",
  DASHBOARD_SUPPORT: "dashboard.support",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  PERMISSIONS_MANAGE: "permissions.manage",
  TERRITORIES_MANAGE: "territories.manage",
  AUDIT_VIEW: "audit.view",
  LEADS_VIEW_ALL: "leads.view_all",
  LEADS_VIEW_ASSIGNED: "leads.view_assigned",
  LEADS_ASSIGN: "leads.assign",
  CRM_UPDATE: "crm.update",
  CUSTOMERS_VIEW_ALL: "customers.view_all",
  CUSTOMERS_VIEW_ASSIGNED: "customers.view_assigned",
  // Milestone 2 (Customer & Master Data Foundation) — the existing two keys
  // above only ever gated *viewing* a customer (set when the storefront's
  // own account/order flows were built); nothing previously gated creating,
  // editing admin-only fields (credit limit, territory, owner), or
  // deactivating one. One key, not one per field/action, matching the
  // granularity every other simple-master domain in this milestone uses.
  CUSTOMERS_MANAGE: "customers.manage",
  // One shared key for every "Common Master" this milestone adds (Units,
  // Brands, Payment Terms, Institution Categories, Departments, Customer
  // Types) — deliberately not one key per master, since these are six
  // near-identical simple lists (name/code/active) with no reason any role
  // would be trusted to manage one but not another.
  MASTER_DATA_MANAGE: "master_data.manage",
  // Employee Master edits User-owned fields (department, designation,
  // status) that are otherwise outside any existing Sales permission's
  // scope — separate from USERS_MANAGE below, which already governs
  // role/permission administration, a different concern.
  EMPLOYEES_MANAGE: "employees.manage",
  QUOTATIONS_VIEW: "quotations.view",
  QUOTATIONS_CREATE: "quotations.create",
  QUOTATIONS_APPROVE_STANDARD: "quotations.approve_standard",
  QUOTATIONS_APPROVE_STRATEGIC: "quotations.approve_strategic",
  REPORTS_VIEW: "reports.view",
  FOLLOWUPS_MANAGE: "followups.manage",
  MEETINGS_MANAGE: "meetings.manage",
  INSTITUTIONAL_MANAGE: "institutional.manage",
  SUPPORT_MANAGE: "support.manage",
  PARTNERS_APPROVE: "partners.approve",
  PRICING_OVERRIDE: "pricing.override",
  SALES_CHANNELS_VIEW: "sales_channels.view",
  SALES_CHANNELS_MANAGE: "sales_channels.manage",
  INQUIRIES_VIEW_ALL: "inquiries.view_all",
  INQUIRIES_VIEW_ASSIGNED: "inquiries.view_assigned",
  INQUIRIES_CREATE: "inquiries.create",
  INQUIRIES_ASSIGN: "inquiries.assign",
  INQUIRIES_REASSIGN: "inquiries.reassign",
  INQUIRIES_CHANGE_STATUS: "inquiries.change_status",
  APPLICATIONS_REVIEW: "applications.review",
  APPLICATIONS_APPROVE: "applications.approve",
  APPLICATIONS_REJECT: "applications.reject",
  TIMELINE_VIEW: "timeline.view",
  LEAD_SOURCES_MANAGE: "lead_sources.manage",
  REPORTS_CHANNELS: "reports.channels",
  OPPORTUNITIES_VIEW_ALL: "opportunities.view_all",
  OPPORTUNITIES_VIEW_ASSIGNED: "opportunities.view_assigned",
  OPPORTUNITIES_CREATE: "opportunities.create",
  OPPORTUNITIES_UPDATE: "opportunities.update",
  OPPORTUNITIES_ASSIGN: "opportunities.assign",
  OPPORTUNITIES_STAGE_CHANGE: "opportunities.stage_change",
  OPPORTUNITIES_CLOSE: "opportunities.close",
  OPPORTUNITIES_REOPEN: "opportunities.reopen",
  OPPORTUNITIES_PROBABILITY_OVERRIDE: "opportunities.probability_override",
  OPPORTUNITIES_BULK: "opportunities.bulk",
  OPPORTUNITIES_EXPORT: "opportunities.export",
  OPPORTUNITY_ACTIVITIES_MANAGE: "opportunity_activities.manage",
  OPPORTUNITY_TASKS_MANAGE: "opportunity_tasks.manage",
  OPPORTUNITY_CONFIG_MANAGE: "opportunity_config.manage",
  REPORTS_OPPORTUNITIES: "reports.opportunities",
  QUOTATIONS_VIEW_ALL: "quotations.view_all",
  QUOTATIONS_VIEW_ASSIGNED: "quotations.view_assigned",
  QUOTATIONS_VIEW_SUPPORT: "quotations.view_support",
  QUOTATIONS_CREATE_VERSIONS: "quotations.create_versions",
  QUOTATIONS_UPDATE: "quotations.update",
  QUOTATIONS_APPROVE: "quotations.approve",
  QUOTATIONS_SEND: "quotations.send",
  QUOTATIONS_RESPOND: "quotations.respond",
  QUOTATIONS_REVISE: "quotations.revise",
  QUOTATIONS_BULK: "quotations.bulk",
  QUOTATIONS_EXPORT: "quotations.export",
  QUOTATIONS_PDF: "quotations.pdf",
  QUOTATION_CONFIG_MANAGE: "quotation_config.manage",
  PRICING_POLICIES_MANAGE: "pricing_policies.manage",
  REPORTS_QUOTATIONS: "reports.quotations",
  COMMERCE_VIEW_ALL: "commerce.view_all",
  COMMERCE_VIEW_ASSIGNED: "commerce.view_assigned",
  COMMERCE_VIEW_SUPPORT: "commerce.view_support",
  ORDERS_CREATE_FROM_QUOTATION: "orders.create_from_quotation",
  ORDERS_MANAGE: "orders.manage_commerce",
  WAREHOUSE_OPERATE: "warehouse.operate",
  WAREHOUSE_ADJUST: "warehouse.adjust",
  INVENTORY_ALLOCATE: "inventory.allocate",
  BILLING_MANAGE: "billing.manage",
  PAYMENTS_RECORD: "payments.record",
  PAYMENTS_VOID: "payments.void",
  COMMERCE_BULK: "commerce.bulk",
  COMMERCE_EXPORT: "commerce.export",
  COMMERCE_CONFIG_MANAGE: "commerce_config.manage",
  REPORTS_COMMERCE: "reports.commerce",
  INTELLIGENCE_VIEW_ALL: "intelligence.view_all",
  INTELLIGENCE_VIEW_ASSIGNED: "intelligence.view_assigned",
  INTELLIGENCE_VIEW_SUPPORT: "intelligence.view_support",
  INTELLIGENCE_RECALCULATE: "intelligence.recalculate",
  SEGMENTS_MANAGE: "segments.manage",
  LOYALTY_VIEW_ALL: "loyalty.view_all",
  LOYALTY_VIEW_ASSIGNED: "loyalty.view_assigned",
  LOYALTY_VIEW_SUPPORT: "loyalty.view_support",
  LOYALTY_ADJUST_REWARDS: "loyalty.adjust_rewards",
  LOYALTY_MANAGE_MEMBERSHIP: "loyalty.manage_membership",
  LOYALTY_MANAGE_REFERRALS: "loyalty.manage_referrals",
  ANALYTICS_VIEW_ALL: "analytics.view_all",
  ANALYTICS_VIEW_TEAM: "analytics.view_team",
  ANALYTICS_VIEW_ASSIGNED: "analytics.view_assigned",
  ANALYTICS_VIEW_INSTITUTIONAL: "analytics.view_institutional",
  ANALYTICS_VIEW_SUPPORT: "analytics.view_support",
  EXECUTIVE_REPORTS_GENERATE: "executive_reports.generate",
  INTELLIGENCE_EXPORT: "intelligence.export",
  KPI_CONFIG_MANAGE: "kpi_config.manage",
  REPORT_CONFIG_MANAGE: "report_config.manage",
  AI_CONVERSATIONS_USE: "ai.conversations.use",
  AI_CONVERSATIONS_MANAGE: "ai.conversations.manage",
  AI_EXECUTIVE_USE: "ai.executive.use",
  AI_KNOWLEDGE_RETRIEVE: "ai.knowledge.retrieve",
  AI_KNOWLEDGE_MANAGE: "ai.knowledge.manage",
  AI_WORKFLOWS_USE: "ai.workflows.use",
  AI_WORKFLOWS_MONITOR: "ai.workflows.monitor",
  AI_ACTIONS_PROPOSE: "ai.actions.propose",
  AI_ACTIONS_APPROVE: "ai.actions.approve",
  AI_RECOMMENDATIONS_VIEW: "ai.recommendations.view",
  AI_PROMPTS_MANAGE: "ai.prompts.manage",
  AI_PROVIDERS_MANAGE: "ai.providers.manage",
  AI_AGENTS_MANAGE: "ai.agents.manage",
  AI_TOOLS_MANAGE: "ai.tools.manage",
  AI_SECURITY_MANAGE: "ai.security.manage",
  AI_OPERATIONS_VIEW: "ai.operations.view",
  AI_OPERATIONS_MANAGE: "ai.operations.manage",
  AI_USAGE_VIEW_OWN: "ai.usage.view_own",
  AI_USAGE_VIEW_TEAM: "ai.usage.view_team",
  AI_USAGE_VIEW_ALL: "ai.usage.view_all",
  AI_EXPORT: "ai.export",
  ENTERPRISE_VENDOR_VIEW: "enterprise.vendor.view",
  ENTERPRISE_VENDOR_CREATE: "enterprise.vendor.create",
  ENTERPRISE_VENDOR_UPDATE: "enterprise.vendor.update",
  ENTERPRISE_VENDOR_APPROVE: "enterprise.vendor.approve",
  ENTERPRISE_VENDOR_SUSPEND: "enterprise.vendor.suspend",
  ENTERPRISE_VENDOR_ARCHIVE: "enterprise.vendor.archive",
  ENTERPRISE_PROCUREMENT_VIEW: "enterprise.procurement.view",
  ENTERPRISE_REQUISITION_CREATE: "enterprise.procurement.requisition.create",
  ENTERPRISE_REQUISITION_SUBMIT: "enterprise.procurement.requisition.submit",
  ENTERPRISE_PROCUREMENT_APPROVE: "enterprise.procurement.approve",
  ENTERPRISE_RFQ_MANAGE: "enterprise.procurement.rfq.manage",
  ENTERPRISE_QUOTATION_EVALUATE: "enterprise.procurement.quotation.evaluate",
  ENTERPRISE_PO_CREATE: "enterprise.procurement.po.create",
  ENTERPRISE_PO_ISSUE: "enterprise.procurement.po.issue",
  ENTERPRISE_RECEIPT_CREATE: "enterprise.procurement.receipt.create",
  ENTERPRISE_RETURN_MANAGE: "enterprise.procurement.return.manage",
  ENTERPRISE_FORMULA_VIEW: "enterprise.formula.view",
  ENTERPRISE_FORMULA_CREATE: "enterprise.formula.create",
  ENTERPRISE_FORMULA_UPDATE_DRAFT: "enterprise.formula.update_draft",
  ENTERPRISE_FORMULA_SUBMIT: "enterprise.formula.submit",
  ENTERPRISE_FORMULA_APPROVE: "enterprise.formula.approve",
  ENTERPRISE_FORMULA_ACTIVATE: "enterprise.formula.activate",
  ENTERPRISE_PRODUCTION_VIEW: "enterprise.production.view",
  ENTERPRISE_PRODUCTION_PLAN: "enterprise.production.plan",
  ENTERPRISE_PRODUCTION_ORDER_CREATE: "enterprise.production.order.create",
  ENTERPRISE_PRODUCTION_ORDER_APPROVE: "enterprise.production.order.approve",
  ENTERPRISE_PRODUCTION_EXECUTE: "enterprise.production.execute",
  ENTERPRISE_PRODUCTION_COMPLETE: "enterprise.production.complete",
  ENTERPRISE_BATCH_VIEW: "enterprise.batch.view",
  ENTERPRISE_BATCH_CREATE: "enterprise.batch.create",
  ENTERPRISE_BATCH_UPDATE: "enterprise.batch.update",
  ENTERPRISE_BATCH_BLOCK: "enterprise.batch.block",
  ENTERPRISE_BATCH_CLOSE: "enterprise.batch.close",
  ENTERPRISE_QUALITY_VIEW: "enterprise.quality.view",
  ENTERPRISE_QUALITY_INSPECT: "enterprise.quality.inspect",
  ENTERPRISE_QUALITY_DECIDE: "enterprise.quality.decide",
  ENTERPRISE_QUALITY_RELEASE: "enterprise.quality.release",
  ENTERPRISE_QUALITY_REJECT: "enterprise.quality.reject",
  ENTERPRISE_QUALITY_OVERRIDE: "enterprise.quality.override",
  ENTERPRISE_WAREHOUSE_VIEW: "enterprise.warehouse.view",
  ENTERPRISE_WAREHOUSE_TRANSFER: "enterprise.warehouse.transfer",
  ENTERPRISE_WAREHOUSE_ADJUST: "enterprise.warehouse.adjust",
  ENTERPRISE_WAREHOUSE_CONSUME: "enterprise.warehouse.consume",
  ENTERPRISE_PLANNING_VIEW: "enterprise.planning.view",
  ENTERPRISE_PLANNING_GENERATE: "enterprise.planning.generate",
  ENTERPRISE_PLANNING_OVERRIDE: "enterprise.planning.override",
  ENTERPRISE_REPORTING_VIEW: "enterprise.reporting.view",
  ENTERPRISE_REPORTING_EXPORT: "enterprise.reporting.export",
  NETWORK_PARTNERS_VIEW: "network.partners.view",
  NETWORK_PARTNERS_MANAGE: "network.partners.manage",
  NETWORK_PARTNERS_APPROVE_ONBOARDING: "network.partners.approve_onboarding",
  NETWORK_TERRITORIES_MANAGE: "network.territories.manage",
  NETWORK_AGREEMENTS_MANAGE: "network.agreements.manage",
  NETWORK_AGREEMENTS_APPROVE: "network.agreements.approve",
  NETWORK_COMMERCIAL_POLICIES_MANAGE: "network.commercial_policies.manage",
  NETWORK_ROYALTIES_MANAGE: "network.royalties.manage",
  NETWORK_ROYALTIES_APPROVE: "network.royalties.approve",
  NETWORK_COMMISSIONS_MANAGE: "network.commissions.manage",
  NETWORK_COMMISSIONS_APPROVE: "network.commissions.approve",
  NETWORK_CLAIMS_MANAGE: "network.claims.manage",
  NETWORK_CLAIMS_APPROVE: "network.claims.approve",
  NETWORK_ANALYTICS_VIEW: "network.analytics.view",
  NETWORK_PARTNER_PORTAL_ADMIN: "network.partner_portal.admin",
  // Enterprise Architecture v3.0 Phase 2 Part 3C — Enterprise Finance
  // Platform. These exact key strings were already reserved and seeded in
  // prisma/seed.ts's permissionData (module "enterprise_finance") ahead of
  // this Part; adding them here only makes the existing, already-granted
  // strings usable as typed PermissionKey values in Business Services.
  FINANCE_MASTERS_VIEW: "finance.masters.view",
  FINANCE_MASTERS_MANAGE: "finance.masters.manage",
  FINANCE_JOURNALS_PREPARE: "finance.journals.prepare",
  FINANCE_JOURNALS_APPROVE: "finance.journals.approve",
  FINANCE_JOURNALS_POST: "finance.journals.post",
  FINANCE_RECEIVABLES_VIEW: "finance.receivables.view",
  FINANCE_RECEIVABLES_MANAGE: "finance.receivables.manage",
  FINANCE_PAYABLES_VIEW: "finance.payables.view",
  FINANCE_PAYABLES_MANAGE: "finance.payables.manage",
  FINANCE_PAYMENTS_PREPARE: "finance.payments.prepare",
  FINANCE_PAYMENTS_APPROVE: "finance.payments.approve",
  FINANCE_EXPENSES_MANAGE: "finance.expenses.manage",
  FINANCE_EXPENSES_APPROVE: "finance.expenses.approve",
  FINANCE_BANKING_MANAGE: "finance.banking.manage",
  FINANCE_BANKING_RECONCILE: "finance.banking.reconcile",
  FINANCE_TAX_MANAGE: "finance.tax.manage",
  FINANCE_REPORTS_VIEW: "finance.reports.view",
  FINANCE_PERIODS_CLOSE: "finance.periods.close",
  FINANCE_PERIODS_REOPEN: "finance.periods.reopen",

  // Milestone 8 — Finance & Accounts (MUV OS). New permission keys only for
  // the genuinely new domains this milestone adds — everything already
  // covered by the FINANCE_* keys above (Journals, AR, AP, Banking,
  // Expenses, Periods, Masters, Reports) is reused unchanged.
  FINANCE_CREDIT_NOTES_MANAGE: "finance.creditnotes.manage",
  FINANCE_DEBIT_NOTES_MANAGE: "finance.debitnotes.manage",
  FINANCE_ASSETS_MANAGE: "finance.assets.manage",
  FINANCE_DEPRECIATION_POST: "finance.depreciation.post",
  FINANCE_BUDGETS_MANAGE: "finance.budgets.manage",
  FINANCE_BUDGETS_APPROVE: "finance.budgets.approve",
  FINANCE_COSTING_VIEW: "finance.costing.view",
  FINANCE_COSTING_MANAGE: "finance.costing.manage",
  FINANCE_CASH_MANAGE: "finance.cash.manage",
  FINANCE_COLLECTIONS_MANAGE: "finance.collections.manage",
  FINANCE_CREDIT_CONTROL_MANAGE: "finance.creditcontrol.manage",
  FINANCE_CREDIT_CONTROL_OVERRIDE: "finance.creditcontrol.override",
  FINANCE_APPROVAL_MATRIX_MANAGE: "finance.approvalmatrix.manage",
  FINANCE_EVENT_POSTING_MANAGE: "finance.eventposting.manage",
  FINANCE_AUDIT_MANAGE: "finance.audit.manage",
  FINANCE_AUDIT_VIEW: "finance.audit.view",

  // Part 3D, Stage 1 — Founder Operating System. Founder OS never
  // introduces a Finance permission of its own — it only reads through
  // the finance.* permissions above, exactly as any other caller must.
  //
  // `founder_os.access` and `founder_os.alerts.manage` already existed in
  // the seed (a `founder_os` permission module was pre-provisioned ahead
  // of this Stage actually being built, the same way
  // `ENTERPRISE_FOUNDER_OS_ENABLED` was pre-reserved as a feature flag) —
  // reused here rather than inventing near-duplicates
  // (`founder_os.dashboard.view`, a separate `founder_os.alerts.view`,
  // etc.). `founder_os.access` gates every general viewing capability this
  // Stage has (dashboard, KPIs, health, alert listing, timeline, activity
  // feed, search) — it does not yet split into the pre-provisioned
  // `founder_os.financial_intelligence.view` /
  // `operational_intelligence.view` / `network_intelligence.view`
  // finer-grained keys; those remain reserved, unused, for a future stage
  // to wire in if per-section gating is ever needed, matching how
  // `ENTERPRISE_TAX_COMPLIANCE_ENABLED` stayed reserved-but-unused in
  // Part 3C. Only the three keys below are genuinely new — no
  // pre-provisioned equivalent existed for notifications or widget
  // preferences.
  FOUNDER_OS_ACCESS: "founder_os.access",
  FOUNDER_OS_ALERTS_MANAGE: "founder_os.alerts.manage",
  FOUNDER_OS_NOTIFICATIONS_VIEW: "founder_os.notifications.view",
  FOUNDER_OS_NOTIFICATIONS_MANAGE: "founder_os.notifications.manage",
  FOUNDER_OS_WIDGETS_MANAGE: "founder_os.widgets.manage",

  // Part 3D, Stage 4 — Founder Workspace. One new key, following the
  // exact same read/write split `founder_os.widgets.manage` already
  // established for a personal-preference resource: `founder_os.access`
  // gates every Stage 4 read (list my saved views/layouts/reports,
  // search my own), this one gates every Stage 4 write (create/update/
  // delete/set-default/pin/generate report/save preferences). None of
  // the 9 pre-provisioned founder_os.* keys fit a personal-workspace
  // write concern — reusing one of them (e.g. `founder_os.approvals.perform`,
  // reserved for actually approving something) would be a semantic
  // mismatch, not a genuine reuse.
  FOUNDER_OS_WORKSPACE_MANAGE: "founder_os.workspace.manage",

  // Milestone 3 — Institutional Sales OS (app/os/sales). Isolated from the
  // existing "institutional.manage"/"dashboard.institutional" pair above by
  // design — see prisma/seed.ts's note at these keys' seed entries.
  INST_DASHBOARD_FOUNDER: "inst_sales.dashboard.founder",
  INST_DASHBOARD_MANAGER: "inst_sales.dashboard.manager",
  INST_DASHBOARD_OFFICER: "inst_sales.dashboard.officer",
  INST_LEADS_VIEW_ALL: "inst_sales.leads.view_all",
  INST_LEADS_VIEW_ASSIGNED: "inst_sales.leads.view_assigned",
  INST_LEADS_MANAGE: "inst_sales.leads.manage",
  INST_OPPORTUNITIES_VIEW_ALL: "inst_sales.opportunities.view_all",
  INST_OPPORTUNITIES_VIEW_ASSIGNED: "inst_sales.opportunities.view_assigned",
  INST_OPPORTUNITIES_MANAGE: "inst_sales.opportunities.manage",
  INST_VISITS_MANAGE: "inst_sales.visits.manage",
  INST_SAMPLES_MANAGE: "inst_sales.samples.manage",
  INST_FOLLOWUPS_MANAGE: "inst_sales.followups.manage",
  INST_QUOTATIONS_VIEW: "inst_sales.quotations.view",
  INST_QUOTATIONS_MANAGE: "inst_sales.quotations.manage",
  INST_QUOTATIONS_APPROVE: "inst_sales.quotations.approve",
  INST_TASKS_MANAGE: "inst_sales.tasks.manage",
  INST_PLANNER_MANAGE: "inst_sales.planner.manage",
  INST_EXPENSES_SUBMIT: "inst_sales.expenses.submit",
  INST_EXPENSES_APPROVE: "inst_sales.expenses.approve",
  INST_EXPENSES_VIEW_ALL: "inst_sales.expenses.view_all",
  INST_ROUTES_MANAGE: "inst_sales.routes.manage",
  INST_REPORTS_VIEW: "inst_sales.reports.view",
  INST_TARGETS_MANAGE: "inst_sales.targets.manage",

  // Milestone 4 — Order Management OS. Deliberately NOT namespaced under
  // "inst_sales." like the block above, even though BusinessOrder currently
  // only originates from the Institutional Sales quotation flow — the
  // BusinessOrder/BusinessOrderItem model naming was kept channel-neutral
  // specifically so a future Corporate/Dealer/Distributor/Franchise/Export
  // order flow isn't blocked by the name, and these permission keys follow
  // that same reasoning rather than tying access control to today's one
  // origin channel. ORDER_MGMT_VIEW is separate again: it gates the unified
  // list surface (both D2C and business orders together), not the
  // business-order domain specifically.
  ORDER_MGMT_VIEW: "order_mgmt.view",
  BUSINESS_ORDERS_VIEW_ALL: "business_orders.view_all",
  BUSINESS_ORDERS_VIEW_ASSIGNED: "business_orders.view_assigned",
  BUSINESS_ORDERS_MANAGE: "business_orders.manage",
  BUSINESS_ORDERS_CREATE_FROM_QUOTATION: "business_orders.create_from_quotation",

  // Milestone 5 — Operations Foundation. A new, small permission pair for
  // the Operations Queue / inventory-check-and-reserve workflow — not
  // folded into business_orders.manage, since "manage a business order's
  // status/dispatch info" and "check live stock and reserve it" are
  // genuinely different capabilities that may need to be granted
  // separately once a real Operations-tier role exists (not activated this
  // milestone — see prisma/seed.ts's grant for the current, temporary
  // assignment to existing Sales roles).
  BUSINESS_OPS_VIEW: "business_ops.view",
  BUSINESS_OPS_MANAGE: "business_ops.manage",

  // Milestone 9 — Customer Support (app/os/support). New, distinct keys —
  // deliberately not reusing the pre-existing "support.manage" permission
  // above (Milestone 1-era, gates the unrelated app/sales/support "Support
  // Work Queue" page and is a load-bearing low-privilege test fixture across
  // many Enterprise v3 integration tests — left untouched, see schema.prisma's
  // Milestone 9 header comment).
  SUPPORT_TICKETS_VIEW_ALL: "support.tickets.view_all",
  SUPPORT_TICKETS_VIEW_ASSIGNED: "support.tickets.view_assigned",
  SUPPORT_TICKETS_MANAGE: "support.tickets.manage",
  SUPPORT_TICKETS_ASSIGN: "support.tickets.assign",
  SUPPORT_TICKETS_ESCALATE: "support.tickets.escalate",
  SUPPORT_TICKETS_REOPEN: "support.tickets.reopen",
  SUPPORT_REFUNDS_PREPARE: "support.refunds.prepare",
  SUPPORT_REFUNDS_APPROVE: "support.refunds.approve",
  SUPPORT_RETURNS_MANAGE: "support.returns.manage",
  SUPPORT_WARRANTY_MANAGE: "support.warranty.manage",
  SUPPORT_KB_AUTHOR: "support.kb.author",
  SUPPORT_KB_APPROVE: "support.kb.approve",
  SUPPORT_KB_PUBLISH: "support.kb.publish",
  SUPPORT_FAQ_MANAGE: "support.faq.manage",
  SUPPORT_TEMPLATES_MANAGE: "support.templates.manage",
  SUPPORT_SLA_CONFIGURE: "support.sla.configure",
  SUPPORT_ESCALATION_CONFIGURE: "support.escalation.configure",
  SUPPORT_DEPARTMENTS_MANAGE: "support.departments.manage",
  SUPPORT_QA_REVIEW: "support.qa.review",
  SUPPORT_REPORTS_VIEW: "support.reports.view",

  // MUV AI Engineering Execution — Sprint 2 (Source Registry). First keys of
  // the Knowledge Factory permission namespace (V4). Distinct from every
  // existing "knowledge.*"-adjacent concept — this governs the Factory's own
  // Canonical Source Layer, not Module 1's KnowledgeItem content itself.
  KNOWLEDGE_FACTORY_SOURCE_VIEW: "knowledge_factory.source.view",
  KNOWLEDGE_FACTORY_SOURCE_MANAGE: "knowledge_factory.source.manage",
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_DASHBOARD: Record<string, string> = {
  [SALES_ROLES.FOUNDER]: "/dashboard/founder",
  [SALES_ROLES.SALES_MANAGER]: "/dashboard/sales-manager",
  [SALES_ROLES.SALES_OFFICER]: "/dashboard/sales-officer",
  // Was "/dashboard/institutional" (the older, thinner legacy shell page) —
  // corrected to the real, fully-built Institutional Sales OS entry point
  // (app/os/sales/page.tsx), which the role was never actually routed to
  // post-login despite it already existing with a real dashboard, visits,
  // samples, quotations, planner, tasks, expenses, and reports.
  [SALES_ROLES.INSTITUTIONAL]: "/os/sales",
  [SALES_ROLES.SUPPORT]: "/dashboard/support",
};
