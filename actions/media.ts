"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { createMediaAssetSchema, mediaQuerySchema } from "@/lib/validations/media";
import { paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";

const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  // Milestone 2 — application/pdf added for Customer Profile documents.
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "application/pdf"]),
  folder: z.enum(["Products", "Blog", "Banners", "General", "Customers"]).default("General"),
});

/**
 * Called after the browser has already PUT the file to the signed URL from
 * `getUploadUrl()` (see lib/media.ts) — this only ever writes metadata,
 * never handles the file bytes themselves.
 */
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
      success: true as const,
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

export async function confirmUpload(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createMediaAssetSchema.parse(input);

    const asset = await prisma.mediaAsset.create({
      data: { ...data, uploadedById: user.id },
    });

    revalidatePath("/admin/media");
    return { success: true as const, data: asset };
  } catch (err) {
    logger.error("media:confirm-upload:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

export async function listMedia(input: unknown) {
  try {
    await requireStaff();
    const query = mediaQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where = query.folder ? { folder: query.folder } : {};
    const [items, total] = await Promise.all([
      prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.mediaAsset.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteMediaAsset(id: string) {
  try {
    await requireStaff();
    const existing = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Media asset");

    // Deletes the database record only — the underlying file in cloud
    // storage must also be deleted via that provider's SDK (e.g.
    // s3.deleteObject) in the same function, using `existing.url` to derive
    // the storage key. Wire that call in alongside your provider from
    // lib/media.ts before relying on this to actually free storage space.
    await prisma.mediaAsset.delete({ where: { id } });

    revalidatePath("/admin/media");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
