import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "./auth-service";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";
import { seedFoundation } from "./seed-service";

const inputSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(16).max(256), name: z.string().trim().min(2).max(120).default("Founder") });
export async function bootstrapFounder(prisma: PrismaClient, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new FoundationError("INVALID_BOOTSTRAP_INPUT", "Secure bootstrap inputs are required");
  await seedFoundation(prisma);
  const normalizedEmail = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { normalizedEmail } });
    const user = existing ?? await tx.user.create({ data: { email: parsed.data.email, normalizedEmail, name: parsed.data.name, passwordHash } });
    const role = await tx.role.findUniqueOrThrow({ where: { code: "FOUNDER_SUPER_ADMIN" } });
    const active = await tx.userRoleAssignment.findFirst({ where: { userId: user.id, roleId: role.id, status: "ACTIVE" } });
    if (!active) await tx.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, assignedById: user.id, assignmentReason: "Secure Founder bootstrap" } });
    if (!existing) await recordAudit(tx, { actorId: user.id, action: "founder.bootstrap", entityType: "User", entityId: user.id, afterState: { role: role.code } });
    return { userId: user.id, created: !existing, roleAssigned: true };
  });
}

export async function bootstrapFounderFromEnvironment(prisma: PrismaClient, env: NodeJS.ProcessEnv) {
  if (env.SEERA_DATABASE_ROLE !== "test") throw new FoundationError("BOOTSTRAP_TARGET_REJECTED", "Founder bootstrap is test-only in Block 3");
  return bootstrapFounder(prisma, { email: env.SEERA_FOUNDER_EMAIL, password: env.SEERA_FOUNDER_PASSWORD, name: env.SEERA_FOUNDER_NAME ?? "Founder" });
}
