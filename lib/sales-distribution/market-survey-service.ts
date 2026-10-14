import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { isTemplateSendable, sanitizeTemplateParam, templateFor, type WhatsAppTemplateKey } from "@/lib/messaging/whatsapp-templates";
import { dispatchOutboxEventById, dispatchWhatsAppOutbox, type WhatsAppOutboxPayload } from "@/lib/messaging/outbox-dispatch";
import { getMessagingProvider } from "@/lib/messaging";
import type { MessagingProvider } from "@/lib/messaging/types";

/**
 * Retailer Market Survey & Recovery.
 *
 * Field staff record why a retailer stopped (or never started) buying Seera. Every survey is one
 * authoritative SeeraMarketSurvey row that the staff form, the Founder panel and the Company Admin
 * panel all read. The survey is always saved, independent of WhatsApp: in the same transaction the
 * survey's follow-up decision is recorded in `whatsappState`, and a PENDING OutboxEvent is created
 * only when every gate passes:
 *   1. the retailer explicitly agreed to survey follow-up on WhatsApp (consent is never inferred
 *      from a phone number being given),
 *   2. the number normalizes to a valid Indian mobile and the latest consent decision recorded for
 *      that number is not a refusal/opt-out,
 *   3. the governed template is Meta-APPROVED with a real language code (whatsapp-templates.ts),
 *   4. SEERA_MARKET_SURVEY_WHATSAPP_ENABLED is exactly "true" (default off).
 * Otherwise the reason is stored (SKIPPED_NO_CONSENT, NO_MOBILE, INVALID_MOBILE, SKIPPED_OPTED_OUT,
 * AWAITING_TEMPLATE_CONFIGURATION, DISPATCH_DISABLED) and an authorized manager can re-queue later.
 * `followUpOutboxEventId` is unique and set with a guarded update, so a survey can never own two
 * follow-up sends, whatever the number of submits, retries or worker runs.
 */

export const MARKET_SURVEY_AGGREGATE = "SeeraMarketSurvey";
export const MARKET_SURVEY_THANK_YOU_EVENT = "MARKET_SURVEY_THANK_YOU";
// MARKETING template: at most one survey thank-you per number in this window, however many surveys.
export const THANK_YOU_REPEAT_DAYS = 30;

/**
 * Body-variable contract for the survey thank-you template (seera_retailer_survey_thankyou),
 * verified live 2026-10-13 (see whatsapp-templates.ts): exactly one variable, {{1}}, the name in
 * "नमस्ते {{1}} जी". Sent as the contact name, else the shop name - never blank. If this is ever
 * unverified (verified: false) or its count stops matching the registry, nothing is queued.
 */
export const THANK_YOU_TEMPLATE_CONTRACT: { verified: boolean; params: (survey: { contactName: string | null; shopName: string }) => string[] } = {
  verified: true,
  params: (survey) => [sanitizeTemplateParam(survey.contactName, sanitizeTemplateParam(survey.shopName, "Retailer"))],
};
export const MARKET_SURVEY_CATALOGUE_EVENT = "MARKET_SURVEY_CATALOGUE_LINK";
const CATALOGUE_LINK_DAYS = 30;

type Option = readonly [code: string, en: string, hi: string];
const codes = <T extends readonly Option[]>(options: T) => options.map(([code]) => code) as unknown as [T[number][0], ...T[number][0][]];
// Staff see "Choose an option" rather than Zod's raw enum text listing internal codes.
const choice = <T extends readonly Option[]>(options: T) => z.enum(codes(options), { errorMap: () => ({ message: "Choose an option" }) });

export const RELATIONSHIP_OPTIONS = [
  ["CURRENTLY_SELLS", "Currently sells Seera", "अभी सीरा बेचते हैं"],
  ["PREVIOUSLY_SOLD", "Previously sold Seera", "पहले सीरा बेचते थे"],
  ["STOPPED", "Sold Seera but stopped purchasing", "सीरा बेचा पर खरीदना बंद किया"],
  ["NEVER_SOLD", "Has never sold Seera", "कभी सीरा नहीं बेचा"],
] as const satisfies readonly Option[];

export const ISSUE_OPTIONS = [
  ["QUALITY", "Product quality / cleaning performance", "क्वालिटी / सफ़ाई"],
  ["BATCH_CONSISTENCY", "Batch-to-batch consistency", "हर बैच में फ़र्क"],
  ["FRAGRANCE", "Fragrance or other product characteristics", "खुशबू / अन्य गुण"],
  ["SUPPLY", "Irregular supply or stock-outs", "सप्लाई अनियमित / माल खत्म"],
  ["VISITS", "Salesperson visits are irregular", "सेल्समैन नियमित नहीं आते"],
  ["COMPETITOR_SELLING", "Competitor's product is selling well", "दूसरा ब्रांड अच्छा बिक रहा"],
  ["CUSTOMER_DEMANDS_OTHER", "Customers ask for another brand", "ग्राहक दूसरा ब्रांड माँगते हैं"],
  ["MARGIN_PRICE", "Retailer margin or purchase price", "मार्जिन / खरीद रेट"],
  ["PACKAGING_AVAILABILITY", "Packaging or product availability", "पैकिंग / उपलब्धता"],
  ["ORDER_DELIVERY", "Payment / order / delivery inconvenience", "पेमेंट / ऑर्डर / डिलीवरी में परेशानी"],
  ["LOW_DEMAND", "Lack of customer demand", "ग्राहक माँग नहीं"],
  ["OTHER", "Other reason", "अन्य कारण"],
] as const satisfies readonly Option[];

export const ACTION_OPTIONS = [
  ["INVESTIGATE_QUALITY", "Investigate a quality complaint", "क्वालिटी शिकायत जाँचें"],
  ["VERIFY_BATCH", "Verify a specific batch", "बैच जाँचें"],
  ["IMPROVE_SUPPLY", "Improve supply frequency", "सप्लाई बढ़ाएँ"],
  ["FIXED_VISIT_DAY", "Assign a fixed weekly visit day", "हफ़्ते का तय विज़िट दिन"],
  ["REVIEW_PRICING", "Review pricing and retailer economics", "रेट / मार्जिन देखें"],
  ["DEMO_SAMPLE", "Product demonstration / sample", "डेमो / सैंपल"],
  ["PAID_TRIAL", "Offer a small paid trial order", "छोटा पेड ट्रायल ऑर्डर"],
  ["SHARE_CATALOGUE", "Share current catalogue / rate list", "कैटलॉग / रेट लिस्ट भेजें"],
  ["FOLLOW_UP_CALL", "Arrange a follow-up call", "फ़ॉलो-अप कॉल"],
  ["NO_FOLLOW_UP", "No follow-up requested", "फ़ॉलो-अप नहीं चाहिए"],
  ["OTHER", "Other action", "अन्य"],
] as const satisfies readonly Option[];

export const TRI_OPTIONS = [
  ["YES", "Yes", "हाँ"],
  ["NO", "No", "नहीं"],
  ["MAYBE", "Maybe", "शायद"],
  ["UNKNOWN", "Not known", "पता नहीं"],
] as const satisfies readonly Option[];

export const CONSENT_OPTIONS = [
  ["GRANTED", "Agrees to WhatsApp follow-up", "WhatsApp फ़ॉलो-अप के लिए सहमत"],
  ["REFUSED", "Refused / does not want messages", "मना किया / मैसेज नहीं चाहिए"],
  ["NOT_ASKED", "Not asked", "पूछा नहीं"],
] as const satisfies readonly Option[];

export const CONSENT_SCOPE_OPTIONS = [
  ["SURVEY_FOLLOW_UP", "Survey thank-you & follow-up on WhatsApp", "सर्वे धन्यवाद और फ़ॉलो-अप (WhatsApp)"],
  ["CATALOGUE_ORDER_INFO", "Requested catalogue / order information", "माँगी गई कैटलॉग / ऑर्डर जानकारी"],
  ["OTHER", "Other (describe)", "अन्य (लिखें)"],
] as const satisfies readonly Option[];

export const FOLLOW_UP_STATUS_OPTIONS = [
  ["NEW", "New", "नया"],
  ["CONTACT_REQUIRED", "Contact required", "संपर्क करना है"],
  ["QUALITY_INVESTIGATION", "Quality investigation", "क्वालिटी जाँच"],
  ["SUPPLY_INVESTIGATION", "Supply issue investigation", "सप्लाई जाँच"],
  ["INTERESTED_IN_TRIAL", "Interested in trial", "ट्रायल में रुचि"],
  ["CATALOGUE_REQUESTED", "Catalogue requested", "कैटलॉग माँगा"],
  ["TRIAL_ORDER_PLACED", "Trial order placed", "ट्रायल ऑर्डर हुआ"],
  ["FOLLOW_UP_SCHEDULED", "Follow-up scheduled", "फ़ॉलो-अप तय"],
  ["NOT_INTERESTED", "Not interested", "रुचि नहीं"],
  ["RESOLVED", "Resolved", "हल हुआ"],
] as const satisfies readonly Option[];

export const WHATSAPP_STATE_LABELS: Record<string, [string, string]> = {
  QUEUED: ["Queued for WhatsApp", "WhatsApp कतार में"],
  SKIPPED_RECENTLY_THANKED: ["Not sent: already thanked recently", "नहीं भेजा: हाल ही में धन्यवाद भेजा"],
  SKIPPED_NO_CONSENT: ["Not sent: no consent", "नहीं भेजा: सहमति नहीं"],
  SKIPPED_OPTED_OUT: ["Not sent: opted out", "नहीं भेजा: मना किया"],
  NO_MOBILE: ["Not sent: no mobile number", "नहीं भेजा: नंबर नहीं"],
  INVALID_MOBILE: ["Not sent: invalid mobile", "नहीं भेजा: गलत नंबर"],
  AWAITING_TEMPLATE_CONFIGURATION: ["Awaiting approved WhatsApp template", "स्वीकृत WhatsApp टेम्पलेट की प्रतीक्षा"],
  DISPATCH_DISABLED: ["Saved; WhatsApp sending is switched off", "सेव हुआ; WhatsApp भेजना बंद है"],
  CANCELLED_OPT_OUT: ["Cancelled after opt-out", "मना करने के बाद रद्द"],
};

export const labelFor = (options: readonly Option[], code: string | null | undefined, language: "EN" | "HI") => {
  const found = options.find(([c]) => c === code);
  return found ? (language === "HI" ? found[2] : found[1]) : code ?? "-";
};

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : undefined));
const optionalMoney = z.coerce.number().min(0).max(1_000_000).optional();

export const marketSurveyInput = z
  .object({
    idempotencyKey: z.string().trim().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
    shopName: text(160).min(2, "Shop name is required"),
    contactName: optionalText(120),
    mobile: optionalText(20),
    market: text(120).min(2, "Market / area is required"),
    address: optionalText(400),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    gpsAccuracyM: z.coerce.number().int().min(0).max(100_000).optional(),
    retailerId: optionalText(40),
    relationship: choice(RELATIONSHIP_OPTIONS),
    issues: z.array(choice(ISSUE_OPTIONS)).max(ISSUE_OPTIONS.length).default([]),
    issueOther: optionalText(300),
    retailerWords: optionalText(2000),
    staffInterpretation: optionalText(2000),
    competitorBrand: optionalText(120),
    competitorPackSize: optionalText(60),
    competitorPurchasePrice: optionalMoney,
    competitorMrp: optionalMoney,
    competitorWeeklyUnits: z.coerce.number().int().min(0).max(1_000_000).optional(),
    competitorReason: optionalText(600),
    competitorVisitFrequency: optionalText(120),
    willingToReconsider: choice(TRI_OPTIONS),
    shelfSpace: choice(TRI_OPTIONS),
    trialQuantityOk: choice(TRI_OPTIONS),
    wantsTesting: z.boolean().default(false),
    wantsQuotation: z.boolean().default(false),
    wantsFollowUp: z.boolean().default(false),
    notInterested: z.boolean().default(false),
    preferredFollowUpAt: z.coerce.date().optional(),
    notes: optionalText(2000),
    recommendedActions: z.array(choice(ACTION_OPTIONS)).max(ACTION_OPTIONS.length).default([]),
    recommendedActionOther: optionalText(300),
    consentStatus: choice(CONSENT_OPTIONS),
    consentScopes: z.array(choice(CONSENT_SCOPE_OPTIONS)).max(CONSENT_SCOPE_OPTIONS.length).default([]),
    consentOther: optionalText(300),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.issues.includes("OTHER") && !v.issueOther) issue("issueOther", "Describe the other reason");
    if (v.recommendedActions.includes("OTHER") && !v.recommendedActionOther) issue("recommendedActionOther", "Describe the other action");
    if (v.consentStatus === "GRANTED" && v.consentScopes.length === 0) issue("consentScopes", "Choose what the retailer agreed to receive");
    if (v.consentStatus !== "GRANTED" && v.consentScopes.length > 0) issue("consentScopes", "Scopes apply only when the retailer agreed");
    if (v.consentScopes.includes("OTHER") && !v.consentOther) issue("consentOther", "Describe the other communication");
    // A number is needed only when contact is being collected for follow-up.
    if ((v.consentStatus === "GRANTED" || v.wantsFollowUp) && !v.mobile) issue("mobile", "Mobile number is required for follow-up");
    if (v.mobile && !normalizeIndianMobile(v.mobile)) issue("mobile", "Enter a valid 10-digit Indian mobile number");
    if ((v.latitude === undefined) !== (v.longitude === undefined)) issue("latitude", "GPS needs both latitude and longitude");
    if (v.notInterested && v.willingToReconsider === "YES") issue("notInterested", "Not interested conflicts with willing to reconsider");
  });
export type MarketSurveyInput = z.input<typeof marketSurveyInput>;

export const surveyDispatchEnabled = (env: Record<string, string | undefined> = process.env) => env.SEERA_MARKET_SURVEY_WHATSAPP_ENABLED === "true";

function reference(now: Date) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `MS-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

const tenDigits = (mobile: string | null | undefined) => (mobile ? mobile.replace(/\D/g, "").slice(-10) : "");

type Db = PrismaClient | Prisma.TransactionClient;

/** Latest consent decision recorded for this canonical number (any survey). */
async function latestConsentForMobile(db: Db, mobile: string) {
  return db.seeraMarketSurvey.findFirst({
    where: { mobile, consentStatus: { in: ["GRANTED", "REFUSED"] } },
    orderBy: [{ consentAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, consentStatus: true },
  });
}

type SkipState = "SKIPPED_NO_CONSENT" | "SKIPPED_OPTED_OUT" | "SKIPPED_RECENTLY_THANKED" | "NO_MOBILE" | "INVALID_MOBILE" | "AWAITING_TEMPLATE_CONFIGURATION" | "DISPATCH_DISABLED";
type FollowUpDecision =
  | { state: "QUEUED"; templateKey: WhatsAppTemplateKey; languageCode: string; templateName: string }
  | { state: SkipState };

export async function decideWhatsApp(
  db: Db,
  input: { consentStatus: string; consentScopes: string[]; mobile: string | null; requiredScope: "SURVEY_FOLLOW_UP" | "CATALOGUE_ORDER_INFO"; templateKey: WhatsAppTemplateKey; surveyId?: string },
  env: Record<string, string | undefined> = process.env,
): Promise<FollowUpDecision> {
  if (input.consentStatus !== "GRANTED" || !input.consentScopes.includes(input.requiredScope)) return { state: "SKIPPED_NO_CONSENT" };
  if (!input.mobile) return { state: "NO_MOBILE" };
  if (!normalizeIndianMobile(input.mobile)) return { state: "INVALID_MOBILE" };
  const latest = await latestConsentForMobile(db, input.mobile);
  if (latest && latest.consentStatus === "REFUSED" && latest.id !== input.surveyId) return { state: "SKIPPED_OPTED_OUT" };
  if (input.templateKey === "MARKET_SURVEY_THANK_YOU" && !THANK_YOU_TEMPLATE_CONTRACT.verified) return { state: "AWAITING_TEMPLATE_CONFIGURATION" };
  if (input.templateKey === "MARKET_SURVEY_THANK_YOU") {
    const since = new Date(Date.now() - THANK_YOU_REPEAT_DAYS * 86_400_000);
    const recent = await db.seeraMarketSurvey.findFirst({ where: { mobile: input.mobile, followUpOutboxEventId: { not: null }, createdAt: { gte: since }, ...(input.surveyId ? { NOT: { id: input.surveyId } } : {}) }, select: { id: true } });
    if (recent) return { state: "SKIPPED_RECENTLY_THANKED" };
  }
  const template = templateFor(input.templateKey);
  if (!isTemplateSendable(template)) return { state: "AWAITING_TEMPLATE_CONFIGURATION" };
  // Parameter count must match the approved template exactly; a mismatch is a configuration gap,
  // reported as awaiting configuration (the survey still saves) rather than sent or thrown.
  if (input.templateKey === "MARKET_SURVEY_THANK_YOU" && THANK_YOU_TEMPLATE_CONTRACT.params({ contactName: null, shopName: "-" }).length !== template.paramLabels.length) {
    console.error("market_survey.template_contract_mismatch", { templateKey: input.templateKey });
    return { state: "AWAITING_TEMPLATE_CONFIGURATION" };
  }
  if (!surveyDispatchEnabled(env)) return { state: "DISPATCH_DISABLED" };
  return { state: "QUEUED", templateKey: input.templateKey, languageCode: template.languageCode, templateName: template.metaTemplateName };
}

async function staffName(db: Db, userId: string) {
  return sanitizeTemplateParam((await db.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name, "Seera representative");
}

async function createFollowUpOutbox(tx: Prisma.TransactionClient, survey: { id: string; mobile: string | null; contactName: string | null; shopName: string; createdAt: Date; staffUserId: string }, decision: Extract<FollowUpDecision, { state: "QUEUED" }>) {
  // Exactly the verified template's variables, in order; a count mismatch with the registry is a
  // configuration error and must never reach Meta.
  const templateParams = THANK_YOU_TEMPLATE_CONTRACT.params(survey).map((p) => sanitizeTemplateParam(p));
  if (templateParams.length !== templateFor(decision.templateKey).paramLabels.length) throw new FoundationError("TEMPLATE_CONTRACT_MISMATCH", "Survey thank-you parameters do not match the approved template", 500);
  const payload: WhatsAppOutboxPayload = {
    mobile: survey.mobile!,
    templateName: decision.templateName,
    templateParams,
    templateKey: decision.templateKey,
    languageCode: decision.languageCode,
  };
  const event = await tx.outboxEvent.create({
    data: { eventType: MARKET_SURVEY_THANK_YOU_EVENT, aggregateType: MARKET_SURVEY_AGGREGATE, aggregateId: survey.id, payload: payload as unknown as Prisma.InputJsonValue, status: "PENDING", channel: "WHATSAPP", templateKey: decision.templateKey },
  });
  // Guarded: only the first writer wins, so a survey owns at most one follow-up send.
  const claimed = await tx.seeraMarketSurvey.updateMany({ where: { id: survey.id, followUpOutboxEventId: null }, data: { followUpOutboxEventId: event.id, whatsappState: "QUEUED" } });
  if (claimed.count !== 1) throw new FoundationError("FOLLOW_UP_ALREADY_QUEUED", "A follow-up message already exists for this survey", 409);
  return event.id;
}

function scheduleImmediateDispatch(db: PrismaClient, outboxEventId: string) {
  try {
    after(() => dispatchOutboxEventById(db, getMessagingProvider, outboxEventId).catch((error) => console.error("market_survey.immediate_dispatch_failed", { outboxEventId, error: error instanceof Error ? error.message : "unknown" })));
  } catch {
    // Outside a request scope (scripts/tests): the PENDING row stays for the batch worker.
  }
}

export async function submitMarketSurvey(db: PrismaClient, actorId: string, raw: unknown, env: Record<string, string | undefined> = process.env) {
  await authorize(db, { actorId, permission: "market_survey:create" });
  const input = marketSurveyInput.parse(raw);

  const existing = await db.seeraMarketSurvey.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.staffUserId !== actorId) throw new FoundationError("IDEMPOTENCY_KEY_CONFLICT", "This submission key belongs to another user", 409);
    return { survey: existing, replayed: true as const };
  }

  if (input.retailerId) {
    const permissions = await effectivePermissions(db, actorId);
    const retailer = await db.seeraRetailer.findUnique({ where: { id: input.retailerId }, select: { id: true, salespersonId: true, createdById: true } });
    const allowed = retailer && (permissions.has("market_survey:view_all") || permissions.has("system:super_admin") || retailer.salespersonId === actorId || retailer.createdById === actorId);
    if (!allowed) throw new FoundationError("RETAILER_SCOPE_DENIED", "That retailer cannot be linked by this user", 403);
  }

  const mobile = input.mobile ? normalizeIndianMobile(input.mobile) : null;
  const now = new Date();
  try {
    const result = await db.$transaction(async (tx) => {
      const decision = await decideWhatsApp(tx, { consentStatus: input.consentStatus, consentScopes: input.consentScopes, mobile, requiredScope: "SURVEY_FOLLOW_UP", templateKey: "MARKET_SURVEY_THANK_YOU" }, env);
      const survey = await tx.seeraMarketSurvey.create({
        data: {
          reference: reference(now),
          idempotencyKey: input.idempotencyKey,
          staffUserId: actorId,
          retailerId: input.retailerId,
          shopName: input.shopName,
          contactName: input.contactName,
          mobile,
          market: input.market,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          gpsAccuracyM: input.gpsAccuracyM,
          relationship: input.relationship,
          issues: [...new Set(input.issues)],
          issueOther: input.issueOther,
          retailerWords: input.retailerWords,
          staffInterpretation: input.staffInterpretation,
          competitorBrand: input.competitorBrand,
          competitorPackSize: input.competitorPackSize,
          competitorPurchasePrice: input.competitorPurchasePrice,
          competitorMrp: input.competitorMrp,
          competitorWeeklyUnits: input.competitorWeeklyUnits,
          competitorReason: input.competitorReason,
          competitorVisitFrequency: input.competitorVisitFrequency,
          willingToReconsider: input.willingToReconsider,
          shelfSpace: input.shelfSpace,
          trialQuantityOk: input.trialQuantityOk,
          wantsTesting: input.wantsTesting,
          wantsQuotation: input.wantsQuotation,
          wantsFollowUp: input.wantsFollowUp,
          notInterested: input.notInterested,
          preferredFollowUpAt: input.preferredFollowUpAt,
          notes: input.notes,
          recommendedActions: [...new Set(input.recommendedActions)],
          recommendedActionOther: input.recommendedActionOther,
          consentStatus: input.consentStatus,
          consentScopes: [...new Set(input.consentScopes)],
          consentOther: input.consentOther,
          consentAt: input.consentStatus === "NOT_ASKED" ? null : now,
          consentSource: input.consentStatus === "NOT_ASKED" ? null : "FIELD_SURVEY_IN_PERSON",
          followUpStatus: input.notInterested ? "NOT_INTERESTED" : input.wantsFollowUp || input.willingToReconsider !== "NO" ? "CONTACT_REQUIRED" : "NEW",
          followUpDueAt: input.preferredFollowUpAt,
          whatsappState: decision.state === "QUEUED" ? "DISPATCH_DISABLED" : decision.state,
        },
      });
      await tx.seeraMarketSurveyActivity.create({ data: { surveyId: survey.id, actorId, type: "SUBMITTED", toStatus: survey.followUpStatus, details: { whatsappState: decision.state } } });
      const outboxEventId = decision.state === "QUEUED" ? await createFollowUpOutbox(tx, survey, decision) : null;
      await recordAudit(tx, { actorId, action: "market_survey.submitted", entityType: "SeeraMarketSurvey", entityId: survey.id, details: { reference: survey.reference, whatsappState: decision.state, consentStatus: survey.consentStatus } });
      return { survey: { ...survey, whatsappState: decision.state, followUpOutboxEventId: outboxEventId }, outboxEventId };
    });
    if (result.outboxEventId) scheduleImmediateDispatch(db, result.outboxEventId);
    return { survey: result.survey, replayed: false as const };
  } catch (error) {
    // Concurrent double-submit with the same key: the loser returns the winner's record.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.seeraMarketSurvey.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (winner && winner.staffUserId === actorId) return { survey: winner, replayed: true as const };
    }
    throw error;
  }
}

async function surveyAccess(db: PrismaClient, actorId: string) {
  const permissions = await effectivePermissions(db, actorId);
  const all = permissions.has("market_survey:view_all") || permissions.has("system:super_admin");
  const manage = permissions.has("market_survey:manage") || permissions.has("system:super_admin");
  if (!all && !permissions.has("market_survey:create")) throw new FoundationError("ACCESS_DENIED", "Market survey access denied", 403);
  return { all, manage };
}

export type SurveyFilters = {
  q?: string;
  issue?: string;
  from?: string;
  to?: string;
  staffId?: string;
  willing?: string;
  consent?: string;
  status?: string;
  market?: string;
};

function filterWhere(filters: SurveyFilters, scope: { all: boolean; actorId: string }): Prisma.SeeraMarketSurveyWhereInput {
  const and: Prisma.SeeraMarketSurveyWhereInput[] = [];
  if (!scope.all) and.push({ staffUserId: scope.actorId });
  const q = filters.q?.trim().slice(0, 80);
  if (q) {
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { shopName: { contains: q, mode: "insensitive" } },
        { market: { contains: q, mode: "insensitive" } },
        { competitorBrand: { contains: q, mode: "insensitive" } },
        { reference: { contains: q.toUpperCase() } },
        ...(digits.length >= 4 ? [{ mobile: { contains: digits.slice(-10) } }] : []),
      ],
    });
  }
  if (filters.issue && ISSUE_OPTIONS.some(([c]) => c === filters.issue)) and.push({ issues: { has: filters.issue } });
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
  if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lt: new Date(to.getTime() + 86_400_000) } });
  if (filters.staffId && scope.all) and.push({ staffUserId: filters.staffId });
  if (filters.willing && TRI_OPTIONS.some(([c]) => c === filters.willing)) and.push({ willingToReconsider: filters.willing });
  if (filters.consent && CONSENT_OPTIONS.some(([c]) => c === filters.consent)) and.push({ consentStatus: filters.consent });
  if (filters.status && FOLLOW_UP_STATUS_OPTIONS.some(([c]) => c === filters.status)) and.push({ followUpStatus: filters.status });
  if (filters.market) and.push({ market: { equals: filters.market.slice(0, 120), mode: "insensitive" } });
  return and.length ? { AND: and } : {};
}

/** Display state for the follow-up message: the survey's own reason, or the live outbox status. */
export function whatsappDisplayState(survey: { whatsappState: string }, outbox?: { status: string; lastErrorCode: string | null; providerMessageId?: string | null } | null) {
  if (!outbox) return survey.whatsappState;
  if (outbox.status === "PENDING" || outbox.status === "PROCESSING") return "QUEUED";
  if (outbox.status === "PUBLISHED") return "SENT";
  if (outbox.status === "DELIVERED") return "DELIVERED";
  if (outbox.status === "READ") return "READ";
  if (outbox.lastErrorCode === "CONSENT_WITHDRAWN") return "CANCELLED_OPT_OUT";
  // Meta accepted it, then reported a delivery failure via webhook: final, nothing will retry it.
  if (outbox.providerMessageId) return "FAILED";
  return outbox.status === "FAILED" ? "RETRYING" : "FAILED";
}

export async function listMarketSurveys(db: PrismaClient, actorId: string, filters: SurveyFilters, page = 1) {
  const access = await surveyAccess(db, actorId);
  const where = filterWhere(filters, { all: access.all, actorId });
  const take = 25;
  const [rows, total] = await Promise.all([
    db.seeraMarketSurvey.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * take,
      take,
      select: { id: true, reference: true, shopName: true, market: true, mobile: true, relationship: true, issues: true, willingToReconsider: true, shelfSpace: true, consentStatus: true, followUpStatus: true, whatsappState: true, followUpOutboxEventId: true, createdAt: true, staff: { select: { name: true, email: true } } },
    }),
    db.seeraMarketSurvey.count({ where }),
  ]);
  const outbox = await outboxById(db, rows.map((r) => r.followUpOutboxEventId));
  return {
    access,
    total,
    pageSize: take,
    rows: rows.map((r) => ({ ...r, mobile: access.all ? r.mobile : maskMobile(r.mobile), whatsapp: whatsappDisplayState(r, r.followUpOutboxEventId ? outbox.get(r.followUpOutboxEventId) : null) })),
  };
}

async function outboxById(db: PrismaClient, ids: (string | null)[]) {
  const wanted = ids.filter((id): id is string => Boolean(id));
  const rows = wanted.length ? await db.outboxEvent.findMany({ where: { id: { in: wanted } }, select: { id: true, status: true, lastErrorCode: true, attempts: true, sentAt: true, deliveredAt: true, readAt: true, providerMessageId: true } }) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

export const maskMobile = (mobile: string | null) => (mobile ? `${mobile.slice(0, 4)}••••${mobile.slice(-2)}` : null);

const ORDER_EXCLUDED = ["DRAFT", "REJECTED", "CANCELLED"] as const;

export async function marketSurveyDashboard(db: PrismaClient, actorId: string, filters: SurveyFilters) {
  const access = await surveyAccess(db, actorId);
  if (!access.all) throw new FoundationError("ACCESS_DENIED", "Market recovery dashboard requires view-all access", 403);
  const where = filterWhere(filters, { all: true, actorId });
  const count = (extra: Prisma.SeeraMarketSurveyWhereInput) => db.seeraMarketSurvey.count({ where: { AND: [where, extra] } });
  const [total, previouslyActive, quality, supply, price, willing, shelf, followUp, declined, areaRows, outboxIds, linked] = await Promise.all([
    count({}),
    count({ relationship: { in: ["PREVIOUSLY_SOLD", "STOPPED", "CURRENTLY_SELLS"] } }),
    count({ issues: { hasSome: ["QUALITY", "BATCH_CONSISTENCY"] } }),
    count({ issues: { hasSome: ["SUPPLY", "VISITS"] } }),
    count({ issues: { has: "MARGIN_PRICE" } }),
    count({ willingToReconsider: { in: ["YES", "MAYBE"] } }),
    count({ shelfSpace: "YES" }),
    count({ followUpStatus: { notIn: ["RESOLVED", "NOT_INTERESTED"] } }),
    count({ consentStatus: "REFUSED" }),
    db.seeraMarketSurvey.groupBy({ by: ["market"], where, _count: { _all: true }, orderBy: { _count: { market: "desc" } }, take: 15 }),
    db.seeraMarketSurvey.findMany({ where: { AND: [where, { followUpOutboxEventId: { not: null } }] }, select: { followUpOutboxEventId: true } }),
    db.seeraMarketSurvey.findMany({ where: { AND: [where, { retailerId: { not: null } }] }, select: { retailerId: true, createdAt: true } }),
  ]);
  const [areaWilling, areaShelf, whatsappStates, outbox] = await Promise.all([
    db.seeraMarketSurvey.groupBy({ by: ["market"], where: { AND: [where, { willingToReconsider: { in: ["YES", "MAYBE"] } }] }, _count: { _all: true } }),
    db.seeraMarketSurvey.groupBy({ by: ["market"], where: { AND: [where, { shelfSpace: "YES" }] }, _count: { _all: true } }),
    db.seeraMarketSurvey.groupBy({ by: ["whatsappState"], where: { AND: [where, { followUpOutboxEventId: null }] }, _count: { _all: true } }),
    outboxById(db, outboxIds.map((r) => r.followUpOutboxEventId)),
  ]);
  const whatsapp: Record<string, number> = {};
  for (const row of whatsappStates) whatsapp[row.whatsappState] = row._count._all;
  for (const row of outbox.values()) {
    const state = whatsappDisplayState({ whatsappState: "QUEUED" }, row);
    whatsapp[state] = (whatsapp[state] ?? 0) + 1;
  }
  // Orders are counted only for surveys linked to an existing retailer record, and only orders
  // created after that retailer's first survey. Payment status is not inferred here.
  const firstSurveyByRetailer = new Map<string, Date>();
  for (const s of linked) if (s.retailerId && (!firstSurveyByRetailer.has(s.retailerId) || s.createdAt < firstSurveyByRetailer.get(s.retailerId)!)) firstSurveyByRetailer.set(s.retailerId, s.createdAt);
  const orders = firstSurveyByRetailer.size
    ? await db.seeraSalesOrder.findMany({ where: { retailerId: { in: [...firstSurveyByRetailer.keys()] }, status: { notIn: [...ORDER_EXCLUDED] } }, select: { retailerId: true, createdAt: true } })
    : [];
  const ordersPerRetailer = new Map<string, number>();
  for (const o of orders) if (o.retailerId && o.createdAt > firstSurveyByRetailer.get(o.retailerId)!) ordersPerRetailer.set(o.retailerId, (ordersPerRetailer.get(o.retailerId) ?? 0) + 1);
  const willingByArea = new Map(areaWilling.map((r) => [r.market, r._count._all]));
  const shelfByArea = new Map(areaShelf.map((r) => [r.market, r._count._all]));
  return {
    total,
    previouslyActive,
    quality,
    supply,
    price,
    willing,
    shelf,
    followUp,
    declined,
    whatsapp,
    linkedRetailers: firstSurveyByRetailer.size,
    retailersOrderedSinceSurvey: [...ordersPerRetailer.values()].filter((n) => n >= 1).length,
    retailersRepeatOrderedSinceSurvey: [...ordersPerRetailer.values()].filter((n) => n >= 2).length,
    areas: areaRows.map((r) => ({ market: r.market, surveys: r._count._all, willing: willingByArea.get(r.market) ?? 0, shelf: shelfByArea.get(r.market) ?? 0 })),
    templates: (["MARKET_SURVEY_THANK_YOU", "MARKET_SURVEY_CATALOGUE_LINK"] as const).map((key) => {
      const t = templateFor(key);
      return { key, name: t.metaTemplateName, approvalStatus: t.approvalStatus, languageCode: t.languageCode, params: t.paramLabels, sendable: isTemplateSendable(t) };
    }),
    dispatchEnabled: surveyDispatchEnabled(),
  };
}

export async function getMarketSurveyDetail(db: PrismaClient, actorId: string, surveyId: string) {
  const access = await surveyAccess(db, actorId);
  const survey = await db.seeraMarketSurvey.findUnique({
    where: { id: surveyId },
    include: {
      staff: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      retailer: { select: { id: true, code: true, businessName: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true, email: true } } } },
      links: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, purpose: true, createdAt: true, expiresAt: true, revokedAt: true, viewCount: true, lastViewedAt: true, outboxEventId: true } },
    },
  });
  if (!survey || (!access.all && survey.staffUserId !== actorId)) throw new FoundationError("NOT_FOUND", "Survey not found", 404);
  const outbox = await outboxById(db, [survey.followUpOutboxEventId, ...survey.links.map((l) => l.outboxEventId)]);
  const followUpOutbox = survey.followUpOutboxEventId ? outbox.get(survey.followUpOutboxEventId) ?? null : null;
  return {
    access,
    survey: { ...survey, mobile: access.all ? survey.mobile : maskMobile(survey.mobile) },
    followUpOutbox,
    whatsapp: whatsappDisplayState(survey, followUpOutbox),
    links: survey.links.map((l) => ({ ...l, whatsapp: l.outboxEventId ? whatsappDisplayState({ whatsappState: "QUEUED" }, outbox.get(l.outboxEventId)) : null })),
  };
}

async function requireManage(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "market_survey:manage" });
}

export const followUpUpdateInput = z.object({
  status: choice(FOLLOW_UP_STATUS_OPTIONS).optional(),
  assigneeId: z.string().trim().max(40).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  trialAgreed: z.boolean().nullable().optional(),
  outcome: optionalText(1000),
  note: optionalText(2000),
});

export async function updateMarketSurveyFollowUp(db: PrismaClient, actorId: string, surveyId: string, raw: unknown) {
  await requireManage(db, actorId);
  const input = followUpUpdateInput.parse(raw);
  const survey = await db.seeraMarketSurvey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new FoundationError("NOT_FOUND", "Survey not found", 404);
  if (input.assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, status: true } });
    const perms = assignee?.status === "ACTIVE" ? await effectivePermissions(db, assignee.id) : new Set<string>();
    if (!perms.has("market_survey:create") && !perms.has("market_survey:manage")) throw new FoundationError("ASSIGNEE_NOT_AUTHORIZED", "Follow-up can only be assigned to active, authorized staff", 400);
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.seeraMarketSurvey.update({
      where: { id: surveyId },
      data: {
        ...(input.status ? { followUpStatus: input.status } : {}),
        ...(input.assigneeId !== undefined ? { followUpAssigneeId: input.assigneeId } : {}),
        ...(input.dueAt !== undefined ? { followUpDueAt: input.dueAt } : {}),
        ...(input.trialAgreed !== undefined ? { trialAgreed: input.trialAgreed } : {}),
        ...(input.outcome ? { lastOutcome: input.outcome } : {}),
      },
    });
    const activities: Prisma.SeeraMarketSurveyActivityCreateManyInput[] = [];
    if (input.status && input.status !== survey.followUpStatus) activities.push({ surveyId, actorId, type: "STATUS_CHANGED", fromStatus: survey.followUpStatus, toStatus: input.status });
    if (input.assigneeId !== undefined && input.assigneeId !== survey.followUpAssigneeId) activities.push({ surveyId, actorId, type: "ASSIGNED", details: { from: survey.followUpAssigneeId, to: input.assigneeId } });
    if (input.dueAt !== undefined && (input.dueAt?.getTime() ?? null) !== (survey.followUpDueAt?.getTime() ?? null)) activities.push({ surveyId, actorId, type: "DUE_DATE_SET", details: { dueAt: input.dueAt?.toISOString() ?? null } });
    if (input.trialAgreed !== undefined && input.trialAgreed !== survey.trialAgreed) activities.push({ surveyId, actorId, type: "TRIAL_RECORDED", details: { trialAgreed: input.trialAgreed } });
    if (input.outcome) activities.push({ surveyId, actorId, type: "OUTCOME_RECORDED", note: input.outcome });
    if (input.note) activities.push({ surveyId, actorId, type: "NOTE", note: input.note });
    if (activities.length) await tx.seeraMarketSurveyActivity.createMany({ data: activities });
    await recordAudit(tx, { actorId, action: "market_survey.follow_up_updated", entityType: "SeeraMarketSurvey", entityId: surveyId, beforeState: { followUpStatus: survey.followUpStatus, followUpAssigneeId: survey.followUpAssigneeId, trialAgreed: survey.trialAgreed }, afterState: { followUpStatus: updated.followUpStatus, followUpAssigneeId: updated.followUpAssigneeId, trialAgreed: updated.trialAgreed } });
    return updated;
  });
}

/** Records a refusal/opt-out: cancels any not-yet-sent messages and revokes catalogue links. */
export async function recordMarketSurveyOptOut(db: PrismaClient, actorId: string, surveyId: string, raw: unknown) {
  await requireManage(db, actorId);
  const { basis } = z.object({ basis: text(300).min(3, "Record how the retailer communicated the opt-out") }).parse(raw);
  const survey = await db.seeraMarketSurvey.findUnique({ where: { id: surveyId }, include: { links: { select: { id: true, outboxEventId: true } } } });
  if (!survey) throw new FoundationError("NOT_FOUND", "Survey not found", 404);
  const outboxIds = [survey.followUpOutboxEventId, ...survey.links.map((l) => l.outboxEventId)].filter((id): id is string => Boolean(id));
  return db.$transaction(async (tx) => {
    const now = new Date();
    const cancelled = outboxIds.length
      ? await tx.outboxEvent.updateMany({ where: { id: { in: outboxIds }, status: { in: ["PENDING", "FAILED"] }, providerMessageId: null }, data: { status: "DEAD_LETTER", lastErrorCode: "CONSENT_WITHDRAWN" } })
      : { count: 0 };
    await tx.seeraMarketSurveyLink.updateMany({ where: { surveyId, revokedAt: null }, data: { revokedAt: now } });
    const updated = await tx.seeraMarketSurvey.update({ where: { id: surveyId }, data: { consentStatus: "REFUSED", consentScopes: [], consentAt: now, consentSource: `OPT_OUT: ${basis}`, ...(survey.followUpOutboxEventId ? {} : { whatsappState: "SKIPPED_OPTED_OUT" }) } });
    await tx.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "OPTED_OUT", note: basis, details: { cancelledMessages: cancelled.count } } });
    await recordAudit(tx, { actorId, action: "market_survey.opted_out", entityType: "SeeraMarketSurvey", entityId: surveyId, details: { cancelledMessages: cancelled.count } });
    return updated;
  });
}

/**
 * Safe retry/re-queue. Never re-sends a message the provider already accepted (providerMessageId
 * set). For a survey with no follow-up message yet, re-evaluates every gate (consent, opt-out,
 * template, switch) and creates the single follow-up row only if all now pass.
 */
export async function retryMarketSurveyWhatsApp(db: PrismaClient, actorId: string, surveyId: string, env: Record<string, string | undefined> = process.env) {
  await requireManage(db, actorId);
  const survey = await db.seeraMarketSurvey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new FoundationError("NOT_FOUND", "Survey not found", 404);
  if (survey.followUpOutboxEventId) {
    if (!surveyDispatchEnabled(env)) return { state: "DISPATCH_DISABLED" as const };
    const reset = await db.outboxEvent.updateMany({
      where: { id: survey.followUpOutboxEventId, status: { in: ["FAILED", "DEAD_LETTER"] }, providerMessageId: null, NOT: { lastErrorCode: "CONSENT_WITHDRAWN" } },
      data: { status: "PENDING", attempts: 0, availableAt: new Date(), lockedAt: null },
    });
    if (reset.count !== 1) throw new FoundationError("RETRY_NOT_ALLOWED", "Only an unsent, failed message can be retried", 409);
    await db.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "WHATSAPP_RETRY" } });
    await recordAudit(db, { actorId, action: "market_survey.whatsapp_retried", entityType: "SeeraMarketSurvey", entityId: surveyId });
    scheduleImmediateDispatch(db, survey.followUpOutboxEventId);
    return { state: "QUEUED" as const };
  }
  const result = await db.$transaction(async (tx) => {
    const decision = await decideWhatsApp(tx, { consentStatus: survey.consentStatus, consentScopes: survey.consentScopes, mobile: survey.mobile, requiredScope: "SURVEY_FOLLOW_UP", templateKey: "MARKET_SURVEY_THANK_YOU", surveyId }, env);
    if (decision.state !== "QUEUED") {
      await tx.seeraMarketSurvey.update({ where: { id: surveyId }, data: { whatsappState: decision.state } });
      return { state: decision.state, outboxEventId: null };
    }
    const outboxEventId = await createFollowUpOutbox(tx, survey, decision);
    await tx.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "WHATSAPP_QUEUED" } });
    await recordAudit(tx, { actorId, action: "market_survey.whatsapp_queued", entityType: "SeeraMarketSurvey", entityId: surveyId });
    return { state: decision.state, outboxEventId };
  });
  if (result.outboxEventId) scheduleImmediateDispatch(db, result.outboxEventId);
  return { state: result.state };
}

export async function linkMarketSurveyRetailer(db: PrismaClient, actorId: string, surveyId: string, raw: unknown) {
  await requireManage(db, actorId);
  const { retailerCode } = z.object({ retailerCode: text(40).min(1) }).parse(raw);
  const retailer = await db.seeraRetailer.findUnique({ where: { code: retailerCode }, select: { id: true, code: true, businessName: true } });
  if (!retailer) throw new FoundationError("RETAILER_NOT_FOUND", "No retailer with that code", 404);
  return db.$transaction(async (tx) => {
    const before = await tx.seeraMarketSurvey.findUniqueOrThrow({ where: { id: surveyId }, select: { retailerId: true } });
    const updated = await tx.seeraMarketSurvey.update({ where: { id: surveyId }, data: { retailerId: retailer.id } });
    await tx.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "RETAILER_LINKED", details: { from: before.retailerId, to: retailer.id, code: retailer.code } } });
    await recordAudit(tx, { actorId, action: "market_survey.retailer_linked", entityType: "SeeraMarketSurvey", entityId: surveyId, details: { retailerCode: retailer.code } });
    return updated;
  });
}

/** Existing retailers with the same mobile, limited to ones this user may link. */
export async function findRetailerMatches(db: PrismaClient, actorId: string, mobile: string) {
  await authorize(db, { actorId, permission: "market_survey:create" });
  const digits = tenDigits(mobile);
  if (digits.length !== 10) return [];
  const permissions = await effectivePermissions(db, actorId);
  const all = permissions.has("market_survey:view_all") || permissions.has("system:super_admin");
  return db.seeraRetailer.findMany({
    where: { OR: [{ normalizedMobile: digits }, { normalizedMobile: `91${digits}` }], ...(all ? {} : { OR: [{ salespersonId: actorId }, { createdById: actorId }] }) },
    select: { id: true, code: true, businessName: true },
    take: 5,
  });
}

const CSV_COLUMNS = [
  "reference", "createdAt", "staff", "shopName", "contactName", "mobile", "market", "address", "relationship", "issues", "issueOther", "retailerWords", "staffInterpretation",
  "competitorBrand", "competitorPackSize", "competitorPurchasePrice", "competitorMrp", "competitorWeeklyUnits", "competitorReason", "competitorVisitFrequency",
  "willingToReconsider", "shelfSpace", "trialQuantityOk", "wantsTesting", "wantsQuotation", "wantsFollowUp", "notInterested", "preferredFollowUpAt", "recommendedActions",
  "consentStatus", "consentScopes", "consentAt", "followUpStatus", "assignee", "trialAgreed", "whatsapp", "retailerCode",
] as const;

/** CSV cell: quoted, and formula-injection safe (=,+,-,@ and control prefixes neutralised). */
export function csvCell(value: unknown) {
  let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join("|") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportMarketSurveysCsv(db: PrismaClient, actorId: string, filters: SurveyFilters) {
  await authorize(db, { actorId, permission: "market_survey:view_all" });
  const rows = await db.seeraMarketSurvey.findMany({
    where: filterWhere(filters, { all: true, actorId }),
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { staff: { select: { name: true, email: true } }, assignee: { select: { name: true, email: true } }, retailer: { select: { code: true } } },
  });
  const outbox = await outboxById(db, rows.map((r) => r.followUpOutboxEventId));
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const record: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      ...r,
      staff: r.staff.name ?? r.staff.email,
      assignee: r.assignee ? r.assignee.name ?? r.assignee.email : "",
      whatsapp: whatsappDisplayState(r, r.followUpOutboxEventId ? outbox.get(r.followUpOutboxEventId) : null),
      retailerCode: r.retailer?.code ?? "",
    } as never;
    lines.push(CSV_COLUMNS.map((c) => csvCell(record[c])).join(","));
  }
  await recordAudit(db, { actorId, action: "market_survey.exported", entityType: "SeeraMarketSurvey", details: { rows: rows.length } });
  return lines.join("\r\n") + "\r\n";
}

export const publicBaseUrl = (env: Record<string, string | undefined> = process.env) => (env.SEERA_PUBLIC_BASE_URL || "https://www.seeradetergent.in").replace(/\/+$/, "");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a revocable, unguessable catalogue link (raw token returned once, only its hash stored).
 * With `send`, queues it to the retailer on WhatsApp only if they agreed to catalogue/order info.
 */
export async function createMarketSurveyCatalogueLink(db: PrismaClient, actorId: string, surveyId: string, raw: unknown, env: Record<string, string | undefined> = process.env) {
  await requireManage(db, actorId);
  const { send } = z.object({ send: z.boolean().default(false) }).parse(raw ?? {});
  const survey = await db.seeraMarketSurvey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new FoundationError("NOT_FOUND", "Survey not found", 404);
  const token = randomBytes(24).toString("base64url");
  const url = `${publicBaseUrl(env)}/c/${token}`;
  const result = await db.$transaction(async (tx) => {
    const link = await tx.seeraMarketSurveyLink.create({ data: { surveyId, tokenHash: hashToken(token), purpose: "CATALOGUE", createdById: actorId, expiresAt: new Date(Date.now() + CATALOGUE_LINK_DAYS * 86_400_000) } });
    let whatsappState: string | null = null;
    let outboxEventId: string | null = null;
    if (send) {
      const decision = await decideWhatsApp(tx, { consentStatus: survey.consentStatus, consentScopes: survey.consentScopes, mobile: survey.mobile, requiredScope: "CATALOGUE_ORDER_INFO", templateKey: "MARKET_SURVEY_CATALOGUE_LINK", surveyId }, env);
      whatsappState = decision.state;
      if (decision.state === "QUEUED") {
        const shop = sanitizeTemplateParam(survey.shopName, "Retailer");
        const payload: WhatsAppOutboxPayload = { mobile: survey.mobile!, templateName: decision.templateName, templateParams: [sanitizeTemplateParam(survey.contactName, shop), await staffName(tx, actorId), url], templateKey: decision.templateKey, languageCode: decision.languageCode };
        const event = await tx.outboxEvent.create({ data: { eventType: MARKET_SURVEY_CATALOGUE_EVENT, aggregateType: MARKET_SURVEY_AGGREGATE, aggregateId: surveyId, payload: payload as unknown as Prisma.InputJsonValue, status: "PENDING", channel: "WHATSAPP", templateKey: decision.templateKey } });
        await tx.seeraMarketSurveyLink.update({ where: { id: link.id }, data: { outboxEventId: event.id } });
        outboxEventId = event.id;
      }
    }
    await tx.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "CATALOGUE_LINK_CREATED", details: { linkId: link.id, send, whatsappState } } });
    await recordAudit(tx, { actorId, action: "market_survey.catalogue_link_created", entityType: "SeeraMarketSurvey", entityId: surveyId, details: { linkId: link.id, whatsappState } });
    return { linkId: link.id, expiresAt: link.expiresAt, whatsappState, outboxEventId };
  });
  if (result.outboxEventId) scheduleImmediateDispatch(db, result.outboxEventId);
  return { ...result, url };
}

export async function revokeMarketSurveyLink(db: PrismaClient, actorId: string, surveyId: string, linkId: string) {
  await requireManage(db, actorId);
  const revoked = await db.seeraMarketSurveyLink.updateMany({ where: { id: linkId, surveyId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (revoked.count !== 1) throw new FoundationError("LINK_NOT_ACTIVE", "Link is already revoked or does not exist", 409);
  await db.seeraMarketSurveyActivity.create({ data: { surveyId, actorId, type: "CATALOGUE_LINK_REVOKED", details: { linkId } } });
  await recordAudit(db, { actorId, action: "market_survey.catalogue_link_revoked", entityType: "SeeraMarketSurvey", entityId: surveyId, details: { linkId } });
}

/** Public catalogue view for a valid link. Read-only: never creates an order or exposes ids. */
export async function resolveCatalogueLink(db: PrismaClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const link = await db.seeraMarketSurveyLink.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, revokedAt: true, expiresAt: true, survey: { select: { shopName: true } } } });
  if (!link || link.revokedAt || link.expiresAt <= new Date()) return null;
  const [skus] = await Promise.all([
    db.seeraSku.findMany({ where: { status: "ACTIVE", brand: "Seera" }, orderBy: [{ category: "asc" }, { productName: "asc" }], select: { code: true, productName: true, category: true, packSize: true, unitType: true, unitsPerCase: true, mrp: true } }),
    db.seeraMarketSurveyLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }),
  ]);
  return { shopName: link.survey.shopName, skus };
}

/** Batch worker for survey messages; only runs when the survey switch is on. */
export async function dispatchMarketSurveyCommunications(db: PrismaClient, provider: () => Pick<MessagingProvider, "sendWhatsApp">, input: { limit?: number } = {}, env: Record<string, string | undefined> = process.env) {
  if (!surveyDispatchEnabled(env)) return [];
  return dispatchWhatsAppOutbox(db, provider, { aggregateType: MARKET_SURVEY_AGGREGATE, limit: input.limit });
}
