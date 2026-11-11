import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getKycSubject, listKycSubjects, readKycFile, removeKycDocument, saveKycDetails, uploadKycDocument } from "@/lib/sales-distribution/partner-kyc-service";
import { partnerSalesSnapshot } from "@/lib/sales-distribution/partner-insight-service";

// DB-backed scope checks. Runs only when SEERA_USABILITY_DB_URL points at a disposable TEST
// database seeded with the review-*@seera.test fixtures (npm run seed:seera:review-users). Writes
// one prospect + KYC rows per run; never truncates anything.
const url = process.env.SEERA_USABILITY_DB_URL;
const suite = url ? describe : describe.skip;

suite("partner KYC + partner snapshot scope (DB)", () => {
  let db: PrismaClient;
  const ids: Record<string, string> = {};
  let prospectId = "";
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(1)]);

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    for (const [k, email] of Object.entries({
      exec1: "review-sales-executive-1@seera.test",
      exec2: "review-sales-executive-2@seera.test",
      manager: "review-sales-manager-1@seera.test",
      distributor: "review-distributor-owner@seera.test",
      ss: "review-ss-owner@seera.test",
    })) ids[k] = (await db.user.findFirstOrThrow({ where: { email } })).id;
    const p = await db.seeraProspect.create({
      data: { prospectType: "SUPER_STOCKIST", businessName: `Scope Test ${Date.now()}`, normalizedMobile: "9000000000", profile: {}, ownerEmployeeId: ids.exec1 },
    });
    prospectId = p.id;
  });
  afterAll(async () => db?.$disconnect());

  it("the owning executive can upload, list and save KYC details", async () => {
    const doc = await uploadKycDocument(db, ids.exec1, { subjectType: "PROSPECT", subjectId: prospectId, docType: "PAN_CARD", originalName: "pan.jpg", mimeType: "image/jpeg", bytes: jpeg });
    ids.doc = doc.id;
    await saveKycDetails(db, ids.exec1, "PROSPECT", prospectId, { pan: "ABCDE1234F", ifsc: "HDFC0001234" });
    const subject = await getKycSubject(db, ids.exec1, "PROSPECT", prospectId);
    expect(subject.documents.map((d) => d.docType)).toContain("PAN_CARD");
    expect(subject.details?.pan).toBe("ABCDE1234F");
    expect((await listKycSubjects(db, ids.exec1)).some((s) => s.subjectId === prospectId)).toBe(true);
    const file = await readKycFile(db, ids.exec1, doc.id);
    expect(file.mimeType).toBe("image/jpeg");
  });

  it("another executive cannot see or touch this prospect's KYC", async () => {
    await expect(getKycSubject(db, ids.exec2, "PROSPECT", prospectId)).rejects.toMatchObject({ code: "KYC_SCOPE_DENIED" });
    await expect(readKycFile(db, ids.exec2, ids.doc)).rejects.toMatchObject({ code: "KYC_SCOPE_DENIED" });
    expect((await listKycSubjects(db, ids.exec2)).some((s) => s.subjectId === prospectId)).toBe(false);
  });

  it("a manager (network:manage) can work any prospect's KYC", async () => {
    const subject = await getKycSubject(db, ids.manager, "PROSPECT", prospectId);
    expect(subject.documents.length).toBeGreaterThan(0);
  });

  it("partners (distributor / S.S.) have no KYC access at all", async () => {
    await expect(listKycSubjects(db, ids.distributor)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(readKycFile(db, ids.ss, ids.doc)).rejects.toBeTruthy();
  });

  it("rejects a renamed non-image and removal needs a reason", async () => {
    await expect(
      uploadKycDocument(db, ids.exec1, { subjectType: "PROSPECT", subjectId: prospectId, docType: "OTHER", originalName: "x.jpg", mimeType: "image/jpeg", bytes: new TextEncoder().encode("<html>nope</html>") }),
    ).rejects.toMatchObject({ code: "KYC_FILE_SIGNATURE_MISMATCH" });
    await expect(removeKycDocument(db, ids.exec1, ids.doc, " ")).rejects.toMatchObject({ code: "KYC_REMOVE_REASON_REQUIRED" });
    await removeKycDocument(db, ids.exec1, ids.doc, "wrong file");
    await expect(readKycFile(db, ids.exec1, ids.doc)).rejects.toMatchObject({ code: "KYC_DOCUMENT_NOT_FOUND" });
  });

  it("partner snapshot is own-party only", async () => {
    const own = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ids.distributor, active: true } });
    const snap = await partnerSalesSnapshot(db, ids.distributor, own.partnerId, "DISTRIBUTOR");
    expect(snap.month.value).toBeGreaterThanOrEqual(0);
    const other = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", id: { not: own.partnerId } } });
    if (other) await expect(partnerSalesSnapshot(db, ids.distributor, other.id, "DISTRIBUTOR")).rejects.toBeTruthy();
    const ssLink = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ids.ss, active: true } });
    await expect(partnerSalesSnapshot(db, ids.ss, ssLink.partnerId, "DISTRIBUTOR")).rejects.toBeTruthy();
  });
});
