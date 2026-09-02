import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// SEERA COMPANY PROFILE (Money Desk 2.0, Part AD) — the Founder-configured document identity used
// to render real Sales Invoices / Purchase Bills / Ledger Statements as "issued by SEERA" rather
// than a fabricated or missing legal identity. Deliberately reuses the EXISTING SeeraBillingProfile
// table (ownerType/ownerId "COMPANY") rather than a new model — this is the same table every
// Distributor/S.S./Company-Direct billing identity already lives in (distributor-management-
// service.ts's setPartnerBillingProfile); a Company Profile is just another row in it, not a
// second party/identity system. Unlike partner rows (always derived from an existing SeeraPartner —
// "do not invent legal identity"), the Founder genuinely IS the source of truth for the Company's
// OWN legal identity, so this is a direct, Founder-authored write — never auto-derived.
//
// The partner-billing versioning convention (effectiveFrom/effectiveTo, one VERIFIED row at a
// time) doesn't fit a single Founder settings record — there is exactly one current Company
// Profile, always. `COMPANY_EFFECTIVE_FROM` is a fixed epoch sentinel so [ownerType, ownerId,
// effectiveFrom] gives ONE stable natural key to upsert against, instead of ever-growing history.
const COMPANY_OWNER_TYPE = "COMPANY";
const COMPANY_OWNER_ID = "COMPANY";
const COMPANY_EFFECTIVE_FROM = new Date(0);

export type CompanyProfileInput = {
  legalName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  address: Record<string, unknown>;
  state: string;
  stateCode: string;
  phone?: string;
  email?: string;
  website?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  ifsc?: string;
  upiId?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  invoicePrefix?: string;
  termsAndConditions?: string;
};

// Internal read — no authorize() call by design. This is invoked from partySnapshot() (document
// issuance, already authorized by whatever created the document) and from PDF-rendering call
// sites (already authorized to view/download that specific document) — gating this a SECOND time
// on a narrower permission would block those legitimate, already-governed callers. GSTIN/PAN/
// address are the kind of information a real invoice already discloses to its recipient; this
// function never returns the bank account number or file bytes to a generic caller — see
// getCompanyProfileForSettings for the governed, Founder-only full read (bank number/StoredFile ids
// included) used by the Settings screen itself.
export async function getCompanyProfile(db: Db) {
  return db.seeraBillingProfile.findUnique({
    where: { ownerType_ownerId_effectiveFrom: { ownerType: COMPANY_OWNER_TYPE, ownerId: COMPANY_OWNER_ID, effectiveFrom: COMPANY_EFFECTIVE_FROM } },
  });
}

export async function getCompanyProfileForSettings(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "settings:manage" });
  return getCompanyProfile(db);
}

export async function upsertCompanyProfile(db: PrismaClient, actorId: string, input: CompanyProfileInput) {
  await authorize(db, { actorId, permission: "settings:manage" });
  if (!input.legalName.trim()) throw new FoundationError("COMPANY_LEGAL_NAME_REQUIRED", "Legal name is required", 400);
  const profile = await db.seeraBillingProfile.upsert({
    where: { ownerType_ownerId_effectiveFrom: { ownerType: COMPANY_OWNER_TYPE, ownerId: COMPANY_OWNER_ID, effectiveFrom: COMPANY_EFFECTIVE_FROM } },
    update: {
      legalName: input.legalName.trim(), tradeName: input.tradeName?.trim() || null, gstRegistered: Boolean(input.gstin?.trim()),
      gstin: input.gstin?.trim() || null, pan: input.pan?.trim() || null, registeredAddress: input.address as never,
      state: input.state.trim(), stateCode: input.stateCode.trim(), phone: input.phone?.trim() || null, email: input.email?.trim() || null,
      website: input.website?.trim() || null, bankName: input.bankName?.trim() || null, bankAccountName: input.bankAccountName?.trim() || null,
      bankAccountNumber: input.bankAccountNumber?.trim() || null, ifsc: input.ifsc?.trim() || null, upiId: input.upiId?.trim() || null,
      signatoryName: input.signatoryName?.trim() || null, signatoryDesignation: input.signatoryDesignation?.trim() || null,
      invoicePrefix: input.invoicePrefix?.trim() || "SEERA", termsAndConditions: input.termsAndConditions?.trim() || null,
      authorizedBilling: true, verificationStatus: "VERIFIED",
    },
    create: {
      ownerType: COMPANY_OWNER_TYPE, ownerId: COMPANY_OWNER_ID, effectiveFrom: COMPANY_EFFECTIVE_FROM,
      legalName: input.legalName.trim(), tradeName: input.tradeName?.trim() || null, gstRegistered: Boolean(input.gstin?.trim()),
      gstin: input.gstin?.trim() || null, pan: input.pan?.trim() || null, registeredAddress: input.address as never,
      state: input.state.trim(), stateCode: input.stateCode.trim(), phone: input.phone?.trim() || null, email: input.email?.trim() || null,
      website: input.website?.trim() || null, bankName: input.bankName?.trim() || null, bankAccountName: input.bankAccountName?.trim() || null,
      bankAccountNumber: input.bankAccountNumber?.trim() || null, ifsc: input.ifsc?.trim() || null, upiId: input.upiId?.trim() || null,
      signatoryName: input.signatoryName?.trim() || null, signatoryDesignation: input.signatoryDesignation?.trim() || null,
      invoicePrefix: input.invoicePrefix?.trim() || "SEERA", termsAndConditions: input.termsAndConditions?.trim() || null,
      authorizedBilling: true, verificationStatus: "VERIFIED", createdById: actorId,
    },
  });
  await recordAudit(db, { actorId, action: "finance.company_profile.updated", entityType: "SeeraBillingProfile", entityId: profile.id, afterState: { legalName: profile.legalName, gstin: profile.gstin } });
  return profile;
}

const MAX_BRANDING_ASSET_BYTES = 5_000_000;
function assertRealImage(mimeType: string, bytes: Uint8Array) {
  if (!/^image\/(png|jpeg)$/.test(mimeType)) throw new FoundationError("UNSUPPORTED_BRANDING_ASSET", "Only PNG or JPEG images are supported", 400);
  const b = bytes;
  const valid = mimeType === "image/png" ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (!valid) throw new FoundationError("BRANDING_ASSET_SIGNATURE_MISMATCH", "File content does not match its declared image type", 400);
}

// Logo/Signature/Seal upload (Part N) — deliberately NOT uploadManualDocument (that always wraps a
// file in a SeeraCommercialDocument with issuer/buyer/amount semantics; a signature image is not a
// commercial document). Stores the same way — a real StoredFile row with contentBytes — and points
// the Company Profile's own file-id column at it, so a Founder can re-upload and swap the asset
// without leaving old rows orphaned as the "current" one (the previous file id is simply no longer
// referenced; StoredFile rows are never destructively deleted here, matching this codebase's
// no-hard-delete convention for uploaded documents elsewhere).
export async function uploadCompanyBrandingAsset(
  db: PrismaClient,
  actorId: string,
  input: { kind: "LOGO" | "SIGNATURE" | "SEAL"; originalName: string; mimeType: string; bytes: Uint8Array },
) {
  await authorize(db, { actorId, permission: "settings:manage" });
  if (!input.bytes.length || input.bytes.length > MAX_BRANDING_ASSET_BYTES) throw new FoundationError("INVALID_BRANDING_ASSET", "Image must be between 1 byte and 5 MB", 400);
  assertRealImage(input.mimeType, input.bytes);
  const profile = await getCompanyProfile(db);
  if (!profile) throw new FoundationError("COMPANY_PROFILE_NOT_CONFIGURED", "Save the Company Profile's legal details before uploading branding assets", 409);
  return db.$transaction(async (tx) => {
    const file = await tx.storedFile.create({
      data: {
        provider: "DATABASE_PRIVATE",
        storageKey: `private/company-branding/${input.kind.toLowerCase()}-${Date.now()}`,
        originalName: input.originalName.replace(/[\\/\0<>]/g, "_"),
        mimeType: input.mimeType,
        extension: input.originalName.split(".").pop()?.toLowerCase(),
        sizeBytes: BigInt(input.bytes.length),
        sha256: (await import("node:crypto")).createHash("sha256").update(input.bytes).digest("hex"),
        classification: "GENERAL",
        scanStatus: "CLEAN",
        lifecycleStatus: "ACTIVE",
        entityType: "SeeraBillingProfile",
        entityId: profile.id,
        uploadedById: actorId,
        contentBytes: Buffer.from(input.bytes),
      },
    });
    const field = input.kind === "LOGO" ? "logoFileId" : input.kind === "SIGNATURE" ? "signatureFileId" : "sealFileId";
    const updated = await tx.seeraBillingProfile.update({ where: { id: profile.id }, data: { [field]: file.id } });
    await recordAudit(tx, { actorId, action: "finance.company_profile.branding_uploaded", entityType: "SeeraBillingProfile", entityId: profile.id, afterState: { kind: input.kind, fileId: file.id } });
    return updated;
  });
}

// Fetches the raw bytes for a configured branding asset, for embedding into a rendered PDF at
// render time. Returns null (never throws) when unconfigured or the referenced file is gone —
// document-pdf.ts's embedding is always optional/graceful, matching Part N's explicit "gracefully
// show 'Authorized Signatory' until configured" requirement.
export async function getBrandingAssetBytes(db: PrismaClient, fileId: string | null): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!fileId) return null;
  const file = await db.storedFile.findFirst({ where: { id: fileId, lifecycleStatus: "ACTIVE" } });
  if (!file?.contentBytes) return null;
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType };
}
