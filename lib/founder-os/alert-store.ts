import { Prisma } from "@prisma/client";
import type { EnterpriseTx } from "@/lib/enterprise/context";
import type { FounderAlertSeverity, FounderAlertType } from "./domain";

/**
 * Part 3D — shared alert creation/dedup logic, factored out of
 * `alert-engine.ts` in Stage 2 so `risk-engine.ts` can create real
 * `FounderAlert` rows through the exact same dedup rule instead of
 * duplicating it (Stage 2's own "never duplicate logic" instruction,
 * applied to Stage 2's own code, not just Part 3C's). Both the Alert
 * Engine's exception detectors and the Risk Engine's trend-based
 * detectors write into the same `FounderAlert` table — there is
 * deliberately no separate "risk" table, matching Stage 1's own "reuse,
 * don't duplicate storage" discipline.
 */
export async function upsertAlert(
  tx: EnterpriseTx,
  organizationKey: string,
  input: {
    alertType: FounderAlertType;
    severity: FounderAlertSeverity;
    title: string;
    description: string;
    sourceModule: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const existing = await tx.founderAlert.findFirst({
    where: {
      organizationKey, alertType: input.alertType, status: "ACTIVE",
      sourceEntityType: input.sourceEntityType ?? null, sourceEntityId: input.sourceEntityId ?? null,
    },
  });
  if (existing) return { created: false as const, alert: existing };
  const alert = await tx.founderAlert.create({
    data: {
      organizationKey, alertType: input.alertType, severity: input.severity, title: input.title,
      description: input.description, sourceModule: input.sourceModule,
      sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return { created: true as const, alert };
}

/**
 * Part 3D, Stage 5 (architecture review) — factored out of two files that
 * had independently written the identical inline query: Stage 2's
 * `brief-engine.ts` (`getCriticalActions`) and Stage 3's
 * `activity-supervision-service.ts` (`getActivitySupervision`), each
 * reading `FounderAlert` rows with `status: "ACTIVE", severity: "CRITICAL"`
 * differing only in their `take` limit. One shared implementation now,
 * two callers.
 */
export function listCriticalActiveAlerts(tx: EnterpriseTx, organizationKey: string, take = 50) {
  return tx.founderAlert.findMany({
    where: { organizationKey, status: "ACTIVE", severity: "CRITICAL" },
    orderBy: [{ detectedAt: "desc" }], take,
  });
}
