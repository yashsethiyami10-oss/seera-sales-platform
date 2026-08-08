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
console.log("[publish-ingredients] Resolved write-target host:", resolvedHost);
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart. No write will be attempted.`);
}

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/actions/products";

const mockAuth = vi.mocked(auth);

// Approved dry-run values (Founder-confirmed: Pure Bleach ships with no preservative entry).
const INGREDIENTS: Record<string, string> = {
  "Muv Indian Rose Liquid Detergent": "Aqua, Caustic Soda, Soda, Slurry, SLES, CAPB, CDEA, Phenoxyethanol, Colour, Indian Rose Fragrance, Salt",
  "Muv Cool Water Liquid Detergent": "Aqua, Caustic Soda, Soda, Slurry, SLES, CAPB, CDEA, Phenoxyethanol, Colour, Cool Water Fragrance, Salt",
  "Muv Lavender Garden Liquid Detergent": "Aqua, Caustic Soda, Soda, Slurry, SLES, CAPB, CDEA, Phenoxyethanol, Colour, Lavender Garden Fragrance, Salt",
  "Muv Floral Toilet Cleaner": "Aqua, Acid Thickener, HCL, Acid Blue Colour, Phenoxyethanol, Floral Fragrance",
  "Muv Spark Dishwash Gel": "Aqua, EDTA, Caustic Soda, LABSA Slurry, SLES, CAPB, CDEA, Glycerine, Phenoxyethanol, Yellow Colour, Lemon Fragrance, Salt, Citric Acid",
  "Muv Fresh Bathroom Cleaner": "Aqua, HCl, SLES, Acid Thickener, Phenoxyethanol, Colour, Mahogany Teakwood Fragrance",
  "Muv Crystal Glass Cleaner": "Aqua, Isopropyl Alcohol, SLES, Butyl Cellosolve, Acetic Acid, Benzalkonium Chloride, Phenoxyethanol, Fragrance, Blue Colour",
  "Muv Velvet Mist Floor Cleaner": "Aqua, SLES, Alfox 200, Phenoxyethanol, Lavender Colour, Velvet Mist Fragrance, Silicone Emulsion",
  "Muv Cloud Walk Floor Cleaner": "Aqua, SLES, Alfox 200, Phenoxyethanol, Blue Colour, Cloud Walk Fragrance, Silicone Emulsion",
  "Muv White Phenyl": "Aqua, Pine Oil, Turkey Red Oil, Non-Ionic Surfactant, Sodium Carbonate, Phenoxyethanol, Pine Fragrance, Colour, pH Adjuster",
  "Muv Black Phenyl": "Aqua, Black Phenyl Concentrate, Turkey Red Oil, Non-Ionic Surfactant, Sodium Carbonate, Phenoxyethanol, Pine Fragrance, Colour, pH Adjuster",
  "Muv Pure Bleach": "Aqua, Sodium Hypochlorite, Sodium Hydroxide, Sodium Silicate",
  "Muv Radiance Car Wash": "Aqua, EDTA, SLES, CAPB, CDEA, Isopropyl Alcohol, Phenoxyethanol, Colour, Aqua Fragrance, Silicone Emulsion, Salt",
  "Muv Life Shield Hand Wash": "Aqua, SLES, CAPB, CDEA, Glycerin, Sodium Benzoate, Pearl Paste, Skin-Friendly Colour, Life Shield Fragrance, Sodium Chloride",
  "Muv Silk Blossom Hand Wash": "Aqua, SLES, CAPB, CDEA, Glycerin, Sodium Benzoate, Pearl Paste, Skin-Friendly Colour, Silk Blossom Fragrance, Sodium Chloride",
  "Muv Ocean Fresh Hand Wash": "Aqua, SLES, CAPB, CDEA, Glycerin, Sodium Benzoate, Pearl Paste, Skin-Friendly Colour, Ocean Fresh Fragrance, Sodium Chloride",
  "Muv Citrus Blast Hand Wash": "Aqua, SLES, CAPB, CDEA, Glycerin, Sodium Benzoate, Pearl Paste, Skin-Friendly Colour, Citrus Blast Fragrance, Sodium Chloride",
  "Muv Crimson Veil Body Wash": "Aqua, SLES, CAPB, Cocamide DEA, Glycerin, Propylene Glycol, 1% Salicylic Acid, HEC, Sodium Benzoate, Skin-Friendly Colour, Crimson Veil Fragrance, pH Adjuster",
  "Muv Velvet Oak Body Wash": "Aqua, SLES, CAPB, Cocamide DEA, Glycerin, Propylene Glycol, 1% Salicylic Acid, HEC, Sodium Benzoate, Skin-Friendly Colour, Velvet Oak Fragrance, pH Adjuster",
  "Muv Midnight Frost Body Wash": "Aqua, SLES, CAPB, Cocamide DEA, Glycerin, Propylene Glycol, 1% Salicylic Acid, HEC, Sodium Benzoate, Skin-Friendly Colour, Midnight Frost Fragrance, pH Adjuster",
};

const HAND_WASH = new Set(["Muv Life Shield Hand Wash", "Muv Silk Blossom Hand Wash", "Muv Ocean Fresh Hand Wash", "Muv Citrus Blast Hand Wash"]);
const BODY_WASH = new Set(["Muv Crimson Veil Body Wash", "Muv Velvet Oak Body Wash", "Muv Midnight Frost Body Wash"]);

describe("Publish Ingredients — all 20 Products (ep-falling-heart UAT only)", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "STAFF"] } } });
    if (!admin) throw new Error("No ADMIN/STAFF user found on the isolated UAT database.");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: admin.role } } as never);
  });

  for (const [name, ingredients] of Object.entries(INGREDIENTS)) {
    it(`publishes and verifies Ingredients: ${name}`, async () => {
      const before = await prisma.product.findFirst({
        where: { name },
        include: { content: true, variants: { include: { inventory: true }, orderBy: { price: "asc" } } },
      });
      expect(before, `Product not found: ${name}`).toBeTruthy();
      if (!before) return;

      // Snapshot ProductContent for the "unchanged" assertion below.
      const beforeContent = before.content ? JSON.stringify(before.content) : null;

      const result = await updateProduct({ id: before.id, ingredients });
      expect(result.success, `updateProduct failed for ${name}: ${!result.success ? JSON.stringify(result.error) : ""}`).toBe(true);

      const reloaded = await prisma.product.findUniqueOrThrow({
        where: { id: before.id },
        include: { content: true, variants: { include: { inventory: true }, orderBy: { price: "asc" } } },
      });

      // ---- Ingredients: exact match ----
      expect(reloaded.ingredients).toBe(ingredients);
      expect(reloaded.ingredients).not.toContain("Water,");
      expect(reloaded.ingredients?.startsWith("Water")).toBe(false);
      expect(reloaded.ingredients).not.toMatch(/kg|\bml\b|\bL\b|litre|\bgram\b/i); // no batch quantities
      if (BODY_WASH.has(name)) {
        expect(reloaded.ingredients).toContain("1% Salicylic Acid");
        // "1%" is the one approved, explicit exception to "no percentages" — everything else must be percentage-free.
        expect((reloaded.ingredients?.match(/%/g) ?? []).length).toBe(1);
      } else {
        expect(reloaded.ingredients).not.toContain("%");
      }
      if (HAND_WASH.has(name) || BODY_WASH.has(name)) {
        expect(reloaded.ingredients).toContain("Sodium Benzoate");
        expect(reloaded.ingredients).toContain("Skin-Friendly Colour");
        expect(reloaded.ingredients).not.toContain("Phenoxyethanol");
      } else if (name !== "Muv Pure Bleach") {
        expect(reloaded.ingredients).toContain("Phenoxyethanol");
        expect(reloaded.ingredients).not.toContain("Sodium Benzoate");
      } else {
        // Pure Bleach: Founder-confirmed exception — no preservative entry.
        expect(reloaded.ingredients).not.toContain("Phenoxyethanol");
        expect(reloaded.ingredients).not.toContain("Sodium Benzoate");
      }

      // ---- Everything else: byte-identical to before ----
      expect(reloaded.id).toBe(before.id);
      expect(reloaded.slug).toBe(before.slug);
      expect(reloaded.categoryId).toBe(before.categoryId);
      expect(reloaded.status).toBe(before.status);
      expect(reloaded.images).toEqual(before.images);
      expect(reloaded.content ? JSON.stringify(reloaded.content) : null).toBe(beforeContent);
      expect(reloaded.variants.length).toBe(before.variants.length);
      for (const v of reloaded.variants) {
        const b = before.variants.find((x) => x.id === v.id)!;
        expect(v.sku).toBe(b.sku);
        expect(v.mrp).toBe(b.mrp);
        expect(v.price).toBe(b.price);
        expect(v.inventory?.quantity).toBe(b.inventory?.quantity);
      }

      console.log(`[publish-ingredients] OK: ${name}`);
    }, 30000);
  }
});
