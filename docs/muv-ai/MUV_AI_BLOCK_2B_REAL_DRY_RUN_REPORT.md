# MUV AI — Real Reconciliation Dry-Run Manifest (Block 2B, Stage 1)

Generated: 2026-08-06T20:46:23.893Z
Duration: 5286ms
Founder Policy version: 2026-08-06.block2c-frozen

This manifest is a PROPOSAL only. Nothing here has been written to any
database table. Every intelligence table remains exactly as it was before
this file was generated (see the companion Stage 1 report for the direct
before/after row-count proof).

## Source inventory (real, live ep-falling-heart data)

- Product: 20
- ProductVariant: 37
- ProductContent: 20
- PublishedKnowledgeRecord: 1043

## Derived projections (this run)

| Target layer | Count |
|---|---|
| KnowledgeItem | 513 |
| ProductIntelligence | 20 |
| ProblemIntelligence | 14 |
| CareIntelligence | 24 |

## Governance decisions (proposed classification totals)

| Classification | Count |
|---|---|
| CUSTOMER_SAFE | 0 |
| INTERNAL_ONLY | 116 |
| FOUNDER_REVIEW_REQUIRED | 455 |
| REJECTED | 0 |
| DEPRECATED | 0 |

| Proposed write operation | Count |
|---|---|
| CREATE | 571 |
| UPDATE | 0 |
| TOUCH | 0 |
| ARCHIVE | 0 |
| SKIP | 0 |

## Unresolved conflicts

- `pi-cmsb49tth0001piimpj61tfkv`: Unresolved conflict on ProductIntelligence pi-cmsb49tth0001piimpj61tfkv — see fieldResolutions/rejectedAlternatives for detail.
- `pi-cmsb3vf9k006oofv3mqyy9bqa`: Unresolved conflict on ProductIntelligence pi-cmsb3vf9k006oofv3mqyy9bqa — see fieldResolutions/rejectedAlternatives for detail.
- `pi-cmsb3v7do006aofv3lvb0xms9`: Unresolved conflict on ProductIntelligence pi-cmsb3v7do006aofv3lvb0xms9 — see fieldResolutions/rejectedAlternatives for detail.

## Excluded records (rejected candidates — never silently dropped)

Total: 10
- **Muv Black Phenyl:Can it be mixed with bleach?** (PRODUCT_CONTENT): Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation.
- **Muv Citrus Blast Hand Wash:Is it antibacterial?** (PRODUCT_CONTENT): Matches a medical/health or unsupported-efficacy claim pattern — Block 2C category 4/5, never derived.
- **Muv Crimson Veil Body Wash:Is it an acne treatment?** (PRODUCT_CONTENT): Matches a medical/health or unsupported-efficacy claim pattern — Block 2C category 4/5, never derived.
- **Muv Floral Toilet Cleaner:Can it be mixed with bleach?** (PRODUCT_CONTENT): Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation.
- **Muv Fresh Bathroom Cleaner:Should it be mixed with bleach?** (PRODUCT_CONTENT): Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation.
- **Muv Life Shield Hand Wash:Is Muv Life Shield Hand Wash antibacterial?** (PRODUCT_CONTENT): Matches a medical/health or unsupported-efficacy claim pattern — Block 2C category 4/5, never derived.
- **Muv Midnight Frost Body Wash:Is this Product an acne treatment?** (PRODUCT_CONTENT): Matches a medical/health or unsupported-efficacy claim pattern — Block 2C category 4/5, never derived.
- **Muv Pure Bleach:Can Muv Pure Bleach be mixed with toilet cleaner?** (PRODUCT_CONTENT): Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation.
- **Muv White Phenyl:Can it be mixed with other cleaners?** (PRODUCT_CONTENT): Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation.
- **Emotional-tone adaptation** (FOUNDER_POLICY): Block 2C Section 12, category 5: no approved source content exists for tone-adapted phrasing; requires net-new Founder authoring, never derived by this mapper.

## Blocked records (governance validation population blockers)

Total: 3
- **pi-cmsb49tth0001piimpj61tfkv** (ProductIntelligence): One or more fields have conflicting source values with no Founder resolution.
- **pi-cmsb3vf9k006oofv3mqyy9bqa** (ProductIntelligence): One or more fields have conflicting source values with no Founder resolution.
- **pi-cmsb3v7do006aofv3lvb0xms9** (ProductIntelligence): One or more fields have conflicting source values with no Founder resolution.

## Governance validation result

- Passed: false
- Total findings: 3
- Population blockers: 3

## Founder-review queue (sample — first 15 of 554)

| Key | Target | Reason |
|---|---|---|
| `kf-founder_intelligence_kf-founder-constitution-article-1` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-10` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-11` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-12` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-13` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-2` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-3` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-4` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-5` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-6` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-7` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-8` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-founder_intelligence_kf-founder-constitution-article-9` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-marketing_kf-ko-bi-ch1-001` | KnowledgeItem | Governance classification requires Founder review before promotion. |
| `kf-marketing_kf-ko-bi-ch1-002` | KnowledgeItem | Governance classification requires Founder review before promotion. |

## Representative ProductIntelligence sample (Cool Water Liquid Detergent)

```json
{
  "deterministicKey": "pi-cmsb3tlg8000gofv3isius90n",
  "targetModel": "ProductIntelligence",
  "targetRecordType": "PRODUCT_IDENTITY",
  "sources": [
    {
      "sourceType": "PRODUCT_CONTENT",
      "sourceId": "cmsb6a7kw0003dwdh5ppvve8x",
      "sourceVersion": "2026-08-06T05:20:33.715Z",
      "sourceApprovalStatus": "PENDING",
      "label": "ProductContent.benefits"
    },
    {
      "sourceType": "PRODUCT_CONTENT",
      "sourceId": "cmsb6a7kw0003dwdh5ppvve8x",
      "sourceVersion": "2026-08-06T05:20:33.715Z",
      "sourceApprovalStatus": "PENDING",
      "label": "ProductContent.usageInstructions"
    },
    {
      "sourceType": "PRODUCT_CONTENT",
      "sourceId": "cmsb6a7kw0003dwdh5ppvve8x",
      "sourceVersion": "2026-08-06T05:20:33.715Z",
      "sourceApprovalStatus": "PENDING",
      "label": "ProductContent.safetyInformation"
    },
    {
      "sourceType": "PRODUCT_CONTENT",
      "sourceId": "cmsb6a7kw0003dwdh5ppvve8x",
      "sourceVersion": "2026-08-06T05:20:33.715Z",
      "sourceApprovalStatus": "PENDING",
      "label": "ProductContent.storage"
    },
    {
      "sourceType": "PRODUCT_CONTENT",
      "sourceId": "cmsb6a7kw0003dwdh5ppvve8x",
      "sourceVersion": "2026-08-06T05:20:33.715Z",
      "sourceApprovalStatus": "PENDING",
      "label": "ProductContent.faq"
    },
    {
      "sourceType": "PUBLISHED_KNOWLEDGE_RECORD",
      "sourceId": "PRODUCT_KF:KO-LD-IDENT-001",
      "sourceVersion": "2",
      "sourceApprovalStatus": "DRAFT",
      "label": "PublishedKnowledgeRecord:PRODUCT_KF:KO-LD-IDENT-001"
    },
    {
      "sourceType": "PUBLISHED_KNOWLEDGE_RECORD",
      "sourceId": "PRODUCT_KF:KO-LD-IDENT-002",
      "sourceVersion": "2",
      "sourceApprovalStatus": "DRAFT",
      "label": "PublishedKnowledgeRecord:PRODUCT_KF:KO-LD-IDENT-002"
    }
  ],
  "sourcePriority": [
    "PRODUCT_CONTENT",
    "PRODUCT",
    "PUBLISHED_KNOWLEDGE_RECORD"
  ],
  "governanceClassification": "FOUNDER_REVIEW_REQUIRED",
  "customerSafeEligible": false,
  "runtimeEligible": false,
  "activeStatus": "ACTIVE",
  "conflictStatus": "NONE",
  "confidence": "MODERATE",
  "reviewStatus": "NOT_REQUIRED",
  "mappedFields": [
    "productIdentity",
    "purpose",
    "benefits",
    "usageInstructions",
    "safetyInformation",
    "storageInstructions",
    "faqs"
  ],
  "excludedFields": [
    {
      "field": "ingredients",
      "reason": "Internal-only by frozen policy unless explicitly approved per-product (none approved today)."
    },
    {
      "field": "price/mrp/stock",
      "reason": "Never stored as intelligence facts — resolved live via Dispatcher tools (see `variants[].priceResolutionTool`)."
    }
  ],
  "missingFields": [
    "problemsSolved",
    "features",
    "doDont",
    "objectionHandling",
    "comparisonNotes",
    "crossSellSuggestions",
    "shelfLife"
  ],
  "warnings": [
    {
      "code": "INGREDIENTS_WITHHELD",
      "message": "Product.ingredients exists but is withheld from this projection's sections — no customer-safe disclosure is approved (Block 2C Decision 5)."
    }
  ],
  "errors": [],
  "relationshipReferences": [
    {
      "targetModel": "ProductIntelligence",
      "targetKey": "family:liquid-detergent",
      "relationType": "FAMILY_MEMBER"
    }
  ],
  "provenance": {
    "benefits": "ProductContent.benefits",
    "usageInstructions": "ProductContent.usageInstructions",
    "safetyInformation": "ProductContent.safetyInformation",
    "storageInstructions": "ProductContent.storage",
    "faqs": "ProductContent.faq",
    "productIdentity": "PublishedKnowledgeRecord:PRODUCT_KF:KO-LD-IDENT-001",
    "purpose": "PublishedKnowledgeRecord:PRODUCT_KF:KO-LD-IDENT-002"
  },
  "proposedWriteOperation": {
    "op": "CREATE",
    "targetModel": "ProductIntelligence"
  },
  "proposedRollbackIdentity": {
    "targetModel": "ProductIntelligence",
    "deterministicKey": "cmsb3tlg8000gofv3isius90n",
    "previousVersionId": null
  },
  "productId": "cmsb3tlg8000gofv3isius90n",
  "productName": "Muv Cool Water Liquid Detergent",
  "productSlug": "muv-cool-water-liquid-detergent",
  "familyId": "liquid-detergent",
  "layer": "INTERNAL",
  "sections": {
    "productIdentity": "| Field | Value |\n|---|---|\n| Product Family Name | MUV Liquid Detergent™ |\n| Product Category | Fabric Care |\n| Catalogue Category (platform) | `Fabric Care` (slug: `fabric-care`) |\n| Product Type | Laundry liquid detergent |\n| Number of Variants | 3 (Lavender Garden, Indian Rose, Cool Water) |\n| Number of SKUs | 6 (each variant × 1 Litre / 5 Litre) |\n| Manufacturer | MUV Care Co. |\n| Batch Basis (as documented) | 10 Litre production batch |\n\n**Not yet available (REQUIRES FOUNDER INPUT):**\n- Formal brand positioning statement for the Liquid Detergent family specifically\n- Product line launch date / market history\n- SKU codes (no product code system was found for these variants anywhere in the repo)\n- Barcode/EAN numbers\n- HSN code and GST rate specific to this product (the seeded but unrelated \"MUV Renew\" product\n  uses HSN `3402` / GST `18%` for a liquid detergent — this may be a reasonable HSN/GST\n  reference for the same product category, but it is not confirmed as this product's own\n  classification and must not be asserted as fact without Founder confirmation)",
    "purpose": "MUV Liquid Detergent™ is formulated as a liquid laundry cleaning product intended to remove\nsoil, stains, and odour from fabric during washing. The formulation is a surfactant-based liquid\nsystem (see `03_Manufacturing.md` for the full raw-material list) combined with a fragrance and\ncolour identity unique to each of the three variants.\n\n**Not yet available (REQUIRES FOUNDER INPUT):**\n- Any specific performance claim (e.g. \"removes 99% of stains,\" \"works in cold water,\" \"safe for\n  all fabric types\") — none of these appear in any source document found, and none may be\n  asserted without Founder-approved, evidence-backed language\n- Intended machine type (top-load / front-load / hand-wash) — not stated in the SOP\n- Water hardness or dosage-per-load guidance beyond what may exist on retail packaging (not\n  found in the repo)",
    "benefits": [
      "Helps remove everyday dirt and common stains",
      "Leaves clothes with a fresh Cool Water fragrance",
      "Suitable for machine wash and bucket wash",
      "Liquid formulation mixes conveniently in water",
      "Suitable for regular fabric care",
      "Can support careful stain pre-treatment",
      "Available in 1 L and 5 L packs"
    ],
    "usageInstructions": "For machine wash, add approximately 30 ml of Muv Liquid Detergent for a regular load. Adjust the quantity according to load size, fabric condition and level of soiling.\n\nFor bucket wash, add a suitable quantity to water, mix well, soak the garments if required, wash gently and rinse thoroughly with clean water.\n\nFor difficult stains, apply a small quantity directly to the affected area, gently rub or allow it to remain briefly, and then wash normally.\n\nAlways check garment care instructions before washing.",
    "safetyInformation": "Keep out of reach of children.\n\nAvoid contact with eyes. In case of eye contact, rinse thoroughly with clean water.\n\nDo not swallow.\n\nWash hands after prolonged direct contact.\n\nTest on a small hidden area before using on delicate or colour-sensitive fabrics.\n\nSeek medical advice in case of accidental ingestion or persistent irritation.",
    "storageInstructions": "Store in a cool and dry place away from direct sunlight and excessive heat.\n\nKeep the container tightly closed and upright when not in use.\n\nDo not transfer the product into food or beverage containers.\n\nProtect from contamination and moisture.",
    "faqs": [
      {
        "answer": "Muv Cool Water Liquid Detergent is available in 1 L and 5 L packs.",
        "question": "What pack sizes are available?"
      },
      {
        "answer": "Approximately 30 ml can be used for a regular load. Adjust according to the load size and level of soiling.",
        "question": "How much should I use in a washing machine?"
      },
      {
        "answer": "Yes, it can be mixed with water for regular bucket washing.",
        "question": "Is it suitable for bucket washing?"
      },
      {
        "answer": "It leaves a fresh Cool Water fragrance.",
        "question": "What fragrance does it leave on clothes?"
      }
    ]
  },
  "variants": [
    {
      "variantId": "cmsb3tm52000iofv3lr2s4631",
      "sku": "MUV-LD-CW-1000",
      "size": "1L",
      "priceResolutionTool": "commerce.getPricing",
      "availabilityResolutionTool": "commerce.getAvailability"
    },
    {
      "variantId": "cmsb3tp94000pofv3l3plphj6",
      "sku": "MUV-LD-CW-5000",
      "size": "5L",
      "priceResolutionTool": "commerce.getPricing",
      "availabilityResolutionTool": "commerce.getAvailability"
    }
  ],
  "suitability": {
    "suitableContexts": [],
    "unsuitableContexts": []
  }
}
```

## Representative Black Phenyl citation condition (must remain visible)

- reviewStatus: REQUIRED
- warnings: [{"code":"PROVENANCE_INCOMPLETE","message":"FAQ citation is incomplete for Muv Black Phenyl per Block 2C's Founder Approval Manifest — kept FOUNDER_REVIEW_REQUIRED until backfilled."},{"code":"INGREDIENTS_WITHHELD","message":"Product.ingredients exists but is withheld from this projection's sections — no customer-safe disclosure is approved (Block 2C Decision 5)."}]
