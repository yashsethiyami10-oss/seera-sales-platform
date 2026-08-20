import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// Real TEST-database coverage for lib/sales-distribution/field-photo-cloudinary-service.ts
// (P0 Cloudinary field-photo storage). Only the `cloudinary` SDK itself is mocked — signature
// issuance, visit/actor ownership checks, folder scoping, forged-input rejection, and DB
// persistence all run against the real service against a real TEST database, same pattern as
// __tests__/seera-whatsapp/checkout-non-blocking.test.ts.
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "test-cloud";
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "test-key";
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "test-secret-never-returned";

const resourceMock = vi.fn();
vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    utils: { api_sign_request: vi.fn(() => "mock-signature") },
    api: { resource: (...args: unknown[]) => resourceMock(...args) },
  },
}));

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(__dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

// createFieldPhotoUploadSignature returns `public_id` as just the leaf name (Cloudinary combines
// it with the separately-supplied `folder` param). The real client sends finalize the FULL
// `folder/leaf` id Cloudinary's own upload response reports back — mirror that here rather than
// finalizing with the bare leaf id, which the service correctly treats as outside the visit folder.
function fullPublicId(signed: { folder: string; public_id: string }) {
  return `${signed.folder}/${signed.public_id}`;
}

function fakeCloudinaryResource(publicId: string, overrides: Record<string, unknown> = {}) {
  return {
    public_id: publicId,
    resource_type: "image",
    type: "upload",
    secure_url: `https://res.cloudinary.com/test-cloud/image/upload/${publicId}.jpg`,
    bytes: 500_000,
    width: 1280,
    height: 960,
    format: "jpg",
    ...overrides,
  };
}

describe("field photo Cloudinary signed upload + finalize", () => {
  let execA: { id: string };
  let execB: { id: string };
  let auditor: { id: string };
  let sessionA: { id: string };
  let visitA: { id: string };

  beforeAll(async () => {
    console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
    resourceMock.mockReset();
    const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const { executiveCheckIn } = await import("../../lib/sales-distribution/field-portal-service");
    const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");

    execA = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
    execB = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });
    auditor = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-auditor@seera.test" } });

    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: execA.id, status: "ACTIVE" } });
    if (existing) await endFieldDay(db, execA.id, existing.id, { outcome: "COMPLETED" }).catch(() => undefined);

    const authorized = await executiveAuthorizedDistributors(db, execA.id);
    const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: execA.id, mobile: { not: null } } });
    sessionA = await startFieldDay(db, execA.id, {
      employeeRole: "SALES_EXECUTIVE",
      workingType: "RETAILING",
      workingDistributorId: authorized[0]!.id,
      latitude: 28.6139,
      longitude: 77.209,
    });
    const suffix = Date.now();
    visitA = await executiveCheckIn(db, execA.id, {
      workSessionId: sessionA.id,
      retailerId: retailer.id,
      latitude: 28.6139,
      longitude: 77.209,
      idempotencyKey: `cloudinary-photo-checkin-${suffix}`,
    });
  }, 60_000);

  afterAll(async () => {
    const { endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    if (sessionA) await endFieldDay(db, execA.id, sessionA.id, { outcome: "COMPLETED" }).catch(() => undefined);
    await db.$disconnect();
  }, 60_000);

  it("issues a visit-scoped signature and never returns the API secret", async () => {
    const { createFieldPhotoUploadSignature } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const signed = await createFieldPhotoUploadSignature(db, execA.id, visitA.id);
    expect(signed.folder).toBe(`seera/field-visits/${visitA.id}`);
    expect(signed.cloudName).toBe("test-cloud");
    expect(signed.apiKey).toBe("test-key");
    expect(JSON.stringify(signed)).not.toContain("test-secret-never-returned");
    expect(signed).not.toHaveProperty("apiSecret");
    expect(signed).not.toHaveProperty("api_secret");
  }, 20_000);

  it("rejects a signature request for a visit the actor does not own", async () => {
    const { createFieldPhotoUploadSignature } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    await expect(createFieldPhotoUploadSignature(db, execB.id, visitA.id)).rejects.toMatchObject({ code: "VISIT_SCOPE_DENIED" });
  }, 20_000);

  it("rejects a signature request from an actor without the retailer:visit permission", async () => {
    const { createFieldPhotoUploadSignature } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    await expect(createFieldPhotoUploadSignature(db, auditor.id, visitA.id)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  }, 20_000);

  it("finalizes a legitimately-signed upload and persists metadata only (no binary)", async () => {
    const { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const signed = await createFieldPhotoUploadSignature(db, execA.id, visitA.id);
    const publicId = fullPublicId(signed);
    resourceMock.mockResolvedValueOnce(fakeCloudinaryResource(publicId));

    const photo = await finalizeFieldPhotoUpload(db, execA.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId });
    expect(photo.storageProvider).toBe("CLOUDINARY");
    expect(photo.publicId).toBe(publicId);
    expect(photo.secureUrl).toContain("res.cloudinary.com");
    expect(photo.fileId).toBeNull();

    const row = await db.seeraVisitPhoto.findUniqueOrThrow({ where: { id: photo.id } });
    expect(row).not.toHaveProperty("bytes");
    expect(row).not.toHaveProperty("contentBytes");
    expect(row).not.toHaveProperty("fileBase64");
  }, 20_000);

  it("rejects a finalize call whose public_id falls outside the visit's governed folder (forged folder)", async () => {
    const { finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    await expect(
      finalizeFieldPhotoUpload(db, execA.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId: "seera/field-visits/some-other-visit/forged-id" }),
    ).rejects.toMatchObject({ code: "PHOTO_SCOPE_DENIED" });
  }, 20_000);

  it("rejects a finalize call whose public_id nests outside the visit's own folder via a path segment (forged public_id)", async () => {
    const { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const signed = await createFieldPhotoUploadSignature(db, execA.id, visitA.id);
    await expect(
      finalizeFieldPhotoUpload(db, execA.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId: `${fullPublicId(signed)}/../../escape` }),
    ).rejects.toMatchObject({ code: "PHOTO_SCOPE_DENIED" });
  }, 20_000);

  it("rejects finalize when the Cloudinary resource does not match expected constraints (oversized/forged)", async () => {
    const { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const signed = await createFieldPhotoUploadSignature(db, execA.id, visitA.id);
    const publicId = fullPublicId(signed);
    resourceMock.mockResolvedValueOnce(fakeCloudinaryResource(publicId, { bytes: 9_000_000 }));
    await expect(
      finalizeFieldPhotoUpload(db, execA.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId }),
    ).rejects.toMatchObject({ code: "PHOTO_UPLOAD_INVALID" });
  }, 20_000);

  it("rejects finalize when a different actor tries to claim someone else's already-finalized public_id", async () => {
    const { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const signed = await createFieldPhotoUploadSignature(db, execA.id, visitA.id);
    const publicId = fullPublicId(signed);
    resourceMock.mockResolvedValueOnce(fakeCloudinaryResource(publicId));
    await finalizeFieldPhotoUpload(db, execA.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId });
    await expect(
      finalizeFieldPhotoUpload(db, execB.id, { visitId: visitA.id, photoType: "SHOPFRONT", publicId }),
    ).rejects.toMatchObject({ code: "VISIT_SCOPE_DENIED" });
  }, 20_000);

  it("never touches the retailer communication outbox from signature issuance or finalize", async () => {
    const service = readFileSync(path.join(root, "lib/sales-distribution/field-photo-cloudinary-service.ts"), "utf8");
    expect(service).not.toContain("queueRetailerCommunicationSafe");
    expect(service).not.toContain("outboxEvent");
  });
});
