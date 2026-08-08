# MUV Digital Flagship™ — Image Completion Report

Companion to `WEBSITE_COMPLETION_AUDIT.md`. Covers product photography, media infrastructure,
image optimization, and the two genuinely missing brand assets. Grounded in direct file reads and
this repository's own dated image-QA passes.

---

## 1. Product photography — Completed

The most recent comprehensive pass (`MUV_FINAL_CUSTOMER_EXPERIENCE_REPORT.md`, Phase 1) checked
**all 220 images across all 19 ACTIVE products programmatically, not sampled**: cover image
numbering, gallery ordering, `Product.images`/`ProductVariant.images` consistency (variant sums
exactly match product totals, zero overlap, zero duplicates), `MediaAsset` row count (220, exact
match), and every one of the 220 URLs fetched directly. **Result: 0 broken links, 0 issues.**

- A real, non-destructive enhancement pass (`sharp`: EXIF-rotate, histogram-normalize, mild
  sharpen, small uniform brightness/saturation lift) was applied to all 220 originals and
  re-uploaded to the same Cloudinary public IDs — re-verified live, `Last-Modified` timestamps
  confirm the run, 38 sampled URLs across all 19 products all return 200 (`FOUNDER_FREEZE_SPRINT_2_REPORT.md`).
- **Per-variant galleries are real**: each of the 36 variants across the 19 products has its own
  distinct image sub-array (e.g. Dishwash Gel's 500ml/1L/5L variants have non-overlapping 6/7/6
  image sets) — selecting a size swaps the gallery immediately, no extra click.
- **Explicitly not attempted**: automated background re-centering/re-cropping for identical
  framing across the catalog — disclosed as out of safe automated scope (risks cropping a bottle
  or label without real subject-detection tooling), not silently skipped. A dedicated pass could
  be scheduled separately if still wanted.
- **Black Phenyl** (the one DRAFT placeholder product) correctly has 0 images and 0 variants —
  confirmed still true, not accidentally populated by any later pass.

## 2. Image delivery & optimization — Completed

- `components/storefront/product-image.tsx` is the single shared image component: uses
  `next/image`, `placeholder="blur"`, responsive `sizes`, and routes every URL through
  `lib/utils/cloudinary-image.ts`'s `cloudinaryUrl()`, which injects `f_auto,q_auto,dpr_auto`
  plus a per-context crop preset (thumbnail/micro/gallery/lightbox/galleryFrame).
- No raw `<img>` tag was found anywhere in `app/**` page code for storefront/product/content
  imagery. The 8 raw `<img>` usages that do exist are all justified, individually
  `eslint-disable`d exceptions confined to `components/` (an external non-Cloudinary QR code,
  client-side blob-preview thumbnails inside upload UIs, and small AI-widget logo icons) — none
  represent a missed optimization on customer-facing content.
- Preloading: variant galleries call React 19's `preload()` for each variant's first two images
  at the resolution tier actually rendered, so switching product size shows an already-warm image.
- Gallery container has a fixed height (460px) to prevent layout shift on image switch; a 0.25s
  fade transition is confirmed still wired after the most recent gallery refactor.

## 3. Image viewer interaction — Completed (code-verified only)

Pinch-to-zoom (clamped 1×–3×), double-tap zoom toggle, swipe navigation (suppressed while zoomed),
and a single, unambiguous path to the fullscreen lightbox (the expand icon only — a single tap no
longer accidentally opens it) are all implemented. **Not device-tested** — no physical touchscreen
or mobile emulator was available in the environment that built this, verified by code review and
build correctness only. This is one instance of the broader "no real device QA has ever happened"
finding in `LAUNCH_BLOCKER_REPORT.md` #3 and should be included in that pass specifically.

## 4. Missing brand assets — the two genuine gaps

Confirmed directly via `Glob` for this audit (`app/icon.*`, `public/favicon.*`,
`public/og-default.*` — zero matches in all three; `public/` contains only `logo.png`,
`muv-ai-logo-icon.png`, `muv-ai-logo-full.png`, `hero`, and `transparent.png`):

| Asset | Referenced by | Status |
|---|---|---|
| Favicon (`app/icon.png` or `public/favicon.ico`) | Next.js's own icon convention | **Missing.** Browser tabs/bookmarks show a generic icon. |
| Social share image (`public/og-default.png`, 1200×630) | `lib/seo.ts:19`, used as the default OG image for every page without a custom one | **Missing.** Every such link shared on WhatsApp/social media shows a broken preview image today. |

Both are small, fast fixes (create and drop in two image files) but are real, live gaps, not
stale-document artifacts — this audit re-confirmed both are still absent today, independently of
every prior document that flagged them.

## 5. Cloudinary infrastructure — Completed (functional), one open item

Real signed-upload flow (`actions/media.ts`, SHA256 signature, env-gated), real admin media
library (`app/admin/media`), real per-product/variant asset tracking. **Open item, not resolved by
this audit**: the provenance of the Cloudinary credentials currently in `.env` (intentional dev
sandbox vs. needs rotation before production use) remains an explicit, undecided item from
`PHASE_1_KNOWN_ISSUES.md` — Founder Review Required before treating Cloudinary as fully
production-hardened.
