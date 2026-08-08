import { notFound } from "next/navigation";
import { isSeeraPortalKey, SEERA_PORTALS } from "@/lib/foundation/portal-registry";

export default async function PortalShell({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (!isSeeraPortalKey(portal)) notFound();
  const definition = SEERA_PORTALS[portal];

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ margin: 0, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12 }}>Seera Portal</p>
      <h1 style={{ margin: "16px 0", fontSize: 38 }}>{definition.title}</h1>
      <p>This shell requires the governed permission: {definition.requiredPermission}.</p>
      <p>Access is disabled during Phase 1 Block 1.</p>
    </main>
  );
}

