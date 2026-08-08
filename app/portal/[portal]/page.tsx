import { notFound, redirect } from "next/navigation";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { isSeeraPortalKey, SEERA_PORTALS } from "@/lib/foundation/portal-registry";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { prisma } from "@/lib/database/client";
import { unstable_noStore as noStore } from "next/cache";
import { PORTAL_EXPERIENCES, type OperationalPortal } from "@/lib/sales-distribution/portal-experiences";

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
  noStore();
  const { portal } = await params; if (!isSeeraPortalKey(portal)) notFound();
  try {
    const { user } = await resolveRequestIdentity(); const definition = SEERA_PORTALS[portal];
    await authorize(prisma, { actorId: user.id, permission: definition.requiredPermission, ...(definition.featureFlag ? { featureFlag: definition.featureFlag } : {}) });
    const experience = portal in PORTAL_EXPERIENCES ? PORTAL_EXPERIENCES[portal as OperationalPortal] : undefined;
    return <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }} data-portal={portal}>
      <p>Seera protected portal</p><h1>{messages[portal]}</h1><p>Authenticated as {user.name ?? user.email}.</p>
      {experience ? <><p>{experience.dashboard}</p><nav aria-label={`${definition.title} navigation`}><ul>{experience.navigation.map((item) => <li key={item}>{item}</li>)}</ul></nav><small>{experience.terminology}</small></> : <p>This governed portal shell remains reserved for its frozen roadmap phase.</p>}
    </main>;
  } catch (error) {
    if (error instanceof FoundationError && error.status === 401) redirect(`/login?next=/portal/${portal}`);
    const disabled=error instanceof FoundationError&&error.code==="PORTAL_DISABLED";return <main style={{maxWidth:760,margin:"0 auto",padding:"72px 24px"}}><h1>{disabled?"Portal temporarily unavailable":"Access denied"}</h1><p>{disabled?"This Phase 1 portal is disabled by an approved feature flag.":"This portal is unavailable for the authenticated identity."}</p></main>;
  }
}
