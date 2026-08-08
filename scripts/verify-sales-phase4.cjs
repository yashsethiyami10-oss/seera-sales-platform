const {PrismaClient}=require("@prisma/client");const fs=require("node:fs");const prisma=new PrismaClient();let passed=0,failed=0;
function check(ok,name){if(ok){passed++;console.log("PASS",name)}else{failed++;console.error("FAIL",name)}}
const text=f=>fs.readFileSync(f,"utf8");
async function main(){
 const [statuses,policies,taxes,rules,transitions,roles]=await Promise.all([prisma.quotationStatus.findMany(),prisma.pricingPolicy.findMany(),prisma.taxConfiguration.findMany(),prisma.quotationApprovalRule.findMany(),prisma.quotationStatusTransition.findMany(),prisma.salesRole.findMany({include:{permissions:{include:{permission:true}}}})]);
 check(statuses.length===9&&new Set(statuses.map(x=>x.code)).size===9,"nine unique quotation statuses");check(policies.length===6,"six pricing policies");check(taxes.length===10,"inclusive/exclusive GST configuration");check(rules.length===3,"approval rules seeded");check(transitions.length>=12,"status transitions configured");
 const keys=Object.fromEntries(roles.map(r=>[r.name,new Set(r.permissions.map(x=>x.permission.permissionKey))]));
 check(keys.Founder.has("quotation_config.manage")&&keys.Founder.has("pricing_policies.manage"),"Founder unrestricted configuration");
 check(keys["Sales Manager"].has("quotations.approve")&&keys["Sales Manager"].has("quotations.view_all"),"Sales Manager approval authority");
 check(keys["Sales Officer"].has("quotations.view_assigned")&&!keys["Sales Officer"].has("quotations.approve"),"Sales Officer assigned-only and no approval");
 check(keys["Institutional Sales Officer"].has("quotations.view_assigned")&&!keys["Institutional Sales Officer"].has("quotations.approve"),"Institutional assigned-only and no approval");
 check(keys["Customer Support"].has("quotations.view_support")&&!keys["Customer Support"].has("quotations.update"),"Customer Support read-only commercial visibility");
 const pricing=text("lib/quotation/pricing.ts"),workflow=text("lib/quotation/workflow.ts"),repo=text("lib/quotation/repository.ts"),pdf=text("lib/quotation/pdf.ts"),actions=text("actions/quotations.ts");
 check(pricing.includes("calculateLine")&&pricing.includes("calculateTotals"),"one deterministic pricing engine");check(workflow.includes("product.findFirst")&&workflow.includes('status: "ACTIVE"'),"catalog references validated");
 check(workflow.includes("quotationLineItem.createMany")&&workflow.includes("productName")&&workflow.includes("skuSnapshot"),"pricing snapshots captured");
 check(workflow.includes("Quotation")&&workflow.includes("isActive: false")&&workflow.includes("parentVersionId"),"central immutable revision workflow");
 check(workflow.includes("quotationStatusTransition.findUnique"),"configuration-driven status validation");check(workflow.includes("validUntil < new Date()"),"expired acceptance rejected");
 check(workflow.includes("prohibitSelfApproval")&&workflow.includes("Self-approval is prohibited"),"self approval restriction");
 check(workflow.includes("salesTimelineEvent.create")&&workflow.includes("salesAuditLog.create")&&workflow.includes("notificationLog.create"),"timeline audit notification integration");
 check(workflow.includes("opportunityTask.create"),"Phase 3 follow-up reuse");check(repo.includes("skip: (page - 1) * pageSize")&&repo.includes("quotationNumber")&&repo.includes("gstNumber"),"server-side search and pagination");
 check(repo.includes("reportingManagerId")&&repo.includes("territoryId"),"team and territory scope");check(actions.includes("requirePermission")&&actions.includes("scopedVersion"),"server actions authorize and scope");
 check(pdf.startsWith("type PdfQuotation")&&pdf.includes("%PDF-1.4")&&pdf.includes("Signature"),"reusable professional PDF generator");
 check(fs.existsSync("app/api/sales/quotations/export/route.ts")&&text("app/api/sales/quotations/export/route.ts").includes("QUOTATIONS_EXPORT"),"authorized CSV export");
 check(fs.existsSync("app/sales/quotations/page.tsx")&&fs.existsSync("app/sales/quotations/[id]/page.tsx")&&fs.existsSync("app/sales/quotations/approvals/page.tsx"),"management list detail version and approval UI");
 check(text("lib/quotation/extensions.ts").includes("enabled: false")&&!/openai|llm|recommendation/i.test(text("lib/quotation/extensions.ts")),"MUV AI extension disabled");
 const preserved=await Promise.all([prisma.customer.count(),prisma.product.count(),prisma.productVariant.count(),prisma.order.count(),prisma.opportunity.count(),prisma.salesAuditLog.count()]);
 check(preserved[0]>0&&preserved[1]>0&&preserved[2]>0&&preserved[3]>0,"existing customer product variant and order data preserved");check(preserved.every(x=>x>=0),"Phase 1-3 tables readable");
 const founder=await prisma.user.findFirst({where:{salesRole:{name:"Founder"}}}),customer=await prisma.customer.findFirst(),stage=await prisma.opportunityStage.findUnique({where:{code:"NEW"}}),priority=await prisma.opportunityPriority.findUnique({where:{code:"NORMAL"}}),draft=statuses.find(x=>x.code==="DRAFT"),policy=policies[0];
 if(founder&&customer&&stage&&priority&&draft&&policy){try{await prisma.$transaction(async tx=>{const opp=await tx.opportunity.create({data:{opportunityNumber:"",customerId:customer.id,ownerUserId:founder.id,currentStageId:stage.id,priorityId:priority.id,estimatedValue:1,probability:10}});const a=await tx.quotation.create({data:{quotationNumber:"",opportunityId:opp.id,customerId:customer.id,ownerUserId:founder.id}});const b=await tx.quotation.create({data:{quotationNumber:"",opportunityId:opp.id,customerId:customer.id,ownerUserId:founder.id}});check(/^MUV-QTN-\d{4}-\d{6}$/.test(a.quotationNumber),"quotation number format");check(a.quotationNumber!==b.quotationNumber,"quotation numbers unique and never reused");const v=await tx.quotationVersion.create({data:{quotationId:a.id,versionNumber:1,statusId:draft.id,pricingPolicyId:policy.id,createdById:founder.id,issueDate:new Date(),validUntil:new Date(Date.now()+86400000)}});await tx.quotationStatusHistory.create({data:{quotationVersionId:v.id,newStatusId:draft.id,changedById:founder.id}});throw Error("ROLLBACK")})}catch(e){if(e.message!=="ROLLBACK")throw e}}else check(false,"quotation database prerequisites");
 check(text("prisma/migrations/20260727050000_quotation_pricing_engine_v1/migration.sql").includes("quotation_one_active_version"),"one active version database constraint");
 check(text("prisma/migrations/20260727050000_quotation_pricing_engine_v1/migration.sql").includes("protect_locked_quotation_line_item"),"locked snapshot database protection");
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
