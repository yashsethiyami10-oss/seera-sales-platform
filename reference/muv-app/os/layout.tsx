import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getCurrentUser } from "@/lib/os-shell/current-user";
import { getGrantedPermissions } from "@/lib/os-shell/granted-permissions";
import { OSShellProvider } from "@/components/os-shell/OSShellProvider";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), route entry point.
 *
 * Deviation from the Specification's literal `app/(os)/` notation, recorded
 * here rather than silently applied: a Next.js *route group* — `(os)` —
 * adds no URL segment, so `app/(os)/page.tsx` would resolve to `/`, which
 * already belongs to `app/(storefront)/page.tsx`. That is a real build-time
 * routing collision, not a style choice. This uses a real segment, `app/os/`
 * (URL `/os`), instead — same isolation property (nothing outside this
 * folder imports from it, nothing in it is linked from live navigation),
 * just a corrected path. See this milestone's report for the full note.
 *
 * Session gating mirrors `app/dashboard/layout.tsx`'s exact pattern —
 * genuine reuse of `lib/auth.ts`'s `auth()`/`signOut`, not a new
 * authentication mechanism (Authentication Integration).
 */
export default async function OSLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/os");

  // Milestone 2 — real navigation entries now declare real permissions;
  // resolved from the existing Sales principal, tolerating users with no
  // active Sales role (see lib/os-shell/granted-permissions.ts).
  const grantedPermissions = await getGrantedPermissions();

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const brand = (
    <div className="p-6" style={{ borderBottom: "1px solid var(--card-border)" }}>
      <Image src="/logo.png" alt="MUV" width={100} height={38} />
    </div>
  );

  return (
    <OSShellProvider
      brand={brand}
      homeHref="/os"
      homeLabel="MUV OS"
      grantedPermissions={grantedPermissions}
      user={user}
      logoutAction={logoutAction}
    >
      {children}
    </OSShellProvider>
  );
}
