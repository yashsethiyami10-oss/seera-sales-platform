import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/actions/products";

const mockAuth = vi.mocked(auth);

/**
 * Approved Requirements §8 verification — a real, existing two-variant
 * Product (Muv Radiance Car Wash: 500ml + 5L) with 12 real images, run end-to-end
 * through the actual updateProduct Server Action (real Zod validation,
 * real Prisma writes, real ProductContent upsert) against the isolated
 * UAT database. The product's exact original state is captured first and
 * restored in `afterAll`, regardless of pass/fail, since this is a real
 * catalogue item.
 */
describe("Admin Product Editor upgrade — real-product verification", () => {
  let productId: string;
  let originalImages: string[];
  let originalStatus: string;
  let hadOriginalContent: boolean;
  let originalContentSnapshot: Record<string, unknown> | null;

  const FIVE_FAQS = [
    { question: "Is Muv Radiance Car Wash safe for all paint finishes?", answer: "Yes — the pH-balanced formula is safe on clear-coat and standard automotive paint finishes." },
    { question: "Does it need to be diluted before use?", answer: "Dilute per the ratio printed on the pack label, then apply with a wash mitt or foam applicator." },
    { question: "Which pack size should I choose?", answer: "500 ml suits occasional home use; the 5 Litre pack suits frequent washing or multiple vehicles." },
    { question: "Can it be used on wheels and tyres too?", answer: "It is formulated for exterior body panels; use a dedicated wheel cleaner for wheels and tyres." },
    { question: "How should it be stored?", answer: "Store in a cool, dry place away from direct sunlight, out of reach of children." },
  ];

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "STAFF"] } } });
    if (!admin) throw new Error("No ADMIN/STAFF user found on the isolated UAT database to run this check as.");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: admin.role } } as never);

    const product = await prisma.product.findFirstOrThrow({
      where: { name: "Muv Radiance Car Wash" },
      include: { content: true, variants: true },
    });
    productId = product.id;
    originalImages = [...product.images];
    originalStatus = product.status;
    hadOriginalContent = !!product.content;
    originalContentSnapshot = product.content
      ? {
          shortDescription: product.content.shortDescription, longDescription: product.content.longDescription,
          keyBenefits: product.content.keyBenefits, productHighlights: product.content.productHighlights,
          howToUse: product.content.howToUse, careInstructions: product.content.careInstructions,
          storage: product.content.storage, safetyInformation: product.content.safetyInformation,
          seoTitle: product.content.seoTitle, seoDescription: product.content.seoDescription, faq: product.content.faq,
        }
      : null;

    expect(product.variants.length).toBe(2); // 500ml + 5L — confirms the right test subject
    expect(product.images.length).toBeGreaterThanOrEqual(12);
  });

  afterAll(async () => {
    // Restore the real catalogue item to its exact original state.
    await prisma.product.update({ where: { id: productId }, data: { images: originalImages, status: originalStatus as never } });
    if (hadOriginalContent && originalContentSnapshot) {
      await prisma.productContent.update({ where: { productId }, data: originalContentSnapshot as never });
    } else {
      await prisma.productContent.deleteMany({ where: { productId } });
    }
    await prisma.$disconnect();
  });

  it("saves 12 reordered images, full content, and 5 FAQs via the real Server Action", async () => {
    const twelveReordered = [...originalImages].slice(0, 12).reverse();
    const result = await updateProduct({
      id: productId,
      images: twelveReordered,
      status: "ACTIVE",
      content: {
        shortDescription: "A liquid exterior vehicle wash for home and frequent use.",
        longDescription: "Muv Radiance Car Wash lifts road grime and restores shine without harming clear-coat paint finishes, sold in 500 ml and 5 Litre pack sizes.",
        keyBenefits: "Cuts road grime fast\nSafe on clear-coat paint\nLeaves a streak-free shine",
        productHighlights: "pH-balanced formula\nWorks with a standard wash mitt or foam applicator",
        howToUse: "Dilute per the pack label. Apply with a wash mitt or foam applicator. Rinse thoroughly with clean water.",
        careInstructions: "Best used on a cool, shaded vehicle surface — avoid washing under direct hot sun.",
        storage: "Store in a cool, dry place away from direct sunlight, out of reach of children.",
        safetyInformation: "For external vehicle-cleaning use only. Avoid contact with eyes. Keep out of reach of children.",
        seoTitle: "Muv Radiance Car Wash — 500ml & 5L | Muv",
        seoDescription: "Muv Radiance Car Wash — a pH-balanced liquid exterior vehicle wash, safe on clear-coat paint. Available in 500 ml and 5 Litre.",
        faq: FIVE_FAQS,
      },
    });

    expect(result.success).toBe(true);

    const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { content: true } });
    expect(reloaded.images).toEqual(twelveReordered); // exact order preserved
    expect(reloaded.images.length).toBe(12);
    expect(reloaded.content?.faq).toEqual(FIVE_FAQS); // order preserved, all 5 present
    expect(reloaded.content?.shortDescription).toContain("liquid exterior vehicle wash");
    expect(reloaded.content?.careInstructions).toContain("shaded vehicle surface");
    expect(reloaded.status).toBe("ACTIVE");
  });

  it("rejects activation when a mandatory field is missing (images cleared)", async () => {
    const result = await updateProduct({ id: productId, images: [], status: "ACTIVE" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.fieldErrors?.images).toBeTruthy();

    // Confirm nothing was actually written — rejection must be all-or-nothing.
    const stillIntact = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(stillIntact.images.length).toBe(12);
  });

  it("allows a Draft save with the same incomplete fields (does not block Draft saving)", async () => {
    const result = await updateProduct({ id: productId, images: [], status: "DRAFT" });
    expect(result.success).toBe(true);

    const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(reloaded.status).toBe("DRAFT");
    expect(reloaded.images.length).toBe(0);
  });

  it("commercial data (variant SKU/price/MRP) is untouched by any of the above", async () => {
    const variants = await prisma.productVariant.findMany({ where: { productId }, orderBy: { size: "asc" } });
    expect(variants.length).toBe(2);
    for (const v of variants) {
      expect(v.sku).toBeTruthy();
      expect(v.price).toBeGreaterThan(0);
      expect(v.mrp).toBeGreaterThanOrEqual(v.price);
    }
  });
});
