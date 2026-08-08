import {
  BarChart3, Building2, ClipboardList, FileText, Headphones, LayoutDashboard,
  Layers, Map, ScrollText, ShieldCheck, Users, Target, CalendarDays, BrainCircuit, Gift, Bot, Activity,
  Factory, Landmark, Network,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "./authorization";
import { PERMISSIONS, type PermissionKey } from "./constants";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales/inquiries", label: "Inquiries", icon: ClipboardList, any: [PERMISSIONS.INQUIRIES_VIEW_ALL, PERMISSIONS.INQUIRIES_VIEW_ASSIGNED] },
  { href: "/sales/opportunities", label: "Opportunities", icon: Target, any: [PERMISSIONS.OPPORTUNITIES_VIEW_ALL, PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED] },
  { href: "/sales/quotations", label: "Quotations", icon: FileText, any: [PERMISSIONS.QUOTATIONS_VIEW_ALL, PERMISSIONS.QUOTATIONS_VIEW_ASSIGNED, PERMISSIONS.QUOTATIONS_VIEW_SUPPORT] },
  { href: "/sales/commerce", label: "Commerce", icon: Layers, any: [PERMISSIONS.COMMERCE_VIEW_ALL, PERMISSIONS.COMMERCE_VIEW_ASSIGNED, PERMISSIONS.COMMERCE_VIEW_SUPPORT] },
  { href: "/sales/intelligence", label: "Customer Intelligence", icon: BrainCircuit, any: [PERMISSIONS.INTELLIGENCE_VIEW_ALL, PERMISSIONS.INTELLIGENCE_VIEW_ASSIGNED, PERMISSIONS.INTELLIGENCE_VIEW_SUPPORT] },
  { href: "/sales/loyalty", label: "Loyalty", icon: Gift, any: [PERMISSIONS.LOYALTY_VIEW_ALL, PERMISSIONS.LOYALTY_VIEW_ASSIGNED, PERMISSIONS.LOYALTY_VIEW_SUPPORT] },
  { href: "/sales/ai", label: "MUV AI", icon: Bot, any: [PERMISSIONS.AI_CONVERSATIONS_USE] },
  { href: "/sales/ai/executive", label: "Executive AI", icon: BrainCircuit, any: [PERMISSIONS.AI_EXECUTIVE_USE] },
  { href: "/sales/ai/operations", label: "AI Operations", icon: Activity, any: [PERMISSIONS.AI_OPERATIONS_VIEW] },
  { href: "/sales/ai/admin", label: "AI Administration", icon: ShieldCheck, any: [PERMISSIONS.AI_PROMPTS_MANAGE, PERMISSIONS.AI_PROVIDERS_MANAGE, PERMISSIONS.AI_SECURITY_MANAGE] },
  { href: "/enterprise", label: "Enterprise Operations", icon: Factory, any: [PERMISSIONS.ENTERPRISE_VENDOR_VIEW, PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, PERMISSIONS.ENTERPRISE_QUALITY_VIEW, PERMISSIONS.ENTERPRISE_WAREHOUSE_VIEW, PERMISSIONS.ENTERPRISE_PLANNING_VIEW, PERMISSIONS.ENTERPRISE_REPORTING_VIEW], feature: "ENTERPRISE_OPERATIONS_ENABLED" },
  // Enterprise UI Integration — Business Network / Enterprise Finance UI.
  // Both flags are seeded off (ENTERPRISE_BUSINESS_NETWORK_ENABLED /
  // ENTERPRISE_FINANCE_ENABLED) — these links are invisible until governed
  // configuration turns the relevant flag on, same as Enterprise Operations
  // above; the routes are already real and permission-gated on their own.
  { href: "/network", label: "Business Network", icon: Network, any: [PERMISSIONS.NETWORK_PARTNERS_VIEW, PERMISSIONS.NETWORK_AGREEMENTS_MANAGE, PERMISSIONS.NETWORK_CLAIMS_MANAGE, PERMISSIONS.NETWORK_PARTNERS_MANAGE, PERMISSIONS.NETWORK_ANALYTICS_VIEW], feature: "ENTERPRISE_BUSINESS_NETWORK_ENABLED" },
  { href: "/finance", label: "Enterprise Finance", icon: Landmark, any: [PERMISSIONS.FINANCE_MASTERS_VIEW, PERMISSIONS.FINANCE_RECEIVABLES_VIEW, PERMISSIONS.FINANCE_PAYABLES_VIEW, PERMISSIONS.FINANCE_EXPENSES_MANAGE, PERMISSIONS.FINANCE_REPORTS_VIEW], feature: "ENTERPRISE_FINANCE_ENABLED" },
  { href: "/sales/calendar", label: "Sales Calendar", icon: CalendarDays, any: [PERMISSIONS.OPPORTUNITY_TASKS_MANAGE, PERMISSIONS.OPPORTUNITY_ACTIVITIES_MANAGE] },
  { href: "/sales/assignments", label: "Assignments", icon: Users, any: [PERMISSIONS.INQUIRIES_ASSIGN] },
  { href: "/sales/queues", label: "Queues", icon: Layers, any: [PERMISSIONS.INQUIRIES_ASSIGN] },
  { href: "/sales/leads", label: "Leads", icon: ClipboardList, any: [PERMISSIONS.LEADS_VIEW_ALL, PERMISSIONS.LEADS_VIEW_ASSIGNED] },
  { href: "/sales/customers", label: "Customers", icon: Users, any: [PERMISSIONS.CUSTOMERS_VIEW_ALL, PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED] },
  { href: "/sales/institutional", label: "Institutional", icon: Building2, any: [PERMISSIONS.INSTITUTIONAL_MANAGE] },
  { href: "/sales/support", label: "Support", icon: Headphones, any: [PERMISSIONS.SUPPORT_MANAGE] },
  { href: "/sales/reports", label: "Reports", icon: BarChart3, any: [PERMISSIONS.REPORTS_VIEW] },
  // Stage 3 (Route Integrity): the page itself only requires USERS_VIEW
  // (it's read-only) — Sales Manager holds USERS_VIEW but neither
  // USERS_MANAGE nor ROLES_MANAGE (confirmed in prisma/seed.ts's role
  // definitions), so gating the link on the management permissions alone
  // made the page reachable by direct URL but invisible in navigation for
  // a role that's fully entitled to it.
  { href: "/sales/organization", label: "Organization", icon: ShieldCheck, any: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE] },
  { href: "/sales/territories", label: "Territories", icon: Map, any: [PERMISSIONS.TERRITORIES_MANAGE] },
  { href: "/sales/channels", label: "Channels", icon: Building2, any: [PERMISSIONS.SALES_CHANNELS_MANAGE] },
  { href: "/sales/audit", label: "Audit log", icon: ScrollText, any: [PERMISSIONS.AUDIT_VIEW] },
] satisfies Array<{ href: string; label: string; icon: typeof LayoutDashboard; any?: PermissionKey[]; feature?: string }>;

export async function getSalesNavigation() {
  const principal = await getSalesPrincipal();
  const flags = await prisma.aiConfiguration.findMany({
    where: { organizationKey: "MUV", category: "FEATURE_FLAG", active: true },
    select: { key: true, value: true },
  });
  const enabled = new Set(flags.filter((row) => Boolean((row.value as { enabled?: boolean }).enabled)).map((row) => row.key));
  return ITEMS.filter((item) =>
    (!item.feature || enabled.has(item.feature)) &&
    (principal.isFounder || !item.any || item.any.some((key) => principal.permissions.has(key)))
  );
}
