import { z } from "zod";

const text = (max = 500) => z.string().trim().min(1).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).optional();
const phone = z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,18}$/).transform((v) => v.replace(/[^\d+]/g, ""));
// Exported so other schemas (e.g. lib/validations/inst-sales.ts's
// Institutional Sales lead-conversion form) reuse this exact GSTIN rule
// instead of re-declaring a weaker length-only check. Preprocessed so a
// blank/whitespace-only string (what an empty HTML input actually submits,
// not `undefined`) is treated as "not provided" rather than failing the
// 15-character format regex — GSTIN must stay genuinely optional.
export const gst = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, "Enter a valid 15-character GSTIN").optional(),
);

export const PUBLIC_CHANNEL_CODES = [
  "INSTITUTIONAL_SALES", "CORPORATE_INQUIRY", "BULK_ORDER", "QUOTATION_REQUEST",
  "SAMPLE_REQUEST", "DEALER_APPLICATION", "DISTRIBUTOR_APPLICATION",
  "FRANCHISE_INQUIRY", "CONTACT_SALES",
] as const;

export const publicInquirySchema = z.object({
  channelCode: z.enum(PUBLIC_CHANNEL_CODES),
  customerTypeCode: z.enum(["D2C", "INSTITUTIONAL", "CORPORATE", "DEALER", "DISTRIBUTOR", "FRANCHISE", "EXPORT"]),
  leadSourceCode: z.string().trim().max(50).default("WEBSITE"),
  name: text(120),
  businessName: optionalText(160),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: phone.optional(),
  gstNumber: gst,
  city: optionalText(100),
  state: optionalText(100),
  subject: text(160),
  requirementSummary: text(5000),
  consent: z.literal(true),
  honeypot: z.string().max(0).default(""),
  idempotencyKey: z.string().uuid(),
  sourceUrl: z.string().url().max(1000).optional(),
  campaignData: z.record(z.string().max(200)).optional(),
  territoryId: z.string().cuid().optional(),
  detail: z.record(z.unknown()),
  attachment: z.object({
    storageReference: z.string().min(1).max(500),
    originalFilename: z.string().min(1).max(200),
    mimeType: z.enum([
      "application/pdf", "image/png", "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
    extension: z.enum(["pdf", "png", "jpg", "jpeg", "docx", "xlsx"]),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  }).optional(),
}).refine((data) => data.email || data.phone, { message: "Phone or email is required", path: ["phone"] });

export type PublicInquiryInput = z.infer<typeof publicInquirySchema>;

const stringList = z.array(text(160)).min(1).max(100);
export const channelDetailSchemas: Record<typeof PUBLIC_CHANNEL_CODES[number], z.ZodTypeAny> = {
  INSTITUTIONAL_SALES: z.object({ institutionType: text(100), organizationName: text(160), monthlyRequirement: text(160), requestedCategories: stringList, siteVisitRequired: z.boolean().default(false), remarks: optionalText(2000) }),
  CORPORATE_INQUIRY: z.object({ companyName: text(160), industry: text(120), locations: z.coerce.number().int().positive(), requestedCategories: stringList, decisionMaker: optionalText(160), remarks: optionalText(2000) }),
  BULK_ORDER: z.object({ deliveryCity: text(100), requestedProducts: stringList, requestedQuantities: z.array(z.coerce.number().int().positive()).min(1), requiredDate: z.coerce.date(), estimatedBudget: z.coerce.number().int().positive().optional(), remarks: optionalText(2000) }),
  QUOTATION_REQUEST: z.object({ requestedProducts: stringList, quantities: z.array(z.coerce.number().int().positive()).min(1), deliveryLocation: text(300), requiredDate: z.coerce.date().optional(), remarks: optionalText(2000) }),
  SAMPLE_REQUEST: z.object({ requestedProducts: stringList, reason: text(2000), expectedMonthlyPurchase: text(160), deliveryAddress: text(1000), remarks: optionalText(2000) }),
  DEALER_APPLICATION: z.object({ businessName: text(160), businessType: text(100), yearsInBusiness: z.coerce.number().int().nonnegative(), marketArea: text(300), requestedTerritory: text(160), currentBrands: z.array(text(100)).default([]), expectedInitialOrder: z.coerce.number().int().positive().optional(), remarks: optionalText(2000) }),
  DISTRIBUTOR_APPLICATION: z.object({ businessName: text(160), warehouseCapacity: text(300), investmentCapacity: z.coerce.number().int().positive(), requestedTerritory: text(160), currentBrands: z.array(text(100)).default([]), dealerCount: z.coerce.number().int().nonnegative().optional(), salesTeamSize: z.coerce.number().int().nonnegative().optional(), vehicleCount: z.coerce.number().int().nonnegative().optional(), remarks: optionalText(2000) }),
  FRANCHISE_INQUIRY: z.object({ applicantName: text(160), preferredCity: text(100), investmentCapacity: z.coerce.number().int().positive(), propertyAvailable: z.boolean().default(false), timelineExpectation: text(160), businessExperience: text(2000), remarks: optionalText(2000) }),
  CONTACT_SALES: z.object({ contactReason: text(160), preferredContactMethod: optionalText(50), preferredContactTime: optionalText(100), remarks: optionalText(2000) }),
};
