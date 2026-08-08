import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---- Database-safety gate: refuse unless this resolves to ep-falling-heart ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
console.log("[publish 15-20] Resolved write-target host:", resolvedHost);
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart. No write will be attempted.`);
}

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/actions/products";

const mockAuth = vi.mocked(auth);

const HAND_WASH_DIRECTIONS = `Wet your hands with clean water.

Take a suitable amount of hand wash onto your palm.

Rub your palms together and work the hand wash into a lather.

Clean the palms, back of the hands, between the fingers, around the fingertips and under the nails.

Rinse thoroughly with clean water.

Dry your hands using a clean towel or air dryer.`;

const HAND_WASH_SAFETY = `For external use only.

Keep out of reach of children.

Avoid contact with eyes.

In case of eye contact, rinse thoroughly with clean water.

Do not swallow.

Discontinue use if persistent irritation occurs.

Seek medical advice in case of accidental ingestion or significant irritation.`;

const HAND_WASH_STORAGE = `Store in a cool and dry place.

Protect from direct sunlight and excessive heat.

Keep the container tightly closed when not in use.

Store the bottle or container upright.

Keep away from children and food items.`;

const BODY_WASH_DIRECTIONS = `Wet the body with clean water.

Take a suitable amount of body wash onto your palm, loofah or washcloth.

Gently massage over the body to create a lather.

Rinse thoroughly with clean water.

Avoid vigorous rubbing on irritated or damaged skin.`;

const BODY_WASH_SAFETY = `For external use only.

Avoid contact with eyes. In case of eye contact, rinse thoroughly with clean water.

Do not apply to broken, inflamed or severely irritated skin.

Discontinue use if persistent irritation or discomfort occurs.

Keep out of reach of children.

Seek medical advice if irritation continues.

Do not combine on the same area with multiple strong exfoliating Products if irritation occurs.

This Product is not intended to diagnose, treat or cure acne or any medical skin condition.`;

const BODY_WASH_STORAGE = `Store in a cool and dry place away from direct sunlight and excessive heat.

Keep the container tightly closed and upright.

Do not allow water or foreign material to enter the container.`;

type Faq = { question: string; answer: string };
type ProductManifestEntry = {
  canonicalName: string;
  shortDescription: string;
  longDescription: string;
  keyBenefits: string[];
  productHighlights: string[];
  careInstructions: string[];
  howToUse: string;
  safetyInformation: string;
  storage: string;
  seoTitle: string;
  seoDescription: string;
  faq: Faq[];
};

const MANIFEST: ProductManifestEntry[] = [
  {
    canonicalName: "Muv Silk Blossom Hand Wash",
    shortDescription: "Muv Silk Blossom Hand Wash is a smooth everyday liquid hand cleanser with a soft floral fragrance, designed to leave hands feeling clean and refreshed.",
    longDescription: `Muv Silk Blossom Hand Wash combines routine hand cleansing with a soft floral Silk Blossom fragrance. Its liquid surfactant-based formulation helps wash away everyday dirt, grease and impurities from the hands.

The formula contains glycerin and a pearl-effect base for a smooth and pleasant handwashing experience. It is suitable for regular handwashing in homes, offices, washrooms and other everyday-use spaces.

The Product is available in a convenient 500 ml pack.`,
    keyBenefits: ["Helps remove everyday dirt and impurities", "Leaves hands feeling clean and refreshed", "Soft Silk Blossom fragrance", "Contains glycerin", "Smooth pearl-effect formulation", "Suitable for regular handwashing"],
    productHighlights: ["Silk Blossom floral fragrance", "Liquid hand-cleansing formulation", "Contains glycerin", "Pearl-effect appearance", "Suitable for homes and workplaces", "Available in a 500 ml pack"],
    careInstructions: ["Home handwashing", "Kitchens and wash areas", "Office washrooms", "Hotels and hospitality spaces", "Regular handwashing"],
    howToUse: HAND_WASH_DIRECTIONS,
    safetyInformation: HAND_WASH_SAFETY,
    storage: HAND_WASH_STORAGE,
    seoTitle: "Muv Silk Blossom Hand Wash | 500 ml",
    seoDescription: "Buy Muv Silk Blossom Hand Wash with a soft floral fragrance for routine hand cleansing at home and work. Available in a 500 ml pack.",
    faq: [
      { question: "What fragrance does Muv Silk Blossom Hand Wash have?", answer: "It has a soft floral Silk Blossom fragrance." },
      { question: "What pack size is available?", answer: "Muv Silk Blossom Hand Wash is available in a 500 ml pack." },
      { question: "Does it contain glycerin?", answer: "Yes. Glycerin is included in the formulation." },
      { question: "Is it suitable for regular handwashing?", answer: "Yes. It is designed for routine hand cleansing." },
    ],
  },
  {
    canonicalName: "Muv Ocean Fresh Hand Wash",
    shortDescription: "Muv Ocean Fresh Hand Wash is a refreshing everyday hand cleanser with a clean aquatic fragrance, suitable for regular handwashing at home and work.",
    longDescription: `Muv Ocean Fresh Hand Wash is designed for routine hand cleansing with a fresh aquatic-inspired fragrance. Its liquid cleansing formulation helps wash away everyday dirt, grease and impurities.

The formula contains glycerin and a pearl-effect base, creating a smooth handwashing experience. It is suitable for homes, offices, hospitality spaces, commercial washrooms and other frequent-use environments.

Available in 500 ml and 5 L packs, it supports both personal use and high-frequency dispenser refilling.`,
    keyBenefits: ["Helps remove everyday dirt and impurities", "Leaves hands feeling clean and refreshed", "Fresh Ocean Fresh fragrance", "Contains glycerin", "Suitable for regular and frequent handwashing", "Available in personal and commercial pack sizes"],
    productHighlights: ["Ocean Fresh aquatic fragrance", "Liquid hand-cleansing formulation", "Contains glycerin", "Pearl-effect appearance", "Suitable for dispenser use", "Available in 500 ml and 5 L packs"],
    careInstructions: ["Home handwashing", "Offices and workplaces", "Hotels and restaurants", "Commercial washrooms", "Frequent-use handwash dispensers", "Institutional environments"],
    howToUse: HAND_WASH_DIRECTIONS,
    safetyInformation: HAND_WASH_SAFETY,
    storage: HAND_WASH_STORAGE,
    seoTitle: "Muv Ocean Fresh Hand Wash | 500 ml & 5 L",
    seoDescription: "Shop Muv Ocean Fresh Hand Wash with a refreshing aquatic fragrance. Available in 500 ml and 5 L packs for home and commercial use.",
    faq: [
      { question: "Which sizes are available?", answer: "Muv Ocean Fresh Hand Wash is available in 500 ml and 5 L packs." },
      { question: "Is the 5 L pack suitable for dispensers?", answer: "Yes. It is suitable for refilling compatible handwash dispensers." },
      { question: "What fragrance does it have?", answer: "It has a fresh Ocean Fresh aquatic fragrance." },
      { question: "Does it contain glycerin?", answer: "Yes. Glycerin is included in the formulation." },
    ],
  },
  {
    canonicalName: "Muv Citrus Blast Hand Wash",
    shortDescription: "Muv Citrus Blast Hand Wash is a refreshing liquid hand cleanser designed to wash away everyday dirt and impurities while leaving hands feeling clean and refreshed with a vibrant Citrus Blast fragrance.",
    longDescription: `Muv Citrus Blast Hand Wash is a refreshing liquid hand cleanser developed for regular handwashing at home, offices, commercial spaces and other everyday-use environments.

Its surfactant-based cleansing formulation helps wash away everyday dirt, grease and impurities from the hands. The formula contains glycerin and a pearl-effect base for a smooth and pleasant handwashing experience.

The vibrant Citrus Blast fragrance and distinctive yellow appearance add a fresh character to every wash. Muv Citrus Blast Hand Wash is available in convenient 250 ml and 500 ml packs, along with a practical 5 L pack suitable for frequent and commercial use.`,
    keyBenefits: ["Helps wash away everyday dirt, grease and impurities", "Leaves hands feeling clean and refreshed", "Contains glycerin for a comfortable after-wash feel", "Refreshing Citrus Blast fragrance", "Smooth pearl-effect liquid formulation", "Suitable for regular handwashing", "Available in personal-use and commercial-use pack sizes"],
    productHighlights: ["Refreshing Citrus Blast fragrance", "Distinctive yellow colour", "Surfactant-based hand-cleansing formulation", "Contains glycerin", "Smooth pearl-effect appearance", "Suitable for regular handwashing", "Available in 250 ml, 500 ml and 5 L packs", "5 L pack suitable for frequent and commercial use"],
    careInstructions: ["For regular handwashing at home", "For use in kitchens and wash areas", "For offices and workplaces", "For hotels, restaurants and institutions", "For commercial washrooms", "For frequent-use handwash dispensers"],
    howToUse: HAND_WASH_DIRECTIONS,
    safetyInformation: HAND_WASH_SAFETY,
    storage: HAND_WASH_STORAGE,
    seoTitle: "Muv Citrus Blast Hand Wash | 250 ml, 500 ml & 5 L",
    seoDescription: "Shop Muv Citrus Blast Hand Wash with a refreshing citrus fragrance. Available in 250 ml, 500 ml and 5 L packs for home, office and commercial use.",
    faq: [
      { question: "What sizes is Muv Citrus Blast Hand Wash available in?", answer: "It is available in 250 ml, 500 ml and 5 L packs." },
      { question: "What is its fragrance?", answer: "It has a refreshing Citrus Blast fragrance." },
      { question: "What colour is the Product?", answer: "It has a distinctive yellow colour." },
      { question: "Does it contain glycerin?", answer: "Yes. Glycerin is included in the formulation." },
      { question: "Can the 5 L pack be used commercially?", answer: "Yes. It is a practical option for offices, hotels, restaurants, institutions and other frequent-use environments." },
      { question: "Is it antibacterial?", answer: "It is intended for routine hand cleansing. An antibacterial or germ-kill claim should not be assumed unless stated on the approved label." },
    ],
  },
  {
    canonicalName: "Muv Crimson Veil Body Wash",
    shortDescription: "Muv Crimson Veil Body Wash is a refreshing daily body cleanser with 1% Salicylic Acid, designed to cleanse away everyday sweat, dirt and excess surface oil.",
    longDescription: `Muv Crimson Veil Body Wash is formulated for everyday body cleansing with 1% Salicylic Acid. It helps remove daily sweat, dirt, impurities and excess surface oil from the skin while creating a refreshing shower experience.

Salicylic Acid is included as a cleansing-support ingredient, but this Product must not be presented as a treatment or cure for acne, infection or any medical condition.

Use the Product gently on wet skin, rinse thoroughly and discontinue use if persistent irritation occurs. Available in 250 ml and 950 ml packs.`,
    keyBenefits: ["Helps cleanse away everyday sweat and dirt", "Helps remove excess surface oil and impurities", "Contains 1% Salicylic Acid", "Suitable for regular body cleansing", "Refreshing Crimson Veil fragrance", "Available in 250 ml and 950 ml packs"],
    productHighlights: ["1% Salicylic Acid", "Daily body-cleansing formulation", "Designed for rinse-off use", "Crimson Veil fragrance", "Suitable for personal and family-use pack sizes", "Available in 250 ml and 950 ml"],
    careInstructions: ["Daily showering", "Routine body cleansing", "Cleansing sweat and everyday impurities", "Areas prone to excess surface oil", "Regular rinse-off personal care"],
    howToUse: BODY_WASH_DIRECTIONS,
    safetyInformation: BODY_WASH_SAFETY,
    storage: BODY_WASH_STORAGE,
    seoTitle: "Muv Crimson Veil Body Wash with 1% Salicylic Acid",
    seoDescription: "Shop Muv Crimson Veil Body Wash with 1% Salicylic Acid for everyday cleansing of sweat, dirt and excess surface oil. Available in 250 ml and 950 ml.",
    faq: [
      { question: "How much Salicylic Acid does it contain?", answer: "It contains 1% Salicylic Acid." },
      { question: "Is it an acne treatment?", answer: "No. It is a rinse-off body cleanser and should not be presented as a medical treatment." },
      { question: "How should it be used?", answer: "Apply a suitable amount to wet skin, gently lather and rinse thoroughly." },
      { question: "Which sizes are available?", answer: "It is available in 250 ml and 950 ml packs." },
    ],
  },
  {
    canonicalName: "Muv Velvet Oak Body Wash",
    shortDescription: "Muv Velvet Oak Body Wash is an everyday body cleanser with 1% Salicylic Acid and a refined woody fragrance, designed to cleanse sweat, dirt and excess surface oil.",
    longDescription: `Muv Velvet Oak Body Wash combines everyday rinse-off cleansing with a refined woody Velvet Oak fragrance. Its formulation contains 1% Salicylic Acid and helps wash away routine sweat, dirt, impurities and excess surface oil.

The Product should be massaged gently onto wet skin and rinsed thoroughly. It must not be presented as a treatment for acne, infection or any medical skin condition.

Available in 250 ml and 950 ml packs, it supports convenient personal use and regular family use.`,
    keyBenefits: ["Helps remove everyday sweat and dirt", "Helps cleanse excess surface oil and impurities", "Contains 1% Salicylic Acid", "Refined Velvet Oak fragrance", "Suitable for regular rinse-off body cleansing", "Available in 250 ml and 950 ml packs"],
    productHighlights: ["1% Salicylic Acid", "Woody Velvet Oak fragrance", "Daily rinse-off body cleanser", "Suitable for routine shower use", "Available in personal and family pack sizes", "250 ml and 950 ml variants"],
    careInstructions: ["Daily showering", "Routine body cleansing", "Cleansing sweat and impurities", "Areas with excess surface oil", "Regular personal-care use"],
    howToUse: BODY_WASH_DIRECTIONS,
    safetyInformation: BODY_WASH_SAFETY,
    storage: BODY_WASH_STORAGE,
    seoTitle: "Muv Velvet Oak Body Wash with 1% Salicylic Acid",
    seoDescription: "Buy Muv Velvet Oak Body Wash with 1% Salicylic Acid and a refined woody fragrance. Available in 250 ml and 950 ml packs.",
    faq: [
      { question: "Does it contain Salicylic Acid?", answer: "Yes. It contains 1% Salicylic Acid." },
      { question: "What fragrance does it have?", answer: "It has a refined Velvet Oak woody fragrance." },
      { question: "Can it be used every day?", answer: "It is designed for regular rinse-off body cleansing. Discontinue use if persistent irritation occurs." },
      { question: "Which sizes are available?", answer: "It is available in 250 ml and 950 ml packs." },
    ],
  },
  {
    canonicalName: "Muv Midnight Frost Body Wash",
    shortDescription: "Muv Midnight Frost Body Wash is a refreshing daily body cleanser with 1% Salicylic Acid, designed to remove everyday sweat, dirt, impurities and excess surface oil.",
    longDescription: `Muv Midnight Frost Body Wash is developed for everyday rinse-off body cleansing with a cool and refreshing Midnight Frost fragrance.

The formulation contains 1% Salicylic Acid and helps cleanse everyday sweat, dirt, impurities and excess surface oil. The Product should be applied gently to wet skin, worked into a lather and rinsed thoroughly.

It must not be promoted as an acne treatment or as a cure for any medical skin condition. The Product is available in 250 ml and 950 ml packs.`,
    keyBenefits: ["Helps cleanse everyday sweat and dirt", "Helps remove impurities and excess surface oil", "Contains 1% Salicylic Acid", "Refreshing Midnight Frost fragrance", "Suitable for regular rinse-off body cleansing", "Available in 250 ml and 950 ml packs"],
    productHighlights: ["1% Salicylic Acid", "Cool Midnight Frost fragrance", "Daily body-cleansing formulation", "Designed for rinse-off use", "Available in personal and family pack sizes", "250 ml and 950 ml variants"],
    careInstructions: ["Daily showering", "Routine body cleansing", "Cleansing sweat and everyday impurities", "Areas with excess surface oil", "Regular personal-care use"],
    howToUse: BODY_WASH_DIRECTIONS,
    safetyInformation: BODY_WASH_SAFETY,
    storage: BODY_WASH_STORAGE,
    seoTitle: "Muv Midnight Frost Body Wash with 1% Salicylic Acid",
    seoDescription: "Shop Muv Midnight Frost Body Wash with 1% Salicylic Acid for everyday cleansing. Available in 250 ml and 950 ml packs.",
    faq: [
      { question: "How much Salicylic Acid does it contain?", answer: "It contains 1% Salicylic Acid." },
      { question: "Is this Product an acne treatment?", answer: "No. It is a rinse-off body cleanser and is not intended as a medical treatment." },
      { question: "How should it be applied?", answer: "Apply a suitable amount to wet skin, gently lather and rinse thoroughly." },
      { question: "Which sizes are available?", answer: "It is available in 250 ml and 950 ml packs." },
    ],
  },
];

describe("Publish approved Product Content — Products 15-20 (ep-falling-heart UAT only)", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "STAFF"] } } });
    if (!admin) throw new Error("No ADMIN/STAFF user found on the isolated UAT database.");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: admin.role } } as never);
  });

  for (const entry of MANIFEST) {
    it(`publishes and verifies: ${entry.canonicalName}`, async () => {
      const before = await prisma.product.findFirst({
        where: { name: entry.canonicalName },
        include: { variants: { include: { inventory: true }, orderBy: { price: "asc" } }, content: true },
      });
      expect(before, `Product not found: ${entry.canonicalName}`).toBeTruthy();
      if (!before) return;

      const contentExistedBefore = !!before.content;

      const contentPayload = {
        shortDescription: entry.shortDescription,
        longDescription: entry.longDescription,
        keyBenefits: entry.keyBenefits.join("\n"),
        productHighlights: entry.productHighlights.join("\n"),
        careInstructions: entry.careInstructions.join("\n"),
        howToUse: entry.howToUse,
        safetyInformation: entry.safetyInformation,
        storage: entry.storage,
        seoTitle: entry.seoTitle,
        seoDescription: entry.seoDescription,
        faq: entry.faq,
      };

      // Activation Rule: only set ACTIVE if it already qualifies (>=1 image, >=1 variant with SKU/MRP/price) —
      // all six already have real images and valid variants (confirmed in the pre-check), so ACTIVE applies to all.
      const qualifiesForActive = before.images.length > 0 && before.variants.length > 0 && before.variants.every((v) => v.sku && v.mrp > 0 && v.price > 0);

      const result = await updateProduct({
        id: before.id,
        content: contentPayload,
        ...(qualifiesForActive ? { status: "ACTIVE" as const } : {}),
      });
      expect(result.success, `updateProduct failed for ${entry.canonicalName}: ${!result.success ? JSON.stringify(result.error) : ""}`).toBe(true);

      const reloaded = await prisma.product.findUniqueOrThrow({
        where: { id: before.id },
        include: { variants: { include: { inventory: true }, orderBy: { price: "asc" } }, content: true },
      });

      console.log(`[publish 15-20] ${entry.canonicalName}: content ${contentExistedBefore ? "UPDATED" : "CREATED"}`);

      // ---- Content fields, exact match ----
      expect(reloaded.content?.shortDescription).toBe(entry.shortDescription);
      expect(reloaded.content?.longDescription).toBe(entry.longDescription);
      expect(reloaded.content?.keyBenefits).toBe(contentPayload.keyBenefits);
      expect(reloaded.content?.productHighlights).toBe(contentPayload.productHighlights);
      expect(reloaded.content?.careInstructions).toBe(contentPayload.careInstructions);
      expect(reloaded.content?.howToUse).toBe(entry.howToUse);
      expect(reloaded.content?.safetyInformation).toBe(entry.safetyInformation);
      expect(reloaded.content?.storage).toBe(entry.storage);
      expect(reloaded.content?.seoTitle).toBe(entry.seoTitle);
      expect(reloaded.content?.seoDescription).toBe(entry.seoDescription);
      expect(reloaded.content?.faq).toEqual(entry.faq); // count + order

      // ---- Data safety: everything else byte-identical to before this write ----
      expect(reloaded.id).toBe(before.id);
      expect(reloaded.slug).toBe(before.slug);
      expect(reloaded.categoryId).toBe(before.categoryId);
      expect(reloaded.images).toEqual(before.images); // count, URLs, order, cover (index 0)
      expect(reloaded.images[0]).toBe(before.images[0]);
      expect(reloaded.variants.length).toBe(before.variants.length);
      for (const v of reloaded.variants) {
        const b = before.variants.find((x) => x.id === v.id)!;
        expect(v.sku).toBe(b.sku);
        expect(v.mrp).toBe(b.mrp);
        expect(v.price).toBe(b.price);
        expect(v.inventory?.quantity).toBe(b.inventory?.quantity);
      }

      console.log(`[publish 15-20] OK: ${entry.canonicalName} | status=${reloaded.status} | images=${reloaded.images.length} | variants=${reloaded.variants.length} | faq=${(reloaded.content?.faq as unknown[])?.length}`);
    }, 60000);
  }
});
