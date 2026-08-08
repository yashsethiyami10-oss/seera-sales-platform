const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const crypto = require("node:crypto");
const p = new PrismaClient();
let passed=0,failed=0;
const check=(condition,name)=>condition?(passed++,console.log("PASS",name)):(failed++,console.error("FAIL",name));
const text=file=>fs.readFileSync(file,"utf8");
const rejects=async(fn,pattern)=>{try{await fn();return false}catch(error){return pattern.test(String(error.message))}};

(async()=>{
 const [configs,providers,models,tools,agents,definitions,prompts,permissions,roles]=await Promise.all([
  p.aiConfiguration.findMany(),p.aiProvider.findMany(),p.aiModelDefinition.findMany(),p.aiToolDefinition.findMany(),
  p.aiAgentDefinition.findMany(),p.aiWorkflowDefinition.findMany(),p.aiPromptTemplate.findMany(),
  p.salesPermission.findMany({where:{module:{in:["ai","ai_governance"]}}}),
  p.salesRole.findMany({include:{permissions:{include:{permission:true}}}}),
 ]);
 check(configs.length>=18,"Phase 7 configuration baseline remains seeded");
 check(new Set(configs.map(x=>x.key)).size===configs.length,"configuration keys unique");
 check(providers.length===2&&providers.some(x=>x.code==="MOCK"&&x.status==="ACTIVE"),"deterministic provider active");
 check(providers.some(x=>x.code==="OPENAI_RESERVED"&&x.status==="DISABLED"),"live provider reserved and disabled");
 check(models.length===1&&models[0].status==="ACTIVE","deterministic model configured");
 check(tools.length>=10&&new Set(tools.map(x=>x.code)).size===tools.length,"tool registry baseline remains unique");
 check(agents.length===7&&new Set(agents.map(x=>x.code)).size===7,"seven specialist agents registered");
 check(definitions.length===5,"governed workflow definitions seeded");
 check(prompts.length===3&&prompts.every(x=>x.status==="PUBLISHED"),"published prompt registry seeded");
 check(permissions.length===21,"Phase 7 permissions seeded");
 const keys=Object.fromEntries(roles.map(r=>[r.name,new Set(r.permissions.map(x=>x.permission.permissionKey))]));
 check(keys.Founder.has("ai.operations.manage")&&keys.Founder.has("ai.executive.use"),"Founder complete AI access");
 check(keys["System Administrator"].has("ai.providers.manage")&&!keys["System Administrator"].has("ai.executive.use"),"System Administrator operational scope");
 check(keys["Sales Manager"].has("ai.usage.view_team")&&!keys["Sales Manager"].has("ai.providers.manage"),"Sales Manager team scope");
 check(keys["Sales Officer"].has("ai.usage.view_own")&&!keys["Sales Officer"].has("ai.actions.approve"),"Sales Officer assigned scope");
 check(keys["Institutional Sales Officer"].has("ai.conversations.use")&&!keys["Institutional Sales Officer"].has("ai.usage.view_all"),"Institutional scoped usage");
 check(keys["Customer Support"].has("ai.knowledge.retrieve")&&!keys["Customer Support"].has("ai.actions.propose"),"Customer Support read-only support scope");
 const flags=Object.fromEntries(configs.filter(x=>x.category==="FEATURE_FLAG").map(x=>[x.key,x.value.enabled]));
 check(flags.AI_PLATFORM_ENABLED===true,"AI platform enabled");
 check(flags.LIVE_PROVIDER_INVOCATION===false,"live provider invocation disabled");
 check(flags.AI_ACTION_EXECUTION===false,"action execution disabled");
 check(flags.AI_HIGH_RISK_ACTIONS===false,"high-risk actions disabled");
 check(flags.AI_SCHEDULED_WORKFLOWS===false&&flags.AI_EVENT_WORKFLOWS===false,"scheduled and event workflows disabled");
 check(flags.AI_EXTERNAL_KNOWLEDGE===false&&flags.AI_STREAMING===false,"external knowledge and streaming disabled");

 const founder=await p.user.findUniqueOrThrow({where:{email:"admin@muv.co.in"}});
 const conversation=await p.aiConversation.create({data:{ownerId:founder.id,title:`Phase 7 verification ${Date.now()}`}});
 const message=await p.aiMessage.create({data:{conversationId:conversation.id,senderId:founder.id,role:"USER",content:"verification",correlationId:crypto.randomUUID()}});
 check(await rejects(()=>p.aiMessage.update({where:{id:message.id},data:{content:"mutated"}}),/immutable/i),"conversation messages reject UPDATE");
 check(await rejects(()=>p.aiMessage.delete({where:{id:message.id}}),/immutable/i),"conversation messages reject DELETE");
 const definition=definitions.find(x=>x.code==="READ_ONLY_ASSISTANCE");
 const workflow=await p.aiWorkflow.create({data:{conversationId:conversation.id,requestedById:founder.id,definitionId:definition.id,workflowType:"READ_ONLY",intent:"QUESTION",idempotencyKey:crypto.randomUUID(),correlationId:crypto.randomUUID()}});
 const checkpoint=await p.aiWorkflowCheckpoint.create({data:{workflowId:workflow.id,stepNumber:1,state:{status:"safe"},stateHash:"verification"}});
 check(await rejects(()=>p.aiWorkflowCheckpoint.update({where:{id:checkpoint.id},data:{stateHash:"changed"}}),/immutable/i),"workflow checkpoints reject UPDATE");
 const action=await p.aiActionRequest.create({data:{conversationId:conversation.id,workflowId:workflow.id,requestedById:founder.id,proposedByAgent:"FOUNDER_INTELLIGENCE",actionType:"PAYMENT_CHANGE",targetEntity:"Payment",inputPayload:{},previewPayload:{impact:"financial"},riskLevel:"HIGH",approvalPolicy:{required:true},status:"PENDING_APPROVAL",idempotencyKey:crypto.randomUUID()}});
 const decision=await p.aiApprovalDecision.create({data:{actionRequestId:action.id,actorId:founder.id,decision:"REJECTED",reason:"Verification",policyVersion:1}});
 check(await rejects(()=>p.aiApprovalDecision.update({where:{id:decision.id},data:{reason:"changed"}}),/immutable/i),"approval decisions reject UPDATE");
 const published=prompts[0];
 check(await rejects(()=>p.aiPromptTemplate.update({where:{id:published.id},data:{template:"unsafe"}}),/immutable/i),"published prompts reject UPDATE");

 const schema=text("prisma/schema.prisma"),migration=text("prisma/migrations/20260727080000_governed_muv_ai_v2/migration.sql");
 const security=text("lib/muv-ai/security.ts"),orchestrator=text("lib/muv-ai/orchestrator.ts"),toolRegistry=text("lib/muv-ai/tools.ts");
 const workflowService=text("lib/muv-ai/workflow.ts"),promptService=text("lib/muv-ai/prompt.ts"),gateway=text("lib/muv-ai/gateway.ts");
 const conversations=text("lib/muv-ai/conversations.ts"),actions=text("actions/muv-ai.ts"),navigation=text("lib/sales/navigation.ts");
 check(schema.includes("model AiConversation")&&schema.includes("model AiMessage")&&schema.includes("model AiSession"),"conversation and session schema");
 check(schema.includes("model AiKnowledgeRecord")&&schema.includes("model AiToolDefinition"),"knowledge and tool registry schema");
 check(schema.includes("model AiAgentDefinition")&&schema.includes("model AiWorkflow"),"agent and workflow schema");
 check(schema.includes("model AiActionRequest")&&schema.includes("model AiApprovalDecision"),"action and approval schema");
 check(schema.includes("model AiPromptTemplate")&&schema.includes("model AiModelInvocation"),"prompt and provider invocation schema");
 check(schema.includes("model AiMemory")&&schema.includes("model AiArtifact"),"memory and artifact schema");
 check(schema.includes("model AiSecurityEvent")&&schema.includes("model AiTelemetry")&&schema.includes("model AiIncident"),"security observability schema");
 check(migration.includes("FOREIGN KEY")&&migration.includes("ai_messages_immutable"),"foreign keys and message immutability");
 check(migration.includes("ai_published_prompts_immutable")&&migration.includes("ai_workflow_checkpoints_immutable"),"prompt and checkpoint immutability");
 check(security.includes("PROMPT_INJECTION_ATTEMPT")&&security.includes("sanitizeContext"),"prompt injection defense and context sanitization");
 check(security.includes("Cross-organization access denied")&&security.includes("rate limit"),"organization isolation and server rate limiting");
 check(orchestrator.includes("classifyIntent")&&orchestrator.includes("routeAgent"),"central intent and agent routing");
 check(orchestrator.includes("invokeTool")&&orchestrator.includes("invokeModel")&&orchestrator.includes("aiValidationResult.create"),"mandatory tool, gateway and validation pipeline");
 check(!orchestrator.includes("customer.update(")&&!orchestrator.includes("order.update("),"orchestrator cannot directly mutate business records");
 check(toolRegistry.includes("aiToolDefinition.findUnique")&&toolRegistry.includes("requiredPermission"),"registered tools enforce permissions");
 check(toolRegistry.includes("listCustomerIntelligence"),"tool adapter reuses business repository");
 check(workflowService.includes("Illegal workflow transition")&&workflowService.includes("idempotencyKey"),"workflow transitions and action idempotency");
 check(workflowService.includes("High-risk self-approval is prohibited"),"high-risk self approval protection");
 check(promptService.includes('status: "PUBLISHED"')&&promptService.includes("Missing prompt variables"),"published prompt and variable validation");
 check(gateway.includes("LIVE_PROVIDER_INVOCATION")&&gateway.includes('provider.code !== "MOCK"'),"model gateway controls live invocation");
 check(gateway.includes("routingPolicy")&&gateway.includes("aiModelInvocation"),"provider routing is traceable");
 check(conversations.includes("deletedAt")&&conversations.includes("participants"),"soft delete and participant access");
 check(conversations.includes("skip: (page - 1) * take"),"conversation search is server paginated");
 check(actions.includes("requireAiPermission")&&actions.includes("setAiKillSwitchAction"),"server actions authorize and kill switch audited");
 check(navigation.includes("PERMISSIONS.AI_CONVERSATIONS_USE")&&navigation.includes("PERMISSIONS.AI_OPERATIONS_VIEW"),"navigation generated from AI permissions");
 check(fs.existsSync("app/sales/ai/page.tsx")&&fs.existsSync("app/sales/ai/[id]/page.tsx"),"integrated AI workspace routes");
 check(fs.existsSync("app/sales/ai/executive/page.tsx")&&fs.existsSync("app/sales/ai/admin/page.tsx")&&fs.existsSync("app/sales/ai/operations/page.tsx"),"executive administration and operations routes");
 check(text("app/sales/ai/executive/page.tsx").includes("centralKpis"),"Founder workspace reuses centralized KPI definitions");
 check(text("app/api/sales/ai/conversations/route.ts").includes("statusForError")&&text("app/api/sales/ai/messages/route.ts").includes("statusForError"),"APIs return standardized safe errors");
 const secretLeak=await p.aiProvider.findMany().then(rows=>JSON.stringify(rows));
 check(!/sk-[A-Za-z0-9]{10,}|password|database_url/i.test(secretLeak),"provider registry contains no secrets");
 const core=await Promise.all([p.customer.count(),p.order.count(),p.product.count(),p.user.count(),p.customerIntelligenceProfile.count()]);
 check(core[0]>=4&&core[1]>=12&&core[2]>=13&&core[3]>=5,"Phases 0-6 business data preserved");
 check((await p.salesAuditLog.count())>=82,"existing immutable audit preserved");
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>p.$disconnect());
