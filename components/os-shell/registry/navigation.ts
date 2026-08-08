import {
  Users, Building2, Map as MapIcon, Settings2, LayoutDashboard, Target, Briefcase,
  MapPinned, FlaskConical, PhoneCall, FileText, ListChecks, CalendarDays, Receipt, BarChart3,
  Package, ClipboardCheck, Factory, Truck, Beaker, ShieldCheck, Landmark, LifeBuoy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PERMISSIONS } from "@/lib/sales/constants";
import type { AppId, ModuleId } from "./types";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Navigation Registration
 * Model (Manifest Architecture §3).
 *
 * `NavManifestEntry` is the data shape an App manifest will contribute to
 * the Sidebar/Command Palette once real Apps exist (none do yet — see
 * `getNavRegistry` below). Every field traces to §3: `ownerAppId`/
 * `ownerModuleId` record who owns the entry (§2's ownership rule);
 * `requiredPermission` is the declarative-only visibility hook §3 requires
 * (never App-computed logic); `placement` is §3's "primary sidebar group,
 * secondary/overflow, or hidden-but-directly-linkable" distinction.
 */
export type NavPlacement = "primary" | "secondary" | "hidden";

export interface NavManifestEntry {
  /** Unique within the owning App — not necessarily globally unique. */
  id: string;
  ownerAppId: AppId;
  /** Omitted for a top-level, App-owned entry (§3: "or the App itself"). */
  ownerModuleId?: ModuleId;
  label: string;
  icon: LucideIcon;
  /** Must be a safe, internal path — validated by whatever renders it, mirroring `lib/auth/safe-path.ts`'s existing rule for other redirect targets. */
  href: string;
  /** Sidebar section this entry groups under. Omitted entries render ungrouped. */
  group?: string;
  placement: NavPlacement;
  /** A declarative reference only — never executed logic (§3). `undefined` means always visible. */
  requiredPermission?: string;
  /** Lower sorts first within its group. Entries with equal order keep registration order. */
  order?: number;
}

const MASTER_DATA_APP_ID = "master-data" as AppId;
const INST_SALES_APP_ID = "inst-sales" as AppId;
const ORDER_MGMT_APP_ID = "order-mgmt" as AppId;
const MANUFACTURING_APP_ID = "manufacturing" as AppId;
const FINANCE_APP_ID = "finance" as AppId;
const SUPPORT_APP_ID = "support" as AppId;

/**
 * Merges every registered App's navigation contributions into one list, for
 * the Sidebar and Command Palette to both read.
 *
 * Milestone 1 returned an empty list here — no App existed to contribute
 * anything real. Milestone 2 (Customer & Master Data Foundation) is the
 * first real content: five entries for the platform built this milestone.
 * Manifest Architecture §11's full `manifest.ts`-per-module aggregation
 * (dynamically collecting manifests from many independent App folders)
 * is still not implemented — with a single, first-party set of pages
 * rather than multiple independent Apps, that machinery has nothing real
 * to aggregate yet either; this hardcoded array is the honest equivalent
 * of a one-App manifest until a second App makes the aggregator worth
 * building.
 */
export function getNavRegistry(): readonly NavManifestEntry[] {
  return [
    {
      id: "customers", ownerAppId: MASTER_DATA_APP_ID, label: "Customers", icon: Users,
      href: "/os/customers", group: "Master Data", placement: "primary",
      requiredPermission: PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED, order: 0,
    },
    {
      id: "suppliers", ownerAppId: MASTER_DATA_APP_ID, label: "Suppliers", icon: Building2,
      href: "/os/suppliers", group: "Master Data", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_VENDOR_VIEW, order: 1,
    },
    {
      id: "employees", ownerAppId: MASTER_DATA_APP_ID, label: "Employees", icon: Users,
      href: "/os/employees", group: "Master Data", placement: "primary",
      requiredPermission: PERMISSIONS.USERS_VIEW, order: 2,
    },
    {
      id: "territories", ownerAppId: MASTER_DATA_APP_ID, label: "Territories", icon: MapIcon,
      href: "/os/territories", group: "Master Data", placement: "primary",
      requiredPermission: PERMISSIONS.TERRITORIES_MANAGE, order: 3,
    },
    {
      id: "masters", ownerAppId: MASTER_DATA_APP_ID, label: "Common Masters", icon: Settings2,
      href: "/os/masters", group: "Master Data", placement: "primary",
      requiredPermission: PERMISSIONS.MASTER_DATA_MANAGE, order: 4,
    },
    // Milestone 3 — Institutional Sales OS. A separate group, a separate
    // owning App id — isolated from the Master Data entries above by the
    // same manifest-ownership mechanism, not just by folder convention.
    {
      // No single dashboard permission covers all three role variants (each
      // of Founder/Manager/Officer holds its own inst_sales.dashboard.*
      // key, and NavManifestEntry only checks one) — gated on
      // reports.view instead, a permission all three tiers are actually
      // granted (see prisma/seed.ts), so this entry is hidden from anyone
      // with no real access to this App rather than shown unconditionally.
      id: "sales-dashboard", ownerAppId: INST_SALES_APP_ID, label: "Dashboard", icon: LayoutDashboard,
      href: "/os/sales", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_REPORTS_VIEW, order: 0,
    },
    {
      id: "sales-leads", ownerAppId: INST_SALES_APP_ID, label: "Leads", icon: Target,
      href: "/os/sales/leads", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_LEADS_VIEW_ASSIGNED, order: 1,
    },
    {
      id: "sales-opportunities", ownerAppId: INST_SALES_APP_ID, label: "Opportunities", icon: Briefcase,
      href: "/os/sales/opportunities", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_OPPORTUNITIES_VIEW_ASSIGNED, order: 2,
    },
    {
      id: "sales-visits", ownerAppId: INST_SALES_APP_ID, label: "Visits", icon: MapPinned,
      href: "/os/sales/visits", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_VISITS_MANAGE, order: 3,
    },
    {
      id: "sales-samples", ownerAppId: INST_SALES_APP_ID, label: "Samples", icon: FlaskConical,
      href: "/os/sales/samples", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_SAMPLES_MANAGE, order: 4,
    },
    {
      id: "sales-followups", ownerAppId: INST_SALES_APP_ID, label: "Follow-ups", icon: PhoneCall,
      href: "/os/sales/followups", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_FOLLOWUPS_MANAGE, order: 5,
    },
    {
      id: "sales-quotations", ownerAppId: INST_SALES_APP_ID, label: "Quotations", icon: FileText,
      href: "/os/sales/quotations", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_QUOTATIONS_VIEW, order: 6,
    },
    {
      id: "sales-tasks", ownerAppId: INST_SALES_APP_ID, label: "Tasks", icon: ListChecks,
      href: "/os/sales/tasks", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_TASKS_MANAGE, order: 7,
    },
    {
      id: "sales-planner", ownerAppId: INST_SALES_APP_ID, label: "Daily Planner", icon: CalendarDays,
      href: "/os/sales/planner", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_PLANNER_MANAGE, order: 8,
    },
    {
      id: "sales-expenses", ownerAppId: INST_SALES_APP_ID, label: "Expenses", icon: Receipt,
      href: "/os/sales/expenses", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_EXPENSES_SUBMIT, order: 9,
    },
    {
      id: "sales-reports", ownerAppId: INST_SALES_APP_ID, label: "Reports", icon: BarChart3,
      href: "/os/sales/reports", group: "Institutional Sales", placement: "primary",
      requiredPermission: PERMISSIONS.INST_REPORTS_VIEW, order: 10,
    },
    // Milestone 4 — Order Management OS. Its own top-level group (not
    // nested under Institutional Sales) since it's explicitly cross-channel
    // — the unified list surfaces both D2C and business orders together.
    {
      id: "orders", ownerAppId: ORDER_MGMT_APP_ID, label: "Orders", icon: Package,
      href: "/os/orders", group: "Order Management", placement: "primary",
      requiredPermission: PERMISSIONS.ORDER_MGMT_VIEW, order: 0,
    },
    // Milestone 5 — Operations Foundation. Same "Order Management" group as
    // the unified order list — Operations is the next stage an order moves
    // through, not a separate top-level concern yet.
    {
      id: "operations-queue", ownerAppId: ORDER_MGMT_APP_ID, label: "Operations Queue", icon: ClipboardCheck,
      href: "/os/operations", group: "Order Management", placement: "primary",
      requiredPermission: PERMISSIONS.BUSINESS_OPS_VIEW, order: 1,
    },
    // Milestone 7 — Manufacturing (Including Procurement). Its own top-level
    // group over the frozen Enterprise v3 Phase 1 domain — each entry gated
    // on the specific ENTERPRISE_*_VIEW permission for that sub-area, same
    // one-permission-per-entry convention as every other group above.
    {
      id: "manufacturing-dashboard", ownerAppId: MANUFACTURING_APP_ID, label: "Dashboard", icon: Factory,
      href: "/os/manufacturing", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_REPORTING_VIEW, order: 0,
    },
    {
      id: "manufacturing-suppliers", ownerAppId: MANUFACTURING_APP_ID, label: "Suppliers", icon: Truck,
      href: "/os/manufacturing/suppliers", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_VENDOR_VIEW, order: 1,
    },
    {
      id: "manufacturing-procurement", ownerAppId: MANUFACTURING_APP_ID, label: "Procurement", icon: ClipboardCheck,
      href: "/os/manufacturing/procurement", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, order: 2,
    },
    {
      id: "manufacturing-formulas", ownerAppId: MANUFACTURING_APP_ID, label: "Formula & BOM", icon: Beaker,
      href: "/os/manufacturing/formulas", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_FORMULA_VIEW, order: 3,
    },
    {
      id: "manufacturing-production", ownerAppId: MANUFACTURING_APP_ID, label: "Production", icon: Factory,
      href: "/os/manufacturing/production", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, order: 4,
    },
    {
      id: "manufacturing-quality", ownerAppId: MANUFACTURING_APP_ID, label: "Quality Control", icon: ShieldCheck,
      href: "/os/manufacturing/quality", group: "Manufacturing", placement: "primary",
      requiredPermission: PERMISSIONS.ENTERPRISE_QUALITY_VIEW, order: 5,
    },
    // Milestone 8 — Finance & Accounts. Its own top-level group over the
    // frozen Part 3C Enterprise Finance Platform — only the most-used areas
    // get a direct sidebar entry (the Dashboard's own tile grid is the hub
    // for the remaining ~13 Finance areas), matching every other group's
    // one-permission-per-entry convention above.
    {
      id: "finance-dashboard", ownerAppId: FINANCE_APP_ID, label: "Finance", icon: Landmark,
      href: "/os/finance", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_REPORTS_VIEW, order: 0,
    },
    {
      id: "finance-journals", ownerAppId: FINANCE_APP_ID, label: "Journals", icon: ClipboardCheck,
      href: "/os/finance/journals", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_JOURNALS_PREPARE, order: 1,
    },
    {
      id: "finance-receivables", ownerAppId: FINANCE_APP_ID, label: "Receivables", icon: Landmark,
      href: "/os/finance/receivables", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_RECEIVABLES_VIEW, order: 2,
    },
    {
      id: "finance-payables", ownerAppId: FINANCE_APP_ID, label: "Payables", icon: Landmark,
      href: "/os/finance/payables", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_PAYABLES_VIEW, order: 3,
    },
    {
      id: "finance-reports", ownerAppId: FINANCE_APP_ID, label: "Reports & Statements", icon: BarChart3,
      href: "/os/finance/reports", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_REPORTS_VIEW, order: 4,
    },
    {
      id: "finance-exceptions", ownerAppId: FINANCE_APP_ID, label: "Finance Exceptions", icon: ShieldCheck,
      href: "/os/finance/exceptions", group: "Finance", placement: "primary",
      requiredPermission: PERMISSIONS.FINANCE_REPORTS_VIEW, order: 5,
    },

    // Milestone 9 — Customer Support. Not all 10 routes get a top-level nav
    // entry — the Dashboard's own tile grid is the hub for Feedback,
    // Knowledge Base, FAQ, Templates, and Configuration, matching Finance's
    // own precedent above.
    {
      id: "support-dashboard", ownerAppId: SUPPORT_APP_ID, label: "Support", icon: LifeBuoy,
      href: "/os/support", group: "Support", placement: "primary",
      requiredPermission: PERMISSIONS.SUPPORT_REPORTS_VIEW, order: 0,
    },
    {
      id: "support-tickets", ownerAppId: SUPPORT_APP_ID, label: "Tickets", icon: ClipboardCheck,
      href: "/os/support/tickets", group: "Support", placement: "primary",
      requiredPermission: PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED, order: 1,
    },
    {
      id: "support-escalations", ownerAppId: SUPPORT_APP_ID, label: "Escalations", icon: ShieldCheck,
      href: "/os/support/escalations", group: "Support", placement: "primary",
      requiredPermission: PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED, order: 2,
    },
    {
      id: "support-reports", ownerAppId: SUPPORT_APP_ID, label: "Support Reports", icon: BarChart3,
      href: "/os/support/reports", group: "Support", placement: "primary",
      requiredPermission: PERMISSIONS.SUPPORT_REPORTS_VIEW, order: 3,
    },
  ];
}
