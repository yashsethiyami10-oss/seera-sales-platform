import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { getApprovalCenter } from "@/lib/founder-os/approval-center-service";
import { getEnterpriseMonitoring } from "@/lib/founder-os/monitoring-service";
import { getExceptionCenter } from "@/lib/founder-os/exception-center-service";
import { getActivitySupervision } from "@/lib/founder-os/activity-supervision-service";
import { escalateNotification, getEscalationCandidates, isEscalationDue } from "@/lib/founder-os/notification-rules";

const suffix = `fo3${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function authAs(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
}

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

let founderUserId: string;
let restrictedUserId: string;
let createdRestrictedUser = false;
let escalationCandidateId: string;

describe("Part 3D Stage 3 — Enterprise Control Center", () => {
  beforeAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
      await setFlag(key, true);
    }

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      restrictedUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "Founder OS Stage 3 Restricted Test User", email: `founder-os-s3-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    // A deterministic, already-aged, unread, HIGH-priority notification —
    // real escalation-eligible data, not a mock. createdAt is explicitly
    // backdated past ESCALATION_UNREAD_AGE_HOURS (24h) since Prisma's
    // `@default(now())` still accepts an explicit override on create.
    const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const notification = await prisma.founderNotification.create({
      data: {
        organizationKey: "MUV", recipientId: founderUserId, category: "ALERT", priority: "HIGH",
        title: `Escalation candidate ${suffix}`, body: "Test notification aged past the escalation threshold",
        createdAt: backdated,
      },
    });
    escalationCandidateId = notification.id;
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
      await setFlag(key, false);
    }
    await prisma.founderNotification.deleteMany({ where: { organizationKey: "MUV", title: { contains: suffix } } });
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  describe("access control", () => {
    it("denies every Stage 3 entry point without founder_os.access", async () => {
      authAs(restrictedUserId);
      await expect(getApprovalCenter()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getEnterpriseMonitoring()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getExceptionCenter()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getActivitySupervision()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getEscalationCandidates()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("denies escalating a notification without founder_os.notifications.manage", async () => {
      authAs(restrictedUserId);
      await expect(escalateNotification(escalationCandidateId)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("Approval Center", () => {
    it("returns pending/escalated/completed/rejected sections, each a real bounded list", async () => {
      authAs(founderUserId);
      const center = await getApprovalCenter();
      expect(Array.isArray(center.pending.vendorPayments)).toBe(true);
      expect(Array.isArray(center.pending.expenseClaims)).toBe(true);
      expect(center.pending.count).toBe(center.pending.vendorPayments.length + center.pending.expenseClaims.length);
      expect(center.escalated.thresholdHours).toBe(48);
      expect(Array.isArray(center.completed.vendorPayments)).toBe(true);
      expect(Array.isArray(center.rejected.expenseClaims)).toBe(true);
      // Vendor payments have no rejection concept in the frozen Part 3C model.
      expect(center.rejected.note).toContain("Vendor payments");
    });
  });

  describe("Enterprise Monitoring", () => {
    it("reports background jobs, queues, and honestly discloses no scheduler exists", async () => {
      authAs(founderUserId);
      const monitoring = await getEnterpriseMonitoring();
      expect(Array.isArray(monitoring.backgroundJobs.pendingOrRunning)).toBe(true);
      expect(Array.isArray(monitoring.backgroundJobs.recentlyFailed)).toBe(true);
      expect(["GOOD", "WATCH", "AT_RISK"]).toContain(monitoring.backgroundJobs.health);
      expect(monitoring.scheduledTasks.supported).toBe(false);
      expect(monitoring.scheduledTasks.tasks).toEqual([]);
    });
  });

  describe("Exception Center", () => {
    it("groups active alerts by their real sourceModule, never a hardcoded list", async () => {
      authAs(founderUserId);
      const alert = await prisma.founderAlert.create({
        data: {
          organizationKey: "MUV", alertType: "FINANCE_EXCEPTION", severity: "WARNING",
          title: `Exception center test ${suffix}`, description: "Test alert for grouping", sourceModule: "TEST",
        },
      });
      try {
        const exceptions = await getExceptionCenter();
        expect(exceptions.totalActive).toBeGreaterThanOrEqual(1);
        const testModule = exceptions.byModule.find((m) => m.sourceModule === "TEST");
        expect(testModule).toBeDefined();
        expect(testModule!.bySeverity.WARNING).toBeGreaterThanOrEqual(1);
      } finally {
        await prisma.founderAlert.delete({ where: { id: alert.id } });
      }
    });
  });

  describe("Enterprise Activity Supervision", () => {
    it("composes the existing activity feed with CRITICAL-severity priority events", async () => {
      authAs(founderUserId);
      const supervision = await getActivitySupervision({ pageSize: 5 });
      expect(supervision.recentActions.items.length).toBeLessThanOrEqual(5);
      expect(Array.isArray(supervision.priorityEvents.items)).toBe(true);
      expect(supervision.priorityEvents.items.every((a) => a.severity === "CRITICAL")).toBe(true);
    });
  });

  describe("Notification Rules", () => {
    it("evaluates the escalation rule as a pure function", () => {
      const now = new Date();
      expect(isEscalationDue({ priority: "HIGH", readAt: null, createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) }, now)).toBe(true);
      expect(isEscalationDue({ priority: "HIGH", readAt: null, createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000) }, now)).toBe(false);
      expect(isEscalationDue({ priority: "HIGH", readAt: now, createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) }, now)).toBe(false);
      expect(isEscalationDue({ priority: "CRITICAL", readAt: null, createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) }, now)).toBe(false);
    });

    it("finds the backdated candidate and escalates it to CRITICAL, refusing a second escalation", async () => {
      authAs(founderUserId);
      const candidates = await getEscalationCandidates();
      expect(candidates.items.some((n) => n.id === escalationCandidateId)).toBe(true);

      const escalated = await escalateNotification(escalationCandidateId);
      expect(escalated.priority).toBe("CRITICAL");

      await expect(escalateNotification(escalationCandidateId)).rejects.toBeInstanceOf(AppError);
    });
  });
});
