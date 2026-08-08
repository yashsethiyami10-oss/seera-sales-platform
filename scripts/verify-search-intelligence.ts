import {
  tokenizeQuery,
  levenshteinDistance,
  scoreCandidate,
  runIntelligentProductSearch,
  fetchProductsByIdsOrdered,
  MIN_CONFIDENCE_SCORE,
} from "../lib/gateway/commerce/search-engine";
import { searchProducts } from "../lib/gateway/commerce/commerce-api";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Production Rollout v1.0,
 * Stage 3 (Search Intelligence Upgrade). Runs against the real database
 * — no mocked catalog — because the whole point of this stage is
 * retrieval quality against real MUV product names.
 *
 * Run: `npx tsx scripts/verify-search-intelligence.ts` (or
 * `npm run verify:search-intelligence`).
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

async function topResultName(query: string): Promise<string | undefined> {
  const { matchedProductIds } = await runIntelligentProductSearch(query);
  const items = await fetchProductsByIdsOrdered(matchedProductIds.slice(0, 1));
  return items[0]?.name;
}

async function main() {
  // ---- Query normalization ----
  check(tokenizeQuery("  Floor   CLEANER!! ").map((t) => t.token).join(" ") === "floor cleaner", "normalization: case, whitespace, and punctuation are normalized");
  check(tokenizeQuery("").length === 0, "normalization: an empty query tokenizes to nothing");
  check(tokenizeQuery("the a of for").length === 0, "normalization: a query of only stopwords tokenizes to nothing");

  // ---- Singular/plural handling ----
  check(tokenizeQuery("floors")[0]?.token === "floor", "singular/plural: 'floors' singularizes to 'floor'");
  check(tokenizeQuery("cleaners")[0]?.token === "cleaner", "singular/plural: 'cleaners' singularizes to 'cleaner'");
  check(tokenizeQuery("glass")[0]?.token === "glass", "singular/plural: a word ending in 'ss' is never over-stripped");

  // ---- Synonym mapping (governed configuration) ----
  const shampooToken = tokenizeQuery("shampoo")[0];
  check(!!shampooToken && shampooToken.expansions.includes("wash"), "synonyms: 'shampoo' expands to include 'wash' from the governed synonym table");

  // ---- Typo tolerance (bounded edit distance) ----
  check(levenshteinDistance("cleaner", "cleaner") === 0, "typo tolerance: identical strings have distance 0");
  check(levenshteinDistance("cleaner", "cleanr") === 1, "typo tolerance: a single dropped letter is distance 1");
  check(levenshteinDistance("floor", "flor") === 1, "typo tolerance: a single dropped letter in a short word is distance 1");
  check(levenshteinDistance("floor", "xyz") > 2, "typo tolerance: unrelated words have a large distance");

  // ---- Pure scoring: whole-word matching, not substring collision ----
  const dishwashCandidate = { id: "x", name: "Muv Dishwash Gel", categoryName: "Home Care", variantSizes: [], keyBenefits: [], benefits: null, fragranceNotes: null, shortDescription: "" };
  const washTokens = tokenizeQuery("wash");
  check(scoreCandidate(washTokens, dishwashCandidate) === 0, "scoring: 'wash' does not spuriously match inside 'Dishwash' (whole-word matching, not substring)");

  const handWashCandidate = { id: "y", name: "Muv Silk Blossom Hand Wash", categoryName: "Personal Care", variantSizes: [], keyBenefits: [], benefits: null, fragranceNotes: null, shortDescription: "" };
  check(scoreCandidate(washTokens, handWashCandidate) >= MIN_CONFIDENCE_SCORE, "scoring: 'wash' correctly matches a real 'Hand Wash' product's name above the confidence threshold");

  // ---- Category and fragrance/benefit field matching ----
  const categoryOnlyCandidate = { id: "z", name: "Muv Something", categoryName: "Car Care", variantSizes: [], keyBenefits: [], benefits: null, fragranceNotes: null, shortDescription: "" };
  check(scoreCandidate(tokenizeQuery("car"), categoryOnlyCandidate) > 0, "scoring: a category-name match contributes real score");
  const fragranceCandidate = { id: "w", name: "Muv Something", categoryName: "Home Care", variantSizes: [], keyBenefits: [], benefits: null, fragranceNotes: "Lavender and Rose", shortDescription: "" };
  check(scoreCandidate(tokenizeQuery("lavender"), fragranceCandidate) > 0, "scoring: a fragranceNotes match contributes real score");

  // ---- Confidence threshold ----
  const noMatchCandidate = { id: "v", name: "Muv Something", categoryName: "Home Care", variantSizes: [], keyBenefits: [], benefits: null, fragranceNotes: null, shortDescription: "" };
  check(scoreCandidate(tokenizeQuery("zzznonexistentzzz"), noMatchCandidate) === 0, "scoring: a completely unmatched query scores zero");

  // ---- No-result handling (real DB) ----
  const noResult = await runIntelligentProductSearch("zzz-no-such-product-zzz-nonsense");
  check(noResult.matchedProductIds.length === 0 && noResult.confidence === "NONE", "no-result handling: a nonsense query returns zero matches with NONE confidence", noResult);

  // ---- Deduplication (by construction — one entry per product id) ----
  const dedupCheck = await runIntelligentProductSearch("floor cleaner floor cleaner");
  const uniqueIds = new Set(dedupCheck.matchedProductIds);
  check(uniqueIds.size === dedupCheck.matchedProductIds.length, "deduplication: no product id ever appears twice in a result set");

  // ---- Result-count limit via the real Commerce Intelligence tool ----
  const cappedResult = await searchProducts({ query: "cleaner", pageSize: 2 });
  check(cappedResult.success === true, "result limit: the real searchProducts tool call succeeds");
  if (cappedResult.success) {
    const data = cappedResult.data as { items: unknown[]; pageSize: number };
    check(data.items.length <= 2, "result limit: pageSize is honored end-to-end through the real tool", data.items.length);
  }

  // ---- The 9 required real-world example queries — each must rank the
  // genuinely correct real product first, using ONLY real DB data. ----
  const expectations: [string, string][] = [
    ["floor cleaner", "Floor Cleaner"],
    ["cleaner for floors", "Floor Cleaner"],
    ["marble floor cleaner", "Floor Cleaner"],
    ["rose detergent", "Rose"],
    ["hand wash", "Hand Wash"],
    ["body wash with salicylic acid", "Body Wash"],
    ["car shampoo", "Car Wash"],
    ["bathroom cleaner", "Bathroom Cleaner"],
  ];
  for (const [query, expectedSubstring] of expectations) {
    const topName = await topResultName(query);
    check(!!topName && topName.includes(expectedSubstring), `real-world query: "${query}" ranks a real "${expectedSubstring}" product first`, topName);
  }

  // "home cleaning liquid" has no single obviously-correct product (it's
  // a genuinely broad, fuzzy phrase) — the real requirement is that it
  // returns SOME real, non-empty, high-confidence result set, not a
  // specific product.
  const broadQuery = await runIntelligentProductSearch("home cleaning liquid");
  check(broadQuery.matchedProductIds.length > 0 && broadQuery.confidence === "HIGH", "real-world query: a broad, fuzzy phrase still returns real, high-confidence matches rather than nothing", broadQuery);

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
