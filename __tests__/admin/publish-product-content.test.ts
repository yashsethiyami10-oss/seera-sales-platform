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
console.log("[publish] Resolved write-target host:", resolvedHost);
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart. No write will be attempted.`);
}

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/actions/products";

const mockAuth = vi.mocked(auth);

// ---- Shared category blocks (transcribed verbatim from the Founder-approved manifest) ----
const LIQUID_DETERGENT_DIRECTIONS = `For machine wash, add approximately 30 ml of Muv Liquid Detergent for a regular load. Adjust the quantity according to load size, fabric condition and level of soiling.

For bucket wash, add a suitable quantity to water, mix well, soak the garments if required, wash gently and rinse thoroughly with clean water.

For difficult stains, apply a small quantity directly to the affected area, gently rub or allow it to remain briefly, and then wash normally.

Always check garment care instructions before washing.`;

const LIQUID_DETERGENT_SAFETY = `Keep out of reach of children.

Avoid contact with eyes. In case of eye contact, rinse thoroughly with clean water.

Do not swallow.

Wash hands after prolonged direct contact.

Test on a small hidden area before using on delicate or colour-sensitive fabrics.

Seek medical advice in case of accidental ingestion or persistent irritation.`;

const LIQUID_DETERGENT_STORAGE = `Store in a cool and dry place away from direct sunlight and excessive heat.

Keep the container tightly closed and upright when not in use.

Do not transfer the product into food or beverage containers.

Protect from contamination and moisture.`;

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

type Faq = { question: string; answer: string };
type ProductManifestEntry = {
  canonicalName: string;
  shortDescription: string;
  longDescription: string;
  keyBenefits: string[];
  productHighlights: string[];
  careInstructions: string[]; // "Uses"
  howToUse: string;
  safetyInformation: string;
  storage: string;
  seoTitle: string;
  seoDescription: string;
  faq: Faq[];
};

const MANIFEST: ProductManifestEntry[] = [
  {
    canonicalName: "Muv Indian Rose Liquid Detergent",
    shortDescription: "Muv Indian Rose Liquid Detergent provides effective everyday fabric cleansing with an elegant Indian Rose fragrance, helping remove routine dirt and stains while leaving clothes fresh after every wash.",
    longDescription: `Muv Indian Rose Liquid Detergent is designed for regular fabric care and everyday laundry needs. Its liquid cleansing formulation disperses conveniently in water and helps remove everyday dirt, body soils and common stains from washable fabrics.

The Indian Rose fragrance gives freshly washed clothes a soft floral character without changing the essential purpose of the product: reliable everyday cleaning. The liquid format is suitable for both machine washing and bucket washing and can also be applied carefully to selected stained areas before washing.

Available in 1 L and 5 L packs, Muv Indian Rose Liquid Detergent supports household as well as frequent-use laundry requirements.`,
    keyBenefits: ["Helps remove everyday dirt and common stains", "Suitable for regular laundry use", "Leaves washed clothes with an Indian Rose fragrance", "Liquid format disperses conveniently in water", "Suitable for machine wash and bucket wash", "Can be used for careful pre-treatment of selected stains", "Available in household and value pack sizes"],
    productHighlights: ["Elegant Indian Rose fragrance", "Liquid fabric-cleansing formulation", "Suitable for machine and bucket washing", "Recommended dosage of approximately 30 ml for a regular machine load", "Suitable for routine washable fabrics", "Available in 1 L and 5 L packs"],
    careInstructions: ["Everyday washing of washable garments", "Machine washing", "Bucket washing", "Regular family laundry", "Pre-treatment of selected washable fabric stains", "Frequent-use laundry environments"],
    howToUse: LIQUID_DETERGENT_DIRECTIONS,
    safetyInformation: LIQUID_DETERGENT_SAFETY,
    storage: LIQUID_DETERGENT_STORAGE,
    seoTitle: "Muv Indian Rose Liquid Detergent | 1 L & 5 L",
    seoDescription: "Shop Muv Indian Rose Liquid Detergent for effective everyday fabric cleaning with an elegant floral fragrance. Available in 1 L and 5 L packs.",
    faq: [
      { question: "What sizes is Muv Indian Rose Liquid Detergent available in?", answer: "It is available in 1 L and 5 L packs." },
      { question: "Can it be used in a washing machine?", answer: "Yes. It is suitable for regular machine washing. Use approximately 30 ml for a regular load and adjust according to load size and soiling." },
      { question: "Can it be used for bucket washing?", answer: "Yes. Add a suitable quantity to water, mix well, wash the garments and rinse thoroughly." },
      { question: "What fragrance does it have?", answer: "It has an Indian Rose fragrance." },
    ],
  },
  {
    canonicalName: "Muv Cool Water Liquid Detergent",
    shortDescription: "Muv Cool Water Liquid Detergent helps clean everyday laundry while leaving washed fabrics with a fresh, clean and aquatic-inspired Cool Water fragrance.",
    longDescription: `Muv Cool Water Liquid Detergent is an everyday liquid laundry cleanser developed for washable garments and routine fabric care. Its liquid formulation mixes conveniently with water and helps lift everyday dirt, body soils and common stains during washing.

The fresh Cool Water fragrance gives washed clothes a crisp and refreshing character. The Product can be used in washing machines as well as for bucket washing and may be applied carefully to selected stained areas before a normal wash.

The 1 L pack is convenient for regular household use, while the 5 L pack supports larger families and frequent-use laundry requirements.`,
    keyBenefits: ["Helps remove everyday dirt and common stains", "Leaves clothes with a fresh Cool Water fragrance", "Suitable for machine wash and bucket wash", "Liquid formulation mixes conveniently in water", "Suitable for regular fabric care", "Can support careful stain pre-treatment", "Available in 1 L and 5 L packs"],
    productHighlights: ["Fresh Cool Water fragrance", "Liquid laundry-cleansing formulation", "Suitable for machine and bucket washing", "Approximately 30 ml recommended for a regular machine load", "Suitable for routine washable fabrics", "Available in household and value pack sizes"],
    careInstructions: ["Regular family laundry", "Machine washing", "Bucket washing", "Washing everyday washable garments", "Pre-treatment of selected fabric stains", "Frequent-use laundry requirements"],
    howToUse: LIQUID_DETERGENT_DIRECTIONS,
    safetyInformation: LIQUID_DETERGENT_SAFETY,
    storage: LIQUID_DETERGENT_STORAGE,
    seoTitle: "Muv Cool Water Liquid Detergent | 1 L & 5 L",
    seoDescription: "Buy Muv Cool Water Liquid Detergent for everyday fabric cleaning with a fresh aquatic fragrance. Available in 1 L and 5 L packs.",
    faq: [
      { question: "What pack sizes are available?", answer: "Muv Cool Water Liquid Detergent is available in 1 L and 5 L packs." },
      { question: "How much should I use in a washing machine?", answer: "Approximately 30 ml can be used for a regular load. Adjust according to the load size and level of soiling." },
      { question: "Is it suitable for bucket washing?", answer: "Yes, it can be mixed with water for regular bucket washing." },
      { question: "What fragrance does it leave on clothes?", answer: "It leaves a fresh Cool Water fragrance." },
    ],
  },
  {
    canonicalName: "Muv Lavender Garden Liquid Detergent",
    shortDescription: "Muv Lavender Garden Liquid Detergent helps clean everyday washable fabrics while leaving clothes with a calm and pleasant Lavender Garden fragrance.",
    longDescription: `Muv Lavender Garden Liquid Detergent combines practical everyday fabric cleansing with a pleasant lavender-inspired fragrance. Its liquid formulation disperses conveniently in water and helps remove everyday dirt, body soils and common stains from washable fabrics.

The Product is suitable for both machine washing and bucket washing. A small amount may also be applied carefully to selected stained areas before the garment is washed normally.

Available in 1 L and 5 L packs, it is designed for routine household laundry as well as frequent-use laundry environments.`,
    keyBenefits: ["Helps clean everyday washable fabrics", "Helps remove routine dirt and common stains", "Leaves clothes with a Lavender Garden fragrance", "Suitable for machine wash and bucket wash", "Liquid formulation disperses conveniently", "Suitable for regular household laundry", "Available in 1 L and 5 L packs"],
    productHighlights: ["Lavender Garden fragrance", "Liquid laundry-cleaning formulation", "Suitable for machine and bucket washing", "Approximately 30 ml recommended for a regular machine load", "Suitable for routine washable garments", "Available in regular and value packs"],
    careInstructions: ["Machine washing", "Bucket washing", "Everyday garments", "Routine household laundry", "Selected stain pre-treatment", "Frequent-use laundry applications"],
    howToUse: LIQUID_DETERGENT_DIRECTIONS,
    safetyInformation: LIQUID_DETERGENT_SAFETY,
    storage: LIQUID_DETERGENT_STORAGE,
    seoTitle: "Muv Lavender Garden Liquid Detergent | 1 L & 5 L",
    seoDescription: "Shop Muv Lavender Garden Liquid Detergent for everyday fabric cleaning with a pleasant lavender-inspired fragrance. Available in 1 L and 5 L.",
    faq: [
      { question: "Which sizes are available?", answer: "It is available in 1 L and 5 L packs." },
      { question: "Can it be used in both top-load and front-load machines?", answer: "It is intended for regular machine washing. The quantity should be adjusted according to machine type, load size and fabric condition." },
      { question: "Can it be used for hand or bucket washing?", answer: "Yes. Add a suitable quantity to water and rinse garments thoroughly after washing." },
      { question: "What fragrance does it have?", answer: "It has a Lavender Garden fragrance." },
    ],
  },
  {
    canonicalName: "Muv Floral Toilet Cleaner",
    shortDescription: "Muv Floral Toilet Cleaner is formulated for routine toilet-bowl cleaning, helping remove visible deposits and everyday stains while leaving a floral freshness after rinsing.",
    longDescription: `Muv Floral Toilet Cleaner is designed for regular cleaning of toilet bowls and internal toilet surfaces. Its cleaning formulation helps loosen visible deposits, water marks and everyday stains when used with suitable contact time and brushing.

The Product should be applied directly inside the toilet bowl, especially under the rim and over affected areas. Allow it to remain briefly, brush thoroughly and flush with water.

The 500 ml pack is suitable for household use, while the 5 L pack supports frequent-use and institutional requirements.`,
    keyBenefits: ["Helps clean toilet bowls and internal toilet surfaces", "Helps loosen visible deposits and everyday stains", "Supports routine washroom hygiene", "Floral fragrance", "Suitable for household and frequent-use environments", "Available in 500 ml and 5 L packs"],
    productHighlights: ["Direct-application toilet cleaner", "Designed for toilet bowls", "Suitable for under-rim application", "Floral fragrance", "Suitable for routine toilet cleaning", "Available in household and bulk pack sizes"],
    careInstructions: ["Toilet bowls", "Under-rim areas", "Internal ceramic toilet surfaces", "Household washrooms", "Office and institutional washrooms"],
    howToUse: `Open the cap carefully.

Apply Muv Floral Toilet Cleaner directly inside the toilet bowl, including under the rim and over visibly stained areas.

Allow the cleaner to remain on the surface for approximately 10 minutes.

Scrub thoroughly with a toilet brush.

Flush with clean water.

For difficult deposits, repeat the process if required.`,
    safetyInformation: `Keep out of reach of children.

Use only for toilet-bowl cleaning.

Avoid contact with skin, eyes and clothing.

Wear suitable protective gloves during prolonged use.

Do not swallow.

Never mix with bleach, acids, ammonia or any other cleaning chemical.

Use in a ventilated area.

In case of eye or skin contact, rinse immediately with plenty of clean water.

Seek medical advice in case of accidental ingestion or significant exposure.`,
    storage: `Store in a cool, dry and ventilated place.

Keep the container tightly closed and upright.

Protect from sunlight and excessive heat.

Keep away from food, beverages and incompatible cleaning chemicals.`,
    seoTitle: "Muv Floral Toilet Cleaner | 500 ml & 5 L",
    seoDescription: "Buy Muv Floral Toilet Cleaner for routine toilet-bowl cleaning and removal of visible deposits. Available in 500 ml and 5 L packs.",
    faq: [
      { question: "Where should the cleaner be applied?", answer: "Apply it directly inside the toilet bowl, including under the rim and over visibly stained areas." },
      { question: "How long should it remain before brushing?", answer: "Allow it to remain for approximately 10 minutes, then brush and flush." },
      { question: "Can it be mixed with bleach?", answer: "No. Never mix toilet cleaner with bleach or any other cleaning chemical." },
      { question: "What sizes are available?", answer: "It is available in 500 ml and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv Spark Dishwash Gel",
    shortDescription: "Muv Spark Dishwash Gel helps remove everyday food residue and grease from washable utensils while rinsing away cleanly for convenient daily dishwashing.",
    longDescription: `Muv Spark Dishwash Gel is developed for regular cleaning of household utensils, cookware and washable kitchenware. Its gel-based cleansing formulation helps loosen everyday food residue, oil and grease during manual dishwashing.

A small suitable quantity can be applied to a wet sponge or scrubber and worked over the utensil surface. Items should be rinsed thoroughly with clean water after washing.

Available in 500 ml, 1 L and 5 L packs, Muv Spark Dishwash Gel supports personal household use as well as kitchens with frequent dishwashing requirements.`,
    keyBenefits: ["Helps remove everyday grease and food residue", "Suitable for routine utensil cleaning", "Gel formulation is convenient to apply", "Rinses away with clean water", "Suitable for household and frequent-use kitchens", "Available in multiple pack sizes"],
    productHighlights: ["Gel-based dishwashing cleanser", "Suitable for manual dishwashing", "Designed for washable utensils and cookware", "Convenient application with sponge or scrubber", "Available in 500 ml, 1 L and 5 L packs", "Suitable for domestic and commercial-use environments"],
    careInstructions: ["Daily utensil washing", "Plates, bowls and cutlery", "Washable cookware", "Kitchen tools", "Household kitchens", "Restaurants and frequent-use kitchens"],
    howToUse: `Wet the utensil and cleaning sponge or scrubber.

Take a suitable amount of Muv Spark Dishwash Gel onto the sponge or scrubber.

Clean the utensil thoroughly, paying attention to greasy and food-stained areas.

Rinse the utensil completely with clean water.

For difficult grease, allow the gel to remain briefly before scrubbing.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes.

Do not swallow.

Rinse utensils thoroughly after washing.

Wear gloves if your skin is sensitive or during prolonged dishwashing.

Discontinue direct use if persistent irritation occurs.

Seek medical advice in case of accidental ingestion or significant irritation.`,
    storage: `Store in a cool and dry place.

Keep the container tightly closed and upright.

Protect from direct sunlight and excessive heat.

Do not store in food or beverage containers.`,
    seoTitle: "Muv Spark Dishwash Gel | 500 ml, 1 L & 5 L",
    seoDescription: "Shop Muv Spark Dishwash Gel for everyday removal of grease and food residue from washable utensils. Available in 500 ml, 1 L and 5 L packs.",
    faq: [
      { question: "Which utensils can it be used on?", answer: "It is intended for routine cleaning of washable household utensils, cutlery, plates and cookware." },
      { question: "How should it be applied?", answer: "Apply a suitable amount to a wet sponge or scrubber, clean the utensil and rinse thoroughly." },
      { question: "Does it need to be diluted?", answer: "It may be used directly in a suitable small quantity during manual dishwashing." },
      { question: "Which sizes are available?", answer: "It is available in 500 ml, 1 L and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv Fresh Bathroom Cleaner",
    shortDescription: "Muv Fresh Bathroom Cleaner helps remove everyday dirt, soap residue and visible marks from suitable washable bathroom surfaces.",
    longDescription: `Muv Fresh Bathroom Cleaner is designed for routine cleaning of suitable bathroom surfaces such as tiles, washbasins and other washable hard surfaces.

The cleaner may be sprayed directly onto the surface or manually applied using a sponge, brush or cloth. Allow it to remain for up to 10 minutes, scrub where required and rinse thoroughly with clean water.

Regular cleaning helps maintain a cleaner and fresher-looking bathroom environment. Always test first on a small hidden area before wider application.`,
    keyBenefits: ["Helps remove everyday bathroom dirt", "Helps loosen soap residue and visible marks", "Supports routine cleaning of washable bathroom surfaces", "Can be sprayed or manually applied", "Suitable for brushing, wiping and rinsing", "Convenient 500 ml pack"],
    productHighlights: ["Dual spray and manual application methods", "Suitable for routine bathroom cleaning", "Up to 10-minute contact time", "Suitable for selected washable hard surfaces", "Designed for rinse-off cleaning", "Available in a 500 ml pack"],
    careInstructions: ["Bathroom tiles", "Washbasins", "Washable bathroom walls", "Suitable hard bathroom surfaces", "Areas with soap residue and routine dirt"],
    howToUse: `Spray Method:

Spray Muv Fresh Bathroom Cleaner directly onto the surface. Leave it for up to 10 minutes, scrub with a brush or sponge if required, then rinse thoroughly with clean water.

Manual Application:

Apply a suitable amount of the cleaner onto a sponge, brush or cloth. Spread it evenly over the surface, leave for up to 10 minutes, scrub if required, and rinse thoroughly with clean water.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes and prolonged skin contact.

Wear gloves during prolonged cleaning.

Do not swallow.

Do not mix with bleach, acids, toilet cleaner, ammonia or any other cleaning chemical.

Use in a ventilated area.

Test on a small hidden area before use on coloured, coated, delicate, metallic or unfamiliar surfaces.`,
    storage: `Store in a cool and dry place.

Keep the container tightly closed and upright.

Protect from direct sunlight and excessive heat.

Keep away from food and incompatible cleaning chemicals.`,
    seoTitle: "Muv Fresh Bathroom Cleaner | 500 ml",
    seoDescription: "Shop Muv Fresh Bathroom Cleaner for routine cleaning of washable bathroom surfaces, tiles and washbasins. Spray or manually apply, scrub and rinse.",
    faq: [
      { question: "Can it be sprayed directly onto bathroom surfaces?", answer: "Yes. Spray it directly, leave for up to 10 minutes, scrub if required and rinse thoroughly." },
      { question: "Can it be applied manually?", answer: "Yes. Apply it using a sponge, brush or cloth, spread evenly, leave briefly, scrub and rinse." },
      { question: "Should it be mixed with bleach?", answer: "No. Never mix it with bleach, toilet cleaner or other cleaning chemicals." },
      { question: "Should I test it before use?", answer: "Yes. Test it on a small hidden area before applying it to a wider or unfamiliar surface." },
    ],
  },
  {
    canonicalName: "Muv Crystal Glass Cleaner",
    shortDescription: "Muv Crystal Glass Cleaner helps remove fingerprints, dust and everyday marks from suitable glass and mirror surfaces for a cleaner-looking finish.",
    longDescription: `Muv Crystal Glass Cleaner is designed for routine cleaning of suitable glass, mirror and other compatible smooth surfaces. Its ready-to-use cleaning format helps loosen everyday dust, fingerprints, smudges and visible marks.

Spray a small amount onto the surface or onto a clean lint-free cloth, wipe evenly and buff with a dry cloth where required. Avoid over-application and test first on unfamiliar or specially coated surfaces.

The convenient 500 ml pack is suitable for regular household, office and commercial cleaning.`,
    keyBenefits: ["Helps remove fingerprints and everyday smudges", "Helps clean dust and visible marks", "Suitable for glass and mirror cleaning", "Convenient spray-and-wipe application", "Suitable for household and workplace use", "500 ml ready-to-use pack"],
    productHighlights: ["Designed for glass and mirrors", "Ready-to-use format", "Suitable for spray-and-wipe cleaning", "Works with clean lint-free cloths", "Suitable for homes, offices and commercial spaces", "Convenient 500 ml pack"],
    careInstructions: ["Windows", "Mirrors", "Glass tabletops", "Suitable glass partitions", "Compatible smooth surfaces", "Office and household glass cleaning"],
    howToUse: `Remove loose dust from the surface.

Spray a small quantity of Muv Crystal Glass Cleaner directly onto the glass or onto a clean lint-free cloth.

Wipe the surface evenly.

Buff with a clean dry cloth if required.

For electronic screens, coated glass or specialised surfaces, follow the equipment manufacturer's instructions and test before use.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes.

Do not swallow.

Do not spray towards the face.

Use in a ventilated area.

Do not use on electronic screens, coated lenses or specialised surfaces unless compatibility has been confirmed.`,
    storage: `Store in a cool and dry place.

Protect from direct sunlight and excessive heat.

Keep the bottle tightly closed and upright.

Keep away from food and beverages.`,
    seoTitle: "Muv Crystal Glass Cleaner | 500 ml",
    seoDescription: "Buy Muv Crystal Glass Cleaner for routine removal of fingerprints, dust and smudges from suitable glass and mirror surfaces.",
    faq: [
      { question: "Can it be used on mirrors?", answer: "Yes. It is suitable for routine cleaning of mirrors and compatible glass surfaces." },
      { question: "Should it be sprayed directly?", answer: "It may be sprayed lightly onto the surface or onto a clean lint-free cloth." },
      { question: "Can it be used on electronic screens?", answer: "Use it only when compatibility is confirmed by the equipment manufacturer." },
      { question: "What pack size is available?", answer: "It is available in a 500 ml pack." },
    ],
  },
  {
    canonicalName: "Muv Velvet Mist Floor Cleaner",
    shortDescription: "Muv Velvet Mist Floor Cleaner supports regular cleaning of suitable washable floors while leaving the surrounding space with a refined Velvet Mist fragrance.",
    longDescription: `Muv Velvet Mist Floor Cleaner is formulated for routine cleaning of suitable washable floor surfaces. When diluted appropriately in water, it helps remove everyday dust, dirt and common floor marks during mopping.

The Velvet Mist fragrance adds a pleasant and refined character to freshly cleaned spaces. The Product is suitable for regular household cleaning as well as offices and other frequently maintained environments.

Always test on a small hidden area before using it on delicate, polished, coated or unfamiliar flooring.`,
    keyBenefits: ["Helps remove everyday floor dirt and dust", "Suitable for routine mopping", "Leaves a Velvet Mist fragrance", "Suitable for household and workplace cleaning", "Available in 1 L and 5 L packs", "Suitable for frequent-use environments"],
    productHighlights: ["Velvet Mist fragrance", "Concentrated liquid floor-cleaning format", "Suitable for dilution in water", "Designed for routine washable-floor maintenance", "Available in regular and bulk packs", "Suitable for domestic and institutional applications"],
    careInstructions: ["Routine floor mopping", "Suitable washable tiles", "Compatible stone and hard floors", "Households", "Offices", "Hotels and institutions"],
    howToUse: `For routine mopping, add a suitable quantity of Muv Velvet Mist Floor Cleaner to a bucket of clean water.

Mix well and mop the floor evenly.

For visibly dirty areas, apply a suitably diluted quantity and clean using a mop or cloth.

Allow the surface to dry.

Test first on delicate, polished, coated or unfamiliar flooring.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes and prolonged skin contact.

Do not swallow.

Do not mix with bleach, acids, toilet cleaner or other cleaning chemicals.

Use only on compatible washable floor surfaces.

Keep children and pets away from wet floors until dry.`,
    storage: `Store in a cool and dry place.

Keep the container tightly closed and upright.

Protect from direct sunlight and excessive heat.

Keep away from food and incompatible chemicals.`,
    seoTitle: "Muv Velvet Mist Floor Cleaner | 1 L & 5 L",
    seoDescription: "Shop Muv Velvet Mist Floor Cleaner for routine cleaning of suitable washable floors with a refined fragrance. Available in 1 L and 5 L packs.",
    faq: [
      { question: "How should it be used for mopping?", answer: "Add a suitable quantity to a bucket of clean water, mix well and mop the floor evenly." },
      { question: "Can it be used on every type of flooring?", answer: "Use it only on compatible washable floors and test first on polished, coated or unfamiliar surfaces." },
      { question: "What fragrance does it have?", answer: "It has a Velvet Mist fragrance." },
      { question: "Which sizes are available?", answer: "It is available in 1 L and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv Cloud Walk Floor Cleaner",
    shortDescription: "Muv Cloud Walk Floor Cleaner helps maintain suitable washable floors through regular mopping while leaving spaces with a fresh Cloud Walk fragrance.",
    longDescription: `Muv Cloud Walk Floor Cleaner is developed for routine cleaning of compatible washable floors in homes, offices and other frequently maintained spaces.

When mixed with water and used for mopping, it helps remove everyday dust, dirt and common marks from the floor surface. Its Cloud Walk fragrance creates a fresh character after cleaning.

Use only on suitable washable floors and test first on delicate, polished, coated or unfamiliar surfaces.`,
    keyBenefits: ["Helps clean everyday floor dust and dirt", "Suitable for regular mopping", "Leaves a fresh Cloud Walk fragrance", "Suitable for household and commercial-use environments", "Available in 1 L and 5 L packs", "Supports frequent floor maintenance"],
    productHighlights: ["Cloud Walk fragrance", "Liquid floor-cleaning formulation", "Suitable for dilution in water", "Designed for routine washable-floor cleaning", "Available in household and value packs", "Suitable for homes, offices and institutions"],
    careInstructions: ["Routine floor mopping", "Suitable tiled surfaces", "Compatible stone and hard floors", "Homes", "Offices", "Hotels and institutions"],
    howToUse: `For routine mopping, add a suitable quantity of Muv Cloud Walk Floor Cleaner to a bucket of clean water.

Mix well and mop the floor evenly.

For visibly dirty areas, clean using an appropriately diluted quantity and a mop or cloth.

Allow the surface to dry fully.

Test before use on delicate, polished, coated or unfamiliar floors.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes.

Do not swallow.

Do not mix with other cleaning chemicals.

Use only on compatible washable floors.

Keep people and pets away from wet floors until the surface is dry.`,
    storage: `Store in a cool and dry place.

Keep the container tightly closed and upright.

Protect from sunlight and excessive heat.

Keep away from food and incompatible chemicals.`,
    seoTitle: "Muv Cloud Walk Floor Cleaner | 1 L & 5 L",
    seoDescription: "Buy Muv Cloud Walk Floor Cleaner for everyday mopping of suitable washable floors with a fresh fragrance. Available in 1 L and 5 L packs.",
    faq: [
      { question: "Is it suitable for routine floor mopping?", answer: "Yes. Add a suitable quantity to clean water and mop compatible washable floors." },
      { question: "Should it be used undiluted?", answer: "For routine mopping, it should be mixed with a suitable quantity of water." },
      { question: "What fragrance does it have?", answer: "It has a Cloud Walk fragrance." },
      { question: "What sizes are available?", answer: "It is available in 1 L and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv White Phenyl",
    shortDescription: "Muv White Phenyl is a liquid floor and surface-cleaning concentrate intended for routine cleaning of suitable washable areas.",
    longDescription: `Muv White Phenyl is designed for routine cleaning of suitable washable floors and selected hard surfaces in homes, offices, common areas and institutional environments.

The concentrate should be diluted appropriately in clean water before mopping or surface cleaning. It helps remove everyday dirt and supports the regular maintenance of frequently used spaces.

Use only on compatible washable surfaces and never mix the Product with bleach, acids, toilet cleaner or other cleaning chemicals.`,
    keyBenefits: ["Suitable for routine floor and surface cleaning", "Helps remove everyday dirt from washable areas", "Concentrated format for dilution", "Suitable for homes, offices and institutions", "Available in 1 L and 5 L packs", "Supports frequent cleaning requirements"],
    productHighlights: ["White phenyl cleaning concentrate", "Suitable for dilution in water", "Designed for routine washable-floor cleaning", "Suitable for household and institutional environments", "Available in regular and bulk packs"],
    careInstructions: ["Washable floors", "Common areas", "Corridors", "Household floors", "Office and institutional cleaning", "Selected compatible hard surfaces"],
    howToUse: `Add a suitable quantity of Muv White Phenyl to a bucket of clean water.

Mix well.

Use the diluted solution for mopping compatible washable floors or wiping suitable hard surfaces.

Allow the surface to dry fully.

Do not use undiluted on delicate, polished, coated or unfamiliar surfaces without testing first.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes and prolonged skin contact.

Do not swallow.

Do not mix with bleach, acids, toilet cleaner or other cleaning chemicals.

Use in a ventilated area.

Keep people and pets away from wet floors until dry.`,
    storage: `Store in a cool, dry and ventilated place.

Keep the container tightly closed and upright.

Protect from direct sunlight and excessive heat.

Keep away from food, beverages and incompatible chemicals.`,
    seoTitle: "Muv White Phenyl | 1 L & 5 L",
    seoDescription: "Shop Muv White Phenyl concentrate for routine cleaning of suitable washable floors and common areas. Available in 1 L and 5 L packs.",
    faq: [
      { question: "Should Muv White Phenyl be diluted?", answer: "Yes. Add a suitable quantity to clean water before routine floor cleaning." },
      { question: "Where can it be used?", answer: "It is intended for compatible washable floors and selected hard surfaces." },
      { question: "Can it be mixed with other cleaners?", answer: "No. Never mix it with bleach, acids, toilet cleaner or other cleaning chemicals." },
      { question: "Which sizes are available?", answer: "It is available in 1 L and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv Black Phenyl",
    shortDescription: "Muv Black Phenyl is a concentrated liquid cleaner intended for routine cleaning of compatible washable floors and selected heavy-use areas.",
    longDescription: `Muv Black Phenyl is designed for routine floor and surface cleaning in compatible heavy-use environments. The concentrate should be diluted appropriately in clean water before mopping or wiping suitable surfaces.

It can support the regular maintenance of common areas, corridors, utility spaces and other frequently cleaned washable surfaces.

Use only on compatible surfaces, test before wider application and never mix the Product with bleach, acids or other cleaning chemicals.`,
    keyBenefits: ["Suitable for routine cleaning of heavy-use washable areas", "Concentrated format for dilution", "Helps remove everyday floor dirt", "Suitable for selected household and institutional applications", "Convenient 1 L pack", "Supports regular maintenance of frequently used areas"],
    productHighlights: ["Black phenyl cleaning concentrate", "Designed for dilution before use", "Suitable for selected washable floors", "Suitable for frequent cleaning environments", "Available in a 1 L pack"],
    careInstructions: ["Compatible washable floors", "Common areas", "Corridors", "Utility spaces", "Selected institutional environments", "Heavy-use washable areas"],
    howToUse: `Add a suitable quantity of Muv Black Phenyl to a bucket of clean water.

Mix thoroughly.

Use the diluted solution for mopping compatible washable floors and selected hard surfaces.

Allow the surface to dry fully.

Test first on delicate, light-coloured, polished, coated or unfamiliar surfaces.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes, skin and clothing.

Wear suitable gloves during prolonged use.

Do not swallow.

Do not mix with bleach, acids, toilet cleaner or any other cleaning chemical.

Use in a ventilated area.

Keep people and pets away from wet floors until dry.`,
    storage: `Store in a cool, dry and ventilated place.

Keep the container tightly closed and upright.

Protect from sunlight and excessive heat.

Keep away from food and incompatible chemicals.`,
    seoTitle: "Muv Black Phenyl | 1 L",
    seoDescription: "Buy Muv Black Phenyl concentrate for routine cleaning of compatible washable floors and selected heavy-use areas. Available in a 1 L pack.",
    faq: [
      { question: "Should Black Phenyl be diluted?", answer: "Yes. It should be diluted appropriately in clean water before routine use." },
      { question: "Can it be used on every floor?", answer: "No. Use it only on compatible washable surfaces and test first on unfamiliar or delicate flooring." },
      { question: "Can it be mixed with bleach?", answer: "No. Never mix it with bleach or any other cleaning chemical." },
      { question: "What pack size is available?", answer: "It is available in a 1 L pack." },
    ],
  },
  {
    canonicalName: "Muv Pure Bleach",
    shortDescription: "Muv Pure Bleach is a chlorine-based household cleaning aid intended for controlled use on compatible white fabrics and suitable bleach-compatible surfaces.",
    longDescription: `Muv Pure Bleach is a chlorine-based cleaning Product intended for carefully controlled household use. Depending on approved label instructions and surface compatibility, it may support cleaning of selected bleach-compatible white fabrics and hard surfaces.

Bleach is a strong chemical Product and must be used carefully. It should never be mixed with toilet cleaner, acids, ammonia, vinegar or any other cleaning chemical because dangerous fumes may be produced.

Always use only according to the approved Product label, maintain ventilation and test compatibility before wider application.`,
    keyBenefits: ["Chlorine-based cleaning aid", "Suitable for controlled use on compatible white fabrics", "May be used on selected bleach-compatible hard surfaces", "Useful for specific household cleaning requirements", "Convenient 500 ml pack"],
    productHighlights: ["Chlorine-based formulation", "Intended for controlled and careful use", "Suitable only for compatible materials", "Requires dilution or application according to the approved label", "Available in a 500 ml pack"],
    careInstructions: ["Compatible white fabrics", "Selected bleach-compatible washable surfaces", "Specific household cleaning tasks", "Only where bleach use is permitted by the material manufacturer"],
    howToUse: `Read the approved Product label before use.

Use only in the quantity and dilution stated on the approved label.

For white fabrics, confirm that the garment-care label permits chlorine bleach before application.

For hard surfaces, test on a small hidden area before wider use.

Rinse treated fabrics or surfaces thoroughly with clean water where applicable.

Never use on coloured fabrics, wool, silk, leather or materials that are not chlorine-bleach compatible.`,
    safetyInformation: `DANGER: Never mix bleach with toilet cleaner, acids, vinegar, ammonia or any other cleaning chemical.

Mixing bleach with incompatible chemicals can release dangerous gases.

Keep out of reach of children.

Avoid contact with eyes, skin and clothing.

Wear suitable protective gloves.

Use only in a well-ventilated area.

Do not swallow or inhale fumes.

In case of exposure, move to fresh air and rinse affected skin or eyes thoroughly with clean water.

Seek urgent medical advice in case of ingestion, breathing difficulty or significant exposure.`,
    storage: `Store upright in a cool, dry and well-ventilated place.

Protect from sunlight and heat.

Keep the container tightly closed.

Store separately from acids, ammonia, toilet cleaner and other cleaning chemicals.

Do not transfer into unlabelled containers.`,
    seoTitle: "Muv Pure Bleach | 500 ml",
    seoDescription: "Muv Pure Bleach is a chlorine-based cleaning aid for controlled use on compatible white fabrics and bleach-compatible surfaces. Available in 500 ml.",
    faq: [
      { question: "Can Muv Pure Bleach be mixed with toilet cleaner?", answer: "No. Never mix bleach with toilet cleaner, acids, vinegar, ammonia or any other cleaning chemical." },
      { question: "Can it be used on coloured clothes?", answer: "It should not be used on coloured fabrics unless the garment manufacturer specifically confirms chlorine-bleach compatibility." },
      { question: "Should gloves be worn?", answer: "Yes. Suitable protective gloves and good ventilation are recommended." },
      { question: "What size is available?", answer: "It is available in a 500 ml pack." },
    ],
  },
  {
    canonicalName: "Muv Radiance Car Wash",
    shortDescription: "Muv Radiance Car Wash is a liquid vehicle-wash shampoo designed to help remove everyday road dust, dirt and light grime from compatible automotive exterior surfaces.",
    longDescription: `Muv Radiance Car Wash is developed for routine exterior washing of cars and other compatible vehicles. When diluted appropriately in water, its cleansing formulation helps loosen everyday road dust, surface dirt and light grime.

Use it with a clean wash mitt, sponge or soft cloth and rinse the vehicle thoroughly with clean water. For best results, wash the vehicle in a shaded area and avoid allowing the shampoo solution to dry on the surface.

The Product is available in 500 ml and 5 L packs for personal vehicle care and frequent-use washing requirements.`,
    keyBenefits: ["Helps remove everyday road dust and dirt", "Suitable for routine exterior vehicle washing", "Liquid shampoo format", "Suitable for use with wash mitt, sponge or soft cloth", "Available in personal and bulk pack sizes", "Supports household and frequent-use vehicle care"],
    productHighlights: ["Automotive exterior wash shampoo", "Suitable for dilution in water", "Designed for routine car washing", "Suitable for compatible painted exterior surfaces", "Available in 500 ml and 5 L packs", "Suitable for personal and professional-use environments"],
    careInstructions: ["Car exterior washing", "Compatible painted vehicle surfaces", "Routine vehicle cleaning", "Personal vehicle care", "Garages and frequent-use washing environments"],
    howToUse: `Park the vehicle in a shaded area and allow hot surfaces to cool.

Rinse loose dust and dirt from the vehicle with clean water.

Add a suitable quantity of Muv Radiance Car Wash to a bucket of water and mix gently.

Apply using a clean wash mitt, sponge or soft cloth.

Wash one section at a time.

Rinse thoroughly with clean water before the shampoo dries.

Dry with a clean soft cloth where required.`,
    safetyInformation: `Keep out of reach of children.

Avoid contact with eyes.

Do not swallow.

Do not use on hot surfaces or allow the Product to dry on the vehicle.

Use only on compatible exterior automotive surfaces.

Test on a small hidden area before use on specialised coatings, wraps or unfamiliar materials.`,
    storage: `Store in a cool and dry place.

Keep the container tightly closed and upright.

Protect from direct sunlight and excessive heat.

Do not allow contamination of the Product.`,
    seoTitle: "Muv Radiance Car Wash Shampoo | 500 ml & 5 L",
    seoDescription: "Shop Muv Radiance Car Wash shampoo for routine removal of road dust and dirt from compatible vehicle exteriors. Available in 500 ml and 5 L.",
    faq: [
      { question: "Should the Product be diluted?", answer: "Yes. Add a suitable quantity to a bucket of clean water before routine vehicle washing." },
      { question: "Can it be used in direct sunlight?", answer: "For better results, wash the vehicle in a shaded area and do not allow the shampoo to dry on the surface." },
      { question: "Can it be used on specialised coatings?", answer: "Test first and follow the coating manufacturer's care instructions." },
      { question: "Which sizes are available?", answer: "It is available in 500 ml and 5 L packs." },
    ],
  },
  {
    canonicalName: "Muv Life Shield Hand Wash",
    shortDescription: "Muv Life Shield Hand Wash is an everyday liquid hand cleanser designed to wash away routine dirt and impurities while leaving hands feeling clean and refreshed.",
    longDescription: `Muv Life Shield Hand Wash is designed for regular handwashing in homes, offices, washrooms and other frequently used environments.

Its surfactant-based cleansing formulation helps remove everyday dirt, grease and impurities from the hands. The formula contains glycerin and a pearl-effect base for a smooth handwashing experience.

The 250 ml and 500 ml packs provide convenient options for personal and family use.`,
    keyBenefits: ["Helps wash away everyday dirt and impurities", "Leaves hands feeling clean and refreshed", "Contains glycerin", "Smooth pearl-effect formulation", "Suitable for regular handwashing", "Available in 250 ml and 500 ml packs"],
    productHighlights: ["Everyday liquid hand cleanser", "Contains glycerin", "Pearl-effect appearance", "Suitable for home and workplace washrooms", "Available in personal and family pack sizes", "Designed for regular handwashing"],
    careInstructions: ["Regular handwashing at home", "Kitchens and wash areas", "Offices and workplaces", "Commercial washrooms", "Hotels and institutions"],
    howToUse: HAND_WASH_DIRECTIONS,
    safetyInformation: HAND_WASH_SAFETY,
    storage: HAND_WASH_STORAGE,
    seoTitle: "Muv Life Shield Hand Wash | 250 ml & 500 ml",
    seoDescription: "Shop Muv Life Shield Hand Wash for routine hand cleansing at home, work and commercial washrooms. Available in 250 ml and 500 ml packs.",
    faq: [
      { question: "Is Muv Life Shield Hand Wash antibacterial?", answer: "It is intended for routine hand cleansing. An antibacterial or germ-kill claim should not be assumed unless stated on the approved label." },
      { question: "Which sizes are available?", answer: "It is available in 250 ml and 500 ml packs." },
      { question: "Does it contain glycerin?", answer: "Yes. Glycerin is included in the formulation." },
      { question: "How should it be used?", answer: "Wet the hands, apply a suitable amount, rub thoroughly to form a lather and rinse with clean water." },
    ],
  },
];

describe("Publish approved Product Content — Products 1-14 (ep-falling-heart UAT only)", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "STAFF"] } } });
    if (!admin) throw new Error("No ADMIN/STAFF user found on the isolated UAT database.");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: admin.role } } as never);
  });

  for (const entry of MANIFEST) {
    it(`publishes and verifies: ${entry.canonicalName}`, async () => {
      const product = await prisma.product.findFirst({ where: { name: entry.canonicalName }, include: { variants: true } });
      expect(product, `Product not found: ${entry.canonicalName}`).toBeTruthy();
      if (!product) return;

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

      const result = await updateProduct({ id: product.id, content: contentPayload });
      expect(result.success, `updateProduct failed for ${entry.canonicalName}: ${!result.success ? JSON.stringify(result.error) : ""}`).toBe(true);

      const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { content: true, variants: true } });

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
      expect(reloaded.content?.faq).toEqual(entry.faq);

      // Data-safety: variants/commercial fields untouched by this content-only save.
      expect(reloaded.variants.length).toBe(product.variants.length);
      for (const v of reloaded.variants) {
        const before = product.variants.find((b) => b.id === v.id)!;
        expect(v.sku).toBe(before.sku);
        expect(v.price).toBe(before.price);
        expect(v.mrp).toBe(before.mrp);
      }
      expect(reloaded.images).toEqual(product.images);
      expect(reloaded.slug).toBe(product.slug);
      expect(reloaded.categoryId).toBe(product.categoryId);

      console.log(`[publish] OK: ${entry.canonicalName} | status=${reloaded.status} | images=${reloaded.images.length} | variants=${reloaded.variants.length}`);
    }, 20000);
  }
});
