import type { PrismaClient } from "@prisma/client";
import { randomInt } from "node:crypto";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { createDistributorForSuperStockist } from "./distributor-management-service";
import { provisionPartnerLogin } from "@/lib/foundation/user-management-service";

// Founder-authorized, ONE-TIME production onboarding batch for the 10 real distributors under the
// existing M/s Ratan Products & Traders Super Stockist. This is deliberately a fixed, named dataset
// (not a generic bulk-upload endpoint) — the Founder's own instruction was explicit that a
// permanent, ungoverned bulk-write action must not be created. Every row still goes through the
// same governed primitives (createDistributorForSuperStockist, provisionPartnerLogin) a Founder
// would otherwise click through one at a time in AddDistributorPanel/PartnerAccessPanel — no
// business logic is reimplemented here, only composed and made idempotent/row-isolated.
const RATAN_SUPER_STOCKIST_LEGAL_NAME = "M/s Ratan Products & Traders";

const RATAN_DISTRIBUTOR_ROWS = [
  { town: "Tahrauli", townCode: "Tah", pin: "284202", state: "Uttar Pradesh", firm: "Somya General Store", contact: "Rajnikanth Jain", mobile: "9451267880" },
  { town: "Talbehat", townCode: "Tal", pin: "284126", state: "Uttar Pradesh", firm: "Point Distributor", contact: "Jain Sahab", mobile: "7007801989" },
  { town: "Prithvipur", townCode: "Pri", pin: "472336", state: "Madhya Pradesh", firm: "Aadi Stationery", contact: "Anand Kumar Jain", mobile: "8319987551" },
  { town: "Mauranipur", townCode: "Mau", pin: "284204", state: "Uttar Pradesh", firm: "Dengre Kirana", contact: null, mobile: "9475582703" },
  { town: "Gursarai", townCode: "Gur", pin: "284202", state: "Uttar Pradesh", firm: "Mahakal Agency", contact: "Purshottam Gupta", mobile: "8953749705" },
  { town: "Bangra", townCode: "Ban", pin: "284205", state: "Uttar Pradesh", firm: "Kushwaha Agency", contact: "Ramkumar Kushwaha", mobile: "8400771280" },
  { town: "Madhogarh", townCode: "Mdg", pin: "285126", state: "Uttar Pradesh", firm: "Tarsoliya Traders", contact: null, mobile: "9026603167" },
  { town: "Mahroni", townCode: "Mhr", pin: "284405", state: "Uttar Pradesh", firm: "Sahu Kirana", contact: "Akash Sahu", mobile: "7385545488" },
  { town: "Madawra", townCode: "Mdw", pin: "284404", state: "Uttar Pradesh", firm: "Sahu Kirana", contact: "Manish Sahu", mobile: "8400658878" },
  { town: "Jhansi", townCode: "Jha", pin: null, state: "Uttar Pradesh", firm: "Kuldeep Jha", contact: "Kuldeep Jha", mobile: "9956736641" },
] as const;

// "SeeraTah#4127" style — typeable/speakable over a phone call, distinct per row, never hardcoded
// (generated fresh at execution time so no plaintext password is ever committed to source control).
function memorablePassword(townCode: string): string {
  return `Seera${townCode}#${randomInt(1000, 10000)}`;
}

export type RatanOnboardRowResult = {
  town: string;
  firm: string;
  mobile: string;
  status: "CREATED" | "RECONCILED" | "CONFLICT";
  partnerId?: string;
  userId?: string;
  loginEmail?: string;
  temporaryPassword?: string;
  note?: string;
};

export async function bulkOnboardRatanDistributors(prisma: PrismaClient, actorId: string): Promise<RatanOnboardRowResult[]> {
  await authorize(prisma, { actorId, permission: "master:manage" });

  const superStockists = await prisma.seeraPartner.findMany({
    where: { type: "SUPER_STOCKIST", legalName: RATAN_SUPER_STOCKIST_LEGAL_NAME, lifecycle: "ACTIVE" },
  });
  if (superStockists.length === 0)
    throw new FoundationError("SUPER_STOCKIST_NOT_FOUND", `No active Super Stockist named "${RATAN_SUPER_STOCKIST_LEGAL_NAME}" was found — refusing to create one implicitly`, 404);
  if (superStockists.length > 1)
    throw new FoundationError("SUPER_STOCKIST_AMBIGUOUS", `${superStockists.length} active Super Stockist records match "${RATAN_SUPER_STOCKIST_LEGAL_NAME}" — resolve the ambiguity before onboarding`, 409);
  const superStockistId = superStockists[0]!.id;

  const results: RatanOnboardRowResult[] = [];
  for (const row of RATAN_DISTRIBUTOR_ROWS) {
    try {
      const normalizedMobile = row.mobile.replace(/\D/g, "");
      const idempotencyKey = `ratan-onboarding-${normalizedMobile}`;

      // Pre-flight: a mobile already attached to a DIFFERENT firm than this row is a genuine
      // conflict — never silently reassign/hijack an unrelated existing partner.
      const conflicting = await prisma.seeraPartner.findFirst({
        where: { type: "DISTRIBUTOR", primaryContact: { path: ["mobile"], equals: normalizedMobile }, legalName: { not: row.firm } },
      });
      if (conflicting) {
        results.push({ town: row.town, firm: row.firm, mobile: row.mobile, status: "CONFLICT", note: `Mobile already belongs to existing partner "${conflicting.legalName}" (${conflicting.id})` });
        continue;
      }

      const { partner } = await createDistributorForSuperStockist(prisma, actorId, superStockistId, {
        firmName: row.firm,
        address: { line: row.town, city: row.town, state: row.state },
        mobile: row.mobile,
        ownerName: row.contact ?? undefined,
        pincode: row.pin ?? undefined,
        creditEnabled: false,
        notes: "Onboarded via Founder-authorized Ratan Products & Traders bulk onboarding batch",
        idempotencyKey,
      });

      const existingMembership = await prisma.seeraPartyUser.findFirst({ where: { partnerId: partner.id, active: true } });
      if (existingMembership) {
        const existingUser = await prisma.user.findUnique({ where: { id: existingMembership.userId }, select: { id: true, email: true } });
        results.push({ town: row.town, firm: row.firm, mobile: row.mobile, status: "RECONCILED", partnerId: partner.id, userId: existingUser?.id, loginEmail: existingUser?.email, note: "Partner and login already existed — no changes made" });
        continue;
      }

      const email = `dist.${normalizedMobile}@seera.local`;
      const temporaryPassword = memorablePassword(row.townCode);
      const login = await provisionPartnerLogin(prisma, actorId, {
        partnerId: partner.id,
        name: row.contact ?? row.firm,
        mobile: row.mobile,
        email,
        accessRole: "OWNER",
        password: temporaryPassword,
      });

      results.push({ town: row.town, firm: row.firm, mobile: row.mobile, status: "CREATED", partnerId: partner.id, userId: login.user.id, loginEmail: login.user.email, temporaryPassword });
    } catch (error) {
      results.push({ town: row.town, firm: row.firm, mobile: row.mobile, status: "CONFLICT", note: error instanceof FoundationError ? error.message : "Unexpected error — see server logs" });
    }
  }

  // Never persist plaintext passwords into the audit trail — only outcome + identifiers.
  await recordAudit(prisma, {
    actorId,
    action: "distributor.ratan_bulk_onboard",
    entityType: "SeeraPartner",
    entityId: superStockistId,
    afterState: { rows: results.map((r) => ({ town: r.town, firm: r.firm, status: r.status, partnerId: r.partnerId, userId: r.userId })) },
  });

  return results;
}
