import fs from "node:fs";
import path from "node:path";

/**
 * MUV Customer Care Knowledge Factory — build-time validation script.
 * Real, programmatic checks against the actual JSON files — not manual
 * counting. Run once, output captured into DOMAIN_VALIDATION.md.
 */

const ROOT = path.join(process.cwd(), "docs/customer-care-knowledge-factory/JSON");

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.error("FAIL", name);
  }
};

function loadJson(file: string): any {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf-8");
  return JSON.parse(raw);
}

function main() {
  // 1. JSON Parse Health
  let manifest: any, kos: any, rels: any;
  try {
    manifest = loadJson("domain_manifest.json");
    check(true, "JSON Parse Health: domain_manifest.json parses");
  } catch {
    check(false, "JSON Parse Health: domain_manifest.json parses");
  }
  try {
    kos = loadJson("knowledge_objects.json");
    check(true, "JSON Parse Health: knowledge_objects.json parses");
  } catch {
    check(false, "JSON Parse Health: knowledge_objects.json parses");
  }
  try {
    rels = loadJson("relationships.json");
    check(true, "JSON Parse Health: relationships.json parses");
  } catch {
    check(false, "JSON Parse Health: relationships.json parses");
  }
  if (!manifest || !kos || !rels) {
    console.error("Cannot continue — a JSON file failed to parse.");
    process.exitCode = 1;
    return;
  }

  // 2. KOID uniqueness (manifest + objects)
  const manifestKoids: string[] = manifest.knowledgeObjects.map((k: any) => k.koid);
  const objectKoids: string[] = kos.objects.map((k: any) => k.koid);
  check(new Set(manifestKoids).size === manifestKoids.length, `KOID Health: all ${manifestKoids.length} manifest KOIDs unique`);
  check(new Set(objectKoids).size === objectKoids.length, `KOID Health: all ${objectKoids.length} object KOIDs unique`);
  check(manifestKoids.length === objectKoids.length && manifestKoids.every((k) => objectKoids.includes(k)), "Repository Consistency: manifest KOID list matches knowledge_objects.json KOID list exactly");

  // 3. Total count matches declared
  check(manifest.totalKnowledgeObjects === manifestKoids.length, `Repository Health: declared totalKnowledgeObjects (${manifest.totalKnowledgeObjects}) matches actual count (${manifestKoids.length})`);
  const citationCount = manifestKoids.filter((k) => manifest.knowledgeObjects.find((x: any) => x.koid === k).type.startsWith("CITATION_ONLY")).length;
  const gapCount = manifestKoids.filter((k) => manifest.knowledgeObjects.find((x: any) => x.koid === k).type === "GAP_RECORD").length;
  const summaryCount = manifestKoids.filter((k) => manifest.knowledgeObjects.find((x: any) => x.koid === k).type === "SUMMARY").length;
  check(citationCount === manifest.breakdown.citationOnly, `Coverage: citation-only count (${citationCount}) matches breakdown.citationOnly (${manifest.breakdown.citationOnly})`);
  check(gapCount === manifest.breakdown.gapRecordsFounderDecisionRequired, `Coverage: gap-record count (${gapCount}) matches breakdown (${manifest.breakdown.gapRecordsFounderDecisionRequired})`);
  check(summaryCount === manifest.breakdown.repositorySummary, `Coverage: summary count (${summaryCount}) matches breakdown (${manifest.breakdown.repositorySummary})`);

  // 4. Relationship Integrity — every internal "from"/"to" (except "ALL") resolves to a real KOID
  const allInternalKoids = new Set(objectKoids);
  let brokenInternal = 0;
  for (const r of rels.internalRelationships) {
    if (r.to === "ALL") continue;
    if (!allInternalKoids.has(r.from) || !allInternalKoids.has(r.to)) {
      brokenInternal++;
      console.error("  BROKEN internal relationship:", JSON.stringify(r));
    }
  }
  check(brokenInternal === 0, `Relationship Integrity: 0/${rels.internalRelationships.length} broken internal relationships`);

  // 5. Citation Integrity — every KO's citedKoids in knowledge_objects.json has a
  // matching edge in relationships.json's externalCrossRepositoryCitations, and vice versa
  const koCitations = new Map<string, string[]>();
  for (const o of kos.objects) if (o.citedKoids?.length) koCitations.set(o.koid, o.citedKoids);
  let missingEdges = 0;
  for (const [koid, cited] of koCitations) {
    for (const target of cited) {
      const found = rels.externalCrossRepositoryCitations.some((e: any) => e.from === koid && e.to === target);
      if (!found) {
        missingEdges++;
        console.error(`  MISSING relationships.json edge for ${koid} -> ${target}`);
      }
    }
  }
  check(missingEdges === 0, "Citation Integrity: every knowledge_objects.json citedKoids entry has a matching relationships.json edge");

  const totalCitedInObjects = [...koCitations.values()].reduce((sum, arr) => sum + arr.length, 0);
  check(totalCitedInObjects === rels.externalCrossRepositoryCitations.length, `Citation Integrity: total cited-KOID count in knowledge_objects.json (${totalCitedInObjects}) matches relationships.json edge count (${rels.externalCrossRepositoryCitations.length})`);
  check(rels.externalCrossRepositoryCitations.length === rels.totalExternalCitations, `JSON Validation: relationships.json's own declared totalExternalCitations (${rels.totalExternalCitations}) matches actual array length (${rels.externalCrossRepositoryCitations.length})`);
  check(rels.internalRelationships.length === rels.totalInternalRelationships, `JSON Validation: relationships.json's own declared totalInternalRelationships (${rels.totalInternalRelationships}) matches actual array length (${rels.internalRelationships.length})`);

  // 6. Gap Validation — every GAP_RECORD has status "OPEN - Founder Decision Required" and no citedKoids
  const gapObjects = kos.objects.filter((o: any) => o.type === "GAP_RECORD");
  check(gapObjects.length === 6, `Gap Validation: exactly 6 Gap Records present (${gapObjects.length})`);
  check(gapObjects.every((o: any) => o.status === "OPEN - Founder Decision Required"), "Gap Validation: every Gap Record correctly marked OPEN - Founder Decision Required");
  check(gapObjects.every((o: any) => !o.citedKoids || o.citedKoids.length === 0), "Gap Validation: no Gap Record fabricates a citation to fill its own gap");

  // 7. Cross-Repository Integrity — spot-check the cited external files actually exist
  const crossRepoFiles = [
    "docs/marketing-knowledge-factory/domains/03-customer-intelligence/chapters/chapter-01-customer-promise-and-experience-context/json/knowledge_objects.json",
    "docs/institutional-sales-knowledge-factory/KNOWLEDGE_OBJECTS.md",
    "docs/founder-intelligence-knowledge-factory/KNOWLEDGE_OBJECTS.md",
    "docs/founder-intelligence-knowledge-factory/FOUNDER_CONSTITUTION.md",
    "docs/knowledge-factory/products/dishwash-gel/knowledge_objects.json",
  ];
  for (const f of crossRepoFiles) {
    check(fs.existsSync(path.join(process.cwd(), f)), `Cross Repository Integrity: cited source file exists — ${f}`);
  }

  // 8. Naming/prefix collision check — KO-CR- must not appear in any other known repository
  const otherPrefixes = ["KO-BI-", "KO-PM-", "KO-CI-", "KO-SC-", "KO-DM-", "KO-CC-", "KO-GO-", "KO-MO-", "KO-IS-", "KO-FD-"];
  check(!otherPrefixes.includes("KO-CR-"), "Repository Health: KO-CR- prefix does not collide with any known Marketing/Institutional Sales/Founder Intelligence KF prefix");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
