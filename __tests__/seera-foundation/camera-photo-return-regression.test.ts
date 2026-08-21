import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const fieldJourney = read("components/seera/product/FieldJourney.tsx");
const workspace = read("components/seera/product/OperationalWorkspace.tsx");
const workflow = read("lib/sales-distribution/workflow-service.ts");
const photoService = read("lib/sales-distribution/field-portal-service.ts");
const cloudinaryService = read("lib/sales-distribution/field-photo-cloudinary-service.ts");
const middleware = read("middleware.ts");
const cameraInput = fieldJourney.indexOf('capture="environment"');
const photoSelection = fieldJourney.slice(cameraInput, fieldJourney.indexOf("<button type=\"button\" disabled={busy} onClick={() => fileRef.current?.click()}>", cameraInput));
// P0 21-Aug screen-recording regression fix: preparePhotoDerivatives (ONE function, ONE call
// site) replaced the old preparePreview + prepareImageForUpload pair, which each independently
// decoded the original camera file (4 total createImageBitmap(file, ...) calls). This block is
// the single source-of-truth image pipeline this whole suite audits.
const imagePipeline = fieldJourney.slice(fieldJourney.indexOf("const PREVIEW_MAX_DIMENSION"), fieldJourney.indexOf("const key ="));

describe("mobile camera memory and reload regression (P0 21-Aug screen-recording fix)", () => {
  it("A/B: the original camera File is decoded via createImageBitmap AT MOST TWICE, through exactly one pipeline function", () => {
    // Every createImageBitmap(file, call in the whole pipeline block — not createImageBitmap of
    // any OTHER value (uploadCanvas is drawn via ctx.drawImage, never re-decoded).
    const originalFileDecodes = imagePipeline.match(/createImageBitmap\(file,/g) ?? [];
    expect(originalFileDecodes.length).toBe(2);
    // Exactly one pipeline entry point — no separate preparePreview/prepareImageForUpload
    // functions that could each independently call createImageBitmap(file, ...) again.
    expect(imagePipeline).toContain("async function preparePhotoDerivatives(file: File)");
    expect(imagePipeline).not.toContain("function preparePreview(");
    expect(imagePipeline).not.toContain("function prepareImageForUpload(");
    const callSites = fieldJourney.match(/preparePhotoDerivatives\(file\)/g) ?? [];
    expect(callSites.length).toBe(1);
  });

  it("C: the preview is derived from the already-bounded upload canvas, never from a fresh decode of the original", () => {
    // The ONLY two real decodes are: one metadata-only pass, one resize-during-decode pass at the
    // upload target. The preview canvas must be filled via canvas-to-canvas drawImage from that
    // same upload canvas, not by decoding `file` a third/fourth time.
    const previewBlock = imagePipeline.slice(imagePipeline.indexOf("// Preview:"), imagePipeline.indexOf("return { uploadBlob, previewBlob };"));
    expect(previewBlock).toContain("previewCtx.drawImage(uploadCanvas, 0, 0, previewWidth, previewHeight)");
    expect(previewBlock).not.toContain("createImageBitmap(file");
  });

  it("D: a real browser yield separates preview render from the Cloudinary upload", () => {
    const onChangeBlock = photoSelection.slice(photoSelection.indexOf("onChange={(event) => {"));
    const previewSetIndex = onChangeBlock.indexOf("setPhotoPreview(previewUrl)");
    const secondYieldIndex = onChangeBlock.indexOf("await yieldToPaint()", previewSetIndex);
    const uploadCallIndex = onChangeBlock.indexOf("uploadFieldPhotoDirect(");
    expect(previewSetIndex).toBeGreaterThan(-1);
    expect(secondYieldIndex).toBeGreaterThan(previewSetIndex);
    expect(uploadCallIndex).toBeGreaterThan(secondYieldIndex);
  });

  it("E: no full-resolution Data URL / base64 of the original is ever produced", () => {
    expect(fieldJourney).not.toContain("FileReader");
    expect(fieldJourney).not.toContain("readAsDataURL");
    expect(fieldJourney).not.toContain("blobToBase64");
    expect(photoSelection).not.toContain("URL.createObjectURL(file)");
    expect(middleware).toContain("img-src 'self' data: blob: https:");
  });

  it("F: the Cloudinary invalid-signature fix (e36b7d2) remains intact — resource_type/transformation/allowed_formats still excluded from the signed object", () => {
    const paramsBlock = cloudinaryService.slice(cloudinaryService.indexOf("const uploadParams = {"), cloudinaryService.indexOf("const signature ="));
    expect(paramsBlock).not.toContain("resource_type");
    expect(paramsBlock).not.toContain("transformation");
    expect(paramsBlock).not.toContain("allowed_formats");
    expect(fieldJourney).not.toContain("uploaded?.error?.message ?? \"Photo upload failed");
  });

  it("bounds upload/preview dimensions, releases image resources, and fails closed for large or undecodable originals", () => {
    expect(imagePipeline).toContain("const UPLOAD_MAX_DIMENSION = 1280");
    expect(imagePipeline).toContain("const UPLOAD_QUALITY = 0.74");
    expect(imagePipeline).toContain("const PREVIEW_MAX_DIMENSION = 800");
    expect(imagePipeline).toContain('resizeQuality: "high"');
    expect(imagePipeline).toContain("metadataBitmap?.close?.()");
    expect(imagePipeline).toContain("uploadBitmap?.close?.()");
    expect(imagePipeline).toContain("uploadCanvas.width = 1");
    expect(imagePipeline).toContain("previewCanvas.width = 1");
    expect(imagePipeline).toContain("file.size > MAX_SAFE_ORIGINAL_FALLBACK_BYTES");
    expect(imagePipeline).toContain("Photo is too large for this device. Please retake the photo.");
    expect(imagePipeline).toContain("Photo could not be prepared. Please retake.");
  });

  it("I: resumes an authoritative ordered or photographed visit at Photo after reload", () => {
    expect(workspace).toContain("_count: { select: { orders: true } }");
    expect(workspace).toContain("orderCount: visit._count.orders");
    expect(fieldJourney).toContain("visit.orderCount > 0 || visit.photos.length > 0");
    expect(fieldJourney).toContain("seera:field-visit:${visit.id}:mode");
    expect(fieldJourney).toContain('? "PHOTO"');
  });

  it("H: keeps order idempotency and WhatsApp strictly outside the photo boundary (0 orders/outbox events from a photo action — see field-photo-cloudinary.test.ts for the live DB proof)", () => {
    expect(workflow).toContain("if (isNew)");
    expect(workflow).toContain('eventType: "ORDER_RECORDED"');
    expect(photoService.slice(photoService.indexOf("export async function capturePhoto"), photoService.indexOf("export async function recordPhotoException"))).not.toContain("queueRetailerCommunicationSafe");
    expect(photoService.slice(photoService.indexOf("export async function capturePhoto"), photoService.indexOf("export async function recordPhotoException"))).not.toContain("seeraSalesOrder");
  });
});
