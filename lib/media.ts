/**
 * MEDIA UPLOAD STRATEGY (placeholder — no real storage provider wired up)
 * ------------------------------------------------------------------------
 * This app never streams file bytes through a Server Action or API route —
 * Vercel's function body size limit (4.5MB) makes that unreliable for
 * anything but tiny thumbnails, and it ties up a compute instance for the
 * whole upload. The real flow is:
 *
 *   1. Admin picks a file in the browser.
 *   2. Client calls `getUploadUrl()` below (a Server Action) with the
 *      filename/content-type, which asks the storage provider (S3,
 *      Cloudinary, Vercel Blob — any of them work the same way here) for a
 *      short-lived signed upload URL.
 *   3. Browser PUTs the file directly to that signed URL — bytes never
 *      touch this Next.js server.
 *   4. Client calls `confirmUpload()` with the resulting public URL, which
 *      is when a MediaAsset row actually gets created in Postgres.
 *
 * Image optimization ("optimized" flag on MediaAsset) — in production this
 * becomes real once a resize/compress step runs after upload (a storage
 * provider transform, or Next's own `next/image` with a remote loader).
 * Until that's wired up, `optimized` stays `false` for anything not
 * manually marked otherwise; nothing here is falsely claiming to have
 * compressed an image it never touched.
 */

import { z } from "zod";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { createHash } from "crypto";

const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
  folder: z.enum(["Products", "Blog", "Banners", "General"]).default("General"),
});

export async function getUploadUrl(input: unknown) {
  try {
    await requireStaff();
    const data = uploadRequestSchema.parse(input);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Missing Cloudinary configuration. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = data.folder;
    const paramsToSign = {
      folder,
      timestamp,
    };

    const signature = createHash("sha256")
      .update(
        `${Object.entries(paramsToSign)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}${apiSecret}`
      )
      .digest("hex");

    return {
      success: true,
      data: {
        cloudName,
        apiKey,
        timestamp,
        signature,
        folder,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
