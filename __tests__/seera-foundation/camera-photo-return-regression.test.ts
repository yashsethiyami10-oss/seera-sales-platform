import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const fieldJourney = read("components/seera/product/FieldJourney.tsx");
const workspace = read("components/seera/product/OperationalWorkspace.tsx");
const workflow = read("lib/sales-distribution/workflow-service.ts");
const photoService = read("lib/sales-distribution/field-portal-service.ts");
const middleware = read("middleware.ts");
const cameraInput = fieldJourney.indexOf('capture="environment"');
const photoSelection = fieldJourney.slice(cameraInput, fieldJourney.indexOf("{photoPreview &&", cameraInput));
const imagePipeline = fieldJourney.slice(fieldJourney.indexOf("const PREVIEW_MAX_DIMENSION"), fieldJourney.indexOf("const key ="));

describe("mobile camera memory and reload regression", () => {
  it("renders only a bounded thumbnail and keeps selection client-only", () => {
    expect(fieldJourney).toContain("const PREVIEW_MAX_DIMENSION = 800");
    expect(fieldJourney).toContain("const PREVIEW_QUALITY = 0.7");
    expect(photoSelection).toContain("preparePreview(file)");
    expect(photoSelection).toContain("URL.createObjectURL(previewBlob)");
    expect(photoSelection).not.toContain("URL.createObjectURL(file)");
    expect(photoSelection).not.toContain("FileReader");
    expect(photoSelection).not.toContain("send(");
    expect(photoSelection).not.toContain("fetch(");
    expect(photoSelection).not.toContain("router.refresh");
    expect(middleware).toContain("img-src 'self' data: blob: https:");
  });

  it("bounds upload memory, releases image resources, and fails closed for large originals", () => {
    expect(imagePipeline).toContain("const UPLOAD_MAX_DIMENSION = 1280");
    expect(imagePipeline).toContain("const UPLOAD_QUALITY = 0.74");
    expect(imagePipeline).toContain('resizeQuality: "high"');
    expect(imagePipeline).toContain("metadataBitmap.close?.()");
    expect(imagePipeline).toContain("resizedBitmap.close?.()");
    expect(imagePipeline).toContain("canvas.width = 1");
    expect(imagePipeline).toContain("canvas.height = 1");
    expect(imagePipeline).toContain("file.size > MAX_SAFE_ORIGINAL_FALLBACK_BYTES");
    expect(imagePipeline).toContain("Photo is too large for this device. Please retake the photo.");
    expect(imagePipeline).not.toContain("base64: await blobToBase64(file)");
  });

  it("resumes an authoritative ordered or photographed visit at Photo after reload", () => {
    expect(workspace).toContain("_count: { select: { orders: true } }");
    expect(workspace).toContain("orderCount: visit._count.orders");
    expect(fieldJourney).toContain("visit.orderCount > 0 || visit.photos.length > 0");
    expect(fieldJourney).toContain("seera:field-visit:${visit.id}:mode");
    expect(fieldJourney).toContain('? "PHOTO"');
  });

  it("keeps order idempotency and WhatsApp strictly outside the photo boundary", () => {
    expect(workflow).toContain("if (isNew)");
    expect(workflow).toContain('eventType: "ORDER_RECORDED"');
    expect(photoService.slice(photoService.indexOf("export async function capturePhoto"), photoService.indexOf("export async function recordPhotoException"))).not.toContain("queueRetailerCommunicationSafe");
    expect(photoService.slice(photoService.indexOf("export async function capturePhoto"), photoService.indexOf("export async function recordPhotoException"))).not.toContain("seeraSalesOrder");
  });
});
