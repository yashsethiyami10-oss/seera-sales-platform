import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";
import type { GrowthActor } from "./customer-intelligence";

const transitions: Record<string, string[]> = {
  CREATED: ["INVITED", "CANCELLED"], INVITED: ["REGISTERED", "CANCELLED"],
  REGISTERED: ["QUALIFIED", "REJECTED"], QUALIFIED: ["COMPLETED", "REJECTED"],
};

export async function postReward(actor: GrowthActor, input: {
  customerId: string; transactionTypeCode: string; points: number; reason: string;
  idempotencyKey?: string; referenceEntity?: string; referenceId?: string; referenceNumber?: string;
}) {
  if (!Number.isInteger(input.points) || input.points <= 0 || !input.reason.trim()) throw new AppError("Positive integer points and reason are required");
  return prisma.$transaction(async tx => {
    if (input.idempotencyKey) {
      const existing = await tx.rewardLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    const type = await tx.rewardTransactionType.findUnique({ where: { code: input.transactionTypeCode } });
    if (!type?.active) throw new AppError("Invalid reward transaction type");
    const profile = await tx.loyaltyProfile.upsert({
      where: { customerId: input.customerId }, update: {},
      create: { customerId: input.customerId, status: "ACTIVE" },
    });
    const movement = input.points * type.direction;
    if (profile.currentRewardBalance + movement < 0) throw new AppError("Insufficient reward balance", 409);
    const ledger = await tx.rewardLedgerEntry.create({ data: {
      ledgerNumber: "", customerId: input.customerId, transactionTypeId: type.id, points: movement,
      previousBalance: profile.currentRewardBalance, newBalance: profile.currentRewardBalance + movement,
      reason: input.reason, idempotencyKey: input.idempotencyKey, referenceEntity: input.referenceEntity,
      referenceId: input.referenceId, referenceNumber: input.referenceNumber, createdById: actor.id,
    } });
    await tx.loyaltyProfile.update({ where: { id: profile.id }, data: {
      currentRewardBalance: ledger.newBalance,
      lifetimeRewardEarned: { increment: movement > 0 ? movement : 0 },
      lifetimeRewardRedeemed: { increment: input.transactionTypeCode === "REDEEMED" ? input.points : 0 },
      lifetimeRewardExpired: { increment: input.transactionTypeCode === "EXPIRED" ? input.points : 0 },
      lastRecalculatedAt: new Date(),
    } });
    await tx.salesTimelineEvent.create({ data: {
      actorId: actor.id, customerId: input.customerId, eventType: `REWARD_${input.transactionTypeCode}`,
      relatedRecordType: "RewardLedgerEntry", relatedRecordId: ledger.id,
      description: `${movement} reward points: ${input.reason}`,
    } });
    await tx.salesAuditLog.create({ data: {
      userId: actor.id, module: "loyalty", action: `REWARD_${input.transactionTypeCode}`,
      recordType: "RewardLedgerEntry", recordId: ledger.id,
      newValue: { movement, previousBalance: ledger.previousBalance, newBalance: ledger.newBalance, reason: input.reason },
    } });
    return ledger;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignMembership(actor: GrowthActor, customerId: string, levelId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required");
  return prisma.$transaction(async tx => {
    const [profile, level] = await Promise.all([
      tx.loyaltyProfile.upsert({ where: { customerId }, update: {}, create: { customerId, status: "ACTIVE" } }),
      tx.membershipLevel.findUnique({ where: { id: levelId } }),
    ]);
    if (!level?.active) throw new NotFoundError("Membership level");
    const history = await tx.membershipHistory.create({ data: {
      customerId, previousLevelId: profile.membershipLevelId, newLevelId: level.id,
      reason, assignedById: actor.id, ruleVersion: level.ruleVersion,
    } });
    await tx.loyaltyProfile.update({ where: { id: profile.id }, data: { membershipLevelId: level.id, lastRecalculatedAt: new Date() } });
    await tx.salesTimelineEvent.create({ data: {
      actorId: actor.id, customerId, eventType: "MEMBERSHIP_CHANGED",
      relatedRecordType: "MembershipHistory", relatedRecordId: history.id, description: `${level.name}: ${reason}`,
    } });
    await tx.salesAuditLog.create({ data: {
      userId: actor.id, module: "loyalty", action: "MEMBERSHIP_CHANGED",
      recordType: "MembershipHistory", recordId: history.id,
      previousValue: { levelId: profile.membershipLevelId }, newValue: { levelId, reason },
    } });
    return history;
  });
}

export async function createReferral(actor: GrowthActor, referrerCustomerId: string, referredCustomerId: string) {
  if (referrerCustomerId === referredCustomerId) throw new AppError("Self-referral is not allowed");
  return prisma.$transaction(async tx => {
    const count = await tx.customer.count({ where: { id: { in: [referrerCustomerId, referredCustomerId] } } });
    if (count !== 2) throw new AppError("Invalid customer reference");
    const status = await tx.referralStatusDefinition.findUniqueOrThrow({ where: { code: "CREATED" } });
    const referral = await tx.customerReferral.create({ data: {
      referenceCode: "", referrerCustomerId, referredCustomerId, statusId: status.id,
    } });
    await tx.referralHistory.create({ data: { referralId: referral.id, newStatusId: status.id, changedById: actor.id, reason: "Referral created" } });
    await tx.salesAuditLog.create({ data: { userId: actor.id, module: "loyalty", action: "REFERRAL_CREATED", recordType: "CustomerReferral", recordId: referral.id } });
    return referral;
  });
}

export async function transitionReferral(actor: GrowthActor, referralId: string, targetCode: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required");
  return prisma.$transaction(async tx => {
    const referral = await tx.customerReferral.findUnique({ where: { id: referralId } });
    if (!referral) throw new NotFoundError("Referral");
    const [current, target] = await Promise.all([
      tx.referralStatusDefinition.findUniqueOrThrow({ where: { id: referral.statusId } }),
      tx.referralStatusDefinition.findUnique({ where: { code: targetCode } }),
    ]);
    if (!target || !transitions[current.code]?.includes(target.code)) throw new AppError("Illegal referral status transition", 409);
    const updated = await tx.customerReferral.update({ where: { id: referral.id }, data: {
      statusId: target.id, completedAt: target.code === "COMPLETED" ? new Date() : undefined,
    } });
    await tx.referralHistory.create({ data: { referralId, previousStatusId: current.id, newStatusId: target.id, changedById: actor.id, reason } });
    await tx.salesTimelineEvent.create({ data: {
      actorId: actor.id, customerId: referral.referrerCustomerId, eventType: `REFERRAL_${target.code}`,
      relatedRecordType: "CustomerReferral", relatedRecordId: referral.id, description: reason,
    } });
    await tx.salesAuditLog.create({ data: { userId: actor.id, module: "loyalty", action: `REFERRAL_${target.code}`, recordType: "CustomerReferral", recordId: referral.id, newValue: { reason } } });
    return updated;
  });
}
