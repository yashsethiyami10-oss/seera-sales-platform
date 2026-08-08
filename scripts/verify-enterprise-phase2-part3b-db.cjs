const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const [networkSodPolicies, flags, seededBusinessPartners] = await Promise.all([
    prisma.phase2SodPolicy.count({
      where: {
        organizationKey: "MUV",
        operationType: { in: [
          "PARTNER_ONBOARDING_APPROVAL", "AGREEMENT_APPROVAL", "COMMERCIAL_POLICY_APPROVAL",
          "ROYALTY_APPROVAL", "COMMISSION_APPROVAL", "CLAIM_APPROVAL",
        ] },
        active: true,
      },
    }),
    prisma.aiConfiguration.findMany({
      where: {
        organizationKey: "MUV",
        key: { in: ["ENTERPRISE_BUSINESS_NETWORK_ENABLED", "ENTERPRISE_PARTNER_PORTAL_ENABLED"] },
      },
      select: { key: true, value: true },
      orderBy: { key: "asc" },
    }),
    prisma.networkPartner.count(),
  ]);
  if (networkSodPolicies !== 6) throw new Error(`Expected 6 network SoD policies, found ${networkSodPolicies}`);
  if (flags.length !== 2 || flags.some((row) => row.value?.enabled !== false)) throw new Error("Part 3B feature flags must remain disabled");
  if (seededBusinessPartners !== 0) throw new Error("Seed must not create business partner history");
  console.log(JSON.stringify({ networkSodPolicies, flags, seededBusinessPartners }));
}

main().finally(() => prisma.$disconnect());
