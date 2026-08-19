import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Confirms, against real production data, whether re-checking a
// today-already-visited retailer is actually blocked at the backend/data level, or only ever
// filtered at the UI layer (FieldJourney.tsx only renders Check-In when visitStatus is
// null/PENDING; executiveCheckIn itself has no such restriction).

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const prisma = new PrismaClient({ datasourceUrl: production });

function maskPhone(v: string | null | undefined): string {
  if (!v) return "(none)";
  const digits = v.replace(/\D/g, "");
  return digits.length < 4 ? "****" : `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const exec = await prisma.user.findFirst({ where: { normalizedEmail: "neerajrawatseera@gmail.com" } });
  if (!exec) {
    console.log("Executive user not found.");
    return;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const visitsToday = await prisma.seeraVisit.findMany({
    where: { workSession: { employeeId: exec.id }, checkedInAt: { gte: startOfDay } },
    orderBy: { checkedInAt: "asc" },
    include: { retailer: true },
  });

  console.log(`\nToday's visits for this Executive: ${visitsToday.length}`);
  for (const v of visitsToday) {
    console.log(
      `  retailerId=${v.retailerId} name=${v.retailer?.businessName} whatsapp=${maskPhone(v.retailer?.whatsapp || v.retailer?.mobile)} lifecycle=${v.retailer?.lifecycle} salespersonId_matches=${v.retailer?.salespersonId === exec.id} outcome=${v.outcome} checkedOutAt=${v.checkedOutAt?.toISOString() ?? "(open)"}`,
    );
  }

  if (visitsToday.length === 0) {
    console.log("No visits found today for this Executive.");
    return;
  }

  const candidate = visitsToday.find((v) => v.retailer?.whatsapp) ?? visitsToday[0];
  console.log(`\nCandidate retailer for retest: ${candidate.retailer?.businessName} (id=${candidate.retailerId})`);
  console.log(`  Still salespersonId===exec: ${candidate.retailer?.salespersonId === exec.id}`);
  console.log(`  Still lifecycle=ACTIVE: ${candidate.retailer?.lifecycle === "ACTIVE"}`);

  // Would executiveCheckIn's own query find this retailer eligible right now, exactly as that
  // function's own WHERE clause is written? (read-only — never actually calls the function)
  const wouldBeEligible = await prisma.seeraRetailer.findFirst({ where: { id: candidate.retailerId!, salespersonId: exec.id, lifecycle: "ACTIVE" } });
  console.log(`\nexecutiveCheckIn's own retailer-eligibility query (salespersonId+lifecycle=ACTIVE) matches: ${wouldBeEligible ? "YES — nothing at the backend blocks a fresh check-in" : "NO"}`);

  const anyOtherOpenVisit = await prisma.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id }, checkedOutAt: null } });
  console.log(`Any other currently-OPEN visit for this Executive (would block check-in into a DIFFERENT retailer only): ${anyOtherOpenVisit ? `YES (id=${anyOtherOpenVisit.id})` : "NO"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
