import { z } from "zod";
import { gst as gstNumber } from "@/lib/sales-channel/validation";

const cuid = z.string().cuid();
const money = z.coerce.number().min(0).max(999999999);
const pageQuery = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) });

// ---------------------------------------------------------------------------
// Module 2 — Lead Management
// ---------------------------------------------------------------------------

export const leadPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "SAMPLE_REQUIRED", "SAMPLE_GIVEN", "TRIAL_RUNNING", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST"]);

export const createLeadSchema = z.object({
  organizationName: z.string().min(2).max(150),
  contactPerson: z.string().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().max(80).optional(),
  territoryId: cuid.optional(),
  leadSourceId: cuid.optional(),
  assignedToId: cuid.optional(),
  priority: leadPriority.default("MEDIUM"),
  estimatedValue: money.default(0),
  note: z.string().max(2000).optional(),
});

export const updateLeadSchema = z.object({
  id: cuid,
  organizationName: z.string().min(2).max(150).optional(),
  contactPerson: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().max(80).optional(),
  territoryId: cuid.optional(),
  leadSourceId: cuid.optional(),
  priority: leadPriority.optional(),
  estimatedValue: money.optional(),
});

export const changeLeadStatusSchema = z.object({
  id: cuid,
  status: leadStatus,
  lostReason: z.string().max(500).optional(),
});

export const assignLeadSchema = z.object({ id: cuid, assignedToId: cuid });

export const convertLeadSchema = z
  .object({
    leadId: cuid,
    customerId: cuid.optional(), // link to an existing Customer instead of creating one
    // Delegated straight to actions/customers.ts's createCustomer — this
    // isn't a second customer-creation path, just the field set that action
    // actually requires, so conversion can create the Customer inline
    // instead of forcing a separate trip through Customer Master first.
    newCustomer: z
      .object({
        name: z.string().trim().min(2).max(100),
        businessName: z.string().trim().max(200).optional(),
        customerTypeId: cuid,
        institutionCategoryId: cuid.optional(),
        phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
        email: z.string().trim().toLowerCase().email(),
        gstNumber, // reuses lib/sales-channel/validation.ts's real GSTIN format validator
        billingAddress: z.string().trim().max(500).optional(),
        city: z.string().trim().max(60).optional(),
        state: z.string().trim().max(60).optional(),
        assignedTerritoryId: cuid.optional(),
      })
      .optional(),
  })
  .refine((d) => d.customerId || d.newCustomer, { message: "Provide either an existing customerId or newCustomer details" });

export const listLeadsQuerySchema = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: leadStatus.optional(),
  priority: leadPriority.optional(),
  assignedToId: cuid.optional(),
  territoryId: cuid.optional(),
});

// ---------------------------------------------------------------------------
// Module 3 — Opportunity Management
// ---------------------------------------------------------------------------

export const opportunityStage = z.enum(["QUALIFICATION", "CUSTOMER_VISIT", "REQUIREMENT_ANALYSIS", "SAMPLE_ISSUED", "FOLLOW_UP", "TRIAL", "QUOTATION", "NEGOTIATION", "WON", "LOST"]);

export const createOpportunitySchema = z.object({
  leadId: cuid.optional(),
  customerId: cuid,
  ownerId: cuid.optional(),
  territoryId: cuid.optional(),
  estimatedRevenue: money.default(0),
  expectedQuantity: z.coerce.number().int().min(0).optional(),
  probability: z.coerce.number().int().min(0).max(100).default(20),
  closingDate: z.coerce.date().optional(),
  products: z.array(z.object({ productId: cuid, quantity: z.coerce.number().int().min(0).optional(), notes: z.string().max(300).optional() })).max(30).default([]),
});

export const updateOpportunitySchema = z.object({
  id: cuid,
  estimatedRevenue: money.optional(),
  expectedQuantity: z.coerce.number().int().min(0).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  closingDate: z.coerce.date().optional(),
  risks: z.string().max(2000).optional(),
  competitors: z.string().max(2000).optional(),
  nextAction: z.string().max(1000).optional(),
  nextActionDate: z.coerce.date().optional(),
  products: z.array(z.object({ productId: cuid, quantity: z.coerce.number().int().min(0).optional(), notes: z.string().max(300).optional() })).max(30).optional(),
});

export const changeOpportunityStageSchema = z.object({
  id: cuid,
  stage: opportunityStage,
  lostReason: z.string().max(500).optional(),
});

export const listOpportunitiesQuerySchema = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  stage: opportunityStage.optional(),
  ownerId: cuid.optional(),
  territoryId: cuid.optional(),
});

// ---------------------------------------------------------------------------
// Module 4 & 5 — Visit Management + Customer Survey
// ---------------------------------------------------------------------------

export const visitOutcome = z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "NO_DECISION_MAKER", "RESCHEDULED"]);

export const checkInVisitSchema = z.object({
  leadId: cuid.optional(),
  opportunityId: cuid.optional(),
  customerId: cuid.optional(),
  visitDate: z.coerce.date(),
  checkInLat: z.coerce.number().min(-90).max(90).optional(),
  checkInLng: z.coerce.number().min(-180).max(180).optional(),
});

export const checkOutVisitSchema = z.object({
  id: cuid,
  checkOutLat: z.coerce.number().min(-90).max(90).optional(),
  checkOutLng: z.coerce.number().min(-180).max(180).optional(),
  meetingNotes: z.string().max(4000).optional(),
  requirements: z.string().max(4000).optional(),
  competitorProducts: z.array(z.string().max(80)).max(20).default([]),
  decisionMaker: z.string().max(150).optional(),
  outcome: visitOutcome.optional(),
  nextFollowUpDate: z.coerce.date().optional(),
  photoUrls: z.array(z.string().url()).max(20).default([]),
});

export const listVisitsQuerySchema = pageQuery.extend({
  officerId: cuid.optional(),
  customerId: cuid.optional(),
  opportunityId: cuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const submitSurveySchema = z.object({
  visitId: cuid,
  institutionType: z.string().max(80).optional(),
  businessType: z.string().max(80).optional(),
  floors: z.coerce.number().int().min(0).optional(),
  rooms: z.coerce.number().int().min(0).optional(),
  beds: z.coerce.number().int().min(0).optional(),
  washrooms: z.coerce.number().int().min(0).optional(),
  kitchens: z.coerce.number().int().min(0).optional(),
  hasLobby: z.boolean().default(false),
  parkingSpaces: z.coerce.number().int().min(0).optional(),
  totalBuiltUpAreaSqft: z.coerce.number().min(0).optional(),
  cleaningAreaSqft: z.coerce.number().min(0).optional(),
  outdoorAreaSqft: z.coerce.number().min(0).optional(),
  workingHours: z.string().max(100).optional(),
  shifts: z.coerce.number().int().min(0).max(10).optional(),
  housekeepingStaff: z.coerce.number().int().min(0).optional(),
  laundryStaff: z.coerce.number().int().min(0).optional(),
  cleaningStaff: z.coerce.number().int().min(0).optional(),
  currentFloorCleaner: z.string().max(120).optional(),
  currentDetergent: z.string().max(120).optional(),
  currentGlassCleaner: z.string().max(120).optional(),
  currentToiletCleaner: z.string().max(120).optional(),
  currentHandWash: z.string().max(120).optional(),
  currentDishwash: z.string().max(120).optional(),
  currentOtherChemicals: z.string().max(2000).optional(),
  currentVendor: z.string().max(150).optional(),
  cleaningFrequency: z.string().max(80).optional(),
  laundryCapacity: z.string().max(80).optional(),
  monthlyConsumptionKnown: z.boolean().default(false),
  monthlyConsumptionNotes: z.string().max(2000).optional(),
  additionalNotes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Module 7 — Sample Management
// ---------------------------------------------------------------------------

export const sampleTrialStatus = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);
export const sampleTrialResult = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "NO_FEEDBACK"]);

export const issueSampleSchema = z.object({
  opportunityId: cuid.optional(),
  customerId: cuid,
  productId: cuid,
  variantId: cuid.optional(),
  quantity: z.coerce.number().min(0.1).max(100000),
  unit: z.string().max(20).default("Ltr"),
  issuedDate: z.coerce.date(),
});

export const updateSampleTrialSchema = z.object({
  id: cuid,
  trialStatus: sampleTrialStatus,
  trialResult: sampleTrialResult.optional(),
  feedback: z.string().max(2000).optional(),
});

export const listSamplesQuerySchema = pageQuery.extend({
  customerId: cuid.optional(),
  opportunityId: cuid.optional(),
  trialStatus: sampleTrialStatus.optional(),
});

// ---------------------------------------------------------------------------
// Module 8 — Follow-up Management
// ---------------------------------------------------------------------------

export const followUpType = z.enum(["CALL", "VISIT", "WHATSAPP", "EMAIL", "REMINDER"]);
export const followUpStatus = z.enum(["PENDING", "COMPLETED", "CANCELLED"]);

export const createFollowUpSchema = z.object({
  leadId: cuid.optional(),
  opportunityId: cuid.optional(),
  customerId: cuid.optional(),
  type: followUpType,
  dueDate: z.coerce.date(),
  assignedToId: cuid.optional(),
  notes: z.string().max(1000).optional(),
});

export const listFollowUpsQuerySchema = pageQuery.extend({
  assignedToId: cuid.optional(),
  status: followUpStatus.optional(),
  overdueOnly: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Module 9 — Quotation Management
// ---------------------------------------------------------------------------

// Milestone 4.2 — exported (was a private const) so
// lib/validations/business-orders.ts's Direct Business Order schema can
// reuse the identical line-item shape rather than defining a duplicate.
export const quotationLineInput = z.object({
  productId: cuid,
  variantId: cuid.optional(),
  quantity: z.coerce.number().int().min(1).max(100000),
  unitPrice: money,
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

export const createQuotationSchema = z.object({
  opportunityId: cuid,
  validUntil: z.coerce.date(),
  termsSnapshot: z.string().max(4000).optional(),
  lineItems: z.array(quotationLineInput).min(1).max(100),
});

export const reviseQuotationSchema = z.object({
  quotationId: cuid,
  validUntil: z.coerce.date(),
  termsSnapshot: z.string().max(4000).optional(),
  revisionReason: z.string().max(500).optional(),
  lineItems: z.array(quotationLineInput).min(1).max(100),
});

export const quotationVersionIdSchema = z.object({ versionId: cuid });
export const rejectQuotationSchema = z.object({ versionId: cuid, reason: z.string().max(500).optional() });
export const sendQuotationSchema = z.object({ versionId: cuid, channel: z.enum(["WHATSAPP", "EMAIL", "BOTH"]) });

// Milestone 4.1 — Quotation Acceptance Workflow Enhancement. Replaces
// respondQuotationSchema/respondToQuotation's single accepted:boolean shape
// with two distinct actions — decline reuses rejectQuotationSchema above
// unchanged (identical {versionId, reason?} shape, no reason to duplicate
// it under a new name).
export const instQuotationAcceptanceMethod = z.enum([
  "VERBAL_CONFIRMATION", "PHONE_CALL", "WHATSAPP", "EMAIL", "SIGNED_COPY", "CUSTOMER_PORTAL", "OTHER",
]);
export const acceptQuotationSchema = z.object({
  versionId: cuid,
  acceptanceMethod: instQuotationAcceptanceMethod,
  remarks: z.string().trim().max(2000).optional(),
});

export const listQuotationsQuerySchema = pageQuery.extend({
  opportunityId: cuid.optional(),
  customerId: cuid.optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "REVISED"]).optional(),
});

// ---------------------------------------------------------------------------
// Module 10 — Task Management
// ---------------------------------------------------------------------------

export const taskType = z.enum(["PERSONAL", "ASSIGNED", "FOLLOWUP", "DAILY"]);
export const taskStatus = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const createTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  type: taskType.default("PERSONAL"),
  priority: leadPriority.default("MEDIUM"),
  dueDate: z.coerce.date().optional(),
  assignedToId: cuid.optional(),
  leadId: cuid.optional(),
  opportunityId: cuid.optional(),
});

export const updateTaskStatusSchema = z.object({ id: cuid, status: taskStatus });

export const listTasksQuerySchema = pageQuery.extend({
  assignedToId: cuid.optional(),
  status: taskStatus.optional(),
  type: taskType.optional(),
});

// ---------------------------------------------------------------------------
// Module 11 & 13 — Daily Planner + Route Management
// ---------------------------------------------------------------------------

export const savePlanSchema = z.object({
  planDate: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});

export const submitEndOfDaySchema = z.object({
  planDate: z.coerce.date(),
  endOfDaySummary: z.string().min(1).max(4000),
});

const routeStop = z.object({ customerId: cuid.optional(), label: z.string().max(150), lat: z.number().optional(), lng: z.number().optional() });

export const saveRouteSchema = z.object({
  routeDate: z.coerce.date(),
  plannedStops: z.array(routeStop).max(50),
  plannedDistanceKm: z.coerce.number().min(0).optional(),
  plannedTravelMinutes: z.coerce.number().int().min(0).optional(),
});

export const completeRouteSchema = z.object({
  routeDate: z.coerce.date(),
  actualStops: z.array(routeStop).max(50),
  actualDistanceKm: z.coerce.number().min(0).optional(),
  actualTravelMinutes: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Module 12 — Expense Management
// ---------------------------------------------------------------------------

export const expenseCategory = z.enum(["FUEL", "PARKING", "TOLL", "HOTEL", "FOOD", "OTHER"]);
export const expenseStatus = z.enum(["PENDING_MANAGER", "APPROVED", "REJECTED"]);

export const submitExpenseSchema = z.object({
  category: expenseCategory,
  amount: money,
  expenseDate: z.coerce.date(),
  description: z.string().max(500).optional(),
  receiptUrl: z.string().url().optional(),
});

export const decideExpenseSchema = z.object({
  id: cuid,
  approve: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
});

export const listExpensesQuerySchema = pageQuery.extend({
  officerId: cuid.optional(),
  status: expenseStatus.optional(),
});

// ---------------------------------------------------------------------------
// Shared — Notes & Attachments (Module 2's "Notes/Attachments", reused
// across Lead/Opportunity/Visit/Sample/Quotation)
// ---------------------------------------------------------------------------

// Milestone 4 — Order Management OS adds "ORDER" (BusinessOrder), reusing
// the same generic InstNote/InstAttachment mechanism.
export const instEntityType = z.enum(["LEAD", "OPPORTUNITY", "VISIT", "SAMPLE", "QUOTATION", "ORDER"]);

export const addNoteSchema = z.object({
  entityType: instEntityType,
  entityId: cuid,
  body: z.string().min(1).max(2000),
});

export const addAttachmentSchema = z.object({
  entityType: instEntityType,
  entityId: cuid,
  fileName: z.string().min(1).max(200),
  url: z.string().url(),
  sizeBytes: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Sales Targets (feeds the Sales Manager Dashboard's "Targets" widget)
// ---------------------------------------------------------------------------

export const targetPeriod = z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]);

export const setTargetSchema = z.object({
  userId: cuid,
  periodType: targetPeriod,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  targetRevenue: money,
});
