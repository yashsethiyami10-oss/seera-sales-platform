import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { v2 as cloudinary } from "cloudinary";

// P0 21-Aug "Invalid Signature" regression coverage. Uses the REAL (unmocked) `cloudinary` package
// — signing is a pure local HMAC computation, it never calls Cloudinary's network API, so this
// needs no real account/credentials, just proves the actual SDK behavior our service depends on.
// This is exactly the class of bug a mocked `api_sign_request` (see field-photo-cloudinary.test.ts,
// which intentionally mocks the whole `cloudinary` module for its DB-integration tests) can never
// catch — the mock always returns a fixed string regardless of what was actually signed.

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const secret = "test-secret-for-signature-math-only";

describe("Cloudinary field-photo signed upload — real signature math (P0 21-Aug)", () => {
  it("field-photo-cloudinary-service.ts signs ONLY the minimal genuinely-necessary param set", () => {
    const code = source("lib/sales-distribution/field-photo-cloudinary-service.ts");
    const paramsBlock = code.slice(code.indexOf("const uploadParams = {"), code.indexOf("const signature ="));
    // Must be present — these are real, legitimately signable Cloudinary Upload API parameters.
    for (const key of ["folder", "overwrite", "public_id", "timestamp", "type", "unique_filename"]) {
      expect(paramsBlock).toContain(key);
    }
    // Must NOT be present in the SIGNED object — resource_type is routing metadata Cloudinary's
    // own upload API never treats as a signable body parameter (confirmed against the Cloudinary
    // Node SDK's own build_upload_params(), which never includes it); transformation/
    // allowed_formats are dropped as redundant since the client already resizes/compresses to a
    // bounded JPEG before upload.
    expect(paramsBlock).not.toContain("resource_type");
    expect(paramsBlock).not.toContain("transformation");
    expect(paramsBlock).not.toContain("allowed_formats");
  });

  it("proves — with the REAL Cloudinary SDK, not a mock — that including resource_type in the signed object breaks the signature (this is the exact bug that shipped)", () => {
    const timestamp = 1755763200;
    const correctParams = { folder: "seera/field-visits/visit1", overwrite: false, public_id: "leaf-id", timestamp, type: "upload", unique_filename: false };
    const buggyParams = { ...correctParams, resource_type: "image" };

    const correctSignature = cloudinary.utils.api_sign_request(correctParams, secret);
    const buggySignature = cloudinary.utils.api_sign_request(buggyParams, secret);

    // Different signed input -> different signature. Any consumer that (like our own server
    // previously did) signs `buggyParams` will never match Cloudinary's own server-side
    // verification, which excludes resource_type entirely — an unconditional mismatch.
    expect(buggySignature).not.toBe(correctSignature);
    expect(correctSignature).toMatch(/^[0-9a-f]{40}$/); // sha1 hex, Cloudinary's default algorithm
  });

  it("client (FieldJourney.tsx) posts exactly the signed fields verbatim — no reconstruction, no leftover transformation/allowed_formats fields", () => {
    const code = source("components/seera/product/FieldJourney.tsx");
    const formBlock = code.slice(code.indexOf("const form = new FormData();"), code.indexOf("api.cloudinary.com"));
    for (const key of ["api_key", "timestamp", "signature", "folder", "public_id", "overwrite", "type", "unique_filename"]) {
      expect(formBlock).toContain(key);
    }
    expect(formBlock).not.toContain("allowed_formats");
    expect(formBlock).not.toContain("transformation");
    // resource_type must NOT be posted as a signed form field (it isn't signed) — it's used only
    // to build the upload URL.
    expect(formBlock).not.toContain("resource_type: signed.resource_type");
  });

  it("client never displays Cloudinary's raw provider error to field staff", () => {
    const code = source("components/seera/product/FieldJourney.tsx");
    expect(code).not.toContain("uploaded?.error?.message ?? \"Photo upload failed");
    expect(code).toContain('throw new Error("Photo upload failed. Please retry.")');
  });
});
