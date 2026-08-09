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
  | "notifications";
export type SurfaceItem = {
  slug: string;
  en: string;
  hi: string;
  icon: string;
  kind: SurfaceKind;
  permission?: string;
  ownerOnly?: string;
  readOnly?: boolean;
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
  item("returns", "Returns", "वापसी", "↩", "orders"),
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
const manager: SurfaceItem[] = [
  item(
    "my-day",
    "My daily working",
    "मेरा दैनिक कार्य",
    "◷",
    "field",
    "manager_field:operate",
  ),
  item(
    "retailing",
    "Retailing",
    "रिटेलिंग",
    "□",
    "field",
    "manager_field:operate",
  ),
  item(
    "joint-working",
    "Joint working",
    "संयुक्त कार्य",
    "⇄",
    "field",
    "joint_work:participate",
  ),
  item(
    "partner-visits",
    "Distributor / S.S. visits",
    "वितरक / एस.एस. विज़िट",
    "⌖",
    "field",
    "manager_field:operate",
  ),
  item(
    "distributor-search",
    "Distributor search",
    "वितरक खोज",
    "◎",
    "prospects",
    "prospect:create",
  ),
  item(
    "collections",
    "Collections",
    "संग्रह",
    "₹",
    "finance",
    "payment_promise:create",
  ),
  item(
    "team-review",
    "Team review",
    "टीम समीक्षा",
    "♟",
    "team",
    "manager_team:view",
  ),
  item(
    "team",
    "Team & executives",
    "टीम और अधिकारी",
    "♟",
    "team",
    "manager_team:view",
  ),
  item(
    "attendance",
    "Attendance",
    "उपस्थिति",
    "◴",
    "field",
    "manager_team:view",
  ),
  item("visits", "Visits", "विज़िट", "⌖", "field", "manager_team:view"),
  item(
    "targets",
    "Targets",
    "लक्ष्य",
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
    "prospects",
    "Prospects",
    "संभावनाएँ",
    "◇",
    "prospects",
    "prospect:create",
  ),
  item(
    "ta-verification",
    "TA verification",
    "यात्रा भत्ता सत्यापन",
    "✓",
    "travel",
    "ta_claim:verify",
  ),
  item(
    "approvals",
    "Approvals",
    "अनुमोदन",
    "✓",
    "approvals",
    "manager_approval:decide",
  ),
  item("alerts", "Alerts", "चेतावनी", "!", "automation"),
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
  item(
    "ta-expenses",
    "TA & expenses",
    "यात्रा भत्ता और खर्च",
    "⌁",
    "travel",
    "ta_claim:view_self",
  ),
  item("sync", "Offline & sync", "ऑफ़लाइन और सिंक", "⇅", "automation"),
  shared.notifications,
  shared.profile,
];
const distributor: SurfaceItem[] = [
  item(
    "orders",
    "Orders & inbox",
    "ऑर्डर और इनबॉक्स",
    "▤",
    "orders",
    "distributor_orders:view",
  ),
  item(
    "fulfilment",
    "Retailer fulfilment",
    "खुदरा पूर्ति",
    "✓",
    "orders",
    "distributor_orders:fulfil",
  ),
  item(
    "inventory",
    "Inventory",
    "इन्वेंटरी",
    "▦",
    "inventory",
    "distributor_inventory:view",
  ),
  item(
    "incoming-stock",
    "Incoming stock",
    "आने वाला स्टॉक",
    "↓",
    "inventory",
    "distributor_inventory:view",
  ),
  item(
    "stock-movements",
    "Stock movement",
    "स्टॉक गतिविधि",
    "⇄",
    "inventory",
    "distributor_inventory:view",
  ),
  item(
    "stock-reconciliation",
    "Stock reconciliation",
    "स्टॉक मिलान",
    "✓",
    "inventory",
    "distributor_inventory:reconcile",
  ),
  item(
    "replenishment",
    "Replenishment",
    "पुनःपूर्ति",
    "↻",
    "orders",
    "distributor_replenishment:create",
  ),
  item(
    "deliveries",
    "Deliveries",
    "डिलीवरी",
    "▣",
    "deliveries",
    "distributor_orders:view",
  ),
  item(
    "returns-damage",
    "Returns & damage",
    "वापसी और नुकसान",
    "↩",
    "inventory",
    "distributor_inventory:view",
  ),
  item(
    "credit",
    "Credit",
    "क्रेडिट",
    "△",
    "finance",
    "distributor_credit:view",
  ),
  item(
    "outstanding",
    "Outstanding",
    "बकाया",
    "₹",
    "finance",
    "distributor_credit:view",
  ),
  item("ledgers", "Ledger", "खाता", "▥", "finance", "ledger:view"),
  item(
    "payments",
    "Payments",
    "भुगतान",
    "₹",
    "finance",
    "payment_proof:create",
  ),
  shared.documents,
  item("claims", "Claims", "दावे", "◇", "claims", "distributor_claims:manage"),
  item(
    "reports",
    "Reports",
    "रिपोर्ट",
    "▨",
    "analytics",
    "distributor_orders:view",
  ),
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
  item(
    "company-orders",
    "Company orders",
    "कंपनी ऑर्डर",
    "▤",
    "orders",
    "company_replenishment:create",
  ),
  item(
    "receipts",
    "Incoming receipts",
    "आने वाली प्राप्ति",
    "↓",
    "inventory",
    "super_stockist_inventory:view",
  ),
  item(
    "inventory",
    "Inventory",
    "इन्वेंटरी",
    "▦",
    "inventory",
    "super_stockist_inventory:view",
  ),
  item(
    "distributor-orders",
    "Distributor orders",
    "वितरक ऑर्डर",
    "▤",
    "orders",
    "super_stockist_orders:view",
  ),
  item(
    "allocation",
    "Allocation",
    "आवंटन",
    "⇄",
    "inventory",
    "super_stockist_orders:fulfil",
  ),
  item(
    "dispatch",
    "Dispatch",
    "डिस्पैच",
    "↑",
    "deliveries",
    "super_stockist_orders:fulfil",
  ),
  item(
    "delivery",
    "Delivery",
    "डिलीवरी",
    "▣",
    "deliveries",
    "super_stockist_orders:view",
  ),
  item(
    "credit",
    "Distributor credit",
    "वितरक क्रेडिट",
    "△",
    "finance",
    "partner_credit:enforce",
  ),
  item(
    "collections",
    "Collections",
    "संग्रह",
    "₹",
    "finance",
    "payment_promise:create",
  ),
  item("outstanding", "Outstanding", "बकाया", "₹", "finance", "ledger:view"),
  item("ledger", "Ledger", "खाता", "▥", "finance", "ledger:view"),
  item(
    "returns-damage",
    "Returns & adjustment",
    "वापसी और समायोजन",
    "↩",
    "inventory",
    "super_stockist_inventory:view",
  ),
  item(
    "stock-reconciliation",
    "Stock reconciliation",
    "स्टॉक मिलान",
    "✓",
    "inventory",
    "super_stockist_inventory:reconcile",
  ),
  shared.documents,
  item(
    "reports",
    "Reports",
    "रिपोर्ट",
    "▨",
    "analytics",
    "super_stockist_orders:view",
  ),
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
