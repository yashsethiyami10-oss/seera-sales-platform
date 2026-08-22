import type { UiLanguage } from "@prisma/client";

export type SurfaceKind =
  | "orders"
  | "partners"
  | "retailers"
  | "inventory"
  | "deliveries"
  | "finance"
  | "documents"
  | "field"
  | "team"
  | "prospects"
  | "approvals"
  | "claims"
  | "travel"
  | "analytics"
  | "automation"
  | "masters"
  | "audit"
  | "employee"
  | "instructions"
  | "notifications"
  | "manufacturing";
export type SurfaceItem = {
  slug: string;
  en: string;
  hi: string;
  icon: string;
  kind: SurfaceKind;
  permission?: string;
  ownerOnly?: string;
  readOnly?: boolean;
  group?: [string, string];
};

const item = (
  slug: string,
  en: string,
  hi: string,
  icon: string,
  kind: SurfaceKind,
  permission?: string,
  ownerOnly?: string,
): SurfaceItem => ({ slug, en, hi, icon, kind, permission, ownerOnly });
const g = (group: [string, string], surfaceItem: SurfaceItem): SurfaceItem => ({ ...surfaceItem, group });
const shared = {
  documents: item(
    "documents",
    "Documents",
    "दस्तावेज़",
    "▧",
    "documents",
    "document:view_scoped",
  ),
  analytics: item(
    "analytics",
    "Analytics",
    "विश्लेषण",
    "◫",
    "analytics",
    "field_reports:view_self",
  ),
  notifications: item(
    "notifications",
    "Notifications",
    "सूचनाएँ",
    "◉",
    "notifications",
    "notifications:view",
  ),
  profile: item("profile", "Profile", "प्रोफ़ाइल", "○", "notifications"),
};

const founder: SurfaceItem[] = [
  item("sales", "Sales overview", "बिक्री अवलोकन", "↗", "orders"),
  item("orders", "Orders", "ऑर्डर", "▤", "orders"),
  item("delivered-sales", "Delivered sales", "वितरित बिक्री", "✓", "orders"),
  // STAGE 14: removed the Founder "Returns" nav item — it had no dedicated render branch anywhere
  // (fell through to the generic item.kind==="orders" handler, which just re-shows the same order
  // list "Orders" already shows, under a misleading "Returns" label with zero real returns data).
  // Founder decision: "No routine Company return program. Only Distributor Closure Stock
  // Settlement" — see DistributorClosureSettlementPanel (wired into the Distributor detail page)
  // for the actual governed mechanism. The real Retailer->Distributor return-request feature
  // (returns-service.ts, reachable via the distributor/super-stockist portals' "returns-damage"
  // slug) is unrelated and untouched — that's a normal, ongoing retail operation, not a "Company
  // return program".
  item("collections", "Collections", "संग्रह", "₹", "finance"),
  item(
    "super-stockists",
    "Super Stockists",
    "सुपर स्टॉकिस्ट",
    "◆",
    "partners",
    "network:manage",
  ),
  item(
    "distributors",
    "Distributors",
    "वितरक",
    "◇",
    "partners",
    "network:manage",
  ),
  item(
    "retailers",
    "Retailers",
    "खुदरा विक्रेता",
    "□",
    "retailers",
    "network:manage",
  ),
  // Final Retailer Cleanup + Handover (22-Aug): one-time governed worklist so the Founder can
  // archive/hard-delete every test/UAT retailer through the real app (production DB writes are
  // categorically blocked outside it — see lib/database/identity-guard.ts) before team handover.
  item(
    "retailer-cleanup",
    "Retailer Cleanup",
    "रिटेलर क्लीनअप",
    "⌫",
    "retailers",
    "master:manage",
  ),
  item(
    "prospects",
    "Distributor prospects",
    "वितरक संभावनाएँ",
    "◎",
    "prospects",
    "prospect:create",
  ),
  item("network-stock", "Network stock", "नेटवर्क स्टॉक", "▦", "inventory"),
  item("field-force", "Field force", "फील्ड टीम", "♟", "team"),
  item("daily-working", "Daily working", "दैनिक कार्य", "◷", "field"),
  item("attendance", "Attendance", "उपस्थिति", "◴", "field"),
  item("visits", "Visits", "विज़िट", "⌖", "field"),
  item("joint-working", "Joint working", "संयुक्त कार्य", "⇄", "field"),
  item(
    "territories",
    "Territories & beats",
    "क्षेत्र और बीट",
    "⌘",
    "masters",
    "master:manage",
  ),
  item(
    "outstanding",
    "Outstanding",
    "बकाया",
    "₹",
    "finance",
    "finance_dashboard:view",
  ),
  item("ageing", "Ageing", "एजिंग", "◷", "finance", "finance_dashboard:view"),
  item("ledgers", "Ledgers", "खाते", "▥", "finance", "ledger:view"),
  // STAGE 13: read-only, network-wide Distributor credit oversight — S.S. governs its own
  // Distributors' credit terms (see the "credit" item in the stockist array below, gated on
  // partner_credit:enforce with a CreditPolicyPanel edit form); Founder gets visibility only, no
  // edit surface, backed by founderDistributorCreditOversight() in credit-service.ts.
  item("distributor-credit", "Distributor credit (read-only)", "वितरक क्रेडिट (केवल-पठन)", "△", "finance", "finance_dashboard:view"),
  // SEERA COMPANY FINANCE OS — Founder Financial Command Center. Its own
  // Chart-of-Accounts general ledger, distinct from the party-to-party
  // Ledgers/Outstanding/Payments items above (which remain the Company<->S.S./
  // Distributor/Retailer commercial subledger and are untouched).
  item("finance-os", "Finance", "वित्त", "₹", "finance", "financial_statements:view"),
  // MONEY DESK — guided transaction entry built on top of Finance OS above,
  // not a replacement. Separate nav slot, separate (narrower) permission —
  // an operator with only money_desk:view never needs financial_statements:view.
  item("money-desk", "Money Desk", "मनी डेस्क", "▣", "finance", "money_desk:view"),
  // SEERA MANUFACTURING OS — first-class module inside the existing
  // Founder/Admin portal (spec §2), sharing the same panel component the
  // dedicated Manufacturing portal below uses, permission-scoped identically.
  item("manufacturing-os", "Manufacturing", "विनिर्माण", "⚙", "manufacturing", "mfg_ledger:view"),
  item("payments", "Payments", "भुगतान", "₹", "finance", "payment:review"),
  item("claims", "Claims", "दावे", "◇", "claims", "claim_settlement:manage"),
  item(
    "ta-expenses",
    "TA & expenses",
    "यात्रा भत्ता और खर्च",
    "⌁",
    "travel",
    "ta_claim:approve",
  ),
  shared.documents,
  item("reports", "Reports & exports", "रिपोर्ट और निर्यात", "▨", "analytics"),
  shared.analytics,
  item(
    "automations",
    "Automation & alerts",
    "स्वचालन और चेतावनी",
    "⚡",
    "automation",
  ),
  item(
    "approvals",
    "Approvals",
    "अनुमोदन",
    "✓",
    "approvals",
    "approval:decide",
  ),
  item("users", "Users", "उपयोगकर्ता", "◉", "masters", "user:view"),
  item(
    "roles",
    "Roles & permissions",
    "भूमिकाएँ और अनुमतियाँ",
    "◇",
    "masters",
    "role:view",
  ),
  item(
    "masters",
    "Masters & pricing",
    "मास्टर और मूल्य",
    "▦",
    "masters",
    "master:manage",
  ),
  item("settings", "Settings", "सेटिंग्स", "⚙", "masters", "settings:view"),
  item("audit", "Audit", "ऑडिट", "▤", "audit", "audit:view"),
  item(
    "system",
    "System authority",
    "सिस्टम प्राधिकरण",
    "◆",
    "audit",
    "system:super_admin",
    "system:super_admin",
  ),
  shared.notifications,
  shared.profile,
];

const accounts: SurfaceItem[] = [
  item("finance-os", "Finance", "वित्त", "₹", "finance", "financial_statements:view"),
  // MONEY DESK — guided transaction entry built on top of Finance OS above,
  // not a replacement. Separate nav slot, separate (narrower) permission —
  // an operator with only money_desk:view never needs financial_statements:view.
  item("money-desk", "Money Desk", "मनी डेस्क", "▣", "finance", "money_desk:view"),
  item("payments", "Payments", "भुगतान", "₹", "finance", "payment:review"),
  item(
    "receipts",
    "Receipts",
    "रसीदें",
    "▧",
    "documents",
    "document:view_scoped",
  ),
  item(
    "payment-inbox",
    "Payment inbox",
    "भुगतान इनबॉक्स",
    "◉",
    "finance",
    "payment:review",
  ),
  item(
    "company-order-dispatch",
    "Company order dispatch",
    "कंपनी ऑर्डर डिस्पैच",
    "↑",
    "orders",
    "company_replenishment:dispatch",
  ),
  item("ledgers", "Ledgers", "खाते", "▥", "finance", "ledger:view"),
  item(
    "outstanding",
    "Outstanding",
    "बकाया",
    "₹",
    "finance",
    "finance_dashboard:view",
  ),
  item("ageing", "Ageing", "एजिंग", "◷", "finance", "finance_dashboard:view"),
  item(
    "allocations",
    "Allocations",
    "आवंटन",
    "⇄",
    "finance",
    "payment:allocate",
  ),
  item(
    "reconciliation",
    "Reconciliation",
    "मिलान",
    "✓",
    "finance",
    "reconciliation:manage",
  ),
  item("claims", "Claims", "दावे", "◇", "claims", "claim_settlement:manage"),
  item(
    "credit-exposure",
    "Credit exposure",
    "क्रेडिट जोखिम",
    "△",
    "finance",
    "finance_dashboard:view",
  ),
  item(
    "credit-exceptions",
    "Credit exceptions",
    "क्रेडिट अपवाद",
    "!",
    "approvals",
    "credit_extension:approve",
  ),
  item("reversals", "Reversals", "रिवर्सल", "↩", "finance", "ledger:reverse"),
  item(
    "ta-expenses",
    "TA & expenses",
    "यात्रा भत्ता और खर्च",
    "⌁",
    "travel",
    "ta_claim:approve",
  ),
  shared.documents,
  item(
    "reports",
    "Reports",
    "रिपोर्ट",
    "▨",
    "analytics",
    "finance_dashboard:view",
  ),
  item("audit", "Audit", "ऑडिट", "▤", "audit", "audit:view"),
  shared.notifications,
  shared.profile,
];
const G = {
  myDay: ["MY DAY", "मेरा दिन"] as [string, string],
  beatPlanning: ["BEAT PLANNING", "बीट योजना"] as [string, string],
  team: ["TEAM", "टीम"] as [string, string],
  fieldWorking: ["FIELD WORKING", "फील्ड कार्य"] as [string, string],
  sales: ["SALES", "बिक्री"] as [string, string],
  followUps: ["FOLLOW-UPS", "फॉलो-अप"] as [string, string],
  distributorOversight: ["DISTRIBUTORS", "वितरक"] as [string, string],
  ssOrders: ["DISTRIBUTOR ORDERS", "वितरक ऑर्डर"] as [string, string],
  ssStock: ["STOCK", "स्टॉक"] as [string, string],
  ssCompanyOrders: ["ORDER FROM COMPANY", "कंपनी से ऑर्डर"] as [string, string],
  ssDistributors: ["DISTRIBUTORS", "वितरक"] as [string, string],
  ssBilling: ["BILLING & PAYMENTS", "बिलिंग और भुगतान"] as [string, string],
  ssMore: ["MORE", "अधिक"] as [string, string],
  distOrders: ["ORDERS", "ऑर्डर"] as [string, string],
  distStock: ["STOCK", "स्टॉक"] as [string, string],
  distOrderFromSS: ["ORDER FROM S.S.", "S.S. से ऑर्डर"] as [string, string],
  distMoney: ["MONEY", "पैसा"] as [string, string],
  distMore: ["MORE", "अधिक"] as [string, string],
  attendanceApprovals: ["ATTENDANCE & APPROVALS", "उपस्थिति और अनुमोदन"] as [string, string],
  taTravel: ["TA & TRAVEL", "यात्रा भत्ता"] as [string, string],
};
const manager: SurfaceItem[] = [
  g(G.myDay, item("my-day", "My daily working", "मेरा दैनिक कार्य", "◷", "field", "manager_field:operate")),
  g(G.beatPlanning, item("beat-planner", "Beat & route planner", "बीट और मार्ग योजना", "⌘", "field", "network:manage")),
  g(G.fieldWorking, item("retailing", "Manager retailing", "मैनेजर रिटेलिंग", "□", "field", "manager_field:operate")),
  g(G.fieldWorking, item("joint-working", "Joint working", "संयुक्त कार्य", "⇄", "field", "joint_work:participate")),
  g(G.fieldWorking, item("partner-visits", "Distributor / S.S. visits", "वितरक / एस.एस. विज़िट", "⌖", "field", "manager_field:operate")),
  g(G.fieldWorking, item("distributor-search", "Distributor search", "वितरक खोज", "◎", "prospects", "prospect:create")),
  g(G.distributorOversight, item("distributor-oversight", "Distributors", "वितरक", "◇", "partners", "network:manage")),
  g(G.sales, item("delivered-sales", "Delivered sales", "वितरित बिक्री", "✓", "orders", "field_reports:view_self")),
  g(G.followUps, item("collections", "Collections", "संग्रह", "₹", "finance", "payment_promise:create")),
  g(G.team, item("team-review", "Team review", "टीम समीक्षा", "♟", "team", "manager_team:view")),
  g(G.team, item("team", "Team & executives", "टीम और अधिकारी", "♟", "team", "manager_team:view")),
  g(G.team, item("dsr", "Team DSR", "टीम डीएसआर", "▨", "field", "manager_team:view")),
  g(G.team, item("new-retailers", "New retailers", "नए रिटेलर", "□", "retailers", "manager_team:view")),
  g(G.team, item("photo-compliance", "Photo compliance", "फोटो अनुपालन", "▧", "field", "manager_team:view")),
  g(G.team, item("visits", "Visits", "विज़िट", "⌖", "field", "manager_team:view")),
  g(G.team, item("alerts", "Exceptions", "अपवाद", "!", "automation")),
  g(G.attendanceApprovals, item("attendance", "Attendance", "उपस्थिति", "◴", "field", "manager_team:view")),
  g(G.attendanceApprovals, item("approvals", "Approvals", "अनुमोदन", "✓", "approvals", "manager_approval:decide")),
  g(G.taTravel, item("my-ta", "My Travel", "मेरी यात्रा", "⌁", "travel", "field_reports:view_self")),
  g(G.taTravel, item("ta-verification", "Team TA verification", "टीम टीए सत्यापन", "✓", "travel", "ta_claim:verify")),
  item("instructions", "Team instructions", "टीम निर्देश", "✎", "instructions", "manager_instruction:manage"),
  item("my-salary", "My salary", "मेरा वेतन", "₹", "employee"),
  item("employment-policy", "My employment / field policy", "मेरी रोजगार / फील्ड नीति", "§", "employee"),
  shared.analytics,
  shared.documents,
  shared.notifications,
  shared.profile,
];
const executive: SurfaceItem[] = [
  item(
    "today",
    "Today / Start day",
    "आज / दिन शुरू",
    "◷",
    "field",
    "field_day:manage_self",
  ),
  item(
    "beat",
    "Beat & route",
    "बीट और मार्ग",
    "⌘",
    "field",
    "field_day:manage_self",
  ),
  item(
    "retailers",
    "Retailers",
    "खुदरा विक्रेता",
    "□",
    "retailers",
    "retailer:visit",
  ),
  item("orders", "Orders", "ऑर्डर", "▤", "orders", "retailer:order"),
  item(
    "collections",
    "Collections",
    "संग्रह",
    "₹",
    "finance",
    "collection:create",
  ),
  item(
    "prospects",
    "Distributor search",
    "वितरक खोज",
    "◎",
    "prospects",
    "prospect:create",
  ),
  item(
    "targets",
    "Target progress",
    "लक्ष्य प्रगति",
    "◎",
    "analytics",
    "field_reports:view_self",
  ),
  item(
    "delivered-sales",
    "Delivered sales",
    "वितरित बिक्री",
    "✓",
    "orders",
    "field_reports:view_self",
  ),
  item(
    "dsr",
    "DSR & history",
    "डीएसआर और इतिहास",
    "▨",
    "field",
    "field_reports:view_self",
  ),
  item("instructions", "My instructions", "मेरे निर्देश", "✎", "instructions", "field_day:manage_self"),
  item("ta-expenses", "My Travel", "मेरी यात्रा", "⌁", "travel", "field_reports:view_self"),
  item("my-salary", "My salary", "मेरा वेतन", "₹", "employee"),
  item("employment-policy", "My employment / field policy", "मेरी रोजगार / फील्ड नीति", "§", "employee"),
  item("sync", "Offline & sync", "ऑफ़लाइन और सिंक", "⇅", "automation"),
  shared.notifications,
  shared.profile,
];
const distributor: SurfaceItem[] = [
  g(G.distOrders, item("fulfilment", "Orders", "ऑर्डर", "✓", "orders", "distributor_orders:fulfil")),
  g(G.distOrders, item("orders", "Orders & inbox (advanced)", "ऑर्डर और इनबॉक्स (उन्नत)", "▤", "orders", "distributor_orders:view")),
  g(G.distStock, item("inventory", "Stock", "स्टॉक", "▦", "inventory", "distributor_inventory:view")),
  g(G.distStock, item("incoming-stock", "Incoming stock", "आने वाला स्टॉक", "↓", "inventory", "distributor_inventory:view")),
  g(G.distOrderFromSS, item("replenishment", "Order from S.S.", "S.S. से ऑर्डर करें", "↻", "orders", "distributor_replenishment:create")),
  g(G.distMoney, item("credit", "Money", "पैसा", "₹", "finance", "distributor_credit:view")),
  g(G.distMore, item("outstanding", "Outstanding (advanced)", "बकाया (उन्नत)", "₹", "finance", "distributor_credit:view")),
  g(G.distMore, item("payments", "Payments (advanced)", "भुगतान (उन्नत)", "₹", "finance", "payment_proof:create")),
  g(G.distMore, item("ledgers", "Ledger (advanced)", "खाता (उन्नत)", "▥", "finance", "ledger:view")),
  g(G.distMore, item("retailers", "Retailers", "रिटेलर", "□", "retailers", "distributor_orders:view")),
  g(G.distMore, item("deliveries", "Delivery history", "डिलीवरी इतिहास", "▣", "deliveries", "distributor_orders:view")),
  g(G.distMore, item("returns-damage", "Returns & damage", "वापसी और नुकसान", "↩", "inventory", "distributor_inventory:view")),
  g(G.distMore, item("stock-movements", "Advanced stock movement", "उन्नत स्टॉक गतिविधि", "⇄", "inventory", "distributor_inventory:view")),
  g(G.distMore, item("stock-reconciliation", "Stock reconciliation", "स्टॉक मिलान", "✓", "inventory", "distributor_inventory:reconcile")),
  g(G.distMore, item("claims", "Claims", "दावे", "◇", "claims", "distributor_claims:manage")),
  g(G.distMore, item("quotations", "Quotations", "कोटेशन", "▧", "documents", "document:create")),
  g(G.distMore, item("billing", "Billing", "बिलिंग", "▤", "documents", "document:create")),
  g(G.distMore, item("billing-profile", "Billing Profile & Numbering", "बिलिंग प्रोफ़ाइल और नंबरिंग", "☰", "documents", "document:create")),
  g(G.distMore, shared.documents),
  g(G.distMore, item("reports", "Reports", "रिपोर्ट", "▨", "analytics", "distributor_orders:view")),
  shared.notifications,
  shared.profile,
];
const delivery: SurfaceItem[] = [
  item(
    "deliveries",
    "Today’s deliveries",
    "आज की डिलीवरी",
    "▣",
    "deliveries",
    "distributor_delivery:execute",
  ),
  item(
    "route",
    "Route",
    "मार्ग",
    "⌘",
    "deliveries",
    "distributor_delivery:execute",
  ),
  item(
    "pending",
    "Pending deliveries",
    "लंबित डिलीवरी",
    "◷",
    "deliveries",
    "distributor_delivery:execute",
  ),
  item(
    "sync",
    "Offline & sync",
    "ऑफ़लाइन और सिंक",
    "⇅",
    "automation",
    "distributor_delivery:execute",
  ),
  shared.notifications,
  shared.profile,
];
const stockist: SurfaceItem[] = [
  g(G.ssOrders, item("distributor-orders", "Distributor orders", "वितरक ऑर्डर", "▤", "orders", "super_stockist_orders:view")),
  g(G.ssOrders, item("dispatch", "Dispatch", "डिस्पैच", "↑", "deliveries", "super_stockist_orders:fulfil")),
  g(G.ssStock, item("inventory", "Stock", "स्टॉक", "▦", "inventory", "super_stockist_inventory:view")),
  g(G.ssCompanyOrders, item("company-orders", "Order from Company", "कंपनी से ऑर्डर करें", "▤", "orders", "company_replenishment:create")),
  g(G.ssDistributors, item("distributors", "Distributors", "वितरक", "◇", "partners", "super_stockist_orders:view")),
  g(G.ssDistributors, item("credit", "Distributor credit", "वितरक क्रेडिट", "△", "finance", "partner_credit:enforce")),
  g(G.ssBilling, item("quotations", "Quotations", "कोटेशन", "▧", "documents", "document:create")),
  g(G.ssBilling, item("billing", "GST billing", "जीएसटी बिलिंग", "▤", "documents", "document:create")),
  g(G.ssBilling, item("billing-profile", "Billing Profile & Numbering", "बिलिंग प्रोफ़ाइल और नंबरिंग", "☰", "documents", "document:create")),
  g(G.ssBilling, item("payments", "Payments", "भुगतान", "₹", "finance", "payment_proof:create")),
  g(G.ssBilling, item("collections", "Collections", "संग्रह", "₹", "finance", "payment_promise:create")),
  g(G.ssBilling, item("outstanding", "Outstanding", "बकाया", "₹", "finance", "ledger:view")),
  g(G.ssMore, item("receipts", "Incoming receipts", "आने वाली प्राप्ति", "↓", "inventory", "super_stockist_inventory:view")),
  g(G.ssMore, item("allocation", "Allocation (advanced)", "आवंटन (उन्नत)", "⇄", "inventory", "super_stockist_orders:fulfil")),
  g(G.ssMore, item("delivery", "Delivery history", "डिलीवरी इतिहास", "▣", "deliveries", "super_stockist_orders:view")),
  g(G.ssMore, item("ledger", "Ledger (advanced)", "खाता (उन्नत)", "▥", "finance", "ledger:view")),
  g(G.ssMore, item("returns-damage", "Returns & adjustment", "वापसी और समायोजन", "↩", "inventory", "super_stockist_inventory:view")),
  g(G.ssMore, item("stock-reconciliation", "Stock reconciliation", "स्टॉक मिलान", "✓", "inventory", "super_stockist_inventory:reconcile")),
  g(G.ssMore, item("claims", "Claims", "दावे", "◇", "claims", "distributor_claims:manage")),
  g(G.ssMore, shared.documents),
  g(G.ssMore, item("reports", "Reports", "रिपोर्ट", "▨", "analytics", "super_stockist_orders:view")),
  shared.notifications,
  shared.profile,
];
const retailer: SurfaceItem[] = [
  item("orders", "Orders", "ऑर्डर", "▤", "orders"),
  item(
    "order-history",
    "Order history & status",
    "ऑर्डर इतिहास और स्थिति",
    "◷",
    "orders",
  ),
  shared.documents,
  item("outstanding", "Outstanding", "बकाया", "₹", "finance"),
  item("reorder", "Reorder", "फिर से ऑर्डर", "↻", "orders"),
  shared.notifications,
  shared.profile,
];
// Dedicated Manufacturing portal (spec §2) — one item, permission-gated by
// mfg_ledger:view (every Manufacturing role has it), sharing the exact same
// ManufacturingWorkspacePanel the Founder nav item above renders. Role-scoped
// sections inside the panel (Operator sees far less than Manager) rather than
// a separate SurfaceItem set per role, mirroring the Finance OS pattern.
const manufacturing: SurfaceItem[] = [
  item("manufacturing-os", "Manufacturing", "विनिर्माण", "⚙", "manufacturing", "mfg_ledger:view"),
  shared.notifications,
  shared.profile,
];
const auditor: SurfaceItem[] = [
  item("audit", "Activity log", "गतिविधि लॉग", "▤", "audit", "audit:view"),
  item(
    "financial-audit",
    "Financial audit",
    "वित्तीय ऑडिट",
    "₹",
    "finance",
    "audit:view",
  ),
  item(
    "stock-audit",
    "Stock audit",
    "स्टॉक ऑडिट",
    "▦",
    "inventory",
    "audit:view",
  ),
  item(
    "security-audit",
    "Security & access",
    "सुरक्षा और पहुँच",
    "◆",
    "audit",
    "audit:view",
  ),
  item(
    "reports",
    "Read-only reports",
    "केवल-पठन रिपोर्ट",
    "▨",
    "analytics",
    "audit:view",
  ),
  shared.notifications,
  shared.profile,
];

export function surfaceItems(
  portal: string,
  permissions: Set<string>,
): SurfaceItem[] {
  const deliveryOnly =
    portal === "distributor" &&
    permissions.has("distributor_delivery:execute") &&
    !permissions.has("distributor_orders:view");
  const source =
    portal === "founder-admin" || portal === "company-admin"
      ? founder
      : portal === "accounts"
        ? accounts
        : portal === "sales-manager"
          ? manager
          : portal === "sales-executive"
            ? executive
            : portal === "distributor"
              ? deliveryOnly
                ? delivery
                : distributor
              : portal === "super-stockist"
                ? stockist
                : portal === "retailer"
                  ? retailer
                  : portal === "auditor"
                    ? auditor
                    : portal === "manufacturing"
                      ? manufacturing
                      : [];
  return source.filter(
    (x) =>
      (!x.permission ||
        permissions.has(x.permission) ||
        permissions.has("system:super_admin")) &&
      (!x.ownerOnly || permissions.has(x.ownerOnly)),
  );
}
export function surfaceItem(
  portal: string,
  slug: string,
  permissions: Set<string>,
) {
  return surfaceItems(portal, permissions).find((x) => x.slug === slug);
}
export function surfaceLabel(item: SurfaceItem, language: UiLanguage) {
  return language === "HI" ? item.hi : item.en;
}
