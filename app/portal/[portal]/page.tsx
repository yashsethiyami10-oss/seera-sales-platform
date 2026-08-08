import { notFound, redirect } from "next/navigation";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { isSeeraPortalKey, SEERA_PORTALS } from "@/lib/foundation/portal-registry";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { prisma } from "@/lib/database/client";

const messages: Record<string, string> = {
  "founder-admin": "Seera Admin Foundation", "company-admin": "Seera Admin Foundation",
  accounts: "Seera Accounts Portal — financial workflows arrive in Phase 8.",
  "sales-manager": "Seera Sales Manager Portal — team workflows arrive in Phase 3.",
  "sales-executive": "Seera Sales Executive Portal — field workflows arrive in Phase 3.",
  distributor: "Seera Distributor Portal — operational workflows arrive in Phase 4.",
  "super-stockist": "Seera Super Stockist Portal — workflows arrive in Phase 5.",
  retailer: "Seera Retailer Portal — workflows arrive in a later governed phase.",
};
export default async function PortalShell({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params; if (!isSeeraPortalKey(portal)) notFound();
  try {
    const { user } = await resolveRequestIdentity(); const definition = SEERA_PORTALS[portal];
    await authorize(prisma, { actorId: user.id, permission: definition.requiredPermission, ...(definition.featureFlag ? { featureFlag: definition.featureFlag } : {}) });
    return <main style={{ maxWidth: 760, margin: "0 auto", padding: "72px 24px" }}><p>Seera protected portal</p><h1>{messages[portal]}</h1><p>Authenticated as {user.name ?? user.email}. Phase 2+ business workflows are not active.</p></main>;
  } catch (error) {
    if (error instanceof FoundationError && error.status === 401) redirect(`/login?next=/portal/${portal}`);
    return <main style={{ padding: 72 }}><h1>Access denied</h1><p>This portal is unavailable for the authenticated identity.</p></main>;
  }
}
