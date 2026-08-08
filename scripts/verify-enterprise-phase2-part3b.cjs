const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let checks = 0;
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function assert(value, message) { checks++; if (!value) throw new Error(`Part 3B verification failed: ${message}`); }

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260727130000_enterprise_phase2_part3b_business_network/migration.sql");
const constants = read("lib/sales/constants.ts");
const partner = read("lib/enterprise-network/partner-service.ts");
const governance = read("lib/enterprise-network/governance-service.ts");
const commercial = read("lib/enterprise-network/commercial-service.ts");
const integration = read("lib/enterprise-network/integration-service.ts");
const ai = read("lib/enterprise-network/ai-adapter.ts");
const seed = read("prisma/seed.ts");
const remediation = read("prisma/migrations/20260727131000_enterprise_phase2_part3b_remediation/migration.sql");
const childImmutability = read("prisma/migrations/20260727133000_enterprise_phase2_part3b_child_immutability/migration.sql");
const runtimeTests = read("__tests__/enterprise-phase2/business-network.integration.test.ts");
const attribution = read("lib/enterprise-network/attribution-service.ts");
const enablement = read("lib/enterprise-network/enablement-service.ts");
const operations = read("lib/enterprise-network/operations-service.ts");

for (const model of [
  "NetworkPartner", "NetworkPartnerHierarchy", "NetworkOnboardingCase", "NetworkTerritory",
  "NetworkAgreement", "NetworkPolicyApplicability", "NetworkRoyaltyRun", "NetworkCommissionRun",
  "NetworkTargetPlan", "NetworkClaim", "NetworkSupportCase", "NetworkTrainingProgram",
  "NetworkComplianceRequirement", "NetworkPartnerUser",
]) assert(schema.includes(`model ${model}`), `${model} missing`);
for (const type of ["FRANCHISE", "DISTRIBUTOR", "SUPER_STOCKIST", "DEALER", "OUTLET", "INSTITUTIONAL_PARTNER"]) {
  assert(read("lib/enterprise-network/domain.ts").includes(`"${type}"`), `${type} missing`);
}
assert(migration.includes("network_partners"), "migration omits partner master");
assert(migration.includes("network_royalty_runs"), "migration omits royalty engine");
assert(migration.includes("network_commission_runs"), "migration omits commission engine");
assert(partner.includes("requireNetworkPrincipal"), "partner mutations bypass trusted authorization");
assert(partner.includes("wouldCreateCycle"), "hierarchy cycle prevention missing");
assert(governance.includes("enforceSegregationOfDuties"), "approval SoD missing");
assert(commercial.includes("claimOperation"), "calculation idempotency missing");
assert(commercial.includes("sourceSnapshotHash"), "source snapshot missing");
assert(integration.includes("warehouseBalance"), "inventory does not reuse authoritative ledger");
assert(integration.includes("requirePortalPrincipal"), "portal mapping is not trusted");
assert(ai.includes("advisoryOnly: true") && ai.includes("mutationAllowed: false"), "AI boundary is unsafe");
for (const permission of [
  "NETWORK_PARTNERS_VIEW", "NETWORK_PARTNERS_MANAGE", "NETWORK_PARTNERS_APPROVE_ONBOARDING",
  "NETWORK_TERRITORIES_MANAGE", "NETWORK_AGREEMENTS_MANAGE", "NETWORK_AGREEMENTS_APPROVE",
  "NETWORK_COMMERCIAL_POLICIES_MANAGE", "NETWORK_ROYALTIES_MANAGE", "NETWORK_ROYALTIES_APPROVE",
  "NETWORK_COMMISSIONS_MANAGE", "NETWORK_COMMISSIONS_APPROVE", "NETWORK_CLAIMS_MANAGE",
  "NETWORK_CLAIMS_APPROVE", "NETWORK_ANALYTICS_VIEW", "NETWORK_PARTNER_PORTAL_ADMIN",
]) assert(constants.includes(permission), `${permission} missing`);
assert(seed.includes('["ENTERPRISE_BUSINESS_NETWORK_ENABLED","FEATURE_FLAG",{enabled:false}]'), "network flag not disabled");
assert(seed.includes('["ENTERPRISE_PARTNER_PORTAL_ENABLED","FEATURE_FLAG",{enabled:false}]'), "portal flag not disabled");
assert(!schema.includes("NetworkGeneralLedger") && !schema.includes("NetworkJournal"), "Finance architecture leaked into Part 3B");
assert(schema.includes("model NetworkPartnerOrderSource"), "partner-scoped authoritative source model missing");
assert(attribution.includes("attributedAmount") && attribution.includes("recordSourceReference"), "partner attribution provenance missing");
assert(commercial.includes("networkPartnerOrderSource.findMany"), "commercial calculations are not partner attributed");
assert(enablement.includes("networkPartnerOrderSource.findMany"), "targets are not partner attributed");
assert(remediation.includes("prevent_finalized_network_mutation"), "Part 3B database immutability missing");
assert(childImmutability.includes("network_order_sources_immutable") && childImmutability.includes("network_royalty_lines_immutable"), "Part 3B evidence immutability missing");
assert(remediation.includes("enforce_network_parent_organization"), "Part 3B database organization integrity missing");
for (const behavior of [
  "closePartnerParentAssignment", "getPartnerHierarchy", "assignPartnerTerritory", "closeTerritoryAssignment",
  "amendAgreement", "correctCommercialRun", "PARTIALLY_APPROVED", "transitionSupportCase",
  "completePartnerTraining", "processExpiredCompliance", "requirePortalAdminPrincipal",
]) assert(
  [partner, governance, commercial, integration, enablement, operations, read("lib/enterprise-network/context.ts")].some((source) => source.includes(behavior)),
  `${behavior} remediation missing`,
);
assert(runtimeTests.includes("actual Business Services and database controls"), "database-backed Part 3B runtime suite missing");
assert(runtimeTests.includes("calculateCommercialRun") && runtimeTests.includes("deriveTargetAchievement"), "runtime attribution coverage missing");

console.log(`Enterprise Phase 2 Part 3B verifier: ${checks}/${checks} checks passed`);
