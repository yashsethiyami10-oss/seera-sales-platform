import { z } from "zod";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — headroom above ImageUploader's own 8MB compression trigger
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20MB — Milestone 2, Customer Profile documents (GST certs, agreements, etc.)

// Phase 16 — previously only `contentType` was validated before issuing a
// signed upload URL (actions/media.ts's getUploadUrl); the actual file size
// was never enforced server-side, only whatever cap the client happened to
// apply (bypassable by calling confirmUpload directly). This rejects
// cataloging an oversized asset into the media library at confirm time.
export const createMediaAssetSchema = z
  .object({
    filename: z.string().min(1).max(200),
    url: z.string().url(),
    // Milestone 2 — DOCUMENT added for Customer Profile documents; "Customers"
    // folder added alongside it. Existing IMAGE/VIDEO callers are unaffected.
    type: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
    folder: z.enum(["Products", "Blog", "Banners", "General", "Customers"]).default("General"),
    sizeBytes: z.number().int().positive(),
  })
  .refine(
    (data) => data.sizeBytes <= (data.type === "VIDEO" ? MAX_VIDEO_BYTES : data.type === "DOCUMENT" ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES),
    { message: "File exceeds the maximum allowed size", path: ["sizeBytes"] }
  );

export const mediaQuerySchema = z.object({
  folder: z.enum(["Products", "Blog", "Banners", "General", "Customers"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(40),
});
