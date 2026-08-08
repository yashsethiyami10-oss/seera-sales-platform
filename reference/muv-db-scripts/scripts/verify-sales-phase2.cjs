// Enterprise UI Integration final audit: this verifier exercises real
// routing logic (not just DB state, unlike the other verify-*.cjs
// scripts), so it needs a compiled CommonJS build of lib/sales-channel's
// routing module — that build step was previously undocumented and not
// reproducible (no package.json script, no README reference), so this
// verifier could not be run without manually reconstructing the exact
// tsc invocation. Fixed: `npm run verify:phase2` builds
// .tmp-phase2-services/ (a disposable local artifact directory, not part
// of the application) then runs this script. `npm run verify:phase2:build`
// runs just the build step, if you already know it's current.
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { routePublicInquiry } = require("../.tmp-phase2-services/routing.js");

const prisma = new PrismaClient();
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  if (!pass) process.exitCode = 1;
};
const base = (channelCode, customerTypeCode, suffix, detail) => ({
  channelCode, customerTypeCode, leadSourceCode: "WEBSITE",
  name: `Phase2 ${suffix}`, businessName: `Phase2 Business ${suffix}`,
  email: `phase2-${suffix}@example.invalid`, phone: `+9199000${suffix.padStart(5, "0").slice(-5)}`,
  subject: `Verification ${channelCode}`, requirementSummary: "Controlled Phase 2 routing verification",
  consent: true, honeypot: "", idempotencyKey: crypto.randomUUID(), detail,
});

async function main() {
  const stamp = Date.now().toString().slice(-8);
  const officerRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Sales Officer" } });
  const institutionalRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Institutional Sales Officer" } });
  const managerRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Sales Manager" } });
  const testUsers = await Promise.all([
    prisma.user.create({ data: { email: `p2-officer-${stamp}@example.invalid`, name: "P2 Officer", role: "STAFF", salesRoleId: officerRole.id } }),
    prisma.user.create({ data: { email: `p2-institutional-${stamp}@example.invalid`, name: "P2 Institutional", role: "STAFF", salesRoleId: institutionalRole.id } }),
    prisma.user.create({ data: { email: `p2-manager-${stamp}@example.invalid`, name: "P2 Manager", role: "STAFF", salesRoleId: managerRole.id } }),
  ]);
  const inputs = [
    base("INSTITUTIONAL_SALES", "INSTITUTIONAL", `${stamp}01`, { institutionType: "Hospital", organizationName: "P2 Hospital", monthlyRequirement: "500 units", requestedCategories: ["Home Care"], siteVisitRequired: true }),
    base("CORPORATE_INQUIRY", "CORPORATE", `${stamp}02`, { companyName: "P2 Corp", industry: "Hospitality", locations: 4, requestedCategories: ["Fabric Care"] }),
    base("BULK_ORDER", "CORPORATE", `${stamp}03`, { deliveryCity: "Delhi", requestedProducts: ["MUV Renew"], requestedQuantities: [100], requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(), estimatedBudget: 100000 }),
    base("QUOTATION_REQUEST", "CORPORATE", `${stamp}04`, { requestedProducts: ["MUV Noir"], quantities: [50], deliveryLocation: "Mumbai" }),
    base("SAMPLE_REQUEST", "CORPORATE", `${stamp}05`, { requestedProducts: ["MUV Cleanse"], reason: "Product evaluation", expectedMonthlyPurchase: "200", deliveryAddress: "P2 Test Address" }),
    base("DEALER_APPLICATION", "DEALER", `${stamp}06`, { businessName: "P2 Dealer", businessType: "Retail", yearsInBusiness: 5, marketArea: "North", requestedTerritory: "Delhi", currentBrands: [] }),
    base("DISTRIBUTOR_APPLICATION", "DISTRIBUTOR", `${stamp}07`, { businessName: "P2 Distributor", warehouseCapacity: "5000 sqft", investmentCapacity: 500000, requestedTerritory: "North India", currentBrands: [] }),
    base("FRANCHISE_INQUIRY", "FRANCHISE", `${stamp}08`, { applicantName: "P2 Applicant", preferredCity: "Pune", investmentCapacity: 1000000, propertyAvailable: true, timelineExpectation: "6 months", businessExperience: "Retail operations" }),
    base("CONTACT_SALES", "D2C", `${stamp}09`, { contactReason: "Product consultation" }),
  ];
  const references = [];
  for (const input of inputs) references.push(await routePublicInquiry(prisma, input));
  check("All nine public flows routed", references.length === 9 && references.every((row) => /^MUV-INQ-\d{4}-\d{6}$/.test(row.inquiryNumber)), references);
  check("Inquiry numbers unique", new Set(references.map((row) => row.inquiryNumber)).size === 9);
  const duplicate = await routePublicInquiry(prisma, inputs[0]);
  check("Duplicate submission prevention", duplicate.duplicate && duplicate.inquiryNumber === references[0].inquiryNumber);
  const inquiries = await prisma.salesInquiry.findMany({
    where: { inquiryNumber: { in: references.map((row) => row.inquiryNumber) } },
    include: { timeline: true, followUps: true, notifications: true, customer: true },
  });
  check("Customer resolution", inquiries.every((row) => row.customerId && row.customer));
  check("Queue and owner assignment", inquiries.every((row) => row.assignmentQueueId && row.assignedOwnerId));
  check("Initial follow-up creation", inquiries.every((row) => row.followUps.length === 1));
  check("Timeline creation", inquiries.every((row) => row.timeline.some((event) => event.eventType === "INQUIRY_SUBMITTED")));
  check("Dashboard and email notification registration", inquiries.every((row) => row.notifications.some((n) => n.channel === "DASHBOARD" && n.status === "PENDING") && row.notifications.some((n) => n.channel === "EMAIL" && n.status === "PENDING")));
  const audits = await prisma.salesAuditLog.count({ where: { recordId: { in: inquiries.map((row) => row.id) }, action: "INQUIRY_CREATED" } });
  check("Immutable audit registration", audits === 9, audits);
  const detailCounts = await Promise.all([
    prisma.institutionalInquiryDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.corporateInquiryDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.bulkOrderDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.quotationRequestDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.sampleRequestDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.dealerApplicationDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.distributorApplicationDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.franchiseInquiryDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
    prisma.contactSalesDetail.count({ where: { inquiryId: { in: inquiries.map((row) => row.id) } } }),
  ]);
  check("Dedicated channel detail models", detailCounts.every((count) => count === 1), detailCounts);
  const beforeRollback = await prisma.customer.count({ where: { email: `phase2-rollback-${stamp}@example.invalid` } });
  try {
    await routePublicInquiry(prisma, base("SAMPLE_REQUEST", "CORPORATE", `rollback-${stamp}`, { requestedProducts: [], reason: "", expectedMonthlyPurchase: "", deliveryAddress: "" }));
  } catch {}
  const afterRollback = await prisma.customer.count({ where: { email: `phase2-rollback-${stamp}@example.invalid` } });
  check("Critical transaction rollback", beforeRollback === afterRollback);
  const timelineOrdered = inquiries.every((row) => row.timeline.every((event, index, all) => index === 0 || all[index - 1].createdAt <= event.createdAt));
  check("Timeline chronological order", timelineOrdered);
  const reserved = await prisma.salesChannel.count({ where: { code: { in: ["EXPORT","MARKETPLACE","GOVERNMENT_SALES","DEALER_PORTAL","DISTRIBUTOR_PORTAL","FRANCHISE_PORTAL","CORPORATE_CONTRACTS","INTERNATIONAL_DISTRIBUTION"] }, active: false } });
  check("Eight reserved channels inactive", reserved === 8, reserved);
  const exactInput = base("CONTACT_SALES", "INSTITUTIONAL", `${stamp}10`, { contactReason: "Exact identity check" });
  exactInput.email = inputs[0].email;
  exactInput.businessName = "Different Display Name";
  const exactResult = await routePublicInquiry(prisma, exactInput);
  const exactInquiry = await prisma.salesInquiry.findUniqueOrThrow({ where: { inquiryNumber: exactResult.inquiryNumber } });
  check("Exact email identity match", exactInquiry.customerId === inquiries.find((row) => row.inquiryNumber === references[0].inquiryNumber).customerId && exactInquiry.identityMatchState === "EXACT");
  const possibleInput = base("CONTACT_SALES", "INSTITUTIONAL", `${stamp}11`, { contactReason: "Possible identity check" });
  possibleInput.businessName = inputs[0].businessName;
  const possibleResult = await routePublicInquiry(prisma, possibleInput);
  const possibleInquiry = await prisma.salesInquiry.findUniqueOrThrow({ where: { inquiryNumber: possibleResult.inquiryNumber } });
  check("Possible match enters manual review", possibleInquiry.identityMatchState === "MANUAL_REVIEW" && !possibleInquiry.customerId && !!possibleInquiry.possibleCustomerId);
  check("Uncertain customers are never auto-merged", possibleInquiry.customerId !== possibleInquiry.possibleCustomerId);
  const requiredPermissions = ["sales_channels.manage","inquiries.view_all","inquiries.view_assigned","inquiries.assign","applications.review","timeline.view","reports.channels"];
  const permissions = await prisma.salesPermission.count({ where: { permissionKey: { in: requiredPermissions } } });
  check("Phase 2 permissions seeded", permissions === requiredPermissions.length, permissions);
  const rolePermissions = await prisma.salesRole.findMany({ where: { name: { in: ["Founder","Sales Manager","Sales Officer","Institutional Sales Officer","Customer Support"] } }, include: { permissions: { include: { permission: true } } } });
  const keys = Object.fromEntries(rolePermissions.map((role) => [role.name, new Set(role.permissions.map((entry) => entry.permission.permissionKey))]));
  check("Founder unrestricted Phase 2 access", keys["Founder"].size === await prisma.salesPermission.count());
  check("Sales Manager restricted configuration", keys["Sales Manager"].has("inquiries.view_all") && keys["Sales Manager"].has("inquiries.assign") && !keys["Sales Manager"].has("sales_channels.manage") && !keys["Sales Manager"].has("applications.approve"));
  check("Sales Officer assigned-only scope", keys["Sales Officer"].has("inquiries.view_assigned") && !keys["Sales Officer"].has("inquiries.view_all") && !keys["Sales Officer"].has("inquiries.assign"));
  check("Institutional Officer workflow scope", keys["Institutional Sales Officer"].has("applications.review") && keys["Institutional Sales Officer"].has("inquiries.view_assigned") && !keys["Institutional Sales Officer"].has("applications.approve"));
  check("Customer Support excludes confidential applications", !keys["Customer Support"].has("applications.review") && !keys["Customer Support"].has("applications.approve") && !keys["Customer Support"].has("inquiries.view_all"));
  await prisma.salesInquiry.deleteMany({ where: { id: { in: [...inquiries.map((row) => row.id), exactInquiry.id, possibleInquiry.id] } } });
  await prisma.customer.deleteMany({ where: { email: { startsWith: "phase2-" } } });
  await prisma.user.deleteMany({ where: { id: { in: testUsers.map((user) => user.id) } } });
  console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
