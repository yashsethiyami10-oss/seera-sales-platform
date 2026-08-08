/**
 * MUV Production Execution Sprint 1 — bulk product image import.
 *
 * Reads every folder under `product-images-import/Product images/`, maps each
 * one to an exact, already-existing (Product, size) pair via a hand-verified
 * table (not fuzzy/auto guessing — every mapping below was checked against
 * the real production catalog's variant sizes before being hardcoded), and
 * uploads the images through the app's existing Cloudinary-backed media
 * architecture (same account/credentials as actions/media.ts, same
 * "Products" MediaAsset folder — just invoked directly via the server-side
 * SDK instead of the browser-signed-upload round trip, which doesn't apply
 * to a local bulk-file script).
 *
 * Only writes `Product.images` and creates `MediaAsset` rows — never touches
 * price, MRP, SKU, inventory, status, category, orders, or customers.
 *
 * Idempotent: a product that already has `images.length > 0` is skipped
 * entirely (no re-upload, no duplicate MediaAsset rows). Cloudinary uploads
 * themselves also use a stable `public_id` with `overwrite: false` so a
 * partial re-run can't create duplicate remote assets either.
 *
 * Defaults to dry-run. Pass EXECUTE=1 to actually upload and write to the DB.
 * Run with: npx tsx scripts/import-product-images.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024; // Cloudinary plan's hard cap on this account

/**
 * The Founder's source photography is far higher resolution than any
 * storefront needs (up to ~5000x5000px, several exceeding Cloudinary's
 * 10MB per-image upload cap on this account). Resizes down only when a
 * file actually exceeds the cap — files already under it are uploaded
 * byte-for-byte, untouched. Preserves the original alpha channel (if any)
 * and re-encodes as PNG (same format), progressively shrinking the longest
 * side until the result fits, so quality loss is the minimum necessary to
 * make the upload possible at all, never an arbitrary blanket compression.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delayMs = 2000 * (i + 1);
      console.error(`  retryable error (attempt ${i + 1}/${attempts}), waiting ${delayMs}ms:`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function prepareForUpload(filePath: string): Promise<{ path: string; cleanup: () => void }> {
  const stat = fs.statSync(filePath);
  if (stat.size <= CLOUDINARY_MAX_BYTES) return { path: filePath, cleanup: () => {} };

  let width = (await sharp(filePath).metadata()).width ?? 3000;
  const candidates = [2400, 1800, 1400, 1100];
  const tmpPath = path.join(os.tmpdir(), `muv-img-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);

  for (const targetWidth of candidates) {
    if (targetWidth >= width) continue;
    await sharp(filePath)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(tmpPath);
    if (fs.statSync(tmpPath).size <= CLOUDINARY_MAX_BYTES) {
      return { path: tmpPath, cleanup: () => fs.unlinkSync(tmpPath) };
    }
  }
  // Last resort — smallest candidate already tried above; if still over,
  // this file is left to fail loudly rather than silently degrading further.
  return { path: tmpPath, cleanup: () => fs.unlinkSync(tmpPath) };
}

const ROOT = path.join(__dirname, "..", "product-images-import", "Product images");

// Hand-verified against the real production catalog (see the mapping audit
// in EXECUTION_SPRINT_1_REPORT.md). `size` must exactly match this product's
// ProductVariant.size string in the DB.
const FOLDER_MAP: Record<number, { slug: string; size: string } | null> = {
  1: { slug: "muv-indian-rose-liquid-detergent", size: "1L" },
  2: { slug: "muv-indian-rose-liquid-detergent", size: "5L" },
  3: { slug: "muv-cool-water-liquid-detergent", size: "1L" },
  4: { slug: "muv-cool-water-liquid-detergent", size: "5L" },
  5: { slug: "muv-lavender-garden-liquid-detergent", size: "1L" },
  6: { slug: "muv-lavender-garden-liquid-detergent", size: "5L" },
  7: { slug: "muv-toilet-cleaner", size: "500ml" },
  8: { slug: "muv-toilet-cleaner", size: "5L" },
  9: { slug: "muv-dishwash-gel", size: "500ml" },
  10: { slug: "muv-dishwash-gel", size: "1L" },
  11: { slug: "muv-dishwash-gel", size: "5L" },
  12: { slug: "muv-bathroom-cleaner", size: "500ml" },
  13: { slug: "muv-glass-cleaner", size: "500ml" },
  14: { slug: "muv-velvet-mist-floor-cleaner", size: "1L" },
  15: { slug: "muv-cloud-walk-floor-cleaner", size: "1L" },
  16: { slug: "muv-velvet-mist-floor-cleaner", size: "5L" },
  17: { slug: "muv-cloud-walk-floor-cleaner", size: "5L" },
  18: { slug: "muv-car-wash", size: "500ml" },
  19: { slug: "muv-car-wash", size: "5L" },
  20: { slug: "muv-white-phenyl", size: "1L" },
  21: { slug: "muv-white-phenyl", size: "5L" },
  // Black Phenyl is DRAFT with zero variants — Founder decision froze it to
  // a future 1L-only SKU once an MRP is supplied. This folder is 500ml,
  // which has no matching variant and was explicitly removed from scope in
  // an earlier round. Deliberately skipped, not guessed onto the product.
  22: null,
  23: { slug: "muv-bleach", size: "500ml" },
  24: { slug: "muv-life-shield-hand-wash", size: "250ml" },
  25: { slug: "muv-life-shield-hand-wash", size: "500ml" },
  26: { slug: "muv-silk-blossom-hand-wash", size: "500ml" },
  27: { slug: "muv-ocean-fresh-hand-wash", size: "500ml" },
  28: { slug: "muv-ocean-fresh-hand-wash", size: "5L" },
  29: { slug: "muv-citrus-blast-hand-wash", size: "250ml" },
  30: { slug: "muv-citrus-blast-hand-wash", size: "500ml" },
  31: { slug: "muv-citrus-blast-hand-wash", size: "5L" },
  32: { slug: "muv-crimson-veil-body-wash", size: "250ml" },
  33: { slug: "muv-crimson-veil-body-wash", size: "950ml" },
  34: { slug: "muv-velvet-oak-body-wash", size: "250ml" },
  35: { slug: "muv-velvet-oak-body-wash", size: "950ml" },
  36: { slug: "muv-midnight-frost-body-wash", size: "250ml" },
  37: { slug: "muv-midnight-frost-body-wash", size: "950ml" },
};

function listImageFilesRecursive(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(listImageFilesRecursive(full));
    else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name)) files.push(full);
  }
  // Numeric filenames (1.png, 2.png, ...) sort numerically; anything else
  // (e.g. the nested IMG_yyyymmdd_hhmmss.png folder) sorts alphabetically,
  // which is chronological for that naming scheme.
  return files.sort((a, b) => {
    const an = parseInt(path.basename(a), 10);
    const bn = parseInt(path.basename(b), 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return path.basename(a).localeCompare(path.basename(b));
  });
}

async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const dirEntries = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory());

  const report: any = { folders: [], skippedFolders: [], products: [], errors: [] };

  // Group folders by target product slug, in ascending leading-number order.
  const bySlug = new Map<string, { folderNum: number; dir: string }[]>();
  for (const entry of dirEntries) {
    const m = entry.name.match(/^(\d+)\s+/);
    const num = m ? parseInt(m[1]!, 10) : NaN;
    const mapping = FOLDER_MAP[num];
    if (!mapping) {
      report.skippedFolders.push({ folder: entry.name, reason: mapping === null ? "no matching ACTIVE product/variant (Black Phenyl 500ml is out of frozen scope)" : "unrecognized folder number" });
      continue;
    }
    const dir = path.join(ROOT, entry.name);
    const list = bySlug.get(mapping.slug) ?? [];
    list.push({ folderNum: num, dir });
    bySlug.set(mapping.slug, list);
    report.folders.push({ folder: entry.name, mappedTo: `${mapping.slug} (${mapping.size})` });
  }

  const execute = process.env.EXECUTE === "1";

  for (const [slug, folders] of bySlug) {
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      report.errors.push({ slug, error: "product not found in DB" });
      continue;
    }
    if (product.images.length > 0) {
      report.products.push({ slug, status: "SKIPPED — already has images", existingCount: product.images.length });
      continue;
    }

    folders.sort((a, b) => a.folderNum - b.folderNum);
    const orderedFiles: string[] = [];
    for (const f of folders) orderedFiles.push(...listImageFilesRecursive(f.dir));

    if (execute) {
      const urls: string[] = [];
      for (let i = 0; i < orderedFiles.length; i++) {
        const filePath = orderedFiles[i]!;
        const publicId = `${slug}-${i + 1}`;
        const prepared = await prepareForUpload(filePath);
        try {
          const result = await withRetry(() =>
            cloudinary.uploader.upload(prepared.path, {
              folder: "Products",
              public_id: publicId,
              overwrite: false, // stable public_id + overwrite:false — a re-run reuses the existing remote asset instead of duplicating it
              unique_filename: false,
              resource_type: "image",
            })
          );
          urls.push(result.secure_url);
          console.log(`  uploaded ${slug} [${i + 1}/${orderedFiles.length}]`);

          const existingAsset = await withRetry(() => prisma.mediaAsset.findFirst({ where: { url: result.secure_url } }));
          if (!existingAsset) {
            const stat = fs.statSync(prepared.path);
            await withRetry(() =>
              prisma.mediaAsset.create({
                data: {
                  filename: path.basename(filePath),
                  url: result.secure_url,
                  type: "IMAGE",
                  folder: "Products",
                  sizeBytes: stat.size,
                },
              })
            );
          }
        } finally {
          prepared.cleanup();
        }
      }

      await withRetry(() => prisma.product.update({ where: { slug }, data: { images: urls } }));
      report.products.push({ slug, status: "UPLOADED", coverImage: urls[0], galleryCount: urls.length - 1, totalImages: urls.length, sourceFolders: folders.map((f) => f.folderNum) });
    } else {
      report.products.push({ slug, status: "[DRY RUN] would upload", totalImages: orderedFiles.length, sourceFolders: folders.map((f) => f.folderNum), firstFile: orderedFiles[0] });
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
