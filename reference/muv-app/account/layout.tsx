import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, Package, Heart, User } from "lucide-react";
import { auth, signOut } from "@/lib/auth";

const NAV = [
  { href: "/account", label: "Home", icon: Home },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/profile", label: "Profile", icon: User },
];

// Founder Final Consolidated Polish, Part 3 — the mobile bottom nav's
// "Home" must always return to the actual site homepage, never stay
// inside Account (previously pointed at /account, same as the desktop
// sidebar's "Home", which stays the account dashboard — unchanged, since
// only the *bottom navigation* was called out here).
const MOBILE_NAV = NAV.map((n) => (n.label === "Home" ? { ...n, href: "/" } : n));

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  return (
    <div style={{ background: "var(--ink)", minHeight: "100svh" }} className="pb-24">
      <header className="h-20 flex items-center justify-between px-6" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="font-display muv-text-solid" style={{ fontSize: 20, fontWeight: 500 }}>Muv Account</span>
        <form action={async () => { "use server"; await signOut(); }}>
          <button className="muv-text-meta text-xs">Log Out</button>
        </form>
      </header>

      <div className="max-w-4xl mx-auto flex gap-10 px-6 py-8">
        <nav className="hidden md:flex flex-col gap-1 w-52 flex-shrink-0">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 py-2.5 rounded-xl muv-text-body hover:text-white text-sm transition-colors">
                <Icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2" style={{ background: "rgba(11,11,15,0.96)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--hairline)" }}>
        {MOBILE_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1 muv-text-meta text-[10px] py-1 px-3">
              <Icon size={20} /> {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
