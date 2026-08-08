import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { resolveRoleLandingPath } from "@/lib/auth/redirect-policy";

/**
 * Stage 1 (Authentication and Role-Aware Entry). The one safe terminal
 * destination `redirect-policy.ts` can always resolve to — deliberately
 * requires no permission of its own (an unauthenticated visitor sees the
 * same page, just with a generic return link) and never redirects
 * further on its own, so it can never participate in a redirect loop.
 * No sensitive detail about *why* access was denied, or what permission
 * would have been required, is shown — only that it was.
 */
export default async function AccessDeniedPage() {
  // Best-effort — an unauthenticated visitor (session expired mid-visit,
  // or a stale bookmark) still gets a working return link, just to the
  // public homepage rather than a role-specific dashboard they no longer
  // have.
  const returnPath = await resolveRoleLandingPath().catch(() => "/");
  const returnHref = returnPath === "/access-denied" ? "/" : returnPath;

  return (
    <div className="relative flex items-center justify-center overflow-hidden px-6" style={{ minHeight: "100svh", background: "var(--ink)" }}>
      <div className="relative z-10 w-full text-center" style={{ maxWidth: 420 }}>
        <div className="mx-auto mb-5 flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: "rgba(var(--danger-rgb), 0.1)", border: "1px solid rgba(var(--danger-rgb), 0.25)" }}>
          <ShieldAlert size={24} style={{ color: "var(--danger)" }} aria-hidden />
        </div>
        <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.6rem" }}>
          You don&apos;t have access to that
        </h1>
        <p className="muv-text-body text-sm mb-7">
          This page requires permissions your account doesn&apos;t currently have. If you believe
          this is a mistake, contact your administrator.
        </p>
        <Link href={returnHref} className="muv-btn-primary inline-flex items-center justify-center px-6 py-3 rounded-full text-sm">
          Return to your dashboard
        </Link>
      </div>
    </div>
  );
}
