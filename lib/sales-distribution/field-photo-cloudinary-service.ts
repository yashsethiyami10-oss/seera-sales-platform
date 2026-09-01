import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

const PHOTO_FOLDER_ROOT = "seera/field-visits";
const MAX_UPLOAD_BYTES = 10_000_000;
const MAX_DIMENSION = 8192;
const SIGNATURE_MAX_AGE_SECONDS = 10 * 60;
const PHOTO_TYPES = ["SHOPFRONT", "COUNTER", "PRODUCT_DISPLAY", "BANNER_BRANDING", "MERCHANDISING", "OTHER"] as const;

type PhotoType = (typeof PHOTO_TYPES)[number];

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret)
    throw new FoundationError("PHOTO_STORAGE_UNAVAILABLE", "Photo storage is not configured", 503);
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

async function requireActiveOwnedVisit(db: PrismaClient, actorId: string, visitId: string) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      checkedOutAt: null,
      workSession: { employeeId: actorId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
    },
    select: { id: true, retailerId: true, workSessionId: true },
  });
  if (!visit) throw new FoundationError("VISIT_SCOPE_DENIED", "Active visit unavailable", 403);
  return visit;
}

// P0 21-Aug "Invalid Signature" fix: this is the ONE place upload parameters are decided — the
// client (FieldJourney.tsx's uploadFieldPhotoDirect) copies these values verbatim into the
// multipart FormData it posts to Cloudinary, it never rebuilds/reinterprets them. Kept to the
// smallest genuinely-necessary signed set on purpose:
//   - `resource_type` was previously included in the object handed to
//     cloudinary.utils.api_sign_request(), which signs literally whatever keys it's given — but
//     Cloudinary's own upload API never treats resource_type as a signable body parameter (it's
//     routing metadata carried in the URL path, `/image/upload`; confirmed against the Cloudinary
//     Node SDK's own build_upload_params(), which never includes it). Our server was signing a
//     string Cloudinary's server-side verification could never reproduce — an unconditional,
//     guaranteed mismatch on every single upload. Removed from the signed object entirely.
//   - `transformation`/`allowed_formats` are dropped too: the client already resizes/compresses to
//     a bounded JPEG (<=1280px, ~q0.74) before upload (see FieldJourney.tsx's
//     prepareImageForUpload), so asking Cloudinary to transform/validate format again on top is
//     redundant processing and redundant signature surface for no real benefit — format/dimensions
//     /bytes are still re-verified authoritatively in finalizeFieldPhotoUpload below.
export async function createFieldPhotoUploadSignature(db: PrismaClient, actorId: string, visitId: string) {
  const visit = await requireActiveOwnedVisit(db, actorId, visitId);
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${PHOTO_FOLDER_ROOT}/${visit.id}`;
  const publicId = `${folder}/${randomUUID()}`;
  const uploadParams = {
    folder,
    overwrite: false,
    public_id: publicId.slice(folder.length + 1),
    timestamp,
    type: "upload" as const,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(uploadParams, apiSecret);
  await recordAudit(db, {
    actorId,
    action: "visit_photo.upload_signature_issued",
    entityType: "SeeraVisit",
    entityId: visit.id,
    afterState: { publicId, folder, expiresAt: new Date((timestamp + SIGNATURE_MAX_AGE_SECONDS) * 1000).toISOString() },
  });
  // `resource_type` is returned for the client's own URL construction only (`/image/upload`) — it
  // is NOT part of `uploadParams` above and therefore NOT part of what was signed, matching how
  // Cloudinary's own upload API treats it.
  return { cloudName, apiKey, signature, resource_type: "image" as const, ...uploadParams, expiresAt: timestamp + SIGNATURE_MAX_AGE_SECONDS };
}

export async function finalizeFieldPhotoUpload(
  db: PrismaClient,
  actorId: string,
  input: {
    visitId: string;
    photoType: PhotoType;
    publicId: string;
    latitude?: number;
    longitude?: number;
  },
) {
  const visit = await requireActiveOwnedVisit(db, actorId, input.visitId);
  const expectedPrefix = `${PHOTO_FOLDER_ROOT}/${visit.id}/`;
  if (!input.publicId.startsWith(expectedPrefix) || input.publicId.slice(expectedPrefix.length).includes("/"))
    throw new FoundationError("PHOTO_SCOPE_DENIED", "Uploaded photo is outside this visit", 403);

  cloudinaryConfig();
  let resource: Awaited<ReturnType<typeof cloudinary.api.resource>>;
  try {
    resource = await cloudinary.api.resource(input.publicId, { resource_type: "image", type: "upload" });
  } catch {
    throw new FoundationError("PHOTO_UPLOAD_UNVERIFIED", "Uploaded photo could not be verified", 400);
  }
  const secureUrl = typeof resource.secure_url === "string" ? resource.secure_url : "";
  const bytes = Number(resource.bytes);
  const width = Number(resource.width);
  const height = Number(resource.height);
  const format = String(resource.format ?? "").toLowerCase();
  if (
    resource.public_id !== input.publicId ||
    resource.resource_type !== "image" ||
    resource.type !== "upload" ||
    !secureUrl.startsWith("https://res.cloudinary.com/") ||
    !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES ||
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    width > MAX_DIMENSION || height > MAX_DIMENSION || format !== "jpg"
  ) throw new FoundationError("PHOTO_UPLOAD_INVALID", "Uploaded photo does not meet photo constraints", 400);

  return db.$transaction(async (tx) => {
    const existing = await tx.seeraVisitPhoto.findUnique({ where: { publicId: input.publicId } });
    if (existing) {
      if (existing.actorId !== actorId || existing.visitId !== visit.id)
        throw new FoundationError("PHOTO_SCOPE_DENIED", "Uploaded photo is already claimed", 403);
      return existing;
    }
    const photo = await tx.seeraVisitPhoto.create({
      data: {
        visitId: visit.id,
        retailerId: visit.retailerId,
        actorId,
        photoType: input.photoType,
        storageProvider: "CLOUDINARY",
        publicId: input.publicId,
        secureUrl,
        sizeBytes: BigInt(bytes),
        width,
        height,
        format,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "visit_photo.upload_finalized",
      entityType: "SeeraVisitPhoto",
      entityId: photo.id,
      afterState: { visitId: visit.id, publicId: input.publicId, bytes, width, height, format },
    });
    return photo;
  });
}

export const fieldPhotoConstraints = { MAX_UPLOAD_BYTES, MAX_DIMENSION, PHOTO_TYPES } as const;
