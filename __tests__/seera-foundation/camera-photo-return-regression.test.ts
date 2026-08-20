import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fieldJourney = readFileSync("components/seera/product/FieldJourney.tsx", "utf8");
const cameraInput = fieldJourney.indexOf('capture="environment"');
const photoSelection = fieldJourney.slice(cameraInput, fieldJourney.indexOf("{photoPreview &&", cameraInput));
const prepareStart = fieldJourney.indexOf("async function prepareImageForUpload");
const prepareImage = fieldJourney.slice(prepareStart, fieldJourney.indexOf("const key =", prepareStart));
const middleware = readFileSync("middleware.ts", "utf8");

describe("camera return regression", () => {
  it("uses a revocable object URL and keeps camera selection client-only", () => {
    expect(photoSelection).toContain("URL.createObjectURL(file)");
    expect(photoSelection).toContain("revokePhotoPreview()");
    expect(photoSelection).not.toContain("FileReader");
    expect(photoSelection).not.toContain("send(");
    expect(photoSelection).not.toContain("fetch(");
    expect(photoSelection).not.toContain("router.refresh");
    expect(middleware).toContain("img-src 'self' data: blob: https:");
  });

  it("does not eagerly base64-encode the original before attempting resize", () => {
    const bitmapAttempt = prepareImage.indexOf("createImageBitmap(file");
    const originalFallback = prepareImage.indexOf("return original()", bitmapAttempt);
    expect(bitmapAttempt).toBeGreaterThan(-1);
    expect(originalFallback).toBeGreaterThan(bitmapAttempt);
    expect(prepareImage).toContain("bitmap?.close?.()");
    expect(prepareImage).not.toContain("const original = { base64: await blobToBase64(file)");
  });
});
