import { z } from "zod";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation).
 *
 * Validation for every new/extended master introduced this milestone.
 * `lib/validations/customer.ts` keeps the storefront's own Customer
 * schemas unchanged — the admin-side Customer schemas below are new,
 * separate exports, not edits to that file's existing ones.
 */

const nameCodeActive = {
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(30).toUpperCase(),
  active: z.boolean().default(true),
};

// ---- Common Masters (Unit, Brand, Department — identical shape) ----
export const unitSchema = z.object(nameCodeActive);
export const updateUnitSchema = unitSchema.partial().extend({ id: z.string().cuid() });

export const brandSchema = z.object(nameCodeActive);
export const updateBrandSchema = brandSchema.partial().extend({ id: z.string().cuid() });

export const departmentSchema = z.object(nameCodeActive);
export const updateDepartmentSchema = departmentSchema.partial().extend({ id: z.string().cuid() });

// ---- Institution Category (name + active only — no `code`, per spec) ----
export const institutionCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});
export const updateInstitutionCategorySchema = institutionCategorySchema.partial().extend({ id: z.string().cuid() });

// ---- Payment Terms ----
export const paymentTermsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  days: z.number().int().min(0).max(365),
  description: z.string().trim().max(300).optional(),
  active: z.boolean().default(true),
});
export const updatePaymentTermsSchema = paymentTermsSchema.partial().extend({ id: z.string().cuid() });

// ---- Territory (State/City/Area/Territory levels of one hierarchy) ----
export const territorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).toUpperCase(),
  level: z.enum(["STATE", "CITY", "AREA", "TERRITORY"]),
  parentTerritoryId: z.string().cuid().optional(),
  active: z.boolean().default(true),
});
export const updateTerritorySchema = territorySchema.partial().extend({ id: z.string().cuid() });

// ---- Employee (extends the existing User record — see actions/employees.ts) ----
export const updateEmployeeSchema = z.object({
  id: z.string().cuid(),
  departmentId: z.string().cuid().nullable().optional(),
  designation: z.string().trim().max(100).nullable().optional(),
  reportingManagerId: z.string().cuid().nullable().optional(),
  territoryId: z.string().cuid().nullable().optional(),
  active: z.boolean().optional(),
});

// ---- Supplier (thin admin-facing wrapper over the existing EnterpriseVendor contract) ----
export const supplierSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160),
  categoryCode: z.string().trim().max(80).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  primaryContactName: z.string().trim().max(160).optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().trim().max(40).optional(),
  paymentTerms: z.string().trim().max(120).optional(),
  notes: z.string().max(5000).optional(),
});

const indianMobile = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

// ---- Customer — admin-side create/update (staff-only fields the
// storefront's own updateCustomer, in actions/customers.ts, never exposed) ----
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().max(200).optional(),
  customerTypeId: z.string().cuid(),
  institutionCategoryId: z.string().cuid().optional(),
  industry: z.string().trim().max(120).optional(),
  phone: indianMobile,
  alternatePhone: indianMobile.optional(),
  whatsappNumber: indianMobile.optional(),
  landlineNumber: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email(),
  website: z.string().trim().url().optional(),
  gstNumber: z.string().trim().max(15).optional(),
  pan: z.string().trim().max(10).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shippingAddress: z.string().trim().max(500).optional(),
  state: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  area: z.string().trim().max(100).optional(),
  pinCode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits").optional(),
  creditLimit: z.number().min(0).max(100_000_000).optional(),
  paymentTermsId: z.string().cuid().optional(),
  assignedOwnerId: z.string().cuid().optional(),
  assignedTerritoryId: z.string().cuid().optional(),
  customerSince: z.coerce.date().optional(),
});

export const updateCustomerAdminSchema = createCustomerSchema.partial().extend({ id: z.string().cuid() });

export const customerContactPersonSchema = z.object({
  customerId: z.string().cuid(),
  name: z.string().trim().min(2).max(100),
  designation: z.string().trim().max(100).optional(),
  mobile: indianMobile.optional(),
  whatsapp: indianMobile.optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  isDecisionMaker: z.boolean().default(false),
});
export const updateCustomerContactPersonSchema = customerContactPersonSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  customerTypeId: z.string().cuid().optional(),
  institutionCategoryId: z.string().cuid().optional(),
  territoryId: z.string().cuid().optional(),
  active: z.boolean().optional(),
  sortBy: z.enum(["name", "customerSince", "createdAt", "creditLimit"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const customerDocumentSchema = z.object({
  customerId: z.string().cuid(),
  mediaAssetId: z.string().cuid(),
  label: z.string().trim().min(1).max(150),
});
