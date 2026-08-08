/**
 * Run with: npm run db:seed (see package.json — invokes `tsx prisma/seed.ts`)
 *
 * This is intentionally the first thing to run after `prisma migrate deploy`
 * — every page built in this assembly pass queries real tables, and an
 * empty database means every one of them renders an empty state. This seed
 * mirrors the mock data that lived in the original `.jsx` files (same
 * product names, same category structure) so the assembled app looks like
 * the designs it was built from, rather than a blank shell.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Phase 1C (GAP-008) — this script creates/upserts a default admin account
// (admin@muv.co.in / ChangeMe123). Running it against a shared or production
// database would create or silently reset that account to a known password.
// A local Postgres instance is the only case this refuses by default; set
// ALLOW_SEED=true to override deliberately (e.g. a genuinely fresh, isolated
// staging database that isn't reachable at localhost).
function assertSafeToSeed() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const looksLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  if (!looksLocal && process.env.ALLOW_SEED !== "true") {
    console.error(
      "Refusing to seed: DATABASE_URL does not look like a local development database.\n" +
        "This script creates a default admin account (admin@muv.co.in / ChangeMe123) — running it " +
        "against a shared or production database would create or reset that account with a known " +
        "password.\nIf you really intend to seed this database, re-run with ALLOW_SEED=true."
    );
    process.exit(1);
  }
}

async function main() {
  assertSafeToSeed();
  console.log("Seeding…");

  // ---- Categories ----
  const categoryData = [
    { name: "Home Care", slug: "home-care", sortOrder: 0 },
    { name: "Fabric Care", slug: "fabric-care", sortOrder: 1 },
    { name: "Body Care", slug: "body-care", sortOrder: 2 },
    { name: "Personal Care", slug: "personal-care", sortOrder: 3 },
    { name: "Car Care", slug: "car-care", sortOrder: 4 },
    { name: "Skin Care", slug: "skin-care", sortOrder: 5, comingSoon: true },
  ];
  const categories: Record<string, string> = {};
  for (const c of categoryData) {
    const created = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categories[c.slug] = created.id;
  }
  console.log(`  ${categoryData.length} categories`);

  // ---- Products + variants + inventory ----
  const productData = [
    {
      name: "MUV Noir", slug: "muv-noir", category: "home-care", hsnCode: "3307", gstRate: 18, isFeatured: true, bestSellerRank: 1,
      shortDescription: "A concentrated home fragrance built on oud, amber and musk.",
      fragranceNotes: "Oud, Amber, Musk",
      ingredients: "Alcohol Denat., Parfum, Aqua, Limonene, Linalool.",
      directions: "Spray 2-3 times in the room, away from fabric and direct sunlight.",
      benefits: "Long-lasting room fragrance in a premium refillable bottle.",
      safety: "Keep away from open flame. For external/ambient use only.",
      variants: [{ size: "250ml", price: 499, mrp: 599, sku: "MUV-HC-NOR-250", stock: 128 }],
    },
    {
      name: "MUV Bloom", slug: "muv-bloom", category: "home-care", hsnCode: "3307", gstRate: 18,
      shortDescription: "A floral home fragrance built around peony and white tea.",
      fragranceNotes: "Peony, White Tea", ingredients: "Alcohol Denat., Parfum, Aqua.",
      directions: "Spray 2-3 times in the room.", benefits: "Bright, everyday floral fragrance.",
      safety: "Keep away from open flame.",
      variants: [{ size: "250ml", price: 449, mrp: 549, sku: "MUV-HC-BLM-250", stock: 60 }],
    },
    {
      name: "MUV Renew", slug: "muv-renew", category: "fabric-care", hsnCode: "3402", gstRate: 18, isFeatured: true, bestSellerRank: 2,
      shortDescription: "A liquid detergent that lifts stains and leaves fabric smelling premium for days.",
      fragranceNotes: "White Musk, Jasmine",
      ingredients: "Aqua, Anionic Surfactants, Fabric Softening Agents, Enzymes, Perfume.",
      directions: "Add one cap (30ml) to the drum before loading clothes.",
      benefits: "Stain removal, 48-hour fragrance, colour-safe formula.",
      safety: "Keep out of reach of children. Avoid contact with eyes.",
      variants: [
        { size: "500ml", price: 349, mrp: 429, sku: "MUV-FC-REN-500", stock: 84 },
        { size: "1L", price: 599, mrp: 749, sku: "MUV-FC-REN-1L", stock: 40 },
      ],
    },
    {
      name: "MUV Cleanse", slug: "muv-cleanse", category: "body-care", hsnCode: "3401", gstRate: 18, isFeatured: true, bestSellerRank: 3,
      shortDescription: "A rich, foaming body wash with 1% Salicylic Acid for a deep cleanse that never strips the skin.",
      fragranceNotes: "Citrus, Bergamot",
      ingredients: "Aqua, Sodium Laureth Sulfate, Salicylic Acid (1%), Glycerin, Perfume.",
      directions: "Apply to wet skin, lather, and rinse. Suitable for daily use.",
      benefits: "Deep-cleanses pores without over-drying, refreshing citrus fragrance.",
      safety: "For external use only. Discontinue if irritation occurs.",
      variants: [
        { size: "250ml", price: 299, mrp: 349, sku: "MUV-BC-CLN-250", stock: 210 },
        { size: "500ml", price: 499, mrp: 599, sku: "MUV-BC-CLN-500", stock: 90 },
      ],
    },
    {
      name: "MUV Silk Hair Wash", slug: "muv-silk-hair-wash", category: "personal-care", hsnCode: "3305", gstRate: 18,
      shortDescription: "A gentle daily shampoo with argan oil and keratin.",
      fragranceNotes: "Argan, Keratin", ingredients: "Aqua, Cocamidopropyl Betaine, Argan Oil, Keratin.",
      directions: "Apply to wet hair, lather, rinse. Follow with conditioner.",
      benefits: "Smoother, more manageable hair with daily use.",
      safety: "Avoid contact with eyes.",
      variants: [{ size: "250ml", price: 379, mrp: 449, sku: "MUV-PC-SLK-250", stock: 2 }],
    },
    {
      name: "MUV Shield", slug: "muv-shield", category: "car-care", hsnCode: "3405", gstRate: 18, bestSellerRank: 4,
      shortDescription: "A professional-grade car shampoo with a gloss-lock finish.",
      fragranceNotes: null, ingredients: "Aqua, Surfactants, Wax Emulsion.",
      directions: "Dilute per label, apply with a wash mitt, rinse thoroughly.",
      benefits: "Gloss-lock formula, safe on all exterior finishes.",
      safety: "Avoid contact with eyes and skin for prolonged periods.",
      variants: [{ size: "500ml", price: 599, mrp: 749, sku: "MUV-CC-SHD-500", stock: 4 }],
    },
  ];

  for (const p of productData) {
    const { variants, category, ...rest } = p;
    const categoryId = categories[category];
    if (!categoryId) throw new Error(`Seed data references unknown category slug: ${category}`);
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...rest, categoryId, status: "ACTIVE" },
    });

    for (const v of variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: {},
        create: { productId: product.id, size: v.size, price: v.price, mrp: v.mrp, sku: v.sku },
      });
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: { quantity: v.stock },
        create: { variantId: variant.id, quantity: v.stock, lowStockThreshold: 10 },
      });
    }
  }
  console.log(`  ${productData.length} products with variants + inventory`);

  // ---- Homepage CMS content ----
  await prisma.banner.upsert({
    where: { id: "seed-hero-1" },
    update: {},
    create: {
      id: "seed-hero-1", type: "HERO", title: "Keep Muving",
      subtitle: "An affordable luxury from India", ctaLabel: "Shop the range", ctaLink: "/shop", active: true, sortOrder: 0,
    },
  });

  const sectionData = [
    { key: "hero", label: "Hero", sortOrder: 0 },
    { key: "marquee", label: "Trust Marquee", sortOrder: 1 },
    { key: "categories", label: "Categories", sortOrder: 2 },
    { key: "bestsellers", label: "Best Sellers", sortOrder: 3 },
    // "brandstory" and "business" back PHASE_6C/6D's homepage sections
    // (components/storefront/brand-story.tsx, business-section.tsx) — added
    // here so a fresh-seeded database doesn't silently hide them the way
    // this one did before this fix (showSection() hides any key not
    // registered here once at least one HomepageSection row exists).
    { key: "brandstory", label: "Brand Story", sortOrder: 4 },
    { key: "reviews", label: "Customer Reviews", sortOrder: 5 },
    { key: "business", label: "Business", sortOrder: 6 },
    { key: "newsletter", label: "Newsletter", sortOrder: 7 },
  ];
  for (const s of sectionData) {
    await prisma.homepageSection.upsert({ where: { key: s.key }, update: {}, create: { ...s, visible: true } });
  }

  await prisma.announcementBar.upsert({
    where: { id: "singleton" }, update: {},
    create: { id: "singleton", message: "Free delivery on orders above ₹999", link: "/shop", active: true },
  });
  await prisma.newsletterContent.upsert({
    where: { id: "singleton" }, update: {},
    create: { id: "singleton", heading: "Join the movement", subtext: "Early access to new launches, and nothing else." },
  });
  console.log("  Homepage CMS content (banners, sections, announcement bar, newsletter)");

  // ---- Coupon ----
  await prisma.coupon.upsert({
    where: { code: "MUV10" }, update: {},
    create: { code: "MUV10", type: "PERCENT", value: 10, minOrderValue: 500, active: true },
  });
  console.log("  1 coupon (MUV10 — 10% off, min ₹500)");

  // ---- Sales Organization Architecture v1 ----
  const permissionData = [
    ["dashboard.all", "All dashboards", "dashboard"], ["dashboard.team", "Team dashboard", "dashboard"],
    ["dashboard.assigned", "Assigned dashboard", "dashboard"], ["dashboard.institutional", "Institutional dashboard", "dashboard"],
    ["dashboard.support", "Support dashboard", "dashboard"], ["users.view", "View users", "organization"],
    ["users.manage", "Manage users", "organization"], ["roles.manage", "Manage roles", "organization"],
    ["permissions.manage", "Manage permissions", "organization"], ["territories.manage", "Manage territories", "territories"],
    ["audit.view", "View audit logs", "audit"], ["leads.view_all", "View all leads", "leads"],
    ["leads.view_assigned", "View assigned leads", "leads"], ["leads.assign", "Assign leads", "leads"],
    ["crm.update", "Update CRM", "crm"], ["customers.view_all", "View all customers", "customers"],
    ["customers.view_assigned", "View assigned customers", "customers"],
    // Milestone 2 (Customer & Master Data Foundation).
    ["customers.manage", "Create, edit, and deactivate customers", "customers"],
    ["master_data.manage", "Manage common masters (units, brands, payment terms, institution categories, departments, customer types)", "master_data"],
    ["employees.manage", "Manage employee department, designation, and status", "employees"],
    ["quotations.view", "View quotations", "quotations"],
    ["quotations.create", "Create quotations", "quotations"], ["quotations.approve_standard", "Approve standard quotations", "quotations"],
    ["quotations.approve_strategic", "Approve strategic quotations", "quotations"], ["reports.view", "View reports", "reports"],
    ["followups.manage", "Manage follow-ups", "followups"], ["meetings.manage", "Manage meetings", "meetings"],
    ["institutional.manage", "Manage institutional sales", "institutional"], ["support.manage", "Manage support cases", "support"],
    ["partners.approve", "Approve channel partners", "partners"], ["pricing.override", "Override pricing", "pricing"],
    ["sales_channels.view", "View sales channels", "channels"], ["sales_channels.manage", "Manage sales channels", "channels"],
    ["inquiries.view_all", "View all inquiries", "inquiries"], ["inquiries.view_assigned", "View assigned inquiries", "inquiries"],
    ["inquiries.create", "Create inquiries", "inquiries"], ["inquiries.assign", "Assign inquiries", "inquiries"],
    ["inquiries.reassign", "Reassign inquiries", "inquiries"], ["inquiries.change_status", "Change inquiry status", "inquiries"],
    ["applications.review", "Review applications", "applications"], ["applications.approve", "Approve applications", "applications"],
    ["applications.reject", "Reject applications", "applications"], ["timeline.view", "View customer timeline", "timeline"],
    ["lead_sources.manage", "Manage lead sources", "channels"], ["reports.channels", "View channel reports", "reports"],
    ["opportunities.view_all", "View all opportunities", "opportunities"],
    ["opportunities.view_assigned", "View assigned opportunities", "opportunities"],
    ["opportunities.create", "Create opportunities", "opportunities"],
    ["opportunities.update", "Update opportunities", "opportunities"],
    ["opportunities.assign", "Assign opportunities", "opportunities"],
    ["opportunities.stage_change", "Change opportunity stage", "opportunities"],
    ["opportunities.close", "Close opportunities", "opportunities"],
    ["opportunities.reopen", "Reopen opportunities", "opportunities"],
    ["opportunities.probability_override", "Override opportunity probability", "opportunities"],
    ["opportunities.bulk", "Bulk update opportunities", "opportunities"],
    ["opportunities.export", "Export opportunities", "opportunities"],
    ["opportunity_activities.manage", "Manage opportunity activities", "opportunities"],
    ["opportunity_tasks.manage", "Manage opportunity tasks", "opportunities"],
    ["opportunity_config.manage", "Manage opportunity configuration", "opportunities"],
    ["reports.opportunities", "View opportunity reports", "reports"],
    ["quotations.view_all", "View all quotations", "quotations"], ["quotations.view_assigned", "View assigned quotations", "quotations"],
    ["quotations.view_support", "Read quotation status for support", "quotations"], ["quotations.create_versions", "Create quotation versions", "quotations"],
    ["quotations.update", "Update draft quotations", "quotations"], ["quotations.approve", "Approve quotations", "quotations"],
    ["quotations.send", "Send quotations", "quotations"], ["quotations.respond", "Register customer response", "quotations"],
    ["quotations.revise", "Create quotation revisions", "quotations"], ["quotations.bulk", "Bulk quotation actions", "quotations"],
    ["quotations.export", "Export quotations", "quotations"], ["quotations.pdf", "Generate quotation PDFs", "quotations"],
    ["quotation_config.manage", "Manage quotation configuration", "quotations"], ["pricing_policies.manage", "Manage pricing policies", "quotations"],
    ["reports.quotations", "View quotation reports", "reports"],
    ["commerce.view_all", "View all commerce", "commerce"], ["commerce.view_assigned", "View assigned commerce", "commerce"],
    ["commerce.view_support", "Read commerce status for support", "commerce"], ["orders.create_from_quotation", "Create order from accepted quotation", "commerce"],
    ["orders.manage_commerce", "Manage commerce orders", "commerce"], ["warehouse.operate", "Perform warehouse operations", "warehouse"],
    ["warehouse.adjust", "Adjust warehouse stock", "warehouse"], ["inventory.allocate", "Allocate inventory", "warehouse"],
    ["billing.manage", "Manage invoices", "billing"], ["payments.record", "Record payments", "billing"],
    ["payments.void", "Void payments", "billing"], ["commerce.bulk", "Bulk commerce actions", "commerce"],
    ["commerce.export", "Export commerce data", "commerce"], ["commerce_config.manage", "Manage commerce configuration", "commerce"],
    ["reports.commerce", "View commerce reports", "reports"],
    ["intelligence.view_all", "View organization customer intelligence", "intelligence"],
    ["intelligence.view_assigned", "View assigned customer intelligence", "intelligence"],
    ["intelligence.view_support", "View support-safe customer intelligence", "intelligence"],
    ["intelligence.recalculate", "Recalculate customer intelligence", "intelligence"],
    ["segments.manage", "Manage customer segments", "intelligence"],
    ["loyalty.view_all", "View organization loyalty", "loyalty"],
    ["loyalty.view_assigned", "View assigned customer loyalty", "loyalty"],
    ["loyalty.view_support", "View support-safe loyalty", "loyalty"],
    ["loyalty.adjust_rewards", "Post reward adjustments", "loyalty"],
    ["loyalty.manage_membership", "Manage membership levels", "loyalty"],
    ["loyalty.manage_referrals", "Manage referrals", "loyalty"],
    ["analytics.view_all", "View organization analytics", "analytics"],
    ["analytics.view_team", "View team and territory analytics", "analytics"],
    ["analytics.view_assigned", "View assigned analytics", "analytics"],
    ["analytics.view_institutional", "View institutional analytics", "analytics"],
    ["analytics.view_support", "View support-safe operational analytics", "analytics"],
    ["executive_reports.generate", "Generate executive reports", "reports"],
    ["intelligence.export", "Export intelligence data", "reports"],
    ["kpi_config.manage", "Manage KPI configuration", "analytics"],
    ["report_config.manage", "Manage executive report configuration", "reports"],
    ["ai.conversations.use", "Use governed AI conversations", "ai"],
    ["ai.conversations.manage", "Manage shared AI conversations", "ai"],
    ["ai.executive.use", "Use Founder executive AI workspace", "ai"],
    ["ai.knowledge.retrieve", "Retrieve approved AI knowledge", "ai"],
    ["ai.knowledge.manage", "Manage AI knowledge", "ai"],
    ["ai.workflows.use", "Create governed AI workflows", "ai"],
    ["ai.workflows.monitor", "Monitor AI workflows", "ai"],
    ["ai.actions.propose", "Propose AI-assisted actions", "ai"],
    ["ai.actions.approve", "Approve AI-assisted actions", "ai"],
    ["ai.recommendations.view", "View AI recommendations", "ai"],
    ["ai.prompts.manage", "Manage AI prompts", "ai_governance"],
    ["ai.providers.manage", "Manage AI providers and models", "ai_governance"],
    ["ai.agents.manage", "Manage AI agents", "ai_governance"],
    ["ai.tools.manage", "Manage AI tools", "ai_governance"],
    ["ai.security.manage", "Manage AI security and compliance", "ai_governance"],
    ["ai.operations.view", "View AI operational health", "ai_governance"],
    ["ai.operations.manage", "Manage AI incidents and kill switches", "ai_governance"],
    ["ai.usage.view_own", "View own AI usage", "ai_governance"],
    ["ai.usage.view_team", "View team AI usage", "ai_governance"],
    ["ai.usage.view_all", "View organization AI usage", "ai_governance"],
    ["ai.export", "Export authorized AI metadata", "ai"],
    ["enterprise.vendor.view", "View enterprise vendors", "enterprise_vendor"],
    ["enterprise.vendor.create", "Create enterprise vendors", "enterprise_vendor"],
    ["enterprise.vendor.update", "Update enterprise vendors", "enterprise_vendor"],
    ["enterprise.vendor.approve", "Approve enterprise vendors", "enterprise_vendor"],
    ["enterprise.vendor.suspend", "Suspend enterprise vendors", "enterprise_vendor"],
    ["enterprise.vendor.archive", "Archive enterprise vendors", "enterprise_vendor"],
    ["enterprise.procurement.view", "View procurement", "enterprise_procurement"],
    ["enterprise.procurement.requisition.create", "Create purchase requisitions", "enterprise_procurement"],
    ["enterprise.procurement.requisition.submit", "Submit purchase requisitions", "enterprise_procurement"],
    ["enterprise.procurement.approve", "Approve procurement records", "enterprise_procurement"],
    ["enterprise.procurement.rfq.manage", "Manage RFQs", "enterprise_procurement"],
    ["enterprise.procurement.quotation.evaluate", "Evaluate vendor quotations", "enterprise_procurement"],
    ["enterprise.procurement.po.create", "Create purchase orders", "enterprise_procurement"],
    ["enterprise.procurement.po.issue", "Issue purchase orders", "enterprise_procurement"],
    ["enterprise.procurement.receipt.create", "Create goods receipts", "enterprise_procurement"],
    ["enterprise.procurement.return.manage", "Manage purchase returns", "enterprise_procurement"],
    ["enterprise.formula.view", "View formula and BOM", "enterprise_formula"],
    ["enterprise.formula.create", "Create formulas", "enterprise_formula"],
    ["enterprise.formula.update_draft", "Update draft formula revisions", "enterprise_formula"],
    ["enterprise.formula.submit", "Submit formula revisions", "enterprise_formula"],
    ["enterprise.formula.approve", "Approve formula revisions", "enterprise_formula"],
    ["enterprise.formula.activate", "Activate formula revisions", "enterprise_formula"],
    ["enterprise.production.view", "View production", "enterprise_production"],
    ["enterprise.production.plan", "Manage production plans", "enterprise_production"],
    ["enterprise.production.order.create", "Create production orders", "enterprise_production"],
    ["enterprise.production.order.approve", "Approve production orders", "enterprise_production"],
    ["enterprise.production.execute", "Execute production", "enterprise_production"],
    ["enterprise.production.complete", "Complete production", "enterprise_production"],
    ["enterprise.batch.view", "View batches", "enterprise_batch"],
    ["enterprise.batch.create", "Create batches", "enterprise_batch"],
    ["enterprise.batch.update", "Update batches", "enterprise_batch"],
    ["enterprise.batch.block", "Block batches", "enterprise_batch"],
    ["enterprise.batch.close", "Close batches", "enterprise_batch"],
    ["enterprise.quality.view", "View quality records", "enterprise_quality"],
    ["enterprise.quality.inspect", "Execute inspections", "enterprise_quality"],
    ["enterprise.quality.decide", "Record quality decisions", "enterprise_quality"],
    ["enterprise.quality.release", "Release quality controlled stock", "enterprise_quality"],
    ["enterprise.quality.reject", "Reject quality controlled stock", "enterprise_quality"],
    ["enterprise.quality.override", "Perform governed quality override", "enterprise_quality"],
    ["enterprise.warehouse.view", "View warehouse operations", "enterprise_warehouse"],
    ["enterprise.warehouse.transfer", "Transfer warehouse stock", "enterprise_warehouse"],
    ["enterprise.warehouse.adjust", "Adjust warehouse stock", "enterprise_warehouse"],
    ["enterprise.warehouse.consume", "Consume production stock", "enterprise_warehouse"],
    ["enterprise.planning.view", "View supply planning", "enterprise_planning"],
    ["enterprise.planning.generate", "Generate planning snapshots", "enterprise_planning"],
    ["enterprise.planning.override", "Override planning recommendations", "enterprise_planning"],
    ["enterprise.reporting.view", "View operational reports", "enterprise_reporting"],
    ["enterprise.reporting.export", "Export operational reports", "enterprise_reporting"],
    ["network.partners.view", "View business-network partners", "enterprise_network"],
    ["network.partners.manage", "Manage business-network partners", "enterprise_network"],
    ["network.partners.approve_onboarding", "Approve partner onboarding", "enterprise_network"],
    ["network.territories.manage", "Manage network territories", "enterprise_network"],
    ["network.agreements.manage", "Manage partner agreements", "enterprise_network"],
    ["network.agreements.approve", "Approve partner agreements", "enterprise_network"],
    ["network.commercial_policies.manage", "Manage commercial policies", "enterprise_network"],
    ["network.royalties.manage", "Manage royalties", "enterprise_network"],
    ["network.royalties.approve", "Approve royalties", "enterprise_network"],
    ["network.commissions.manage", "Manage commissions", "enterprise_network"],
    ["network.commissions.approve", "Approve commissions", "enterprise_network"],
    ["network.claims.manage", "Manage network claims", "enterprise_network"],
    ["network.claims.approve", "Approve network claims", "enterprise_network"],
    ["network.analytics.view", "View network analytics", "enterprise_network"],
    ["network.partner_portal.admin", "Administer the partner portal", "enterprise_network"],
    ["finance.masters.view", "View financial masters", "enterprise_finance"],
    ["finance.masters.manage", "Manage financial masters", "enterprise_finance"],
    ["finance.journals.prepare", "Prepare journals", "enterprise_finance"],
    ["finance.journals.approve", "Approve journals", "enterprise_finance"],
    ["finance.journals.post", "Post journals", "enterprise_finance"],
    ["finance.receivables.view", "View receivables", "enterprise_finance"],
    ["finance.receivables.manage", "Manage receivables", "enterprise_finance"],
    ["finance.payables.view", "View payables", "enterprise_finance"],
    ["finance.payables.manage", "Manage payables", "enterprise_finance"],
    ["finance.payments.prepare", "Prepare payments", "enterprise_finance"],
    ["finance.payments.approve", "Approve payments", "enterprise_finance"],
    ["finance.expenses.manage", "Manage expenses", "enterprise_finance"],
    ["finance.expenses.approve", "Approve expenses", "enterprise_finance"],
    ["finance.banking.manage", "Manage banking", "enterprise_finance"],
    ["finance.banking.reconcile", "Reconcile bank accounts", "enterprise_finance"],
    ["finance.tax.manage", "Manage tax configuration", "enterprise_finance"],
    ["finance.reports.view", "View financial reports", "enterprise_finance"],
    ["finance.periods.close", "Close accounting periods", "enterprise_finance"],
    ["finance.periods.reopen", "Reopen accounting periods", "enterprise_finance"],
    // Milestone 8 — Finance & Accounts (MUV OS). New keys for genuinely new domains only.
    ["finance.creditnotes.manage", "Manage credit notes", "enterprise_finance"],
    ["finance.debitnotes.manage", "Manage debit notes", "enterprise_finance"],
    ["finance.assets.manage", "Manage fixed assets", "enterprise_finance"],
    ["finance.depreciation.post", "Post depreciation entries", "enterprise_finance"],
    ["finance.budgets.manage", "Prepare and revise budgets", "enterprise_finance"],
    ["finance.budgets.approve", "Approve budgets", "enterprise_finance"],
    ["finance.costing.view", "View manufacturing costing", "enterprise_finance"],
    ["finance.costing.manage", "Manage manufacturing costing", "enterprise_finance"],
    ["finance.cash.manage", "Manage cash and petty cash", "enterprise_finance"],
    ["finance.collections.manage", "Manage receivables collections", "enterprise_finance"],
    ["finance.creditcontrol.manage", "Manage customer/supplier credit control", "enterprise_finance"],
    ["finance.creditcontrol.override", "Override a credit hold", "enterprise_finance"],
    ["finance.approvalmatrix.manage", "Configure the finance approval matrix", "enterprise_finance"],
    ["finance.eventposting.manage", "Manage and retry event-driven postings", "enterprise_finance"],
    ["finance.audit.manage", "Manage internal audit findings", "enterprise_finance"],
    ["finance.audit.view", "View internal audit findings", "enterprise_finance"],
    ["founder_os.access", "Access Founder OS", "founder_os"],
    ["founder_os.financial_intelligence.view", "View executive financial intelligence", "founder_os"],
    ["founder_os.operational_intelligence.view", "View executive operational intelligence", "founder_os"],
    ["founder_os.network_intelligence.view", "View executive network intelligence", "founder_os"],
    ["founder_os.alerts.manage", "Manage executive alerts", "founder_os"],
    ["founder_os.decisions.access", "Access strategic decisions", "founder_os"],
    ["founder_os.decisions.record", "Record strategic decisions", "founder_os"],
    ["founder_os.approvals.perform", "Perform authorized executive approvals", "founder_os"],
    ["founder_os.ai_briefings.access", "Access MUV AI executive briefings", "founder_os"],
    // Part 3D, Stage 1 — genuinely new capabilities the pre-provisioned
    // founder_os.* set above didn't anticipate (notifications, widget
    // layout). founder_os.access and founder_os.alerts.manage above are
    // reused as-is by Stage 1, not duplicated.
    ["founder_os.notifications.view", "View Founder notification feed", "founder_os"],
    ["founder_os.notifications.manage", "Manage Founder notification read state", "founder_os"],
    ["founder_os.widgets.manage", "Manage Founder dashboard widget layout", "founder_os"],
    // Part 3D, Stage 4 — Founder Workspace (saved views, dashboard
    // layouts, pinned widgets, saved reports, workspace preferences).
    ["founder_os.workspace.manage", "Manage Founder workspace (saved views, layouts, reports, preferences)", "founder_os"],
    // Milestone 3 — Institutional Sales OS (app/os/sales). A fully isolated
    // module prefix ("inst_sales.*"), deliberately distinct from the
    // pre-existing "institutional.manage"/"dashboard.institutional" pair
    // above (those gate the separate, unrelated /sales/institutional inquiry
    // filter and its dashboard flag) — reusing them would blur two
    // intentionally separate systems.
    ["inst_sales.dashboard.founder", "View Institutional Sales OS Founder dashboard", "inst_sales"],
    ["inst_sales.dashboard.manager", "View Institutional Sales OS Sales Manager dashboard", "inst_sales"],
    ["inst_sales.dashboard.officer", "View Institutional Sales OS Sales Officer dashboard", "inst_sales"],
    ["inst_sales.leads.view_all", "View all Institutional Sales OS leads", "inst_sales"],
    ["inst_sales.leads.view_assigned", "View assigned Institutional Sales OS leads", "inst_sales"],
    ["inst_sales.leads.manage", "Create, qualify, assign, and update leads", "inst_sales"],
    ["inst_sales.opportunities.view_all", "View all Institutional Sales OS opportunities", "inst_sales"],
    ["inst_sales.opportunities.view_assigned", "View assigned Institutional Sales OS opportunities", "inst_sales"],
    ["inst_sales.opportunities.manage", "Create and update opportunities", "inst_sales"],
    ["inst_sales.visits.manage", "Record and manage customer visits and surveys", "inst_sales"],
    ["inst_sales.samples.manage", "Issue and track samples", "inst_sales"],
    ["inst_sales.followups.manage", "Create and complete follow-ups", "inst_sales"],
    ["inst_sales.quotations.view", "View Institutional Sales OS quotations", "inst_sales"],
    ["inst_sales.quotations.manage", "Create, edit, and send quotations", "inst_sales"],
    ["inst_sales.quotations.approve", "Approve Institutional Sales OS quotations", "inst_sales"],
    ["inst_sales.tasks.manage", "Manage personal, assigned, and daily tasks", "inst_sales"],
    ["inst_sales.planner.manage", "Manage the daily planner and route", "inst_sales"],
    ["inst_sales.expenses.submit", "Submit expense claims", "inst_sales"],
    ["inst_sales.expenses.approve", "Approve or reject expense claims", "inst_sales"],
    ["inst_sales.expenses.view_all", "View all Institutional Sales OS expenses (Founder visibility)", "inst_sales"],
    ["inst_sales.routes.manage", "Manage route plans and tracking", "inst_sales"],
    ["inst_sales.reports.view", "View Institutional Sales OS reports", "inst_sales"],
    ["inst_sales.targets.manage", "Set and manage sales targets", "inst_sales"],

    // Milestone 4 — Order Management OS. business_orders.* is deliberately
    // NOT under the inst_sales module prefix (see lib/sales/constants.ts's
    // comment at these keys) — BusinessOrder's naming stays channel-neutral
    // for future Corporate/Dealer/Distributor/Franchise/Export flows, and
    // its permissions follow the same reasoning. order_mgmt.view is its own
    // module: it gates the unified list surfacing both D2C and business
    // orders together, not the business-order domain specifically.
    ["order_mgmt.view", "View the unified Order Management list (D2C and business orders)", "order_mgmt"],
    ["business_orders.view_all", "View all business orders", "business_orders"],
    ["business_orders.view_assigned", "View assigned business orders", "business_orders"],
    ["business_orders.manage", "Change business order status, dispatch info, and cancel", "business_orders"],
    ["business_orders.create_from_quotation", "Convert an accepted institutional quotation into a business order", "business_orders"],

    // Milestone 5 — Operations Foundation.
    ["business_ops.view", "View the Operations Queue", "business_ops"],
    ["business_ops.manage", "Check inventory, reserve stock, and assign the warehouse for a business order", "business_ops"],

    // Milestone 9 — Customer Support (app/os/support). Distinct from the
    // pre-existing "support.manage" key (Milestone 1-era, gates the
    // unrelated /sales/support "Support Work Queue" page) — see
    // lib/sales/constants.ts's comment at these keys.
    ["support.tickets.view_all", "View all support tickets", "support"],
    ["support.tickets.view_assigned", "View assigned support tickets", "support"],
    ["support.tickets.manage", "Create and manage support tickets", "support"],
    ["support.tickets.assign", "Assign support tickets to agents", "support"],
    ["support.tickets.escalate", "Escalate support tickets", "support"],
    ["support.tickets.reopen", "Reopen a resolved or closed ticket", "support"],
    ["support.refunds.prepare", "Prepare a support refund request", "support"],
    ["support.refunds.approve", "Approve or reject a support refund request", "support"],
    ["support.returns.manage", "Manage return and replacement requests", "support"],
    ["support.warranty.manage", "Register and manage warranty coverage", "support"],
    ["support.kb.author", "Author knowledge base articles", "support"],
    ["support.kb.approve", "Approve knowledge base articles", "support"],
    ["support.kb.publish", "Publish knowledge base articles", "support"],
    ["support.faq.manage", "Manage FAQs", "support"],
    ["support.templates.manage", "Manage resolution templates", "support"],
    ["support.sla.configure", "Configure SLA policies, business hours, and holidays", "support"],
    ["support.escalation.configure", "Configure escalation rules", "support"],
    ["support.departments.manage", "Manage support departments", "support"],
    ["support.qa.review", "Review support ticket quality", "support"],
    ["support.reports.view", "View support reports", "support"],

    // MUV AI Engineering Execution — Sprint 2 (Knowledge Factory, Source
    // Registry). Founder-only for now via the existing permissionData.map
    // pattern below — broader role grants are a Sprint 4 (Governance)
    // concern once ApprovalAuthority/delegation exists to scope them safely.
    ["knowledge_factory.source.view", "View canonical source documents", "knowledge_factory"],
    ["knowledge_factory.source.manage", "Register and manage canonical source documents", "knowledge_factory"],
  ] as const;
  const permissionIds: Record<string, string> = {};
  for (const [permissionKey, displayName, module] of permissionData) {
    const permission = await prisma.salesPermission.upsert({
      where: { permissionKey }, update: { displayName, module },
      create: { permissionKey, displayName, module },
    });
    permissionIds[permissionKey] = permission.id;
  }
  const roleDefinitions: Record<string, { active: boolean; permissions: string[] }> = {
    "Founder": { active: true, permissions: permissionData.map(([key]) => key) },
    "Sales Manager": { active: true, permissions: ["dashboard.team", "users.view", "leads.view_all", "leads.assign", "customers.view_all", "quotations.view", "quotations.approve_standard", "reports.view", "followups.manage", "meetings.manage", "sales_channels.view", "inquiries.view_all", "inquiries.create", "inquiries.assign", "inquiries.reassign", "inquiries.change_status", "applications.review", "timeline.view", "reports.channels", "opportunities.view_all", "opportunities.create", "opportunities.update", "opportunities.assign", "opportunities.stage_change", "opportunities.close", "opportunities.reopen", "opportunities.probability_override", "opportunities.bulk", "opportunities.export", "opportunity_activities.manage", "opportunity_tasks.manage", "reports.opportunities", "quotations.view_all", "quotations.create_versions", "quotations.update", "quotations.approve", "quotations.send", "quotations.respond", "quotations.revise", "quotations.bulk", "quotations.export", "quotations.pdf", "reports.quotations"] },
    "Sales Officer": { active: true, permissions: ["dashboard.assigned", "leads.view_assigned", "customers.view_assigned", "crm.update", "quotations.view", "quotations.create", "followups.manage", "meetings.manage", "inquiries.view_assigned", "inquiries.create", "inquiries.change_status", "timeline.view", "opportunities.view_assigned", "opportunities.create", "opportunities.update", "opportunities.stage_change", "opportunities.close", "opportunity_activities.manage", "opportunity_tasks.manage", "quotations.view_assigned", "quotations.create_versions", "quotations.update", "quotations.send", "quotations.respond", "quotations.revise", "quotations.pdf"] },
    "Institutional Sales Officer": { active: true, permissions: ["dashboard.institutional", "institutional.manage", "customers.view_assigned", "quotations.view", "quotations.create", "followups.manage", "meetings.manage", "inquiries.view_assigned", "inquiries.create", "inquiries.change_status", "applications.review", "timeline.view", "opportunities.view_assigned", "opportunities.create", "opportunities.update", "opportunities.stage_change", "opportunities.close", "opportunity_activities.manage", "opportunity_tasks.manage", "reports.opportunities", "quotations.view_assigned", "quotations.create_versions", "quotations.update", "quotations.send", "quotations.respond", "quotations.revise", "quotations.pdf", "reports.quotations"] },
    "Customer Support": { active: true, permissions: ["dashboard.support", "support.manage", "customers.view_assigned", "quotations.view_support"] },
    "Corporate Sales": { active: false, permissions: [] }, "Key Account Manager": { active: false, permissions: [] },
    "Dealer Development": { active: false, permissions: [] }, "Distributor Development": { active: false, permissions: [] },
    "Franchise Development": { active: false, permissions: [] }, "Sales Operations": { active: false, permissions: [] },
    "Sales Analytics": { active: false, permissions: [] },
  };
  roleDefinitions["Sales Manager"]!.permissions.push("commerce.view_all","orders.create_from_quotation","orders.manage_commerce","inventory.allocate","billing.manage","payments.record","commerce.bulk","commerce.export","reports.commerce");
  // Milestone 2 — team-level customer management, same tier as Sales
  // Manager's existing commerce/quotation permissions above. Common-master
  // and employee administration stay Founder-only, matching the existing
  // precedent set by territories.manage/roles.manage (neither granted to
  // Sales Manager either).
  roleDefinitions["Sales Manager"]!.permissions.push("customers.manage");
  roleDefinitions["Sales Officer"]!.permissions.push("commerce.view_assigned","orders.create_from_quotation","orders.manage_commerce","commerce.export");
  roleDefinitions["Institutional Sales Officer"]!.permissions.push("commerce.view_assigned","orders.create_from_quotation","orders.manage_commerce","commerce.export","reports.commerce");
  roleDefinitions["Customer Support"]!.permissions.push("commerce.view_support");
  roleDefinitions["Sales Manager"]!.permissions.push("intelligence.view_all","intelligence.recalculate","segments.manage","loyalty.view_all","loyalty.adjust_rewards","loyalty.manage_membership","loyalty.manage_referrals","analytics.view_team","executive_reports.generate","intelligence.export");
  roleDefinitions["Sales Officer"]!.permissions.push("intelligence.view_assigned","loyalty.view_assigned","analytics.view_assigned");
  roleDefinitions["Institutional Sales Officer"]!.permissions.push("intelligence.view_assigned","loyalty.view_assigned","analytics.view_institutional","intelligence.export");
  roleDefinitions["Customer Support"]!.permissions.push("intelligence.view_support","loyalty.view_support","analytics.view_support");
  roleDefinitions["Founder"]!.permissions.push("ai.conversations.use","ai.conversations.manage","ai.executive.use","ai.knowledge.retrieve","ai.knowledge.manage","ai.workflows.use","ai.workflows.monitor","ai.actions.propose","ai.actions.approve","ai.recommendations.view","ai.prompts.manage","ai.providers.manage","ai.agents.manage","ai.tools.manage","ai.security.manage","ai.operations.view","ai.operations.manage","ai.usage.view_all","ai.export");
  roleDefinitions["Sales Manager"]!.permissions.push("ai.conversations.use","ai.conversations.manage","ai.knowledge.retrieve","ai.workflows.use","ai.workflows.monitor","ai.actions.propose","ai.actions.approve","ai.recommendations.view","ai.usage.view_team","ai.export");
  roleDefinitions["Sales Officer"]!.permissions.push("ai.conversations.use","ai.knowledge.retrieve","ai.workflows.use","ai.actions.propose","ai.recommendations.view","ai.usage.view_own");
  roleDefinitions["Institutional Sales Officer"]!.permissions.push("ai.conversations.use","ai.knowledge.retrieve","ai.workflows.use","ai.actions.propose","ai.recommendations.view","ai.usage.view_own");
  roleDefinitions["Customer Support"]!.permissions.push("ai.conversations.use","ai.knowledge.retrieve","ai.workflows.use","ai.recommendations.view","ai.usage.view_own");
  // Milestone 3 — Institutional Sales OS. Sales Manager gets the full
  // team-level set (view_all + manage + approve); Sales Officer and
  // Institutional Sales Officer get the identical assigned-scope set —
  // this milestone's whole workflow is the institutional motion, so both
  // existing officer-tier roles are genuine, equal users of it, not one
  // role getting a cut-down copy of the other's grant.
  roleDefinitions["Sales Manager"]!.permissions.push("inst_sales.dashboard.manager","inst_sales.leads.view_all","inst_sales.leads.manage","inst_sales.opportunities.view_all","inst_sales.opportunities.manage","inst_sales.visits.manage","inst_sales.samples.manage","inst_sales.followups.manage","inst_sales.quotations.view","inst_sales.quotations.manage","inst_sales.quotations.approve","inst_sales.tasks.manage","inst_sales.planner.manage","inst_sales.expenses.submit","inst_sales.expenses.approve","inst_sales.expenses.view_all","inst_sales.routes.manage","inst_sales.reports.view","inst_sales.targets.manage");
  // "customers.manage" was Milestone 2's Sales-Manager-only grant — added
  // here for the officer tier too, since converting a qualified lead into a
  // real Customer record (Module 2's Lead → Opportunity step) is an
  // everyday action for the Sales Officer who owns that lead, not something
  // that should force a detour through a manager.
  const instOfficerPermissions = ["inst_sales.dashboard.officer","inst_sales.leads.view_assigned","inst_sales.leads.manage","inst_sales.opportunities.view_assigned","inst_sales.opportunities.manage","inst_sales.visits.manage","inst_sales.samples.manage","inst_sales.followups.manage","inst_sales.quotations.view","inst_sales.quotations.manage","inst_sales.tasks.manage","inst_sales.planner.manage","inst_sales.expenses.submit","inst_sales.routes.manage","inst_sales.reports.view","customers.manage"];
  roleDefinitions["Sales Officer"]!.permissions.push(...instOfficerPermissions);
  roleDefinitions["Institutional Sales Officer"]!.permissions.push(...instOfficerPermissions);
  // Milestone 4 — Order Management OS. Sales Manager gets the team-level set
  // (view_all + manage + create_from_quotation); Sales Officer and
  // Institutional Sales Officer get the identical assigned-scope set —
  // matching the exact "both officer tiers are equal users of the
  // institutional workflow" rule already established for Milestone 3 above.
  roleDefinitions["Sales Manager"]!.permissions.push("order_mgmt.view","business_orders.view_all","business_orders.manage","business_orders.create_from_quotation");
  const businessOrderOfficerPermissions = ["order_mgmt.view","business_orders.view_assigned","business_orders.manage","business_orders.create_from_quotation"];
  roleDefinitions["Sales Officer"]!.permissions.push(...businessOrderOfficerPermissions);
  roleDefinitions["Institutional Sales Officer"]!.permissions.push(...businessOrderOfficerPermissions);
  // Milestone 5 — Operations Foundation. No dedicated Operations-tier role
  // is activated this milestone (explicitly deferred, same as Milestone 4)
  // — granted to the same roles that already manage business orders, as a
  // temporary assignment until a real Operations role exists.
  roleDefinitions["Sales Manager"]!.permissions.push("business_ops.view","business_ops.manage");
  roleDefinitions["Sales Officer"]!.permissions.push("business_ops.view","business_ops.manage");
  roleDefinitions["Institutional Sales Officer"]!.permissions.push("business_ops.view","business_ops.manage");
  roleDefinitions["System Administrator"] = { active: true, permissions: ["ai.conversations.use","ai.knowledge.retrieve","ai.knowledge.manage","ai.workflows.monitor","ai.prompts.manage","ai.providers.manage","ai.agents.manage","ai.tools.manage","ai.security.manage","ai.operations.view","ai.operations.manage","ai.usage.view_all","ai.export"] };
  const vendorPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.vendor.")).map(([key]) => key);
  const procurementPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.procurement.")).map(([key]) => key);
  const formulaPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.formula.")).map(([key]) => key);
  const productionPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.production.") || key.startsWith("enterprise.batch.")).map(([key]) => key);
  const qualityPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.quality.")).map(([key]) => key);
  const warehousePermissions = permissionData.filter(([key]) => key.startsWith("enterprise.warehouse.")).map(([key]) => key);
  const planningPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.planning.")).map(([key]) => key);
  const reportingPermissions = permissionData.filter(([key]) => key.startsWith("enterprise.reporting.")).map(([key]) => key);
  roleDefinitions["System Administrator"]!.permissions.push(...vendorPermissions, ...procurementPermissions, ...formulaPermissions, ...productionPermissions, ...qualityPermissions, ...warehousePermissions, ...planningPermissions, ...reportingPermissions);
  // Milestone 7 — Manufacturing (Including Procurement). Approved role list:
  // Founder, Manufacturing Manager, Procurement Officer, Production
  // Supervisor, Quality Inspector, Warehouse Manager. Three of these already
  // existed under different names ("Procurement Manager", "Production
  // Manager", "Quality Manager") with an already-sound permission scope —
  // renamed in place (same grants, same role row) rather than redesigned;
  // "Warehouse Manager" already matched exactly and is untouched.
  // "Manufacturing Manager" is genuinely new: the cross-domain owner sitting
  // above the three specialist roles, so it gets full Formula/BOM authority
  // (create/approve/activate — Production Supervisor only gets .view) and
  // full Planning authority (including .override, unlike Production
  // Supervisor's deliberately narrower grant) plus read-only oversight into
  // Quality/Warehouse/Vendor/Procurement, which stay owned by their own
  // specialist roles.
  roleDefinitions["Manufacturing Manager"] = { active: true, permissions: [...formulaPermissions, ...productionPermissions, "enterprise.quality.view", "enterprise.warehouse.view", ...planningPermissions, "enterprise.vendor.view", "enterprise.procurement.view", ...reportingPermissions] };
  roleDefinitions["Procurement Officer"] = { active: true, permissions: [...vendorPermissions, ...procurementPermissions, ...reportingPermissions] };
  roleDefinitions["Production Supervisor"] = { active: true, permissions: [...formulaPermissions.filter(key => key.endsWith(".view")), ...productionPermissions, "enterprise.quality.view", "enterprise.warehouse.view", ...planningPermissions.filter(key => !key.endsWith(".override")), ...reportingPermissions] };
  roleDefinitions["Quality Inspector"] = { active: true, permissions: [...qualityPermissions, "enterprise.batch.view", "enterprise.production.view", "enterprise.warehouse.view", ...reportingPermissions] };
  roleDefinitions["Warehouse Manager"] = { active: true, permissions: [...warehousePermissions, "enterprise.batch.view", "enterprise.quality.view", "enterprise.procurement.view", ...reportingPermissions] };

  // Milestone 8 — Finance & Accounts (MUV OS). Approved role list: Accountant,
  // Senior Accountant, Accounts Receivable Officer, Collections Officer,
  // Accounts Payable Officer, Treasury/Banking Officer, Cost Accountant,
  // Finance Manager, Finance Controller, Internal Auditor, Founder. Founder
  // needs no explicit grant (bypasses all checks, as everywhere else).
  // Duties-based, not page-visibility-based: each role gets exactly the
  // FINANCE_* keys its real job needs, not a copy of the full set.
  const financeCoreView = ["finance.reports.view", "finance.masters.view"];
  roleDefinitions["Accountant"] = { active: true, permissions: [...financeCoreView, "finance.journals.prepare", "finance.receivables.view", "finance.payables.view", "finance.expenses.manage", "finance.cash.manage"] };
  roleDefinitions["Senior Accountant"] = { active: true, permissions: [...financeCoreView, "finance.journals.prepare", "finance.receivables.view", "finance.receivables.manage", "finance.payables.view", "finance.payables.manage", "finance.expenses.manage", "finance.banking.reconcile", "finance.cash.manage", "finance.creditnotes.manage", "finance.debitnotes.manage"] };
  roleDefinitions["Accounts Receivable Officer"] = { active: true, permissions: [...financeCoreView, "finance.receivables.view", "finance.receivables.manage", "finance.creditnotes.manage", "finance.creditcontrol.manage"] };
  roleDefinitions["Collections Officer"] = { active: true, permissions: [...financeCoreView, "finance.receivables.view", "finance.collections.manage"] };
  roleDefinitions["Accounts Payable Officer"] = { active: true, permissions: [...financeCoreView, "finance.payables.view", "finance.payables.manage", "finance.debitnotes.manage", "finance.payments.prepare"] };
  roleDefinitions["Treasury / Banking Officer"] = { active: true, permissions: [...financeCoreView, "finance.banking.manage", "finance.banking.reconcile", "finance.cash.manage", "finance.payments.prepare"] };
  roleDefinitions["Cost Accountant"] = { active: true, permissions: [...financeCoreView, "finance.costing.view", "finance.costing.manage", "finance.assets.manage"] };
  roleDefinitions["Finance Manager"] = { active: true, permissions: [...financeCoreView, "finance.masters.manage", "finance.journals.approve", "finance.receivables.manage", "finance.payables.manage", "finance.payments.approve", "finance.expenses.approve", "finance.banking.manage", "finance.periods.close", "finance.budgets.manage", "finance.budgets.approve", "finance.assets.manage", "finance.depreciation.post", "finance.creditcontrol.manage", "finance.creditcontrol.override", "finance.approvalmatrix.manage", "finance.eventposting.manage"] };
  roleDefinitions["Finance Controller"] = { active: true, permissions: [...financeCoreView, "finance.masters.manage", "finance.journals.prepare", "finance.journals.approve", "finance.journals.post", "finance.receivables.manage", "finance.payables.manage", "finance.payments.prepare", "finance.payments.approve", "finance.expenses.approve", "finance.banking.manage", "finance.banking.reconcile", "finance.tax.manage", "finance.periods.close", "finance.periods.reopen", "finance.budgets.manage", "finance.budgets.approve", "finance.assets.manage", "finance.depreciation.post", "finance.creditnotes.manage", "finance.debitnotes.manage", "finance.creditcontrol.manage", "finance.creditcontrol.override", "finance.approvalmatrix.manage", "finance.eventposting.manage", "finance.costing.view", "finance.costing.manage"] };
  // Read-only across operational accounting, per the approved requirement
  // ("must remain read-only for operational accounting records except for
  // audit-specific records") — reports + audit management only, no
  // journals/receivables/payables/banking manage/approve grant of any kind.
  roleDefinitions["Internal Auditor"] = { active: true, permissions: [...financeCoreView, "finance.audit.view", "finance.audit.manage"] };

  // Milestone 9 — Customer Support (MUV OS). Approved role list: Support
  // Agent, Senior Support Agent, Support Manager, QA Reviewer, Knowledge
  // Manager, Department Head, Founder. Duties-based grants, same discipline
  // as Milestone 8's Finance roles above. These are new, distinct roles —
  // NOT the pre-existing "Customer Support" role (Milestone 1-era, used as
  // a generic low-privilege test fixture across many integration tests;
  // left untouched, see schema.prisma's Milestone 9 header comment).
  const supportCoreView = ["support.tickets.view_assigned"];
  roleDefinitions["Support Agent"] = { active: true, permissions: [...supportCoreView, "support.tickets.manage"] };
  roleDefinitions["Senior Support Agent"] = { active: true, permissions: [...supportCoreView, "support.tickets.manage", "support.tickets.escalate", "support.templates.manage"] };
  roleDefinitions["Support Manager"] = { active: true, permissions: ["support.tickets.view_all", "support.tickets.manage", "support.tickets.assign", "support.tickets.escalate", "support.tickets.reopen", "support.departments.manage", "support.sla.configure", "support.escalation.configure", "support.refunds.approve", "support.returns.manage", "support.warranty.manage", "support.reports.view"] };
  roleDefinitions["QA Reviewer"] = { active: true, permissions: ["support.tickets.view_all", "support.qa.review", "support.reports.view"] };
  roleDefinitions["Knowledge Manager"] = { active: true, permissions: ["support.kb.author", "support.kb.approve", "support.kb.publish", "support.faq.manage", "support.templates.manage"] };
  roleDefinitions["Department Head"] = { active: true, permissions: ["support.tickets.view_all", "support.tickets.manage", "support.tickets.assign", "support.tickets.escalate", "support.tickets.reopen", "support.refunds.approve", "support.returns.manage", "support.reports.view"] };

  const salesRoleIds: Record<string, string> = {};
  for (const [name, definition] of Object.entries(roleDefinitions)) {
    const role = await prisma.salesRole.upsert({
      where: { name }, update: { active: definition.active },
      create: { name, active: definition.active, description: definition.active ? "MUV Sales Architecture v1 role" : "Reserved for future enterprise expansion" },
    });
    salesRoleIds[name] = role.id;
    await prisma.salesRolePermission.deleteMany({ where: { roleId: role.id } });
    if (definition.permissions.length) {
      await prisma.salesRolePermission.createMany({
        data: definition.permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds[key]! })),
        skipDuplicates: true,
      });
    }
  }
  const customerTypes = [
    ["D2C", "D2C"], ["Institutional", "INSTITUTIONAL"], ["Corporate", "CORPORATE"],
    ["Dealer", "DEALER"], ["Distributor", "DISTRIBUTOR"], ["Franchise", "FRANCHISE"], ["Export", "EXPORT"],
    // Milestone 2 (Customer & Master Data Foundation) — the three requested
    // customer types not already covered by the existing list above. Kept
    // additive: existing codes (D2C, Corporate, Franchise, Export) are
    // untouched since other rows/relations already reference them by id.
    ["Individual", "INDIVIDUAL"], ["Retailer", "RETAILER"], ["Wholesaler", "WHOLESALER"],
  ] as const;
  const customerTypeIds: Record<string, string> = {};
  for (const [name, code] of customerTypes) {
    const row = await prisma.customerType.upsert({ where: { code }, update: {}, create: { name, code } });
    customerTypeIds[code] = row.id;
  }

  // Milestone 2 — Institution Categories ("must be Admin Configurable" —
  // these are the seeded defaults, not a hardcoded list; an admin can add
  // more via actions/master-data.ts's createInstitutionCategory).
  const institutionCategories = [
    "Hotel", "Hospital", "School", "College", "University", "Restaurant", "Cafe", "Laundry",
    "Factory", "Corporate Office", "Government Office", "Society", "Car Wash", "Petrol Pump",
    "Retail Shop", "Other",
  ];
  for (const [index, name] of institutionCategories.entries()) {
    await prisma.institutionCategory.upsert({ where: { name }, update: {}, create: { name, sortOrder: index } });
  }

  // Milestone 2 — minimal starter Common Masters. Small, genuinely useful
  // defaults (not exhaustive) — an admin extends these the same way as
  // Institution Categories, via the Common Masters UI.
  const departments = [
    ["Sales", "SALES"], ["Warehouse", "WAREHOUSE"], ["Procurement", "PROCUREMENT"],
    ["Production", "PRODUCTION"], ["Finance", "FINANCE"], ["HR", "HR"], ["Administration", "ADMIN"],
  ] as const;
  for (const [name, code] of departments) {
    await prisma.department.upsert({ where: { code }, update: {}, create: { name, code } });
  }

  const units = [
    ["Piece", "PCS"], ["Litre", "LTR"], ["Kilogram", "KG"], ["Box", "BOX"], ["Carton", "CTN"],
  ] as const;
  for (const [name, code] of units) {
    await prisma.unit.upsert({ where: { code }, update: {}, create: { name, code } });
  }

  const paymentTermsDefaults = [
    { name: "Advance", days: 0, description: "Payment before dispatch" },
    { name: "Cash on Delivery", days: 0, description: "Payment on delivery" },
    { name: "Net 15", days: 15, description: "Due within 15 days of invoice" },
    { name: "Net 30", days: 30, description: "Due within 30 days of invoice" },
    { name: "Net 45", days: 45, description: "Due within 45 days of invoice" },
    { name: "Net 60", days: 60, description: "Due within 60 days of invoice" },
  ];
  for (const term of paymentTermsDefaults) {
    await prisma.paymentTerms.upsert({ where: { name: term.name }, update: {}, create: term });
  }
  console.log(`  Milestone 2: ${customerTypes.length} customer types, ${institutionCategories.length} institution categories, ${departments.length} departments, ${units.length} units, ${paymentTermsDefaults.length} payment terms`);
  const channels = [
    ["D2C Website", "D2C_WEBSITE", true, true], ["Institutional Sales", "INSTITUTIONAL_SALES", true, true],
    ["Corporate Inquiry", "CORPORATE_INQUIRY", true, true], ["Bulk Order", "BULK_ORDER", true, true],
    ["Quotation Request", "QUOTATION_REQUEST", true, true], ["Sample Request", "SAMPLE_REQUEST", true, true],
    ["Contact Sales", "CONTACT_SALES", true, true], ["Dealer Application", "DEALER_APPLICATION", true, true],
    ["Distributor Application", "DISTRIBUTOR_APPLICATION", true, true], ["Franchise Inquiry", "FRANCHISE_INQUIRY", true, true],
    ["Export", "EXPORT", false, false], ["Marketplace", "MARKETPLACE", false, false],
    ["Government Sales", "GOVERNMENT_SALES", false, false], ["Dealer Portal", "DEALER_PORTAL", false, false],
    ["Distributor Portal", "DISTRIBUTOR_PORTAL", false, false], ["Franchise Portal", "FRANCHISE_PORTAL", false, false],
    ["Corporate Contracts", "CORPORATE_CONTRACTS", false, false], ["International Distribution", "INTERNATIONAL_DISTRIBUTION", false, false],
  ] as const;
  const channelIds: Record<string, string> = {};
  const channelOwnerRole: Record<string, string> = {
    INSTITUTIONAL_SALES: "Institutional Sales Officer", SAMPLE_REQUEST: "Institutional Sales Officer",
    BULK_ORDER: "Institutional Sales Officer", QUOTATION_REQUEST: "Sales Officer",
    CORPORATE_INQUIRY: "Sales Manager", DEALER_APPLICATION: "Sales Manager",
    DISTRIBUTOR_APPLICATION: "Sales Manager", FRANCHISE_INQUIRY: "Sales Manager",
    CONTACT_SALES: "Sales Officer",
  };
  for (const [i, channel] of channels.entries()) {
    const [name, code, active, publicVisibility] = channel;
    const row = await prisma.salesChannel.upsert({
      where: { code }, update: {},
      create: { name, code, active, publicVisibility, displayOrder: i, defaultOwnerRoleId: channelOwnerRole[code] ? salesRoleIds[channelOwnerRole[code]] : null },
    });
    channelIds[code] = row.id;
    if (!row.defaultOwnerRoleId && channelOwnerRole[code]) {
      await prisma.salesChannel.update({ where: { id: row.id }, data: { defaultOwnerRoleId: salesRoleIds[channelOwnerRole[code]] } });
    }
  }
  const sources = ["Website", "Referral", "Phone", "Email", "Sales Visit", "Walk In", "Advertisement", "Existing Customer", "Manual Entry", "QR", "Trade Show"] as const;
  for (const name of sources) {
    const code = name.toUpperCase().replaceAll(" ", "_");
    await prisma.leadSource.upsert({ where: { code }, update: {}, create: { name, code } });
  }
  const queues = [
    ["General Sales Queue", "GENERAL", "CONTACT_SALES"], ["Institutional Queue", "INSTITUTIONAL", "INSTITUTIONAL_SALES"],
    ["Corporate Queue", "CORPORATE", "CORPORATE_INQUIRY"], ["Dealer Queue", "DEALER", "DEALER_APPLICATION"],
    ["Distributor Queue", "DISTRIBUTOR", "DISTRIBUTOR_APPLICATION"], ["Franchise Queue", "FRANCHISE", "FRANCHISE_INQUIRY"],
    ["Quotation Queue", "QUOTATION", "QUOTATION_REQUEST"], ["Sample Queue", "SAMPLE", "SAMPLE_REQUEST"],
  ] as const;
  for (const [name, code, channelCode] of queues) {
    const queue = await prisma.assignmentQueue.upsert({
      where: { code }, update: {},
      create: { name, code, channelId: channelIds[channelCode] },
    });
    await prisma.salesChannel.updateMany({
      where: { id: channelIds[channelCode], defaultAssignmentQueueId: null },
      data: { defaultAssignmentQueueId: queue.id },
    });
  }
  const institutionalQueue = await prisma.assignmentQueue.findUniqueOrThrow({ where: { code: "INSTITUTIONAL" } });
  await prisma.salesChannel.updateMany({
    where: { code: "BULK_ORDER", defaultAssignmentQueueId: null },
    data: { defaultAssignmentQueueId: institutionalQueue.id },
  });
  const inquiryStatuses = ["NEW", "ASSIGNMENT_PENDING", "ASSIGNED", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "IN_PROGRESS", "CONVERTED", "CLOSED_WON", "CLOSED_LOST", "SPAM", "DUPLICATE"] as const;
  for (const [i, code] of inquiryStatuses.entries()) {
    await prisma.salesInquiryStatus.upsert({ where: { code }, update: {}, create: { code, displayName: code.replaceAll("_", " "), displayOrder: i, terminal: code.startsWith("CLOSED") || ["SPAM", "DUPLICATE", "UNQUALIFIED"].includes(code) } });
  }
  const statusRows = await prisma.salesInquiryStatus.findMany({ select: { id: true, code: true } });
  const statusId = Object.fromEntries(statusRows.map((row) => [row.code, row.id]));
  const transitions: Record<string, string[]> = {
    NEW: ["ASSIGNMENT_PENDING", "ASSIGNED", "SPAM", "DUPLICATE"],
    ASSIGNMENT_PENDING: ["ASSIGNED", "SPAM", "DUPLICATE"],
    ASSIGNED: ["CONTACT_ATTEMPTED", "CONTACTED", "IN_PROGRESS", "SPAM", "DUPLICATE"],
    CONTACT_ATTEMPTED: ["CONTACTED", "IN_PROGRESS", "CLOSED_LOST"],
    CONTACTED: ["QUALIFIED", "UNQUALIFIED", "IN_PROGRESS"],
    QUALIFIED: ["IN_PROGRESS", "CONVERTED", "CLOSED_WON", "CLOSED_LOST"],
    IN_PROGRESS: ["CONVERTED", "CLOSED_WON", "CLOSED_LOST"],
    CONVERTED: ["CLOSED_WON", "CLOSED_LOST"],
  };
  for (const [from, targets] of Object.entries(transitions)) {
    for (const to of targets) {
      await prisma.salesInquiryStatusTransition.upsert({
        where: { fromStatusId_toStatusId: { fromStatusId: statusId[from]!, toStatusId: statusId[to]! } },
        update: {}, create: { fromStatusId: statusId[from]!, toStatusId: statusId[to]! },
      });
    }
  }
  const applicationStatuses = ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "VERIFIED", "APPROVED", "REJECTED", "ON_HOLD", "WITHDRAWN"] as const;
  for (const [i, code] of applicationStatuses.entries()) {
    await prisma.salesApplicationStatus.upsert({ where: { code }, update: {}, create: { code, displayName: code.replaceAll("_", " "), displayOrder: i, terminal: ["APPROVED", "REJECTED", "WITHDRAWN"].includes(code) } });
  }
  console.log(`  Phase 2: ${channels.length} channels, ${customerTypes.length} customer types, ${sources.length} lead sources, ${queues.length} queues`);
  const opportunityStages = [
    ["NEW", 10, false, false], ["QUALIFIED", 20, false, false],
    ["DISCOVERY", 35, false, false], ["PROPOSAL", 50, false, false],
    ["NEGOTIATION", 70, false, false], ["VERBAL_COMMITMENT", 90, false, false],
    ["WON", 100, true, true], ["LOST", 0, true, false], ["ON_HOLD", 25, false, false],
  ] as const;
  for (const [i, [code, probabilityDefault, isClosed, isWon]] of opportunityStages.entries()) {
    await prisma.opportunityStage.upsert({
      where: { code }, update: {},
      create: { code, name: code.replaceAll("_", " "), displayOrder: i, probabilityDefault, isClosed, isWon },
    });
  }
  const opportunityStageRows = await prisma.opportunityStage.findMany({ select: { id: true, code: true } });
  const opportunityStageId = Object.fromEntries(opportunityStageRows.map((row) => [row.code, row.id]));
  const opportunityTransitions: Record<string, string[]> = {
    NEW: ["QUALIFIED", "ON_HOLD"], QUALIFIED: ["NEW", "DISCOVERY", "ON_HOLD"],
    DISCOVERY: ["QUALIFIED", "PROPOSAL", "ON_HOLD"], PROPOSAL: ["DISCOVERY", "NEGOTIATION", "ON_HOLD"],
    NEGOTIATION: ["PROPOSAL", "VERBAL_COMMITMENT", "WON", "LOST", "ON_HOLD"],
    VERBAL_COMMITMENT: ["NEGOTIATION", "WON", "LOST", "ON_HOLD"],
    ON_HOLD: ["NEW", "QUALIFIED", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "VERBAL_COMMITMENT", "LOST"],
  };
  for (const [from, targets] of Object.entries(opportunityTransitions)) {
    for (const to of targets) {
      await prisma.opportunityStageTransition.upsert({
        where: { fromStageId_toStageId: { fromStageId: opportunityStageId[from]!, toStageId: opportunityStageId[to]! } },
        update: {}, create: { fromStageId: opportunityStageId[from]!, toStageId: opportunityStageId[to]! },
      });
    }
  }
  for (const [i, code] of ["PRICE", "COMPETITOR", "NO_BUDGET", "NO_RESPONSE", "PROJECT_DELAYED", "REQUIREMENTS_CHANGED", "OTHER"].entries()) {
    await prisma.opportunityLostReason.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll("_", " "), displayOrder: i } });
  }
  for (const [i, code] of ["PRODUCT_QUALITY", "PRICE", "SERVICE", "RELATIONSHIP", "BRAND", "OTHER"].entries()) {
    await prisma.opportunityWonReason.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll("_", " "), displayOrder: i } });
  }
  for (const code of ["CALL", "MEETING", "SITE_VISIT", "PRODUCT_DEMO", "EMAIL", "WHATSAPP", "INTERNAL_DISCUSSION", "OTHER"]) {
    await prisma.opportunityActivityType.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll("_", " ") } });
  }
  for (const code of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"]) {
    await prisma.opportunityActivityStatus.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll("_", " ") } });
    await prisma.opportunityTaskStatus.upsert({ where: { code: code === "PLANNED" ? "OPEN" : code }, update: {}, create: { code: code === "PLANNED" ? "OPEN" : code, name: (code === "PLANNED" ? "OPEN" : code).replaceAll("_", " ") } });
  }
  for (const code of ["FOLLOW_UP", "PHONE_CALL", "MEETING", "SITE_VISIT", "PROPOSAL", "NEGOTIATION", "DOCUMENT_REQUEST", "PAYMENT_FOLLOWUP", "OTHER"]) {
    await prisma.opportunityTaskType.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll("_", " ") } });
  }
  const taskTypeRows = await prisma.opportunityTaskType.findMany({ select: { id: true, code: true } });
  const taskTypeId = Object.fromEntries(taskTypeRows.map((row) => [row.code, row.id]));
  for (const rule of [
    ["OPPORTUNITY_CREATED", "FOLLOW_UP", "Initial opportunity follow-up", 1440],
    ["STAGE_ADVANCED", "FOLLOW_UP", "Follow up after stage advancement", 1440],
    ["ACTIVITY_COMPLETED", "FOLLOW_UP", "Activity follow-up", 1440],
    ["EXPECTED_CLOSE_APPROACHING", "FOLLOW_UP", "Expected close follow-up", 0],
    ["OPPORTUNITY_REOPENED", "FOLLOW_UP", "Reopened opportunity follow-up", 60],
  ] as const) {
    await prisma.opportunityTaskRule.upsert({
      where: { triggerEvent_taskTypeId: { triggerEvent: rule[0], taskTypeId: taskTypeId[rule[1]]! } },
      update: {}, create: { triggerEvent: rule[0], taskTypeId: taskTypeId[rule[1]]!, titleTemplate: rule[2], dueOffsetMinutes: rule[3] },
    });
  }
  for (const [weight, code] of ["LOW", "NORMAL", "HIGH", "URGENT"].entries()) {
    await prisma.opportunityPriority.upsert({ where: { code }, update: {}, create: { code, name: code, weight } });
  }
  console.log("  Phase 3: opportunity stages, activities, tasks, reasons, priorities, and permissions");
  const quotationStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"] as const;
  for (const [displayOrder, code] of quotationStatuses.entries()) {
    await prisma.quotationStatus.upsert({ where: { code }, update: {}, create: {
      code, name: code.replaceAll("_", " "), displayOrder, terminal: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"].includes(code),
    } });
  }
  const quotationStatusRows = await prisma.quotationStatus.findMany({ select: { id: true, code: true } });
  const quotationStatusId = Object.fromEntries(quotationStatusRows.map((row) => [row.code, row.id]));
  const quotationTransitions: Record<string, string[]> = {
    DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"], PENDING_APPROVAL: ["APPROVED", "REJECTED"],
    APPROVED: ["SENT"], SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"],
    VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED"],
  };
  for (const [from, targets] of Object.entries(quotationTransitions)) for (const to of targets) {
    await prisma.quotationStatusTransition.upsert({
      where: { fromStatusId_toStatusId: { fromStatusId: quotationStatusId[from]!, toStatusId: quotationStatusId[to]! } },
      update: {}, create: { fromStatusId: quotationStatusId[from]!, toStatusId: quotationStatusId[to]! },
    });
  }
  for (const [code, discount] of [["RETAIL", 0], ["DEALER", 10], ["DISTRIBUTOR", 15], ["INSTITUTIONAL", 8], ["CORPORATE", 8], ["FRANCHISE", 12]] as const) {
    await prisma.pricingPolicy.upsert({ where: { code }, update: {}, create: { code, name: code, defaultDiscount: discount, approvalThreshold: 15 } });
  }
  for (const rate of [0, 5, 12, 18, 28]) for (const inclusive of [false, true]) {
    const code = `GST_${rate}_${inclusive ? "INCLUSIVE" : "EXCLUSIVE"}`;
    await prisma.taxConfiguration.upsert({ where: { code }, update: {}, create: { code, name: `GST ${rate}% ${inclusive ? "Inclusive" : "Exclusive"}`, rate, inclusive } });
  }
  for (const rule of [
    { code: "NO_APPROVAL", name: "No Approval Required", approvalType: "NONE", discountThreshold: 0, levels: 0 },
    { code: "STANDARD_APPROVAL", name: "Single Approval", approvalType: "SINGLE", discountThreshold: 10, levels: 1 },
    { code: "MULTI_LEVEL_RESERVED", name: "Multi-Level Approval", approvalType: "MULTI_LEVEL", discountThreshold: 20, levels: 2 },
  ]) await prisma.quotationApprovalRule.upsert({ where: { code: rule.code }, update: {}, create: rule });
  console.log("  Phase 4: quotation statuses, transitions, pricing policies, taxes, approval rules, and permissions");
  const commerceStatuses = ["CREATED","CONFIRMED","INVENTORY_ALLOCATED","PICKING","PACKING","READY_FOR_DISPATCH","DISPATCHED","IN_TRANSIT","DELIVERED","COMPLETED","CANCELLED","RETURNED"] as const;
  for (const [displayOrder,code] of commerceStatuses.entries()) await prisma.commerceOrderStatus.upsert({where:{code},update:{},create:{code,name:code.replaceAll("_"," "),displayOrder,terminal:["COMPLETED","CANCELLED","RETURNED"].includes(code)}});
  const commerceStatusRows=await prisma.commerceOrderStatus.findMany({select:{id:true,code:true}}),commerceStatusId=Object.fromEntries(commerceStatusRows.map(x=>[x.code,x.id]));
  const commerceTransitions:Record<string,string[]>={CREATED:["CONFIRMED","CANCELLED"],CONFIRMED:["INVENTORY_ALLOCATED","CANCELLED"],INVENTORY_ALLOCATED:["PICKING"],PICKING:["PACKING"],PACKING:["READY_FOR_DISPATCH"],READY_FOR_DISPATCH:["DISPATCHED"],DISPATCHED:["IN_TRANSIT","RETURNED"],IN_TRANSIT:["DELIVERED"],DELIVERED:["COMPLETED"]};
  for(const[from,targets]of Object.entries(commerceTransitions))for(const to of targets)await prisma.commerceOrderStatusTransition.upsert({where:{fromStatusId_toStatusId:{fromStatusId:commerceStatusId[from]!,toStatusId:commerceStatusId[to]!}},update:{},create:{fromStatusId:commerceStatusId[from]!,toStatusId:commerceStatusId[to]!}});
  await prisma.warehouse.upsert({where:{code:"MAIN"},update:{},create:{code:"MAIN",name:"MUV Main Warehouse",address:"Primary warehouse"}});
  for(const code of ["CASH","BANK_TRANSFER","UPI","CARD","CHEQUE"])await prisma.commercePaymentMethod.upsert({where:{code},update:{},create:{code,name:code.replaceAll("_"," ")}});
  for(const [code,name]of [["MANUAL","Manual Dispatch"],["SHIPROCKET","Shiprocket"],["DELHIVERY","Delhivery"],["BLUEDART","Blue Dart"],["DTDC","DTDC"]]as const)await prisma.commerceCarrier.upsert({where:{code},update:{},create:{code,name}});
  console.log("  Phase 5: order statuses, warehouse, payment methods, carriers, and permissions");
  const statusDefinitions = [
    ["NEW","New",{maxCompletedOrders:1,recentDays:30}],["ACTIVE","Active",{maxDaysSincePurchase:90}],
    ["REPEAT","Repeat",{minCompletedOrders:2}],["INACTIVE","Inactive",{minDaysSincePurchase:91}],
    ["DORMANT","Dormant",{minDaysSincePurchase:365}],["AT_RISK","At Risk",{minCompletedOrders:2,minDaysSincePurchase:120}],
    ["REACTIVATED","Reactivated",{reactivatedAfterDays:120}],
  ] as const;
  for(const [code,name,rule] of statusDefinitions) await prisma.customerStatusDefinition.upsert({where:{code},update:{},create:{code,name,rule}});
  const segments = ["NEW_CUSTOMER","ACTIVE_CUSTOMER","REPEAT_CUSTOMER","HIGH_VALUE_CUSTOMER","LOW_FREQUENCY_CUSTOMER","INACTIVE_CUSTOMER","DORMANT_CUSTOMER","AT_RISK_CUSTOMER","REACTIVATED_CUSTOMER","INSTITUTIONAL_CUSTOMER","RETAIL_CUSTOMER","WHOLESALE_CUSTOMER","DISTRIBUTOR","HOSPITALITY","HEALTHCARE"];
  for(const code of segments) await prisma.customerSegment.upsert({where:{code},update:{},create:{code,name:code.replaceAll("_"," "),rule:{type:"STATUS_OR_CLASSIFICATION",code}}});
  for(const [displayOrder,code] of ["STANDARD","SILVER","GOLD","PLATINUM"].entries()) await prisma.membershipLevel.upsert({where:{code},update:{},create:{code,name:code,displayOrder,rule:{minimumLifetimeRevenue:displayOrder*50000}}});
  for(const code of ["EARNED","REDEEMED","ADJUSTED","EXPIRED","REFERRAL_BONUS","WELCOME_BONUS","MANUAL_CREDIT","MANUAL_DEBIT"]) await prisma.rewardTransactionType.upsert({where:{code},update:{},create:{code,name:code.replaceAll("_"," "),direction:["REDEEMED","EXPIRED","MANUAL_DEBIT"].includes(code)?-1:1}});
  for(const [displayOrder,code] of ["CREATED","INVITED","REGISTERED","QUALIFIED","COMPLETED","CANCELLED","REJECTED"].entries()) await prisma.referralStatusDefinition.upsert({where:{code},update:{},create:{code,name:code,displayOrder,terminal:["COMPLETED","CANCELLED","REJECTED"].includes(code)}});
  const kpis = ["GROSS_REVENUE","NET_REVENUE","COLLECTED_REVENUE","OUTSTANDING_REVENUE","TOTAL_ORDERS","COMPLETED_ORDERS","CANCELLED_ORDERS","AVERAGE_ORDER_VALUE","CUSTOMER_LIFETIME_VALUE","REPEAT_PURCHASE_RATE","COLLECTION_RATE","QUOTATION_CONVERSION","OPPORTUNITY_CONVERSION","SALES_OFFICER_PERFORMANCE","TERRITORY_PERFORMANCE","SALES_CHANNEL_PERFORMANCE","PRODUCT_PERFORMANCE"];
  for(const code of kpis) await prisma.kpiDefinition.upsert({where:{code},update:{},create:{code,name:code.replaceAll("_"," "),module:"PHASE_6",formula:{service:"central-kpi",metric:code}}});
  for(const code of ["DAILY","WEEKLY","MONTHLY","QUARTERLY","YEARLY","CUSTOM","ORGANIZATION","SALES","CUSTOMER_GROWTH","COMMERCE","LOYALTY","WAREHOUSE","COLLECTION","OUTSTANDING"]) await prisma.executiveReportTemplate.upsert({where:{code},update:{},create:{code,name:`${code.replaceAll("_"," ")} SUMMARY`,periodType:code,configuration:{sections:["summary","kpis","comparison","breakdowns","tables"]}}});
  for(const [key,value] of [
    ["STATUS_THRESHOLDS",{activeDays:90,inactiveDays:91,dormantDays:365,atRiskDays:120}],
    ["LOYALTY_ENABLED",{customerFacing:false,automaticExpiration:false}],
    ["REWARD_EXPIRATION_POLICY",{enabled:false,days:365}],
    ["ANALYTICS_REFRESH",{eventDriven:true,scheduledExtension:false}],
    ["MUV_AI_INTEGRATION",{enabled:false,reserved:true}],
  ] as const) await prisma.phase6Configuration.upsert({where:{key},update:{},create:{key,value}});
  console.log("  Phase 6: intelligence, loyalty, KPI, reporting, configuration, and permissions");
  const aiConfigs = [
    ["AI_PLATFORM_ENABLED","FEATURE_FLAG",{enabled:true}],["LIVE_PROVIDER_INVOCATION","FEATURE_FLAG",{enabled:false}],
    ["AI_ACTION_EXECUTION","FEATURE_FLAG",{enabled:false}],["AI_HIGH_RISK_ACTIONS","FEATURE_FLAG",{enabled:false}],
    ["AI_SCHEDULED_WORKFLOWS","FEATURE_FLAG",{enabled:false}],["AI_EVENT_WORKFLOWS","FEATURE_FLAG",{enabled:false}],
    ["AI_EXTERNAL_KNOWLEDGE","FEATURE_FLAG",{enabled:false}],["AI_STREAMING","FEATURE_FLAG",{enabled:false}],
    ["AI_KNOWLEDGE_RETRIEVAL","FEATURE_FLAG",{enabled:true}],["AI_KILL_SWITCH","SECURITY",{enabled:false}],
    ["SESSION_POLICY","RETENTION",{timeoutMinutes:30,retentionDays:30}],["CONVERSATION_POLICY","RETENTION",{retentionDays:365,maxMessages:500}],
    ["RATE_LIMIT_POLICY","OPERATIONS",{perUserPerMinute:20,perConversationPerMinute:10}],["BUDGET_POLICY","OPERATIONS",{dailyWarning:10,dailyHardLimit:25}],
    ["CIRCUIT_BREAKER_POLICY","OPERATIONS",{failureThreshold:5,resetSeconds:60}],["DATA_CLASSIFICATIONS","SECURITY",{levels:["PUBLIC","INTERNAL","CONFIDENTIAL","RESTRICTED","HIGHLY_RESTRICTED"]}],
    ["PROMPT_INJECTION_POLICY","SECURITY",{enabled:true,block:true}],["DEFAULT_LANGUAGE","PERSONALIZATION",{language:"en"}],
  ] as const;
  for(const [key,category,value] of aiConfigs) await prisma.aiConfiguration.upsert({where:{organizationKey_key:{organizationKey:"MUV",key}},update:{},create:{organizationKey:"MUV",key,category,value}});
  // Milestone 7 — Manufacturing (Including Procurement). These ten flags
  // gate the exact domain this milestone activates — flipped to enabled
  // per "proceed with implementation" (the architecture doc flagged this as
  // needing explicit sign-off; approving the architecture and instructing
  // implementation to proceed is that sign-off). ENTERPRISE_AI_EXTENSIONS_ENABLED
  // stays disabled — AI automation is explicitly out of this milestone's scope.
  // Note: this array's upsert is create-only (update:{}), so changing these
  // values only affects a fresh environment seeding for the first time; the
  // already-seeded rows in this dev database were flipped via a one-time
  // direct update, not by re-running this seed (see the Milestone 7 report).
  const enterpriseConfigs = [
    ["ENTERPRISE_OPERATIONS_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_VENDOR_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_PROCUREMENT_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_MANUFACTURING_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_FORMULA_BOM_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_BATCH_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_QUALITY_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_WAREHOUSE_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_PLANNING_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_REPORTING_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_AI_EXTENSIONS_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_PROCUREMENT_POLICY","ENTERPRISE_POLICY",{activeVendorRequired:true,incomingQcRequired:true}],
    ["ENTERPRISE_PRODUCTION_POLICY","ENTERPRISE_POLICY",{activeFormulaRequired:true,materialAvailabilityRequired:true}],
    ["ENTERPRISE_QUALITY_POLICY","ENTERPRISE_POLICY",{releaseRequiresQualityRole:true,overrideRequiresReason:true}],
    ["ENTERPRISE_PLANNING_POLICY","ENTERPRISE_POLICY",{calculationVersion:"DETERMINISTIC_V1"}],
    ["ENTERPRISE_BUSINESS_NETWORK_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_PARTNER_PORTAL_ENABLED","FEATURE_FLAG",{enabled:false}],
    // Milestone 8 — Finance & Accounts (MUV OS). Activated per "proceed with
    // implementation" (same basis as Milestone 7's activation). Tax
    // compliance stays disabled — statutory filing is explicitly out of
    // this milestone's scope, only the structural framework was built.
    ["ENTERPRISE_FINANCE_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_FINANCIAL_POSTING_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_BANKING_RECONCILIATION_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_TAX_COMPLIANCE_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_FINANCIAL_REPORTING_ENABLED","FEATURE_FLAG",{enabled:true}],
    ["ENTERPRISE_FOUNDER_OS_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_FOUNDER_AI_INTELLIGENCE_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED","FEATURE_FLAG",{enabled:false}],
    ["ENTERPRISE_PHASE2_WORKFLOW_SUBJECTS","WORKFLOW_REGISTRY",{subjects:["PARTNER_ONBOARDING","AGREEMENT","COMMERCIAL_POLICY","ROYALTY","COMMISSION","CLAIM","MANUAL_JOURNAL","EXPENSE","PAYMENT","PERIOD_REOPENING","TAX_ADJUSTMENT","BUDGET","STRATEGIC_DECISION"],version:1}],
    ["ENTERPRISE_PHASE2_NOTIFICATION_EVENTS","NOTIFICATION_REGISTRY",{events:["PARTNER_ONBOARDING_STATUS","AGREEMENT_STATUS","ROYALTY_STATUS","COMMISSION_STATUS","CLAIM_STATUS","PAYMENT_DUE","RECEIVABLE_OVERDUE","PAYABLE_OVERDUE","PERIOD_CLOSE_TASK","RECONCILIATION_EXCEPTION","EXECUTIVE_ALERT","STRATEGIC_DECISION_REVIEW","AI_EXECUTIVE_BRIEFING"],version:1}],
    // Milestone 9 — Customer Support (MUV OS). Activated per "proceed with
    // implementation" (same basis as Milestones 7/8's activation).
    ["ENTERPRISE_SUPPORT_ENABLED","FEATURE_FLAG",{enabled:true}],
    // MUV AI Engineering Execution — Sprint 2. Activated per the Founder's
    // explicit implementation directive (same basis as every prior
    // milestone's activation this session).
    ["ENTERPRISE_KNOWLEDGE_FACTORY_ENABLED","FEATURE_FLAG",{enabled:true}],
  ] as const;

  // MUV AI Engineering Execution — Sprint 4 (Governance). The fixed, small,
  // Founder-approved list of change categories where even the Founder's own
  // self-approval is not sufficient — EIOS §7.2's precise, non-blanket rule.
  for (const [category, description] of [
    ["SAFETY_CRITICAL", "Any change to safety information, exclusion rules, or escalation requirements for a product or problem"],
    ["LEGAL", "Any change with legal or regulatory implication"],
    ["RECALL", "Declaring, expanding, or closing a product recall"],
    ["FINANCIAL", "Any change with direct financial/pricing-policy implication (not routine MRP updates, which bypass the Knowledge Factory entirely)"],
    ["REGULATED", "Any change to a compliance-tracked requirement or its evidence"],
  ] as const) {
    await prisma.hardMakerCheckerCategory.upsert({
      where: { organizationKey_category: { organizationKey: "MUV", category } },
      update: { description },
      create: { organizationKey: "MUV", category, description, active: true },
    });
  }
  console.log("  5 Hard Maker-Checker categories (Knowledge Factory governance)");
  for(const [key,category,value] of enterpriseConfigs) await prisma.aiConfiguration.upsert({where:{organizationKey_key:{organizationKey:"MUV",key}},update:{},create:{organizationKey:"MUV",key,category,value}});
  const providers = [
    {code:"MOCK",name:"Deterministic Test Provider",status:"ACTIVE",priority:1,capabilities:["structured_output","tool_calling"],maximumContext:32000,structuredOutput:true,toolCallingSupport:true,dataPolicy:{classifications:["PUBLIC","INTERNAL"],trainingOptOut:true}},
    {code:"OPENAI_RESERVED",name:"OpenAI (Reserved)",status:"DISABLED",priority:10,capabilities:["text","structured_output","tool_calling"],maximumContext:0,structuredOutput:true,toolCallingSupport:true,dataPolicy:{credentials:"server-only",configured:false}},
  ];
  for(const row of providers) await prisma.aiProvider.upsert({where:{code:row.code},update:{},create:row});
  const mockProvider=await prisma.aiProvider.findUniqueOrThrow({where:{code:"MOCK"}});
  await prisma.aiModelDefinition.upsert({where:{code:"DETERMINISTIC_MOCK_V1"},update:{},create:{code:"DETERMINISTIC_MOCK_V1",providerId:mockProvider.id,version:"1",purpose:"Deterministic automated testing",status:"ACTIVE",capabilities:["structured_output"],maximumTokens:4096}});
  const tools = [
    ["CUSTOMER_LOOKUP","Customer Lookup","READ","customers.view_assigned"],["ORDER_LOOKUP","Order Lookup","READ","commerce.view_assigned"],
    ["PRODUCT_LOOKUP","Product Lookup","READ",null],["KNOWLEDGE_SEARCH","Knowledge Search","KNOWLEDGE","ai.knowledge.retrieve"],
    // Sprint 13 (Sales AI) fix: these four were seeded against the LEGACY
    // permission namespace (followups.manage/quotations.create/reports.view/
    // executive_reports.generate — real keys, but gating a different,
    // legacy SalesInquiry/general-Quotation/general-report domain), while
    // their adapters (lib/muv-ai/tools.ts) call the real Institutional
    // Sales OS functions, which independently require inst_sales.* keys.
    // Left as-is, these tools would have been unreachable for the
    // Institutional Sales Officers they're actually meant for — found and
    // fixed before it ever shipped broken, not after.
    ["REPORT_LOOKUP","Report Lookup","REPORTING","inst_sales.reports.view"],["CUSTOMER_INTELLIGENCE","Customer Intelligence","ANALYTICS","intelligence.view_assigned"],
    ["EXECUTIVE_REPORT","Generate Executive Report","REPORTING","inst_sales.reports.view"],["CREATE_FOLLOWUP","Create Follow-up","ACTION","inst_sales.followups.manage"],
    ["CREATE_DRAFT_QUOTATION","Create Draft Quotation","ACTION","inst_sales.quotations.manage"],["REQUEST_APPROVAL","Request Approval","WORKFLOW","ai.actions.propose"],
    // Sprint 12 (Support AI) — requiredPermission here is invokeTool's own
    // gate; lib/support/ticket-service.ts's listSupportTickets/
    // createSupportTicket enforce their own requireSupportPrincipal check
    // independently underneath, same "every layer authorizes itself" rule
    // as everywhere else in this codebase.
    ["SUPPORT_TICKET_LOOKUP","Support Ticket Lookup","READ","support.tickets.view_assigned"],["CREATE_SUPPORT_TICKET","Create Support Ticket","ACTION","support.tickets.manage"],
    // Sprint 13 (Sales AI) — new tools.
    ["OPPORTUNITY_LOOKUP","Opportunity Lookup","READ","inst_sales.opportunities.view_assigned"],["SALES_INTELLIGENCE_LOOKUP","Sales Intelligence Lookup","ANALYTICS","inst_sales.opportunities.view_assigned"],
    // Sprint 14 (Founder AI) — new tools. AI_PLATFORM_HEALTH_LOOKUP's real
    // gate is requireStaff() inside the adapter itself (lib/muv-ai/tools.ts
    // — Module 9 doesn't self-authorize, unlike Founder OS); this
    // requiredPermission is a real, meaningful outer invokeTool gate on top
    // of that, reusing the same permission the pre-existing OPERATIONS
    // agent already requires, not a new one invented for this tool alone.
    ["FOUNDER_DASHBOARD_LOOKUP","Founder Dashboard Lookup","ANALYTICS","founder_os.access"],["FOUNDER_DECISION_QUEUE_LOOKUP","Founder Decision Queue Lookup","ANALYTICS","founder_os.access"],
    ["AI_PLATFORM_HEALTH_LOOKUP","AI Platform Health Lookup","REPORTING","ai.operations.view"],
  ] as const;
  // Sprint 13 fix: requiredPermission is now also in `update` (was `{}`) so
  // the corrected inst_sales.* strings actually backfill onto rows this
  // dev database already seeded with the old, wrong-namespace values in
  // earlier sprints — matching the same precedent already established for
  // AiAgentDefinition.personalityProfile (Sprint 9) and .allowedTools
  // (Sprint 12): a field whose *default* is being corrected mid-project
  // gets backfilled, unlike founder-customizable fields this file
  // deliberately never touches on reseed.
  for(const [code,name,category,requiredPermission] of tools) await prisma.aiToolDefinition.upsert({where:{code},update:{requiredPermission},create:{code,name,description:name,category,requiredPermission,inputSchema:{type:"object"},outputSchema:{type:"object"},auditCategory:"AI_TOOL",status:"ACTIVE"}});
  for (const [code,name,requiredPermission] of [
    ["ENTERPRISE_VENDOR_INSIGHTS","Vendor Insights","enterprise.vendor.view"],
    ["ENTERPRISE_PROCUREMENT_ASSISTANT","Procurement Assistant","enterprise.procurement.view"],
    ["ENTERPRISE_PRODUCTION_ASSISTANT","Production Assistant","enterprise.production.view"],
    ["ENTERPRISE_QUALITY_ASSISTANT","Quality Assistant","enterprise.quality.view"],
    ["ENTERPRISE_INVENTORY_ASSISTANT","Inventory Assistant","enterprise.warehouse.view"],
    ["ENTERPRISE_EXECUTIVE_INSIGHTS","Executive Manufacturing Insights","enterprise.reporting.view"],
  ] as const) await prisma.aiToolDefinition.upsert({where:{code},update:{},create:{code,name,description:`Advisory-only ${name}`,category:"ENTERPRISE_READ",requiredPermission,inputSchema:{type:"object"},outputSchema:{type:"object"},auditCategory:"ENTERPRISE_AI",featureFlag:"ENTERPRISE_AI_EXTENSIONS_ENABLED",dataScope:"CALLER",status:"ACTIVE"}});
  const agents = [
    // Sprint 14 (Founder AI) — allowedTools extended with the three new
    // Founder OS / AI-platform-health tools.
    ["FOUNDER_INTELLIGENCE","Founder Intelligence Agent",["Founder"],["ai.executive.use"],["QUESTION","SUMMARIZE","COMPARE","CALCULATE"],["EXECUTIVE_REPORT","REPORT_LOOKUP","FOUNDER_DASHBOARD_LOOKUP","FOUNDER_DECISION_QUEUE_LOOKUP","AI_PLATFORM_HEALTH_LOOKUP"]],
    // Sprint 13 (Sales AI) — allowedTools extended with the Institutional
    // Sales OS tools (opportunity lookup, deal-health lookup, follow-up and
    // draft-quotation creation).
    ["SALES_INTELLIGENCE","Sales Intelligence Agent",["Founder","Sales Manager","Sales Officer","Institutional Sales Officer"],["ai.conversations.use"],["QUESTION","SUMMARIZE","COMPARE"],["CUSTOMER_LOOKUP","REPORT_LOOKUP","OPPORTUNITY_LOOKUP","SALES_INTELLIGENCE_LOOKUP","CREATE_FOLLOWUP","CREATE_DRAFT_QUOTATION"]],
    // Sprint 12 (Support AI) — allowedTools extended with the two new
    // Support tools; CUSTOMER_INTELLIGENCE is the agent Customer Support
    // staff already route to by role (routeAgent, orchestrator.ts), no new
    // agent needed for a first Support AI integration.
    ["CUSTOMER_INTELLIGENCE","Customer Intelligence Agent",["Founder","Sales Manager","Sales Officer","Institutional Sales Officer","Customer Support"],["ai.conversations.use"],["QUESTION","SUMMARIZE","EXPLAIN"],["CUSTOMER_LOOKUP","CUSTOMER_INTELLIGENCE","SUPPORT_TICKET_LOOKUP","CREATE_SUPPORT_TICKET"]],
    ["COMMERCE_INTELLIGENCE","Commerce Intelligence Agent",["Founder","Sales Manager","Sales Officer","Institutional Sales Officer","Customer Support"],["ai.conversations.use"],["SEARCH","QUESTION","EXPLAIN"],["ORDER_LOOKUP","PRODUCT_LOOKUP"]],
    ["KNOWLEDGE","Knowledge Agent",["Founder","System Administrator","Sales Manager","Sales Officer","Institutional Sales Officer","Customer Support"],["ai.knowledge.retrieve"],["SEARCH","QUESTION","COMPARE"],["KNOWLEDGE_SEARCH"]],
    ["ANALYTICS","Analytics Agent",["Founder","Sales Manager","Sales Officer","Institutional Sales Officer"],["ai.conversations.use"],["QUESTION","SUMMARIZE","COMPARE","CALCULATE"],["REPORT_LOOKUP","CUSTOMER_INTELLIGENCE"]],
    ["OPERATIONS","Operations Agent",["Founder","System Administrator"],["ai.operations.view"],["SEARCH","QUESTION","CONFIGURATION"],["REPORT_LOOKUP"]],
  ] as const;
  // Sprint 9 (EIOS Runtime) — base personalityProfile per agent, consumed by
  // lib/eios/personality.ts's composePersonality(). Deliberately distinct
  // per agent role rather than one shared default, so EIOS's tone actually
  // varies by which agent was routed to, not just by cognitive state.
  const personalityProfiles: Record<string, { tone: string; formality: "casual"|"moderate"|"formal"; pace: string }> = {
    FOUNDER_INTELLIGENCE: { tone: "concise and analytical", formality: "formal", pace: "efficient" },
    SALES_INTELLIGENCE: { tone: "confident and consultative", formality: "moderate", pace: "brisk" },
    CUSTOMER_INTELLIGENCE: { tone: "warm and attentive", formality: "moderate", pace: "unhurried" },
    COMMERCE_INTELLIGENCE: { tone: "clear and practical", formality: "moderate", pace: "steady" },
    KNOWLEDGE: { tone: "precise and neutral", formality: "moderate", pace: "steady" },
    ANALYTICS: { tone: "precise and analytical", formality: "formal", pace: "efficient" },
    OPERATIONS: { tone: "direct and procedural", formality: "formal", pace: "efficient" },
  };
  for(const [code,name,allowedRoles,requiredPermissions,supportedIntents,allowedTools] of agents) await prisma.aiAgentDefinition.upsert({where:{code},update:{personalityProfile:personalityProfiles[code] ?? {},allowedTools:[...allowedTools]},create:{code,name,purpose:name,description:name,allowedRoles:[...allowedRoles],requiredPermissions:[...requiredPermissions],supportedIntents:[...supportedIntents],allowedTools:[...allowedTools],status:"ACTIVE",personalityProfile:personalityProfiles[code] ?? {}}});
  const workflows = [
    ["READ_ONLY_ASSISTANCE","Read-only assistance","READ_ONLY",false],["EXECUTIVE_BRIEFING","Executive briefing","GENERATION",false],
    ["EVIDENCE_RECOMMENDATION","Evidence-backed recommendation","RECOMMENDATION",false],["APPROVAL_ACTION","Approval-required action","APPROVAL_REQUIRED",true],
    ["ADMIN_REFRESH","Administrative refresh","ADMINISTRATIVE",true],
  ] as const;
  for(const [code,name,purpose,approval] of workflows) await prisma.aiWorkflowDefinition.upsert({where:{code},update:{},create:{code,name,purpose,allowedRoles:["Founder","System Administrator","Sales Manager","Sales Officer","Institutional Sales Officer","Customer Support"],requiredPermissions:["ai.workflows.use"],allowedAgents:agents.map(a=>a[0]),allowedTools:tools.map(t=>t[0]),approvalPolicy:{required:approval},status:"ACTIVE"}});
  const prompts = [
    ["SYSTEM_GOVERNANCE","System Governance","SYSTEM_PROMPT","You are MUV AI. Use only authorized tool results and published knowledge. Never bypass RBAC or approval. Distinguish verified platform data, organizational knowledge, and general knowledge. {{user_request}}"],
    ["RESPONSE_VALIDATION","Response Validation","VALIDATION_PROMPT","Validate evidence, citations, permissions, organization scope, confidence and action safety for {{response}}."],
    ["EXECUTIVE_BRIEFING","Executive Briefing","WORKFLOW_PROMPT","Compose a historical executive briefing from validated KPI tool results only: {{tool_results}}."],
  ] as const;
  for(const [code,name,category,template] of prompts) await prisma.aiPromptTemplate.upsert({where:{code_version:{code,version:1}},update:{},create:{code,name,purpose:name,category,version:1,status:"PUBLISHED",variables:[...template.matchAll(/{{(.*?)}}/g)].map(m=>m[1]!),safetyRules:{rbac:true,evidence:true,noDirectMutation:true},outputFormat:{type:"structured"},template,effectiveAt:new Date()}});
  console.log("  Phase 7: governed AI configuration, providers, model, tools, agents, workflows, prompts, and permissions");
  for (const [operationType, preparerAction, approverAction] of [
    ["PARTNER_ONBOARDING_APPROVAL", "PARTNER_ONBOARDING_PREPARE", "PARTNER_ONBOARDING_APPROVE"],
    ["AGREEMENT_APPROVAL", "AGREEMENT_PREPARE", "AGREEMENT_APPROVE"],
    ["COMMERCIAL_POLICY_APPROVAL", "COMMERCIAL_POLICY_PREPARE", "COMMERCIAL_POLICY_APPROVE"],
    ["ROYALTY_APPROVAL", "ROYALTY_PREPARE", "ROYALTY_APPROVE"],
    ["COMMISSION_APPROVAL", "COMMISSION_PREPARE", "COMMISSION_APPROVE"],
    ["CLAIM_APPROVAL", "CLAIM_PREPARE", "CLAIM_APPROVE"],
  ] as const) {
    await prisma.phase2SodPolicy.upsert({
      where: { organizationKey_operationType: { organizationKey: "MUV", operationType } },
      update: { preparerAction, approverAction, prohibitSameActor: true, active: true },
      create: { organizationKey: "MUV", operationType, preparerAction, approverAction, prohibitSameActor: true, active: true },
    });
  }
  console.log("  Phase 2 Part 3B: network SoD policies (feature flags remain disabled)");

  for (const [operationType, preparerAction, approverAction] of [
    ["FISCAL_PERIOD_REOPEN", "FISCAL_PERIOD_REOPEN_REQUEST", "FISCAL_PERIOD_REOPEN_APPROVE"],
    ["JOURNAL_APPROVAL", "JOURNAL_SUBMIT", "JOURNAL_APPROVE"],
    ["JOURNAL_POSTING", "JOURNAL_APPROVE", "JOURNAL_POST"],
    ["VENDOR_PAYMENT_APPROVAL", "VENDOR_PAYMENT_REQUEST", "VENDOR_PAYMENT_APPROVE"],
    ["EXPENSE_APPROVAL", "EXPENSE_CLAIM_SUBMIT", "EXPENSE_CLAIM_APPROVE"],
    ["RECONCILIATION_APPROVAL", "RECONCILIATION_PREPARE", "RECONCILIATION_COMPLETE"],
    // Added during the Part 3C independent-audit repair pass: reversing a
    // posted journal had no maker-checker control at all (every other
    // sensitive Part 3C mutation already had one). preparerId is the
    // original journal's poster (postedById) — the actor who posted the
    // journal being reversed cannot also be the one who reverses it.
    ["JOURNAL_REVERSAL", "JOURNAL_POST", "JOURNAL_REVERSE"],
  ] as const) {
    await prisma.phase2SodPolicy.upsert({
      where: { organizationKey_operationType: { organizationKey: "MUV", operationType } },
      update: { preparerAction, approverAction, prohibitSameActor: true, active: true },
      create: { organizationKey: "MUV", operationType, preparerAction, approverAction, prohibitSameActor: true, active: true },
    });
  }
  console.log("  Phase 2 Part 3C Wave 1/Stage A/Stage B: finance SoD policies (fiscal period reopen, journal approval/posting/reversal, vendor payment approval, expense approval, reconciliation approval); feature flags remain disabled");

  // Part 3D, Stage 1 — Founder Widget Framework's default registry. Order
  // matches the Stage 1 objective's own Dashboard list. defaultVisible:
  // true for all — every Founder sees the full set until they personalize
  // it via setWidgetPreference.
  for (const [code, name, category, defaultOrder] of [
    ["REVENUE", "Revenue", "KPI", 0],
    ["COLLECTIONS", "Collections", "KPI", 1],
    ["OUTSTANDING_RECEIVABLES", "Outstanding Receivables", "KPI", 2],
    ["OUTSTANDING_PAYABLES", "Outstanding Payables", "KPI", 3],
    ["CASH_POSITION", "Cash Position", "KPI", 4],
    ["EXPENSES", "Expenses", "KPI", 5],
    ["ORDERS", "Orders", "KPI", 6],
    ["SALES_PERFORMANCE", "Sales Performance", "KPI", 7],
    ["CUSTOMER_GROWTH", "Customer Growth", "KPI", 8],
    ["BUSINESS_HEALTH", "Business Health", "HEALTH", 9],
    ["ALERTS", "Alerts", "ALERTS", 10],
    ["PENDING_APPROVALS", "Pending Approvals", "ALERTS", 11],
    ["RECENT_ACTIVITY", "Recent Activity", "TIMELINE", 12],
    // Milestone 9 — Customer Support. Additive rows in the same registry —
    // no parallel founder-widget table.
    ["SUPPORT_OPEN_TICKETS", "Support: Open Tickets", "KPI", 13],
    ["SUPPORT_CRITICAL_TICKETS", "Support: Critical Tickets", "ALERTS", 14],
    ["SUPPORT_CSAT", "Support: CSAT", "KPI", 15],
    ["SUPPORT_TOP_COMPLAINTS", "Support: Top Complaint Categories", "CUSTOM", 16],
  ] as const) {
    await prisma.founderWidgetDefinition.upsert({
      where: { code },
      update: { name, category, defaultOrder },
      create: { code, name, category, defaultOrder, defaultVisible: true, status: "ACTIVE" },
    });
  }
  console.log("  Phase 2 Part 3D Stage 1 + Milestone 9: Founder OS widget registry (13 Part 3D + 4 Support dashboard widgets)");

  await prisma.territory.upsert({
    where: { code: "INDIA" }, update: {},
    create: { name: "India", code: "INDIA" },
  });
  console.log(`  ${Object.keys(roleDefinitions).length} sales roles and ${permissionData.length} permissions`);

  // ---- Admin user ----
  // Password below is a seed-only placeholder — change it immediately after
  // first login in any environment beyond local development.
  const adminPasswordHash = await bcrypt.hash("ChangeMe123", 12);
  await prisma.user.upsert({
    where: { email: "admin@muv.co.in" },
    update: { salesRoleId: salesRoleIds["Founder"], active: true },
    create: { name: "MUV Admin", email: "admin@muv.co.in", passwordHash: adminPasswordHash, role: "ADMIN", salesRoleId: salesRoleIds["Founder"] },
  });
  console.log("  1 admin user (admin@muv.co.in / ChangeMe123 — change this immediately)");

  // ---- Milestone 8 — Finance & Accounts baseline (Chart of Accounts, current
  // fiscal year, event-posting rules) ----
  // The frozen Part 3C Finance Platform ships with zero seeded accounts and
  // zero seeded fiscal years — every FinanceAccount/FinanceFiscalYear row
  // that already existed in this dev database before this milestone was
  // confirmed to be Part 3C's own randomized integration-test residue
  // (account codes/fiscal years prefixed with test-run identifiers), not a
  // real baseline. This block is that real, clean, production baseline —
  // additive, written directly (matching this seed's existing convention
  // for bulk data), never via the Business Service layer, which requires a
  // live session principal seed.ts doesn't have.
  const financeAdmin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@muv.co.in" } });
  const coaDefinitions: { code: string; name: string; category: string; subtype: string; normalBalance: string; isControlAccount?: boolean }[] = [
    { code: "1000", name: "Cash", category: "ASSET", subtype: "CASH", normalBalance: "DEBIT" },
    { code: "1010", name: "Bank - Primary Account", category: "ASSET", subtype: "BANK", normalBalance: "DEBIT" },
    { code: "1100", name: "Accounts Receivable", category: "ASSET", subtype: "RECEIVABLE", normalBalance: "DEBIT", isControlAccount: true },
    { code: "1200", name: "Raw Material Inventory", category: "ASSET", subtype: "INVENTORY", normalBalance: "DEBIT" },
    { code: "1210", name: "Work-in-Progress Inventory", category: "ASSET", subtype: "INVENTORY", normalBalance: "DEBIT" },
    { code: "1220", name: "Finished Goods Inventory", category: "ASSET", subtype: "INVENTORY", normalBalance: "DEBIT" },
    { code: "1300", name: "Input Tax Recoverable", category: "ASSET", subtype: "TAX", normalBalance: "DEBIT" },
    { code: "1500", name: "Fixed Assets", category: "ASSET", subtype: "FIXED_ASSET", normalBalance: "DEBIT" },
    { code: "1510", name: "Accumulated Depreciation", category: "ASSET", subtype: "CONTRA_ASSET", normalBalance: "CREDIT" },
    { code: "2000", name: "Accounts Payable", category: "LIABILITY", subtype: "PAYABLE", normalBalance: "CREDIT", isControlAccount: true },
    { code: "2100", name: "Output Tax Payable", category: "LIABILITY", subtype: "TAX", normalBalance: "CREDIT" },
    { code: "2200", name: "Accrued Expenses", category: "LIABILITY", subtype: "ACCRUAL", normalBalance: "CREDIT" },
    { code: "2300", name: "Expense Reimbursement Payable", category: "LIABILITY", subtype: "PAYABLE", normalBalance: "CREDIT" },
    { code: "3000", name: "Share Capital", category: "EQUITY", subtype: "CAPITAL", normalBalance: "CREDIT" },
    { code: "3100", name: "Retained Earnings", category: "EQUITY", subtype: "RETAINED_EARNINGS", normalBalance: "CREDIT" },
    { code: "4000", name: "Sales Revenue", category: "REVENUE", subtype: "OPERATING_REVENUE", normalBalance: "CREDIT" },
    { code: "5000", name: "Cost of Goods Sold", category: "EXPENSE", subtype: "DIRECT_COST", normalBalance: "DEBIT" },
    { code: "5100", name: "Direct Material Cost", category: "EXPENSE", subtype: "DIRECT_COST", normalBalance: "DEBIT" },
    { code: "5200", name: "Direct Labor Cost", category: "EXPENSE", subtype: "DIRECT_COST", normalBalance: "DEBIT" },
    { code: "5300", name: "Manufacturing Overhead", category: "EXPENSE", subtype: "INDIRECT_COST", normalBalance: "DEBIT" },
    { code: "6000", name: "Operating Expenses", category: "EXPENSE", subtype: "OPERATING_EXPENSE", normalBalance: "DEBIT" },
    { code: "6100", name: "Depreciation Expense", category: "EXPENSE", subtype: "OPERATING_EXPENSE", normalBalance: "DEBIT" },
    { code: "6900", name: "Bad Debt Expense", category: "EXPENSE", subtype: "OPERATING_EXPENSE", normalBalance: "DEBIT" },
  ];
  const coaIds: Record<string, string> = {};
  for (const acc of coaDefinitions) {
    const row = await prisma.financeAccount.upsert({
      where: { organizationKey_accountCode: { organizationKey: "MUV", accountCode: acc.code } },
      update: {},
      create: {
        organizationKey: "MUV", accountCode: acc.code, name: acc.name, category: acc.category, subtype: acc.subtype,
        normalBalance: acc.normalBalance, isControlAccount: acc.isControlAccount ?? false, postingEnabled: true,
        status: "ACTIVE", isSystemAccount: true, createdById: financeAdmin.id,
      },
    });
    coaIds[acc.code] = row.id;
  }
  console.log(`  ${coaDefinitions.length} baseline Chart of Accounts entries (organizationKey "MUV")`);

  // Current fiscal year (India convention: 1 Apr – 31 Mar) covering today,
  // with 12 monthly periods, all OPEN — mirrors createFiscalYearWithPeriods'
  // own shape exactly, written directly since seed.ts has no session principal.
  const fyStart = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
  const fyEnd = new Date(Date.UTC(2027, 2, 31, 23, 59, 59)); // 2027-03-31
  const fiscalYear = await prisma.financeFiscalYear.upsert({
    where: { organizationKey_code: { organizationKey: "MUV", code: "FY2026-27" } },
    update: {},
    create: { organizationKey: "MUV", code: "FY2026-27", startDate: fyStart, endDate: fyEnd, status: "OPEN", createdById: financeAdmin.id },
  });
  for (let i = 0; i < 12; i += 1) {
    const periodStart = new Date(Date.UTC(2026, 3 + i, 1));
    const periodEndMonth = new Date(Date.UTC(2026, 4 + i, 1));
    const periodEnd = new Date(periodEndMonth.getTime() - 1);
    await prisma.financeFiscalPeriod.upsert({
      where: { organizationKey_fiscalYearId_periodNumber: { organizationKey: "MUV", fiscalYearId: fiscalYear.id, periodNumber: i + 1 } },
      update: {},
      create: {
        organizationKey: "MUV", fiscalYearId: fiscalYear.id, periodNumber: i + 1,
        name: periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        startDate: periodStart, endDate: periodEnd, status: "OPEN",
      },
    });
  }
  console.log("  1 fiscal year (FY2026-27) with 12 open periods");

  // Event-driven accounting: the exact mapping from Milestone 6/7 business
  // events to journal debit/credit accounts (Milestone 8's own architecture,
  // §8 Event-Driven Accounting Architecture).
  const eventPostingRules: { sourceModule: string; sourceEventAction: string; journalType: string; debit: string; credit: string; description: string }[] = [
    { sourceModule: "business_ops", sourceEventAction: "ORDER_DELIVERED", journalType: "SALES_REVENUE", debit: "1100", credit: "4000", description: "Revenue recognition on delivery" },
    { sourceModule: "enterprise_procurement", sourceEventAction: "GOODS_RECEIPT_CREATED", journalType: "PURCHASE_RECEIPT", debit: "1200", credit: "2000", description: "Raw material received against vendor bill" },
    { sourceModule: "enterprise_production", sourceEventAction: "PRODUCTION_IN_PROGRESS", journalType: "MATERIAL_CONSUMPTION", debit: "1210", credit: "1200", description: "Raw material consumed into WIP" },
    { sourceModule: "enterprise_finished_goods", sourceEventAction: "FINISHED_GOODS_TRANSFERRED", journalType: "FINISHED_GOODS_TRANSFER", debit: "1220", credit: "1210", description: "WIP transferred to Finished Goods on QC release" },
    // Milestone 9 — Customer Support. Institutional-order refund approval
    // bridges through this exact rule (lib/support/return-refund-warranty-service.ts's
    // approveRefundRequest -> recordFinanceEvent) — Support never writes a
    // FinanceLedgerEntry row directly. Modeled as a cash outflow against
    // revenue (CASH_VOUCHER, an existing Milestone 8 journal type), not a
    // Credit Note (a Credit Note only ever reduces what a customer owes —
    // it never moves cash, and a refund always does).
    { sourceModule: "support", sourceEventAction: "REFUND_APPROVED", journalType: "CASH_VOUCHER", debit: "4000", credit: "1010", description: "Customer refund approved via Support" },
  ];
  for (const rule of eventPostingRules) {
    await prisma.financeEventPostingRule.upsert({
      where: { organizationKey_sourceModule_sourceEventAction: { organizationKey: "MUV", sourceModule: rule.sourceModule, sourceEventAction: rule.sourceEventAction } },
      update: {},
      create: {
        organizationKey: "MUV", sourceModule: rule.sourceModule, sourceEventAction: rule.sourceEventAction, journalType: rule.journalType,
        debitAccountCode: rule.debit, creditAccountCode: rule.credit, description: rule.description, active: true, createdById: financeAdmin.id,
      },
    });
  }
  console.log(`  ${eventPostingRules.length} Finance event-posting rules (Milestones 6–7 events)`);

  // ---- Milestone 9 — Customer Support baseline (Departments, SLA policies,
  // Business Hours, default Escalation Rule) ----
  const supportAdmin = financeAdmin; // Founder admin, same principal used for every other seed baseline write.
  const departmentDefinitions: { code: string; name: string }[] = [
    { code: "SUPPORT", name: "Customer Support" },
    { code: "QUALITY", name: "Quality" },
    { code: "MANUFACTURING", name: "Manufacturing" },
    { code: "FINANCE", name: "Finance" },
    { code: "LOGISTICS", name: "Logistics" },
  ];
  const departmentIds: Record<string, string> = {};
  for (const dept of departmentDefinitions) {
    const row = await prisma.supportDepartment.upsert({
      where: { organizationKey_code: { organizationKey: "MUV", code: dept.code } },
      update: { name: dept.name },
      create: { organizationKey: "MUV", code: dept.code, name: dept.name },
    });
    departmentIds[dept.code] = row.id;
  }
  console.log(`  ${departmentDefinitions.length} Support departments`);

  const slaPolicyDefinitions: { name: string; category?: string; priority?: string; responseMinutes: number; resolutionMinutes: number }[] = [
    { name: "Critical priority", priority: "CRITICAL", responseMinutes: 15, resolutionMinutes: 240 },
    { name: "Urgent priority", priority: "URGENT", responseMinutes: 30, resolutionMinutes: 480 },
    { name: "High priority", priority: "HIGH", responseMinutes: 60, resolutionMinutes: 1440 },
    { name: "Complaint default", category: "COMPLAINT", responseMinutes: 60, resolutionMinutes: 1440 },
    { name: "Default", responseMinutes: 240, resolutionMinutes: 2880 },
  ];
  for (const policy of slaPolicyDefinitions) {
    const existing = await prisma.supportSlaPolicy.findFirst({ where: { organizationKey: "MUV", name: policy.name } });
    if (!existing) {
      await prisma.supportSlaPolicy.create({
        data: {
          organizationKey: "MUV", name: policy.name, category: policy.category as never, priority: policy.priority as never,
          responseMinutes: policy.responseMinutes, resolutionMinutes: policy.resolutionMinutes, businessHoursOnly: true,
        },
      });
    }
  }
  console.log(`  ${slaPolicyDefinitions.length} Support SLA policies`);

  for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek += 1) {
    await prisma.supportBusinessHours.upsert({
      where: { organizationKey_dayOfWeek: { organizationKey: "MUV", dayOfWeek } },
      update: {},
      create: { organizationKey: "MUV", dayOfWeek, startTime: "09:00", endTime: dayOfWeek === 6 ? "14:00" : "18:00" },
    });
  }
  console.log("  Support business hours (Mon–Sat)");

  const defaultEscalationChain = [
    { level: 1, roleName: "Senior Support Agent", afterMinutes: 0 },
    { level: 2, roleName: "Support Manager", afterMinutes: 60 },
    { level: 3, roleName: "Department Head", afterMinutes: 240 },
    { level: 4, roleName: "Founder", afterMinutes: 1440 },
  ];
  const existingEscalationRule = await prisma.supportEscalationRule.findFirst({ where: { organizationKey: "MUV", name: "Default SLA breach escalation" } });
  if (!existingEscalationRule) {
    await prisma.supportEscalationRule.create({
      data: { organizationKey: "MUV", name: "Default SLA breach escalation", triggerType: "SLA_BREACH", chainJson: defaultEscalationChain, active: true, createdById: supportAdmin.id },
    });
  }
  console.log("  1 default Support escalation rule (Agent -> Senior Agent -> Support Manager -> Department Head -> Founder)");

  // ---- UAT sales-role test users ----
  // Dev/UAT only — this block runs after assertSafeToSeed() has already
  // gated the whole script, the same guard the admin account above relies
  // on, so no separate guard is needed here. Each user is upserted onto an
  // *existing* seeded SalesRole (salesRoleIds, built above) — no new roles
  // or permissions are created. Base `Role` is CUSTOMER for the five named
  // Sales roles (matching the pattern used throughout __tests__: sales-scoped
  // access comes entirely from the active SalesRole + its permissions, not
  // from the base Role enum) except the plain "Staff" account, which has no
  // SalesRole at all and instead exercises the base STAFF role that gates
  // /admin alongside ADMIN.
  const uatPasswordHash = await bcrypt.hash("ChangeMe123", 12);
  const uatUsers: { salesRole: string | null; baseRole: "ADMIN" | "STAFF" | "CUSTOMER"; name: string; email: string }[] = [
    { salesRole: "Founder", baseRole: "CUSTOMER", name: "Founder Test User", email: "founder.test@muv.local" },
    { salesRole: "Sales Manager", baseRole: "CUSTOMER", name: "Sales Manager Test User", email: "salesmanager.test@muv.local" },
    { salesRole: "Sales Officer", baseRole: "CUSTOMER", name: "Sales Officer Test User", email: "salesofficer.test@muv.local" },
    { salesRole: "Institutional Sales Officer", baseRole: "CUSTOMER", name: "Institutional Sales Officer Test User", email: "institutional.test@muv.local" },
    { salesRole: "Customer Support", baseRole: "CUSTOMER", name: "Customer Support Test User", email: "support.test@muv.local" },
    { salesRole: null, baseRole: "STAFF", name: "Staff Test User", email: "staff.test@muv.local" },
    // Milestone 9 — Customer Support. New, distinct roles/emails from the
    // pre-existing "Customer Support" test user above.
    { salesRole: "Support Agent", baseRole: "CUSTOMER", name: "Support Agent Test User", email: "supportagent.test@muv.local" },
    { salesRole: "Senior Support Agent", baseRole: "CUSTOMER", name: "Senior Support Agent Test User", email: "seniorsupportagent.test@muv.local" },
    { salesRole: "Support Manager", baseRole: "CUSTOMER", name: "Support Manager Test User", email: "supportmanager.test@muv.local" },
    { salesRole: "QA Reviewer", baseRole: "CUSTOMER", name: "QA Reviewer Test User", email: "qareviewer.test@muv.local" },
    { salesRole: "Knowledge Manager", baseRole: "CUSTOMER", name: "Knowledge Manager Test User", email: "knowledgemanager.test@muv.local" },
    { salesRole: "Department Head", baseRole: "CUSTOMER", name: "Department Head Test User", email: "departmenthead.test@muv.local" },
  ];
  for (const u of uatUsers) {
    const salesRoleId = u.salesRole ? salesRoleIds[u.salesRole] : null;
    await prisma.user.upsert({
      where: { email: u.email },
      update: { salesRoleId, role: u.baseRole, active: true },
      create: { name: u.name, email: u.email, passwordHash: uatPasswordHash, role: u.baseRole, salesRoleId, active: true },
    });
  }
  console.log(`  ${uatUsers.length} UAT sales-role test users (password: ChangeMe123 — dev/UAT only, change before any non-local use)`);

  // ---- Stage 6C — Founder Decision Registry ----
  // Resolves CF-01 (ENGINEERING_TEST_REPORT.md). These four entries are the
  // Founder's own formal decisions from "MUV AI Intelligence Core — Stage 6C
  // — Founder Authorization", transcribed verbatim into `decisionText`, not
  // paraphrased or interpreted. Upsert on `decisionId` — idempotent, safe to
  // re-run; never overwrites `approvedAt` with a fresh timestamp since it's
  // included in `create` only, not `update`.
  const founderDecisions: {
    decisionId: string;
    title: string;
    category: string;
    decisionText: string;
    scope: string;
  }[] = [
    {
      decisionId: "FD-AIC-001",
      title: "Repository-First Response Assembly",
      category: "RESPONSE_ASSEMBLY",
      decisionText:
        "The LLM is a language-generation and response-composition layer. It is NOT an authoritative " +
        "knowledge source. Mandatory flow: User Input -> Intent Classification -> Repository Retrieval -> " +
        "Context Construction -> Founder Reasoning -> Decision and Conflict Resolution -> Confidence " +
        "Evaluation -> PII Protection -> LLM Response Assembly -> Post-generation Safety Verification -> " +
        "Delivery. Every factual statement that depends on MUV-specific knowledge must be grounded in the " +
        "approved repositories or verified live operational data. Unsupported knowledge must never be " +
        "silently generated.",
      scope: "Governs Module 9 (Response Assembly Runtime) and the overall runtime pipeline ordering.",
    },
    {
      decisionId: "FD-AIC-002",
      title: "Conflict Arbitration",
      category: "CONFLICT_ARBITRATION",
      decisionText:
        "Conflict arbitration is domain-aware, not a naive universal ranking. Authority framework: " +
        "1. Latest explicit Founder Decision applicable to the issue. " +
        "2. Founder Constitution and binding Founder Rules. " +
        "3. Domain-authoritative Knowledge Factory: Product facts and product safety -> Product Knowledge " +
        "Factory; Marketing and brand communication -> Marketing Knowledge Factory; Institutional sales " +
        "process -> Institutional Sales Knowledge Factory; Founder reasoning and judgement -> Founder " +
        "Intelligence Knowledge Factory; Customer care policy -> Customer Care Knowledge Factory once " +
        "completed. " +
        "4. Live operational or commercial data for current-state fields only: MRP, Selling price, " +
        "Discount, Pack availability, Variant availability, Stock, Product URL, Slug, Other approved live " +
        "commercial fields. Live commercial data must never override product safety, formulation, usage, " +
        "governance, or Founder policy. " +
        "5. Recency and evidence confidence may act only as a tiebreaker between sources with equal " +
        "authority inside the same subject. " +
        "6. Any unresolved material conflict must be escalated. The AI must disclose uncertainty and must " +
        "not invent a winning source. Founder Intelligence may guide reasoning, but may not overwrite " +
        "verified domain facts.",
      scope: "Governs Module 6 (Conflict Resolution Runtime); Founder Intelligence KF is explicitly excluded " +
        "from level 3's domain-authority set for FACT arbitration (it guides Module 4 reasoning, it does " +
        "not arbitrate Module 6 facts).",
    },
    {
      decisionId: "FD-AIC-003",
      title: "Production Protection",
      category: "PRODUCTION_PROTECTION",
      decisionText:
        "Runtime implementation is approved. Production activation is NOT approved. No new runtime module " +
        "may become active for live users until: Complete implementation is finished; Full engineering " +
        "testing passes; Existing production regression passes; Security and privacy testing passes; " +
        "Founder Acceptance Testing passes; Explicit Founder go-live authorization is issued.",
      scope: "Governs the RUNTIME_PIPELINE_ENABLED feature flag and every module-level flag under it — all " +
        "default false; go-live requires a future, separate, explicit Founder Decision, not this one.",
    },
    {
      decisionId: "FD-AIC-004",
      title: "Privacy-First AI",
      category: "PRIVACY",
      decisionText:
        "No unnecessary personal or confidential information may be transmitted to an external LLM " +
        "provider. A mandatory privacy boundary must exist before the LLM call. The boundary must support: " +
        "PII detection; Data minimization; Redaction; Tokenization or pseudonymization where appropriate; " +
        "Secret and credential blocking; Payment-information blocking; Sensitive internal identifier " +
        "protection; Redacted audit logging; Provider-independent privacy enforcement; Safe restoration of " +
        "permitted placeholders after generation. Potentially protected data includes: Phone numbers, " +
        "Email addresses, Postal addresses, Payment information, Authentication credentials, Private order " +
        "identifiers, Internal customer identifiers, Confidential business data, Any other information not " +
        "required for response generation. Only the minimum necessary context may be sent externally. Raw " +
        "secrets, credentials, payment information, and unrestricted internal records must never leave " +
        "MUV-controlled systems. If safe redaction cannot be completed: Do not call the external LLM. Use " +
        "a safe fallback or escalate.",
      scope: "Governs Module 8 (Safety and Privacy Runtime)'s privacy boundary, enforced before every " +
        "Module 9 LLM call, with no bypass path.",
    },
  ];
  for (const d of founderDecisions) {
    await prisma.founderDecisionRegistryEntry.upsert({
      where: { decisionId: d.decisionId },
      update: { title: d.title, category: d.category, decisionText: d.decisionText, scope: d.scope, status: "APPROVED" },
      create: { ...d, status: "APPROVED", approvedAt: new Date("2026-08-01T00:00:00.000Z") },
    });
  }
  console.log(`  ${founderDecisions.length} Founder Decision Registry entries (FD-AIC-001 through FD-AIC-004)`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
