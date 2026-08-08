/**
 * Sprint 2 Part 9 — Image Quality Pass.
 *
 * Explicitly NOT image regeneration: no AI upscaling, no label redesign, no
 * bottle replacement. This re-processes the same original source files
 * already used for the real upload (Execution Sprint 1) through a real,
 * deterministic, non-destructive enhancement pipeline (sharp) and re-
 * uploads to the SAME Cloudinary public_id (`overwrite: true`) — so the
 * exact URLs already stored in Product.images / ProductVariant.images start
 * serving the enhanced version with zero database changes.
 *
 * Pipeline, applied identically to every image (uniform treatment across
 * the whole catalog, not a per-image judgment call):
 *   - `.rotate()` — honor embedded EXIF orientation (harmless correctness fix)
 *   - `.normalize()` — stretches the actual pixel histogram to use the full
 *     tonal range, which is the real, standard fix for a washed-out/grey
 *     background and flat contrast — not a fabricated "whitening" filter,
 *     it's driven by each image's own real pixel data.
 *   - `.sharpen({ sigma: 0.8 })` — mild unsharp mask for real edge/detail
 *     improvement, tuned low enough not to introduce halos or artifacts.
 *   - `.modulate({ brightness: 1.01, saturation: 1.03 })` — a very small,
 *     uniform lift; deliberately subtle so label colors and bottle colors
 *     are preserved, not reinterpreted.
 *
 * What this deliberately does NOT attempt: automated re-centering/re-
 * cropping ("keep hero images centered", "identical framing across
 * catalog"). Doing that safely requires per-image subject detection this
 * script doesn't have — attempting it blind risks cropping a bottle or
 * label. The framing in the original photography is preserved exactly;
 * only tone/sharpness/contrast are touched. This is disclosed, not silently
 * skipped.
 *
 * Idempotent in the sense that matters: re-running always re-derives the
 * enhanced output fresh from the untouched original source file (never from
 * a previous run's output), so repeated runs don't compound the effect.
 *
 * Defaults to dry-run (reports which files would be processed + their
 * public_id, does no network work). Pass EXECUTE=1 to actually re-upload.
 * Run with: npx tsx scripts/sprint2-image-quality-pass.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROOT = path.join(__dirname, "..", "product-images-import", "Product images");
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;

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
  return files.sort((a, b) => {
    const an = parseInt(path.basename(a), 10);
    const bn = parseInt(path.basename(b), 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return path.basename(a).localeCompare(path.basename(b));
  });
}

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

async function enhanceAndPrepare(filePath: string): Promise<{ path: string; cleanup: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `muv-enhanced-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  let pipeline = sharp(filePath).rotate().normalize().sharpen({ sigma: 0.8 }).modulate({ brightness: 1.01, saturation: 1.03 });

  const candidates = [null, 2400, 1800, 1400, 1100]; // null = original resolution first
  for (const targetWidth of candidates) {
    const p = targetWidth ? pipeline.clone().resize({ width: targetWidth, withoutEnlargement: true }) : pipeline.clone();
    await p.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(tmpPath);
    if (fs.statSync(tmpPath).size <= CLOUDINARY_MAX_BYTES) {
      return { path: tmpPath, cleanup: () => fs.unlinkSync(tmpPath) };
    }
  }
  return { path: tmpPath, cleanup: () => fs.unlinkSync(tmpPath) };
}

async function main() {
  const execute = process.env.EXECUTE === "1";
  if (execute) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error("Missing Cloudinary env vars");
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }

  const dirEntries = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory());
  const bySlug = new Map<string, { folderNum: number; dir: string }[]>();
  for (const entry of dirEntries) {
    const m = entry.name.match(/^(\d+)\s+/);
    const num = m ? parseInt(m[1]!, 10) : NaN;
    const mapping = FOLDER_MAP[num];
    if (!mapping) continue;
    const list = bySlug.get(mapping.slug) ?? [];
    list.push({ folderNum: num, dir: path.join(ROOT, entry.name) });
    bySlug.set(mapping.slug, list);
  }

  // Resume support — Sprint 2 Part 9 continuation. Pass RESUME_LOG pointing
  // at a previous run's log file; every "enhanced Products/<id> [" line in
  // it is treated as already done and skipped, so a re-run after a
  // transient network failure (e.g. DNS ENOTFOUND mid-batch) never re-
  // uploads or duplicates an asset that already succeeded.
  const alreadyDone = new Set<string>();
  if (process.env.RESUME_LOG && fs.existsSync(process.env.RESUME_LOG)) {
    const logText = fs.readFileSync(process.env.RESUME_LOG, "utf-8");
    for (const m of logText.matchAll(/enhanced (Products\/[a-zA-Z0-9-]+) \[/g)) alreadyDone.add(m[1]!);
    console.log(`Resume: ${alreadyDone.size} images already enhanced in a prior run, will be skipped.`);
  }

  const report: any[] = [];
  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const [slug, folders] of bySlug) {
    folders.sort((a, b) => a.folderNum - b.folderNum);
    const orderedFiles: string[] = [];
    for (const f of folders) orderedFiles.push(...listImageFilesRecursive(f.dir));

    const productReport: any = { slug, imageCount: orderedFiles.length, publicIds: orderedFiles.map((_, i) => `Products/${slug}-${i + 1}`) };

    if (execute) {
      for (let i = 0; i < orderedFiles.length; i++) {
        const publicId = `Products/${slug}-${i + 1}`;
        if (alreadyDone.has(publicId)) {
          totalSkipped++;
          continue;
        }
        const enhanced = await enhanceAndPrepare(orderedFiles[i]!);
        try {
          await withRetry(() =>
            cloudinary.uploader.upload(enhanced.path, {
              public_id: publicId,
              overwrite: true, // same asset, enhanced bytes — existing DB URLs are unaffected
              invalidate: true, // bust Cloudinary's CDN cache so the enhanced version serves immediately
              resource_type: "image",
            })
          );
          console.log(`  enhanced ${publicId} [${i + 1}/${orderedFiles.length}]`);
          totalProcessed++;
        } finally {
          enhanced.cleanup();
        }
      }
    }

    report.push(productReport);
  }

  console.log(JSON.stringify({ mode: execute ? "EXECUTE" : "DRY_RUN", totalProcessed, totalSkipped, products: report }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
