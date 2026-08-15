-- Canonical Product/SKU/Price/Scheme master restoration.
-- Purely additive: production had zero SeeraSku/SeeraPriceVersion/SeeraScheme rows before this
-- migration (confirmed by read-only forensic audit) -- no historical order/stock/quotation data
-- exists to protect. Every statement is idempotent (ON CONFLICT DO NOTHING for SKUs/prices; a
-- NOT EXISTS guard for schemes, which has no natural unique constraint). No taxRate/hsn set on any
-- MUV SKU; the 7 non-MUV SKUs get the supplied HSN only, no taxRate (Founder decision: the existing
-- tax engine only supports inclusive/extractive GST, which would contradict the stated "IGST
-- applied separately" intent -- left unconfigured rather than silently misapplied). Bartan Tub and
-- non-MUV SS_TO_DISTRIBUTOR prices are deliberately NOT created this pass (explicit Founder
-- decision: PENDING_FOUNDER_PRICE -- createDistributorReplenishment already governs this with a
-- PRICE_UNAVAILABLE rejection, no new code needed). No "Additional 2.5% MUV scheme" is created.
-- Validated by direct execution against TEST (scripts/seera/catalog-restoration-proof.ts, 63/63)
-- before being applied here.

-- 37 MUV SKUs (brand='MUV', no tax configured)
INSERT INTO "seera_skus" ("id","code","productName","brand","category","packSize","unitType","unitsPerCase","mrp","status","createdById","createdAt","updatedAt")
SELECT gen_random_uuid()::text, v.code, v.name, 'MUV', v.category, v.pack_size, v.unit_type, 1, v.mrp, 'ACTIVE'::"MasterStatus", u.id, now(), now()
FROM (VALUES
  ('MUV-LD-IR-1000','MUV Indian Rose Liquid Detergent','Fabric Care',1::decimal,'L',155::decimal),
  ('MUV-LD-IR-5000','MUV Indian Rose Liquid Detergent','Fabric Care',5::decimal,'L',699::decimal),
  ('MUV-LD-CW-1000','MUV Cool Water Liquid Detergent','Fabric Care',1::decimal,'L',155::decimal),
  ('MUV-LD-CW-5000','MUV Cool Water Liquid Detergent','Fabric Care',5::decimal,'L',699::decimal),
  ('MUV-LD-LG-1000','MUV Lavender Garden Liquid Detergent','Fabric Care',1::decimal,'L',155::decimal),
  ('MUV-LD-LG-5000','MUV Lavender Garden Liquid Detergent','Fabric Care',5::decimal,'L',699::decimal),
  ('MUV-TC-STD-500','MUV Toilet Cleaner','Home Care',500::decimal,'ml',80::decimal),
  ('MUV-TC-STD-5000','MUV Toilet Cleaner','Home Care',5::decimal,'L',400::decimal),
  ('MUV-DG-STD-500','MUV Dishwash Gel','Home Care',500::decimal,'ml',85::decimal),
  ('MUV-DG-STD-1000','MUV Dishwash Gel','Home Care',1::decimal,'L',155::decimal),
  ('MUV-DG-STD-5000','MUV Dishwash Gel','Home Care',5::decimal,'L',699::decimal),
  ('MUV-BC-STD-500','MUV Bathroom Cleaner','Home Care',500::decimal,'ml',65::decimal),
  ('MUV-GC-STD-500','MUV Glass Cleaner','Home Care',500::decimal,'ml',90::decimal),
  ('MUV-FC-VM-1000','MUV Velvet Mist Floor Cleaner','Home Care',1::decimal,'L',150::decimal),
  ('MUV-FC-CWK-1000','MUV Cloud Walk Floor Cleaner','Home Care',1::decimal,'L',150::decimal),
  ('MUV-FC-VM-5000','MUV Velvet Mist Floor Cleaner','Home Care',5::decimal,'L',549::decimal),
  ('MUV-FC-CWK-5000','MUV Cloud Walk Floor Cleaner','Home Care',5::decimal,'L',549::decimal),
  ('MUV-CW-STD-500','MUV Car Wash','Car Care',500::decimal,'ml',70::decimal),
  ('MUV-CW-STD-5000','MUV Car Wash','Car Care',5::decimal,'L',550::decimal),
  ('MUV-WP-STD-1000','MUV White Phenyl','Home Care',1::decimal,'L',60::decimal),
  ('MUV-WP-STD-5000','MUV White Phenyl','Home Care',5::decimal,'L',270::decimal),
  ('MUV-BP-STD-1000','MUV Black Phenyl','Home Care',1::decimal,'L',80::decimal),
  ('MUV-BL-STD-500','MUV Bleach','Home Care',500::decimal,'ml',50::decimal),
  ('MUV-HW-LS-250','MUV Lifeshield Hand Wash','Personal Care',250::decimal,'ml',80::decimal),
  ('MUV-HW-LS-500','MUV Lifeshield Hand Wash','Personal Care',500::decimal,'ml',95::decimal),
  ('MUV-HW-SB-500','MUV Silk Blossom Hand Wash','Personal Care',500::decimal,'ml',95::decimal),
  ('MUV-HW-OF-500','MUV Ocean Fresh Hand Wash','Personal Care',500::decimal,'ml',95::decimal),
  ('MUV-HW-OF-5000','MUV Ocean Fresh Hand Wash','Personal Care',5::decimal,'L',725::decimal),
  ('MUV-HW-CB-250','MUV Citrus Blast Hand Wash','Personal Care',250::decimal,'ml',80::decimal),
  ('MUV-HW-CB-500','MUV Citrus Blast Hand Wash','Personal Care',500::decimal,'ml',95::decimal),
  ('MUV-HW-CB-5000','MUV Citrus Blast Hand Wash','Personal Care',5::decimal,'L',725::decimal),
  ('MUV-BW-CV-250','MUV Crimson Veil Body Wash','Body Care',250::decimal,'ml',110::decimal),
  ('MUV-BW-CV-950','MUV Crimson Veil Body Wash','Body Care',950::decimal,'ml',360::decimal),
  ('MUV-BW-VO-250','MUV Velvet Oak Body Wash','Body Care',250::decimal,'ml',110::decimal),
  ('MUV-BW-VO-950','MUV Velvet Oak Body Wash','Body Care',950::decimal,'ml',360::decimal),
  ('MUV-BW-MF-250','MUV Midnight Frost Body Wash','Body Care',250::decimal,'ml',110::decimal),
  ('MUV-BW-MF-950','MUV Midnight Frost Body Wash','Body Care',950::decimal,'ml',360::decimal)
) AS v(code, name, category, pack_size, unit_type, mrp)
CROSS JOIN (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) u
ON CONFLICT ("code") DO NOTHING;

-- MUV price versions (COMPANY_TO_SS + SS_TO_DISTRIBUTOR), 74 rows
INSERT INTO "seera_price_versions" ("id","skuId","tier","amount","mrpSnapshot","effectiveFrom","status","createdById","createdAt")
SELECT gen_random_uuid()::text, s.id, v.tier::"PriceTier", v.amount, s."mrp", '2026-01-01'::date, 'ACTIVE'::"MasterStatus", u.id, now()
FROM (VALUES
  ('MUV-LD-IR-1000','COMPANY_TO_SS',116.25::decimal),
  ('MUV-LD-IR-1000','SS_TO_DISTRIBUTOR',125.55::decimal),
  ('MUV-LD-IR-5000','COMPANY_TO_SS',524.25::decimal),
  ('MUV-LD-IR-5000','SS_TO_DISTRIBUTOR',566.19::decimal),
  ('MUV-LD-CW-1000','COMPANY_TO_SS',116.25::decimal),
  ('MUV-LD-CW-1000','SS_TO_DISTRIBUTOR',125.55::decimal),
  ('MUV-LD-CW-5000','COMPANY_TO_SS',524.25::decimal),
  ('MUV-LD-CW-5000','SS_TO_DISTRIBUTOR',566.19::decimal),
  ('MUV-LD-LG-1000','COMPANY_TO_SS',116.25::decimal),
  ('MUV-LD-LG-1000','SS_TO_DISTRIBUTOR',125.55::decimal),
  ('MUV-LD-LG-5000','COMPANY_TO_SS',524.25::decimal),
  ('MUV-LD-LG-5000','SS_TO_DISTRIBUTOR',566.19::decimal),
  ('MUV-TC-STD-500','COMPANY_TO_SS',60::decimal),
  ('MUV-TC-STD-500','SS_TO_DISTRIBUTOR',64.8::decimal),
  ('MUV-TC-STD-5000','COMPANY_TO_SS',300::decimal),
  ('MUV-TC-STD-5000','SS_TO_DISTRIBUTOR',324::decimal),
  ('MUV-DG-STD-500','COMPANY_TO_SS',63.75::decimal),
  ('MUV-DG-STD-500','SS_TO_DISTRIBUTOR',68.85::decimal),
  ('MUV-DG-STD-1000','COMPANY_TO_SS',116.25::decimal),
  ('MUV-DG-STD-1000','SS_TO_DISTRIBUTOR',125.55::decimal),
  ('MUV-DG-STD-5000','COMPANY_TO_SS',524.25::decimal),
  ('MUV-DG-STD-5000','SS_TO_DISTRIBUTOR',566.19::decimal),
  ('MUV-BC-STD-500','COMPANY_TO_SS',48.75::decimal),
  ('MUV-BC-STD-500','SS_TO_DISTRIBUTOR',52.65::decimal),
  ('MUV-GC-STD-500','COMPANY_TO_SS',67.5::decimal),
  ('MUV-GC-STD-500','SS_TO_DISTRIBUTOR',72.9::decimal),
  ('MUV-FC-VM-1000','COMPANY_TO_SS',112.5::decimal),
  ('MUV-FC-VM-1000','SS_TO_DISTRIBUTOR',121.5::decimal),
  ('MUV-FC-CWK-1000','COMPANY_TO_SS',112.5::decimal),
  ('MUV-FC-CWK-1000','SS_TO_DISTRIBUTOR',121.5::decimal),
  ('MUV-FC-VM-5000','COMPANY_TO_SS',411.75::decimal),
  ('MUV-FC-VM-5000','SS_TO_DISTRIBUTOR',444.69::decimal),
  ('MUV-FC-CWK-5000','COMPANY_TO_SS',411.75::decimal),
  ('MUV-FC-CWK-5000','SS_TO_DISTRIBUTOR',444.69::decimal),
  ('MUV-CW-STD-500','COMPANY_TO_SS',52.5::decimal),
  ('MUV-CW-STD-500','SS_TO_DISTRIBUTOR',56.7::decimal),
  ('MUV-CW-STD-5000','COMPANY_TO_SS',412.5::decimal),
  ('MUV-CW-STD-5000','SS_TO_DISTRIBUTOR',445.5::decimal),
  ('MUV-WP-STD-1000','COMPANY_TO_SS',45::decimal),
  ('MUV-WP-STD-1000','SS_TO_DISTRIBUTOR',48.6::decimal),
  ('MUV-WP-STD-5000','COMPANY_TO_SS',202.5::decimal),
  ('MUV-WP-STD-5000','SS_TO_DISTRIBUTOR',218.7::decimal),
  ('MUV-BP-STD-1000','COMPANY_TO_SS',60::decimal),
  ('MUV-BP-STD-1000','SS_TO_DISTRIBUTOR',64.8::decimal),
  ('MUV-BL-STD-500','COMPANY_TO_SS',37.5::decimal),
  ('MUV-BL-STD-500','SS_TO_DISTRIBUTOR',40.5::decimal),
  ('MUV-HW-LS-250','COMPANY_TO_SS',60::decimal),
  ('MUV-HW-LS-250','SS_TO_DISTRIBUTOR',64.8::decimal),
  ('MUV-HW-LS-500','COMPANY_TO_SS',71.25::decimal),
  ('MUV-HW-LS-500','SS_TO_DISTRIBUTOR',76.95::decimal),
  ('MUV-HW-SB-500','COMPANY_TO_SS',71.25::decimal),
  ('MUV-HW-SB-500','SS_TO_DISTRIBUTOR',76.95::decimal),
  ('MUV-HW-OF-500','COMPANY_TO_SS',71.25::decimal),
  ('MUV-HW-OF-500','SS_TO_DISTRIBUTOR',76.95::decimal),
  ('MUV-HW-OF-5000','COMPANY_TO_SS',543.75::decimal),
  ('MUV-HW-OF-5000','SS_TO_DISTRIBUTOR',587.25::decimal),
  ('MUV-HW-CB-250','COMPANY_TO_SS',60::decimal),
  ('MUV-HW-CB-250','SS_TO_DISTRIBUTOR',64.8::decimal),
  ('MUV-HW-CB-500','COMPANY_TO_SS',71.25::decimal),
  ('MUV-HW-CB-500','SS_TO_DISTRIBUTOR',76.95::decimal),
  ('MUV-HW-CB-5000','COMPANY_TO_SS',543.75::decimal),
  ('MUV-HW-CB-5000','SS_TO_DISTRIBUTOR',587.25::decimal),
  ('MUV-BW-CV-250','COMPANY_TO_SS',77::decimal),
  ('MUV-BW-CV-250','SS_TO_DISTRIBUTOR',83.16::decimal),
  ('MUV-BW-CV-950','COMPANY_TO_SS',252::decimal),
  ('MUV-BW-CV-950','SS_TO_DISTRIBUTOR',272.16::decimal),
  ('MUV-BW-VO-250','COMPANY_TO_SS',77::decimal),
  ('MUV-BW-VO-250','SS_TO_DISTRIBUTOR',83.16::decimal),
  ('MUV-BW-VO-950','COMPANY_TO_SS',252::decimal),
  ('MUV-BW-VO-950','SS_TO_DISTRIBUTOR',272.16::decimal),
  ('MUV-BW-MF-250','COMPANY_TO_SS',77::decimal),
  ('MUV-BW-MF-250','SS_TO_DISTRIBUTOR',83.16::decimal),
  ('MUV-BW-MF-950','COMPANY_TO_SS',252::decimal),
  ('MUV-BW-MF-950','SS_TO_DISTRIBUTOR',272.16::decimal)
) AS v(code, tier, amount)
JOIN "seera_skus" s ON s.code = v.code
CROSS JOIN (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) u
ON CONFLICT ("skuId","tier","effectiveFrom") DO NOTHING;

-- 7 non-MUV SKUs (Seera / Shine Plus / Yuva -- distinct brands, not merged)
INSERT INTO "seera_skus" ("id","code","productName","brand","category","packSize","unitType","unitsPerCase","mrp","hsn","status","createdById","createdAt","updatedAt")
SELECT gen_random_uuid()::text, v.code, v.name, v.brand, 'PERSONAL_CARE', v.pack_value, v.pack_unit, v.units_per_case, 1, '34021190', 'ACTIVE'::"MasterStatus", u.id, now(), now()
FROM (VALUES
  ('SEERA-CAKE-BLUE','Seera Blue Detergent Cake','Seera',180::decimal,'g',40),
  ('SEERA-CAKE-WHITE','Seera White Detergent Cake','Seera',150::decimal,'g',40),
  ('SEERA-POWDER-1KG','Seera Detergent Powder','Seera',1::decimal,'kg',1),
  ('SEERA-SHINEPLUS-POWDER-1KG','Shine Plus Detergent Powder','Shine Plus',1::decimal,'kg',1),
  ('SEERA-SHINEPLUS-POWDER-3KG','Shine Plus Detergent Powder','Shine Plus',3::decimal,'kg',10),
  ('SEERA-SHINEPLUS-POWDER-5KG','Shine Plus Detergent Powder','Shine Plus',5::decimal,'kg',6),
  ('SEERA-YUVA-CAKE-BLUE','Yuva Detergent Cake','Yuva',170::decimal,'g',40)
) AS v(code, name, brand, pack_value, pack_unit, units_per_case)
CROSS JOIN (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) u
ON CONFLICT ("code") DO NOTHING;

-- Non-MUV COMPANY_TO_SS price versions (7 rows; SS_TO_DISTRIBUTOR intentionally NOT created)
INSERT INTO "seera_price_versions" ("id","skuId","tier","amount","mrpSnapshot","effectiveFrom","status","createdById","createdAt")
SELECT gen_random_uuid()::text, s.id, 'COMPANY_TO_SS'::"PriceTier", v.amount, s."mrp", '2026-01-01'::date, 'ACTIVE'::"MasterStatus", u.id, now()
FROM (VALUES
  ('SEERA-CAKE-BLUE',252.54::decimal),
  ('SEERA-CAKE-WHITE',252.54::decimal),
  ('SEERA-POWDER-1KG',1165.26::decimal),
  ('SEERA-SHINEPLUS-POWDER-1KG',953.39::decimal),
  ('SEERA-SHINEPLUS-POWDER-3KG',1144.06::decimal),
  ('SEERA-SHINEPLUS-POWDER-5KG',1144.06::decimal),
  ('SEERA-YUVA-CAKE-BLUE',252.54::decimal)
) AS v(code, amount)
JOIN "seera_skus" s ON s.code = v.code
CROSS JOIN (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) u
ON CONFLICT ("skuId","tier","effectiveFrom") DO NOTHING;

-- 7 free-goods schemes (display-only entitlement, never deducted from order total)
INSERT INTO "seera_schemes" ("id","name","skuId","eligibilityType","minimumQuantity","freeQuantity","applicability","effectiveFrom","effectiveTo","status","createdById","createdAt")
SELECT gen_random_uuid()::text, v.name, s.id, 'COMPANY_TO_SS_DISPLAY_ONLY', 1::decimal, v.free_qty::decimal,
  jsonb_build_object('scope','COMPANY_TO_SS','appliesToOrderTotal',false,'reason','Display-only entitlement -- never deducted from the order total, matching governed free-goods policy.'),
  '2026-01-01'::date, '2030-01-01'::date, 'ACTIVE'::"MasterStatus", u.id, now()
FROM (VALUES
  ('SEERA-CAKE-BLUE','Buy 1 BOX -> +1 PC FREE',1),
  ('SEERA-CAKE-WHITE','Buy 1 BOX -> +1 PC FREE',1),
  ('SEERA-POWDER-1KG','Buy 1 BAG -> +1 PC FREE',1),
  ('SEERA-SHINEPLUS-POWDER-1KG','Buy 1 BAG -> +1 PC FREE',1),
  ('SEERA-SHINEPLUS-POWDER-3KG','Buy 1 BAG -> +1 PC FREE',1),
  ('SEERA-SHINEPLUS-POWDER-5KG','Buy 1 BAG -> +1 PC FREE',1),
  ('SEERA-YUVA-CAKE-BLUE','Buy 1 BOX -> +2 PCS FREE',2)
) AS v(code, name, free_qty)
JOIN "seera_skus" s ON s.code = v.code
CROSS JOIN (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM "seera_schemes" existing WHERE existing."skuId" = s.id AND existing.name = v.name);
