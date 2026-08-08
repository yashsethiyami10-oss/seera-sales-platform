import Image from "next/image";
import { redirect } from "next/navigation";
import { getSalesNavigation } from "@/lib/sales/navigation";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { signOut } from "@/lib/auth";
import { EnterpriseShell, type ShellNavItem } from "@/components/enterprise-shell/EnterpriseShell";

const brand = (
  <div className="border-b border-white/10 p-6"><Image src="/logo.png" alt="MUV" width={100} height={38} /></div>
);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let navigation;
  let principal;
  try {
    // getSalesPrincipal() is React cache()-wrapped, so calling it here in
    // addition to inside getSalesNavigation() is a dedup, not a second
    // database round trip.
    [navigation, principal] = await Promise.all([getSalesNavigation(), getSalesPrincipal()]);
  } catch { redirect("/login?callbackUrl=/dashboard"); }

  const navItems: ShellNavItem[] = navigation.map(({ href, label, icon: Icon }) => ({ href, label, icon: <Icon size={17} /> }));

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="bg-zinc-950 min-h-screen">
      <EnterpriseShell
        variant="ops"
        brand={brand}
        homeHref="/dashboard"
        homeLabel="Dashboard"
        navItems={navItems}
        user={{ name: principal.name, email: principal.email ?? "", roleLabel: principal.salesRole.name }}
        logoutAction={logoutAction}
      >
        {children}
      </EnterpriseShell>
    </div>
  );
}
