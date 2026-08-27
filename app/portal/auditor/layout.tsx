import { redirect } from "next/navigation";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { primaryRoleAssignment } from "@/lib/foundation/portal-landing";
import { prisma } from "@/lib/database/client";
import { AppShell } from "@/components/seera/foundation/AppShell";
import { phase1Navigation } from "@/lib/foundation/phase1-ui";

// The Auditor workspace renders from this static segment (it shadows /portal/[portal]), so it never
// picked up the shared /portal/[portal]/layout.tsx — which meant an authenticated auditor had no
// navigation and, critically, no Logout control. This layout gives the read-only auditor portal the
// same governed AppShell (identity guard + Sign out) every other portal already has. It does not
// grant any write capability — the auditor pages themselves remain button/form-free.
export default async function AuditorPortalLayout({ children }: { children: React.ReactNode }) {
  let identity;
  try {
    identity = await resolveRequestIdentity();
  } catch {
    redirect("/login?next=/portal/auditor");
  }
  const permissions = await effectivePermissions(prisma, identity.user.id);
  if (!permissions.has("audit:view") && !permissions.has("system:super_admin")) redirect("/portal/founder-admin");
  const assignment = await primaryRoleAssignment(prisma, identity.user.id);
  const language = identity.user.preferredLanguage;
  const environment =
    process.env.VERCEL_ENV === "production"
      ? "PRODUCTION"
      : process.env.VERCEL_ENV === "preview"
        ? "PREVIEW"
        : process.env.SEERA_DATABASE_ROLE === "test"
          ? "TEST / Local review"
          : "LOCAL / DEVELOPMENT";
  return (
    <AppShell
      nav={phase1Navigation({ portal: "auditor", permissions, language })}
      language={language}
      portal="auditor"
      role={assignment?.role.name ?? "Auditor"}
      user={{ name: identity.user.name ?? identity.user.email, email: identity.user.email }}
      environment={environment}
    >
      {children}
    </AppShell>
  );
}
