import Image from "next/image";
import { redirect } from "next/navigation";
import { LayoutDashboard, Package, ShoppingCart, LayoutGrid, Tag, Layers, Users, Boxes, Image as ImageIcon, Settings, TrendingUp, Briefcase, AlertTriangle, Sparkles } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { EnterpriseShell, type ShellNavItem } from "@/components/enterprise-shell/EnterpriseShell";

const NAV: ShellNavItem[] = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard size={17} /> },
  { href: "/admin/analytics", label: "Analytics", icon: <TrendingUp size={17} /> },
  // Founder Validation & Safe UAT Activation, Block A1 — governance
  // inspection surface for the four frozen intelligence layers. Admin/
  // Staff-only, same layout gate as every other item in this NAV; grants
  // no clearance beyond what requireStaff() already allows.
  { href: "/admin/intelligence", label: "AI Intelligence", icon: <Sparkles size={17} /> },
  { href: "/admin/products", label: "Products", icon: <Package size={17} /> },
  { href: "/admin/orders", label: "Orders", icon: <ShoppingCart size={17} /> },
  // Phase 1D — customer-submitted "Report an Issue / Request Replacement"
  // tickets (actions/returns.ts), distinct from the pre-existing courier
  // return-pickup flow (ReturnShipment/initiateReturnShipment).
  { href: "/admin/returns", label: "Returns", icon: <AlertTriangle size={17} /> },
  { href: "/admin/customers", label: "Customers", icon: <Users size={17} /> },
  // Phase 1C (GAP-006) — real admin view for institutional/bulk inquiries
  // submitted via /contact; previously backend-only with no staff-facing list.
  { href: "/admin/inquiries", label: "Inquiries", icon: <Briefcase size={17} /> },
  { href: "/admin/inventory", label: "Inventory", icon: <Boxes size={17} /> },
  { href: "/admin/media", label: "Media Library", icon: <ImageIcon size={17} /> },
  { href: "/admin/cms/categories", label: "Categories", icon: <LayoutGrid size={17} /> },
  { href: "/admin/cms/homepage", label: "Homepage CMS", icon: <Layers size={17} /> },
  { href: "/admin/marketing", label: "Marketing", icon: <Tag size={17} /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings size={17} /> },
];

const brand = (
  <div className="flex items-center gap-2 px-5 py-6" style={{ borderBottom: "1px solid var(--card-border)" }}>
    <Image src="/logo.png" alt="MUV" width={100} height={38} style={{ height: 24, width: "auto" }} />
    <span className="muv-text-faint text-[10px] uppercase tracking-widest">Admin</span>
  </div>
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN" && session.user.role !== "STAFF") redirect("/access-denied");

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div style={{ background: "var(--ink)", minHeight: "100vh" }} className="muv-admin-shell">
      <EnterpriseShell
        variant="admin"
        brand={brand}
        homeHref="/admin"
        homeLabel="Admin"
        navItems={NAV}
        user={{ name: session.user.name ?? null, email: session.user.email ?? "", roleLabel: session.user.role === "ADMIN" ? "Administrator" : "Staff" }}
        logoutAction={logoutAction}
      >
        {children}
      </EnterpriseShell>
    </div>
  );
}
