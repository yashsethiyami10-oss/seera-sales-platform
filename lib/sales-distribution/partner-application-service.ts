import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { validateLibraryFile } from "./company-library-service";
import { createDistributorProspect } from "./manager-service";

// Online Super Stockist / Distributor / Depot application, filled on the phone (by the field rep
// with the applicant, or handed to the applicant) instead of the paper form. A submission becomes
// a Prospect owned by the submitting staff member at stage EVALUATION, with the full application
// (and any KYC photos / PDFs) attached, so it flows through the existing Distributor-search pipeline.

const opt = (max = 200) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const req = (max = 200) => z.string().trim().min(1).max(max);

export const partnerApplicationSchema = z.object({
  type: z.enum(["SUPER_STOCKIST", "DISTRIBUTOR", "DEPOT"]),
  firmName: req(160),
  tradeName: opt(160),
  constitution: z.enum(["PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_LIMITED", "OTHER"]),
  yearEstablished: opt(4),
  gstStatus: z.enum(["REGULAR", "COMPOSITION", "UNREGISTERED"]),
  gstin: z.string().trim().toUpperCase().max(15).optional().transform((v) => v || undefined)
    .refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN must be 15 characters"),
  pan: z.string().trim().toUpperCase().max(10).optional().transform((v) => v || undefined)
    .refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "PAN format is ABCDE1234F"),
  address: req(400),
  city: req(120),
  district: opt(120),
  state: req(80),
  pincode: z.string().trim().max(6).optional().transform((v) => v || undefined).refine((v) => !v || /^[1-9][0-9]{5}$/.test(v), "PIN must be 6 digits"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  ownerName: req(120),
  fatherName: opt(120),
  mobile: z.string().trim().regex(/^[6-9][0-9]{9}$/, "Enter a 10-digit mobile number"),
  alternateMobile: opt(15),
  email: z.string().trim().max(160).optional().transform((v) => v || undefined).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Invalid email"),
  aadhaarLast4: z.string().trim().max(4).optional().transform((v) => v || undefined).refine((v) => !v || /^[0-9]{4}$/.test(v), "Only the last 4 digits"),
  yearsInBusiness: opt(10),
  turnover: opt(40),
  brandsHandled: opt(400),
  reach: opt(200),
  godown: opt(200),
  vehicles: opt(120),
  staff: opt(120),
  depotDetails: opt(600),
  areasApplied: req(400),
  mappedSuperStockist: opt(160),
  openingOrderValue: opt(40),
  monthlyPurchase: opt(80),
  securityDeposit: opt(80),
  bankName: opt(120),
  accountHolder: opt(120),
  accountNumber: z.string().trim().max(20).optional().transform((v) => v || undefined).refine((v) => !v || /^[0-9]{6,20}$/.test(v), "Account number must be digits"),
  ifsc: z.string().trim().toUpperCase().max(11).optional().transform((v) => v || undefined).refine((v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "IFSC format is ABCD0123456"),
  references: opt(400),
  remarks: opt(600),
  declarationAccepted: z.literal(true, { errorMap: () => ({ message: "The applicant must accept the declaration" }) }),
  confirmDuplicate: z.boolean().optional(),
}).strict();

export type PartnerApplicationInput = z.input<typeof partnerApplicationSchema>;
export type ApplicationFile = { originalName: string; mimeType: string; bytes: Uint8Array };

const MAX_FILES = 6;
const MAX_FILE_BYTES = 8_000_000;
const SUBMIT_PERMISSIONS = ["prospect:create", "system:super_admin"];

export async function submitPartnerApplication(db: PrismaClient, actorId: string, raw: unknown, files: ApplicationFile[] = []) {
  const input = partnerApplicationSchema.parse(raw);
  if (input.type !== "DISTRIBUTOR" && input.gstStatus !== "REGULAR")
    throw new FoundationError("GST_REGISTRATION_REQUIRED", "A Super Stockist / Depot must be GST-registered (Regular)", 400);
  if (input.gstStatus === "REGULAR" && !input.gstin) throw new FoundationError("GSTIN_REQUIRED", "Enter the GSTIN", 400);
  if (files.length > MAX_FILES) throw new FoundationError("TOO_MANY_FILES", `Attach at most ${MAX_FILES} files`, 400);
  for (const f of files) {
    if (f.bytes.length > MAX_FILE_BYTES) throw new FoundationError("FILE_TOO_LARGE", "Each file must be under 8 MB", 400);
    validateLibraryFile(f);
  }
  const { confirmDuplicate, declarationAccepted: _declared, ...application } = input;
  const submittedAt = new Date();
  const summary = [
    `Online ${input.type.replace("_", " ").toLowerCase()} application`,
    `${input.city}${input.district ? `, ${input.district}` : ""}, ${input.state}`,
    `Areas: ${input.areasApplied}`,
    input.openingOrderValue ? `Opening order ₹${input.openingOrderValue}` : null,
  ].filter(Boolean).join(" · ");
  const prospect = await createDistributorProspect(db, actorId, {
    businessName: input.firmName,
    mobile: input.mobile,
    alternateMobile: input.alternateMobile,
    existingBrands: input.brandsHandled,
    expectedVolume: input.monthlyPurchase,
    notes: summary.slice(0, 1000),
    prospectType: input.type,
    confirmDuplicate,
    profile: { source: "ONLINE_APPLICATION", applicationSubmittedAt: submittedAt.toISOString(), declarationAcceptedAt: submittedAt.toISOString(), application },
  });
  const fileIds: string[] = [];
  for (const f of files) {
    const file = await db.storedFile.create({ data: {
      provider: "DATABASE_PRIVATE", storageKey: `private/partner-applications/${randomBytes(24).toString("hex")}`,
      originalName: f.originalName.replace(/[\\/\0<>"\r\n]/g, "_").slice(0, 200), mimeType: f.mimeType,
      extension: f.originalName.split(".").pop()?.toLowerCase(), sizeBytes: BigInt(f.bytes.length),
      sha256: createHash("sha256").update(f.bytes).digest("hex"), classification: "IDENTITY", scanStatus: "CLEAN", lifecycleStatus: "ACTIVE",
      entityType: "SeeraProspect", entityId: prospect.id, uploadedById: actorId, contentBytes: Buffer.from(f.bytes),
    } });
    fileIds.push(file.id);
  }
  const updated = await db.seeraProspect.update({
    where: { id: prospect.id },
    data: {
      stage: "EVALUATION",
      profile: { source: "ONLINE_APPLICATION", applicationSubmittedAt: submittedAt.toISOString(), declarationAcceptedAt: submittedAt.toISOString(), application, documentFileIds: fileIds } as Prisma.InputJsonValue,
    },
  });
  await recordAudit(db, { actorId, action: "partner_application.submitted", entityType: "SeeraProspect", entityId: prospect.id, afterState: { type: input.type, firmName: input.firmName, files: fileIds.length } });
  return updated;
}

type ApplicationProfile = { source?: string; applicationSubmittedAt?: string; application?: Record<string, unknown>; documentFileIds?: string[] };

// Own applications for field staff; every application for the Founder / Admin.
export async function listPartnerApplications(db: PrismaClient, actorId: string) {
  const permissions = await effectivePermissions(db, actorId);
  const all = permissions.has("system:super_admin") || permissions.has("settings:manage");
  if (!all && !SUBMIT_PERMISSIONS.some((p) => permissions.has(p))) throw new FoundationError("ACCESS_DENIED", "Required permission denied", 403);
  const rows = await db.seeraProspect.findMany({
    where: { ...(all ? {} : { ownerEmployeeId: actorId }), profile: { path: ["source"], equals: "ONLINE_APPLICATION" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const owners = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ownerEmployeeId))] } }, select: { id: true, name: true, email: true } });
  const ownerName = new Map(owners.map((o) => [o.id, o.name ?? o.email]));
  return rows.map((r) => {
    const profile = (r.profile ?? {}) as ApplicationProfile;
    return {
      id: r.id, type: r.prospectType, firmName: r.businessName, mobile: r.normalizedMobile, stage: r.stage, status: r.status,
      submittedAt: profile.applicationSubmittedAt ? new Date(profile.applicationSubmittedAt) : r.createdAt,
      submittedBy: ownerName.get(r.ownerEmployeeId) ?? "—",
      application: profile.application ?? {}, documentCount: profile.documentFileIds?.length ?? 0,
    };
  });
}

export async function downloadPartnerApplicationFile(db: PrismaClient, actorId: string, prospectId: string, index: number) {
  const permissions = await effectivePermissions(db, actorId);
  const all = permissions.has("system:super_admin") || permissions.has("settings:manage");
  const prospect = await db.seeraProspect.findFirst({ where: { id: prospectId, ...(all ? {} : { ownerEmployeeId: actorId }) } });
  const fileId = ((prospect?.profile ?? {}) as ApplicationProfile).documentFileIds?.[index];
  if (!prospect || !fileId) throw new FoundationError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  const file = await db.storedFile.findFirst({ where: { id: fileId, lifecycleStatus: "ACTIVE", revokedAt: null } });
  if (!file?.contentBytes) throw new FoundationError("DOCUMENT_CONTENT_MISSING", "File content unavailable", 404);
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}
