"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import {
  unitSchema, updateUnitSchema,
  brandSchema, updateBrandSchema,
  departmentSchema, updateDepartmentSchema,
  institutionCategorySchema, updateInstitutionCategorySchema,
  paymentTermsSchema, updatePaymentTermsSchema,
} from "@/lib/validations/master-data";
import { z } from "zod";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Common
 * Masters. Six small, near-identical entities (Unit, Brand, Department,
 * Institution Category, Payment Terms, Customer Type/Tax reuse the
 * existing CustomerType/TaxConfiguration models directly) — deliberately
 * kept as plain, repeated CRUD functions rather than one generic engine:
 * Server Actions must be individually exported named functions for Next.js
 * to treat them as callable actions, so a "generic" version would still
 * need one exported wrapper per entity anyway, at the cost of an extra
 * layer of indirection for no real benefit.
 *
 * Every list function only requires a valid Sales principal (no specific
 * permission) — these are reference data used to populate dropdowns
 * everywhere (Customer forms, Employee forms, etc.), not sensitive
 * records. Every mutation requires `MASTER_DATA_MANAGE`.
 */

const listQuery = z.object({ q: z.string().trim().max(100).optional(), activeOnly: z.boolean().default(false) });

// ---- Unit ----
export async function listUnits(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.unit.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createUnit(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = unitSchema.parse(input);
    const unit = await prisma.unit.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: unit };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateUnit(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateUnitSchema.parse(input);
    const existing = await prisma.unit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Unit");
    const updated = await prisma.unit.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Brand ----
export async function listBrands(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.brand.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createBrand(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = brandSchema.parse(input);
    const brand = await prisma.brand.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: brand };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateBrand(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateBrandSchema.parse(input);
    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Brand");
    const updated = await prisma.brand.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Department ----
export async function listDepartments(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.department.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createDepartment(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = departmentSchema.parse(input);
    const department = await prisma.department.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: department };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateDepartment(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateDepartmentSchema.parse(input);
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Department");
    const updated = await prisma.department.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Institution Category ("must be Admin Configurable") ----
export async function listInstitutionCategories(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.institutionCategory.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createInstitutionCategory(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = institutionCategorySchema.parse(input);
    const category = await prisma.institutionCategory.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: category };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateInstitutionCategory(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateInstitutionCategorySchema.parse(input);
    const existing = await prisma.institutionCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Institution category");
    const updated = await prisma.institutionCategory.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Payment Terms ----
export async function listPaymentTerms(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.paymentTerms.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: { days: "asc" },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createPaymentTerms(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = paymentTermsSchema.parse(input);
    const term = await prisma.paymentTerms.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: term };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updatePaymentTerms(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updatePaymentTermsSchema.parse(input);
    const existing = await prisma.paymentTerms.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Payment terms");
    const updated = await prisma.paymentTerms.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Customer Type — reuses the existing CustomerType model (already
// used by Inquiries/Opportunities/Quotations); this milestone only adds
// the ability to manage it, not a new table. ----
export async function listCustomerTypes(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { q, activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.customerType.findMany({
      where: { AND: [activeOnly ? { active: true } : {}, q ? { name: { contains: q, mode: "insensitive" } } : {}] },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createCustomerType(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = unitSchema.parse(input); // identical name/code/active shape
    const type = await prisma.customerType.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: type };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateCustomerType(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateUnitSchema.parse(input);
    const existing = await prisma.customerType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Customer type");
    const updated = await prisma.customerType.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---- Tax Masters — reuses the existing TaxConfiguration model (already
// used by Quotation line items). ----
const taxConfigurationSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(2).max(80),
  rate: z.number().min(0).max(100),
  inclusive: z.boolean().default(false),
  active: z.boolean().default(true),
});
const updateTaxConfigurationSchema = taxConfigurationSchema.partial().extend({ id: z.string().cuid() });

/**
 * Refinement pass — real bug found during the browser audit: Prisma's
 * `Decimal` (a decimal.js class instance, not a plain object) was being
 * returned straight from these actions and passed as a prop from the
 * Server Component page into the Client Component tab UI. React refuses
 * to serialize a class instance across that boundary ("Only plain objects
 * can be passed to Client Components from Server Components") — the same
 * class of bug already found and fixed once this milestone for
 * `NavManifestEntry.icon` (a function, also non-serializable). Fixed by
 * converting `rate` to a plain `number` before it ever leaves this file.
 */
function serializeTaxRate<T extends { rate: unknown }>(row: T): Omit<T, "rate"> & { rate: number } {
  return { ...row, rate: Number(row.rate) };
}

export async function listTaxRates(input?: unknown) {
  try {
    await getSalesPrincipal();
    const { activeOnly } = listQuery.parse(input ?? {});
    const items = await prisma.taxConfiguration.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { rate: "asc" },
    });
    return { success: true as const, data: items.map(serializeTaxRate) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function createTaxRate(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const data = taxConfigurationSchema.parse(input);
    const tax = await prisma.taxConfiguration.create({ data });
    revalidatePath("/os/masters");
    return { success: true as const, data: serializeTaxRate(tax) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
export async function updateTaxRate(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
    const { id, ...data } = updateTaxConfigurationSchema.parse(input);
    const existing = await prisma.taxConfiguration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Tax rate");
    const updated = await prisma.taxConfiguration.update({ where: { id }, data });
    revalidatePath("/os/masters");
    return { success: true as const, data: serializeTaxRate(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
