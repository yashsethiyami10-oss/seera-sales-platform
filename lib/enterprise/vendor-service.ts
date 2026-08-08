import { z } from "zod";
import { AppError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { requireEnterprisePrincipal, requireVersion } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";

const vendorInput = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160),
  categoryCode: z.string().trim().max(80).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  primaryContactName: z.string().trim().max(160).optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().trim().max(40).optional(),
  notes: z.string().max(5000).optional(),
});

const transitions: Record<string, readonly string[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ACTIVE", "SUSPENDED", "INACTIVE"],
  ACTIVE: ["SUSPENDED", "INACTIVE"],
  SUSPENDED: ["ACTIVE", "INACTIVE"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export async function createVendor(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_VENDOR_CREATE, "ENTERPRISE_VENDOR_ENABLED");
  const data = vendorInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const duplicate = await tx.enterpriseVendor.findFirst({
      where: {
        organizationKey: principal.organizationKey,
        OR: [
          { legalName: { equals: data.legalName, mode: "insensitive" } },
          ...(data.primaryContactEmail ? [{ primaryContactEmail: data.primaryContactEmail }] : []),
        ],
        archivedAt: null,
      },
    });
    if (duplicate) throw new AppError("A matching vendor already exists", 409, "DUPLICATE_VENDOR");
    const vendorCode = await nextEnterpriseNumber(tx, principal.organizationKey, "VENDOR", "VEN");
    const vendor = await tx.enterpriseVendor.create({
      data: { ...data, vendorCode, organizationKey: principal.organizationKey, createdById: principal.id },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_vendor", action: "VENDOR_CREATED", entityType: "EnterpriseVendor",
      entityId: vendor.id, description: `Vendor ${vendor.vendorCode} created`,
      next: { vendorCode, status: vendor.status },
    });
    return { entity: vendor, correlationId };
  });
}

export async function transitionVendor(id: string, targetStatus: string, version: number, reason?: string) {
  const permission = targetStatus === "APPROVED" || targetStatus === "ACTIVE"
    ? PERMISSIONS.ENTERPRISE_VENDOR_APPROVE
    : targetStatus === "SUSPENDED"
      ? PERMISSIONS.ENTERPRISE_VENDOR_SUSPEND
      : targetStatus === "ARCHIVED"
        ? PERMISSIONS.ENTERPRISE_VENDOR_ARCHIVE
        : PERMISSIONS.ENTERPRISE_VENDOR_UPDATE;
  const principal = await requireEnterprisePrincipal(permission, "ENTERPRISE_VENDOR_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const current = await tx.enterpriseVendor.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Vendor");
    requireVersion(current.version, version);
    if (!transitions[current.status]?.includes(targetStatus)) {
      throw new AppError("Invalid vendor lifecycle transition", 409, "INVALID_TRANSITION");
    }
    const vendor = await tx.enterpriseVendor.update({
      where: { id },
      data: {
        status: targetStatus,
        approvalStatus: targetStatus === "APPROVED" || targetStatus === "ACTIVE" ? "APPROVED" : current.approvalStatus,
        version: { increment: 1 },
        updatedById: principal.id,
        archivedAt: targetStatus === "ARCHIVED" ? new Date() : null,
      },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_vendor", action: `VENDOR_${targetStatus}`, entityType: "EnterpriseVendor",
      entityId: vendor.id, description: `Vendor ${vendor.vendorCode}: ${current.status} → ${targetStatus}`,
      previous: { status: current.status, version: current.version },
      next: { status: targetStatus, version: vendor.version, reason: reason ?? null },
    });
    return { entity: vendor, correlationId };
  });
}

export async function listVendors(input: { q?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_VENDOR_VIEW, "ENTERPRISE_VENDOR_ENABLED");
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.status ? { status: input.status } : {}),
    ...(input.q ? { OR: [
      { vendorCode: { contains: input.q, mode: "insensitive" as const } },
      { displayName: { contains: input.q, mode: "insensitive" as const } },
      { legalName: { contains: input.q, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseVendor.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseVendor.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

