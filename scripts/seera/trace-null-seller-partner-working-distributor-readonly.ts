import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Founder-directed auto-routing investigation: for every production
// SeeraSalesOrder{type:"RETAILER_ORDER", sellerPartnerId:null}, trace order -> visitId ->
// SeeraVisit -> workSessionId -> SeeraWorkSession.workingDistributorId, to determine how many of
// today's unassigned retailer orders WOULD have been auto-recoverable had working-distributor
// auto-routing already been live at order-placement time. Never mutates anything.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const orders = await db.seeraSalesOrder.findMany({
    where: { type: "RETAILER_ORDER", sellerPartnerId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, orderNumber: true, retailerId: true, visitId: true, createdAt: true, sourcePortal: true, source: true },
  });
  console.log(`\n== ${orders.length} RETAILER_ORDER rows with sellerPartnerId=NULL ==\n`);

  let autoRecoverable = 0;
  let ambiguous = 0;

  for (const o of orders) {
    let line = `orderNumber=${o.orderNumber} retailerId=${o.retailerId} createdAt=${o.createdAt.toISOString()} sourcePortal=${o.sourcePortal} source=${o.source} visitId=${o.visitId ?? "NO VISIT LINK"}`;
    if (!o.visitId) {
      line += " => AMBIGUOUS/UNRECOVERABLE (no visit link)";
      ambiguous++;
      console.log(line);
      continue;
    }
    const visit = await db.seeraVisit.findUnique({
      where: { id: o.visitId },
      select: { id: true, workSessionId: true },
    });
    if (!visit) {
      line += " => AMBIGUOUS/UNRECOVERABLE (visit row not found)";
      ambiguous++;
      console.log(line);
      continue;
    }
    const session = await db.seeraWorkSession.findUnique({
      where: { id: visit.workSessionId },
      select: { id: true, workingDistributorId: true, status: true, employeeId: true },
    });
    if (!session) {
      line += ` workSessionId=${visit.workSessionId} => AMBIGUOUS/UNRECOVERABLE (session row not found)`;
      ambiguous++;
      console.log(line);
      continue;
    }
    if (!session.workingDistributorId) {
      line += ` workSessionId=${session.id} => NO ACTIVE/MATCHING SESSION (session had no workingDistributorId set)`;
      ambiguous++;
      console.log(line);
      continue;
    }
    line += ` workSessionId=${session.id} sessionStatus=${session.status} => AUTO-RECOVERABLE workingDistributorId=${session.workingDistributorId}`;
    autoRecoverable++;
    console.log(line);
  }

  console.log(`\n== SUMMARY ==`);
  console.log(`Total unassigned RETAILER_ORDER rows: ${orders.length}`);
  console.log(`AUTO-RECOVERABLE (single unambiguous workingDistributorId traced): ${autoRecoverable}`);
  console.log(`AMBIGUOUS/UNRECOVERABLE (no visit link / no session / no workingDistributorId): ${ambiguous}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
