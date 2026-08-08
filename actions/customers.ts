"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireUser, requireCustomer } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, ForbiddenError, AppError } from "@/lib/errors";
import {
  updateCustomerSchema,
  createAddressSchema,
  updateAddressSchema,
  addCustomerNoteSchema,
} from "@/lib/validations/customer";
import {
  createCustomerSchema,
  updateCustomerAdminSchema,
  customerContactPersonSchema,
  updateCustomerContactPersonSchema,
  customerListQuerySchema,
  customerDocumentSchema,
} from "@/lib/validations/master-data";
import { requirePermission, requireAnyPermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { toCSV, csvToRecords } from "@/lib/import-export/csv";

/**
 * Phase 5.4 (Customer Intelligence) self-service reads — a customer
 * reading their own profile/addresses. No existing read function covered
 * this (the storefront simply reads `Customer.addresses` inline wherever
 * needed, e.g. checkout) — genuinely new, but the same
 * `requireCustomer()`-then-resolve-own-row pattern every other
 * customer-only action in this codebase already uses.
 */
export async function getMyProfile() {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");
    // Decimal fields must be Number()-serialized before crossing to a
    // Client Component — same rule this file's own admin reads already
    // follow (see `creditLimit` handling elsewhere in this file).
    return {
      success: true as const,
      data: { ...customer, creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getMyAddresses() {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id }, include: { addresses: true } });
    if (!customer) return { success: true as const, data: [] };
    return { success: true as const, data: customer.addresses };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** A customer editing their own profile, or staff editing any profile. */
export async function updateCustomer(input: unknown) {
  try {
    const user = await requireUser();
    const data = updateCustomerSchema.parse(input);

    const customer = await prisma.customer.findUnique({ where: { id: data.id } });
    if (!customer) throw new NotFoundError("Customer");

    const isOwner = customer.userId === user.id;
    const isStaff = user.role === "ADMIN" || user.role === "STAFF";
    if (!isOwner && !isStaff) throw new ForbiddenError();

    const { id, ...rest } = data;
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.customer.update({ where: { id }, data: rest });
      await tx.salesTimelineEvent.create({ data: { actorId: user.id, customerId: id, eventType: "PROFILE_UPDATED", relatedRecordType: "Customer", relatedRecordId: id, description: "Customer profile updated" } });
      return value;
    });

    revalidatePath("/account/profile");
    revalidatePath("/admin/customers");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addAddress(input: unknown) {
  try {
    const user = await requireUser();
    const data = createAddressSchema.parse(input);

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.userId !== user.id) throw new ForbiddenError();

    if (data.isDefault) {
      await prisma.address.updateMany({ where: { customerId: data.customerId }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({ data });
    revalidatePath("/account/profile");
    return { success: true as const, data: address };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateAddress(input: unknown) {
  try {
    const user = await requireUser();
    const { id, ...data } = updateAddressSchema.parse(input);

    const existing = await prisma.address.findUnique({ where: { id }, include: { customer: true } });
    if (!existing) throw new NotFoundError("Address");
    if (existing.customer.userId !== user.id) throw new ForbiddenError();

    if (data.isDefault) {
      await prisma.address.updateMany({ where: { customerId: existing.customerId }, data: { isDefault: false } });
    }
    const updated = await prisma.address.update({ where: { id }, data });
    revalidatePath("/account/profile");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteAddress(id: string) {
  try {
    const user = await requireUser();
    const existing = await prisma.address.findUnique({ where: { id }, include: { customer: true } });
    if (!existing) throw new NotFoundError("Address");
    if (existing.customer.userId !== user.id) throw new ForbiddenError();

    await prisma.address.delete({ where: { id } });
    revalidatePath("/account/profile");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Staff-only — internal notes are never exposed to the customer themselves. */
export async function addCustomerNote(input: unknown) {
  try {
    const staff = await requireStaff();
    const data = addCustomerNoteSchema.parse(input);

    const note = await prisma.customerNote.create({
      data: { customerId: data.customerId, body: data.body, authorId: staff.id },
    });
    revalidatePath("/admin/customers");
    return { success: true as const, data: note };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/* =============================================================================
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation).
 * Admin-side Customer Master — every function below is gated through
 * `lib/sales/authorization.ts`'s permission system (the one already
 * governing Inquiries/Opportunities/Quotations), not the coarser
 * ADMIN/STAFF-only `lib/rbac.ts` used by the storefront actions above.
 * Master data is explicitly meant to serve the same Sales/Enterprise
 * userbase already governed by that system — introducing a third,
 * parallel authorization scheme here would be exactly the kind of
 * unnecessary duplication this milestone's own rules forbid.
 * ============================================================================= */

/** Bare random code + collision retry — the same pattern `actions/orders.ts`'s
 * `generateOrderNumber`/`withOrderNumberRetry` already established for this
 * exact problem in this exact domain (base Sales schema, not the Enterprise
 * v3 track's `nextEnterpriseNumber` sequence table, which is
 * organizationKey-scoped and belongs to a different system). */
function generateCustomerCode() {
  return `CUST${Math.floor(100000 + Math.random() * 900000)}`;
}

async function withCustomerCodeRetry<T>(attempt: (customerCode: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await attempt(generateCustomerCode());
    } catch (err) {
      const isCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("customerCode");
      if (!isCollision || i === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Refinement pass — real bug found via a real-browser audit:
 * `Customer.creditLimit` is a Prisma `Decimal` (a decimal.js class
 * instance, not a plain object). Every function below that returns a
 * Customer row is called directly from a Client Component
 * (`CustomerForm`/`CustomerActiveToggle`) — a Server Action's return value
 * crosses the same Server→Client serialization boundary as a prop does,
 * so React refuses a raw Decimal there too ("Only plain objects can be
 * passed to Client Components from Server Components"). Data-dependent —
 * only manifests once a customer actually has a credit limit set, which is
 * why it wasn't caught by earlier default/empty-data checks. One shared
 * helper so every Customer-returning function serializes identically.
 */
function serializeCustomer<T extends { creditLimit: unknown }>(row: T): Omit<T, "creditLimit"> & { creditLimit: number | null } {
  return { ...row, creditLimit: row.creditLimit ? Number(row.creditLimit) : null };
}

export async function createCustomer(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const data = createCustomerSchema.parse(input);

    const created = await withCustomerCodeRetry((customerCode) =>
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: { ...data, customerCode, name: data.name, email: `${customerCode.toLowerCase()}@no-login.muv.local`.slice(0, 254) },
        });
        await tx.salesTimelineEvent.create({
          data: {
            actorId: principal.id, customerId: customer.id, eventType: "CUSTOMER_CREATED",
            relatedRecordType: "Customer", relatedRecordId: customer.id,
            description: `Customer ${customer.customerCode} created`,
          },
        });
        return customer;
      })
    );

    revalidatePath("/os/customers");
    return { success: true as const, data: serializeCustomer(created) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateCustomerAdmin(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const { id, ...data } = updateCustomerAdminSchema.parse(input);

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Customer");

    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.customer.update({ where: { id }, data });
      await tx.salesTimelineEvent.create({
        data: {
          actorId: principal.id, customerId: id, eventType: "PROFILE_UPDATED",
          relatedRecordType: "Customer", relatedRecordId: id, description: "Customer profile updated by staff",
        },
      });
      return value;
    });

    revalidatePath("/os/customers");
    revalidatePath(`/os/customers/${id}`);
    return { success: true as const, data: serializeCustomer(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function setCustomerActive(id: string, active: boolean) {
  try {
    const principal = await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Customer");

    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.customer.update({ where: { id }, data: { active } });
      await tx.salesTimelineEvent.create({
        data: {
          actorId: principal.id, customerId: id, eventType: active ? "CUSTOMER_REACTIVATED" : "CUSTOMER_DEACTIVATED",
          relatedRecordType: "Customer", relatedRecordId: id,
          description: active ? "Customer reactivated" : "Customer deactivated (soft delete)",
        },
      });
      return value;
    });

    revalidatePath("/os/customers");
    return { success: true as const, data: serializeCustomer(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Refinement pass — Customer Dashboard summary cards. One query per card,
 * run in parallel; each count uses the exact same scope/permission rule
 * `listCustomers` already uses, so a card's number always matches what
 * clicking it actually filters down to.
 */
const SUMMARY_CUSTOMER_TYPES = ["Institutional", "Individual", "Distributor", "Dealer", "Retailer"] as const;

export async function getCustomerSummaryCounts() {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.CUSTOMERS_VIEW_ALL, PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED);
    const scope = buildCustomerScope(principal);

    const [all, inactive, byType] = await Promise.all([
      prisma.customer.count({ where: scope }),
      prisma.customer.count({ where: { AND: [scope, { active: false }] } }),
      Promise.all(
        SUMMARY_CUSTOMER_TYPES.map((name) =>
          prisma.customer.count({ where: { AND: [scope, { active: true }, { customerType: { name } }] } })
        )
      ),
    ]);

    const byTypeCounts: Record<string, number> = Object.fromEntries(
      SUMMARY_CUSTOMER_TYPES.map((name, i) => [name, byType[i] ?? 0])
    );
    return { success: true as const, data: { all, inactive, byType: byTypeCounts } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

function buildCustomerScope(principal: Awaited<ReturnType<typeof getSalesPrincipal>>): Prisma.CustomerWhereInput {
  if (principal.isFounder || principal.permissions.has(PERMISSIONS.CUSTOMERS_VIEW_ALL)) return {};
  if (principal.permissions.has(PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED)) return { assignedOwnerId: principal.id };
  throw new ForbiddenError("You do not have permission to view customers");
}

/** Search/filter/sort/pagination — mirrors `lib/sales-channel/repository.ts`'s
 * `listLeads` return shape (`{ items, total, page, pageSize, pages }`) exactly,
 * the established convention for every list action in this codebase. */
export async function listCustomers(input: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.CUSTOMERS_VIEW_ALL, PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED);
    const query = customerListQuerySchema.parse(input ?? {});
    const scope = buildCustomerScope(principal);

    const where: Prisma.CustomerWhereInput = {
      AND: [
        scope,
        query.active !== undefined ? { active: query.active } : {},
        query.customerTypeId ? { customerTypeId: query.customerTypeId } : {},
        query.institutionCategoryId ? { institutionCategoryId: query.institutionCategoryId } : {},
        query.territoryId ? { assignedTerritoryId: query.territoryId } : {},
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { businessName: { contains: query.q, mode: "insensitive" } },
                { customerCode: { contains: query.q, mode: "insensitive" } },
                { email: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q, mode: "insensitive" } },
                { gstNumber: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true, customerCode: true, name: true, businessName: true, phone: true, email: true,
          crmStatus: true, active: true, creditLimit: true, customerSince: true,
          createdAt: true, updatedAt: true,
          customerType: { select: { id: true, name: true } },
          institutionCategory: { select: { name: true } },
          assignedTerritory: { select: { name: true } },
          assignedOwner: { select: { name: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      success: true as const,
      data: { items, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getCustomerDetail(id: string) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.CUSTOMERS_VIEW_ALL, PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED);
    const scope = buildCustomerScope(principal);

    const customer = await prisma.customer.findFirst({
      where: { AND: [{ id }, scope] },
      include: {
        customerType: true,
        institutionCategory: true,
        assignedTerritory: true,
        assignedOwner: { select: { id: true, name: true, email: true } },
        paymentTerms: true,
        contactPersons: { orderBy: { createdAt: "asc" } },
        documents: { include: { mediaAsset: true }, orderBy: { createdAt: "desc" } },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
        salesTimeline: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!customer) throw new NotFoundError("Customer");

    // Refinement pass — real bug found via a real-browser audit: this
    // object is passed as a prop straight into `CustomerDetailTabs` (a
    // Client Component). `creditLimit` is a Prisma `Decimal` (a decimal.js
    // class instance) — React refuses to serialize a class instance across
    // the Server→Client boundary. Data-dependent: only manifested for a
    // customer that actually had a credit limit set, which is why it
    // wasn't caught by earlier default/empty-data smoke tests.
    return { success: true as const, data: { ...customer, creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addContactPerson(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const data = customerContactPersonSchema.parse(input);
    const contact = await prisma.customerContactPerson.create({ data });
    revalidatePath(`/os/customers/${data.customerId}`);
    return { success: true as const, data: contact };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateContactPerson(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const { id, ...data } = updateCustomerContactPersonSchema.parse(input);
    const existing = await prisma.customerContactPerson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Contact person");
    const updated = await prisma.customerContactPerson.update({ where: { id }, data });
    revalidatePath(`/os/customers/${existing.customerId}`);
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteContactPerson(id: string) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const existing = await prisma.customerContactPerson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Contact person");
    await prisma.customerContactPerson.delete({ where: { id } });
    revalidatePath(`/os/customers/${existing.customerId}`);
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Links an already-uploaded MediaAsset (via actions/media.ts's existing
 * getUploadUrl/confirmUpload — unchanged, reused as-is) to a customer. This
 * action never touches Cloudinary itself, only the join row. */
export async function addCustomerDocument(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const data = customerDocumentSchema.parse(input);
    const document = await prisma.customerDocument.create({ data, include: { mediaAsset: true } });
    revalidatePath(`/os/customers/${data.customerId}`);
    return { success: true as const, data: document };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteCustomerDocument(id: string) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const existing = await prisma.customerDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Document");
    await prisma.customerDocument.delete({ where: { id } });
    revalidatePath(`/os/customers/${existing.customerId}`);
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const EXPORT_COLUMNS = [
  { key: "customerCode", header: "Customer Code" }, { key: "name", header: "Name" },
  { key: "businessName", header: "Business Name" }, { key: "phone", header: "Phone" },
  { key: "email", header: "Email" }, { key: "crmStatus", header: "Status" },
  { key: "active", header: "Active" }, { key: "creditLimit", header: "Credit Limit" },
] as const;

/** Export Foundation — the same scope/filter rules as `listCustomers`, capped
 * at 5,000 rows so this cannot be turned into an unbounded full-table dump. */
export async function exportCustomersCsv(input: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.CUSTOMERS_VIEW_ALL, PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED);
    const query = customerListQuerySchema.parse(input ?? {});
    const scope = buildCustomerScope(principal);
    const where: Prisma.CustomerWhereInput = {
      AND: [scope, query.active !== undefined ? { active: query.active } : {}],
    };
    const rows = await prisma.customer.findMany({
      where, take: 5000, orderBy: { [query.sortBy]: query.sortDir },
      select: { customerCode: true, name: true, businessName: true, phone: true, email: true, crmStatus: true, active: true, creditLimit: true },
    });
    const csv = toCSV(rows, EXPORT_COLUMNS as unknown as { key: keyof (typeof rows)[number]; header: string }[]);
    return { success: true as const, data: { csv, count: rows.length } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Import Foundation, step 1 — parse + validate only, never writes to the
 * database. The UI shows this preview and only calls `commitCustomerImport`
 * once the user confirms. */
export async function previewCustomerImport(csvText: string) {
  try {
    await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const records = csvToRecords(csvText);
    if (records.length === 0) throw new AppError("The uploaded file has no data rows", 400, "EMPTY_IMPORT");
    if (records.length > 1000) throw new AppError("Import is limited to 1000 rows at a time", 400, "IMPORT_TOO_LARGE");

    const customerType = await prisma.customerType.findMany({ select: { id: true, name: true, code: true } });
    const byTypeName = new Map(customerType.map((t) => [t.name.toLowerCase(), t.id]));

    const results = records.map((record, index) => {
      const candidate = {
        name: record["Name"] ?? record["name"],
        businessName: record["Business Name"] || record["businessName"] || undefined,
        customerTypeId: byTypeName.get((record["Customer Type"] ?? record["customerType"] ?? "").toLowerCase()),
        phone: record["Phone"] ?? record["phone"],
        email: record["Email"] ?? record["email"],
        gstNumber: record["GST Number"] || record["gstNumber"] || undefined,
      };
      const parsed = createCustomerSchema.pick({ name: true, businessName: true, customerTypeId: true, phone: true, email: true, gstNumber: true }).safeParse(candidate);
      return parsed.success
        ? { row: index + 2, ok: true as const, data: parsed.data }
        : { row: index + 2, ok: false as const, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    });

    return {
      success: true as const,
      data: { total: results.length, validCount: results.filter((r) => r.ok).length, results },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Import Foundation, step 2 — commits rows the caller has already validated
 * via `previewCustomerImport` (re-validated here too — never trust client
 * state for what actually gets written). */
export async function commitCustomerImport(rows: unknown[]) {
  try {
    const principal = await requirePermission(PERMISSIONS.CUSTOMERS_MANAGE);
    const schema = createCustomerSchema.pick({ name: true, businessName: true, customerTypeId: true, phone: true, email: true, gstNumber: true });
    const validated = rows.map((row) => schema.parse(row));

    let created = 0;
    for (const data of validated) {
      await withCustomerCodeRetry((customerCode) =>
        prisma.$transaction(async (tx) => {
          const customer = await tx.customer.create({ data: { ...data, customerCode } });
          await tx.salesTimelineEvent.create({
            data: {
              actorId: principal.id, customerId: customer.id, eventType: "CUSTOMER_CREATED",
              relatedRecordType: "Customer", relatedRecordId: customer.id,
              description: `Customer ${customer.customerCode} created via CSV import`,
            },
          });
          return customer;
        })
      );
      created++;
    }

    revalidatePath("/os/customers");
    return { success: true as const, data: { created } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
