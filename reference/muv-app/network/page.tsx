import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";
import { NETWORK_FLAG } from "@/lib/enterprise-network/context";

export const dynamic = "force-dynamic";

const cardConfig: Array<{ label: string; permission: PermissionKey; load: (organizationKey: string) => Promise<number> }> = [
  { label: "Partners", permission: PERMISSIONS.NETWORK_PARTNERS_VIEW, load: (organizationKey) => prisma.networkPartner.count({ where: { organizationKey, lifecycleStatus: "ACTIVE" } }) },
  { label: "Active agreements", permission: PERMISSIONS.NETWORK_AGREEMENTS_MANAGE, load: (organizationKey) => prisma.networkAgreement.count({ where: { organizationKey, status: "ACTIVE" } }) },
  { label: "Open claims", permission: PERMISSIONS.NETWORK_CLAIMS_MANAGE, load: (organizationKey) => prisma.networkClaim.count({ where: { organizationKey, status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] } } }) },
  { label: "Open support cases", permission: PERMISSIONS.NETWORK_PARTNERS_MANAGE, load: (organizationKey) => prisma.networkSupportCase.count({ where: { organizationKey, status: { notIn: ["CLOSED", "RESOLVED"] } } }) },
];

// Enterprise UI Integration — Business Network UI overview, mirroring the
// same permission+feature-flag-gated card pattern established (and
// hardened during Stage 3's route-integrity pass) for app/enterprise/page.tsx.
export default async function NetworkHome() {
  const principal = await getSalesPrincipal();
  const organizationKey = "MUV";
  const flag = await prisma.aiConfiguration.findFirst({ where: { organizationKey, key: NETWORK_FLAG, category: "FEATURE_FLAG" } });
  if (!flag || !(flag.value as { enabled?: boolean }).enabled) throw new ForbiddenError();

  const visible = cardConfig.filter((c) => principal.isFounder || principal.permissions.has(c.permission));
  if (!visible.length) throw new ForbiddenError();

  const cards = await Promise.all(visible.map(async (c) => [c.label, await c.load(organizationKey)] as const));
  return <section className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Business Network</h1><p className="mt-1 text-sm text-zinc-400">Partner network overview for {principal.salesRole.name}.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</div>
  </section>;
}
