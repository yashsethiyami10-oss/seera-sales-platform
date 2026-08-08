"use server";

import { revalidatePath } from "next/cache";
import { toErrorResponse } from "@/lib/errors";

import * as tickets from "@/lib/support/ticket-service";
import * as sla from "@/lib/support/sla-service";
import * as escalation from "@/lib/support/escalation-service";
import * as communication from "@/lib/support/communication-service";
import * as productIssue from "@/lib/support/product-issue-service";
import * as returnRefundWarranty from "@/lib/support/return-refund-warranty-service";
import * as feedback from "@/lib/support/feedback-service";
import * as knowledge from "@/lib/support/knowledge-service";
import * as timeline from "@/lib/support/timeline-service";
import * as reporting from "@/lib/support/reporting-service";
import * as founderIntegration from "@/lib/support/founder-integration-service";

/**
 * Milestone 9 — Customer Support. The MUV-OS-shell "use server" boundary
 * for app/os/support/* — thin wrappers over lib/support/*, matching
 * Milestone 7/8's actions/manufacturing.ts and actions/finance.ts pattern
 * exactly. Every wrapped call self-enforces its own permission/feature-flag
 * check inside requireSupportPrincipal — this file adds no new
 * authorization logic. Every export below is declared `async` directly
 * (Next.js requires this for Server Actions — see actions/finance.ts's own
 * build-time lesson from Milestone 8; do not regress to a bare arrow that
 * merely returns a Promise).
 */

const revalidateSupport = () => revalidatePath("/os/support", "layout");
async function run<T>(fn: () => Promise<T>) {
  try { const data = await fn(); revalidateSupport(); return { success: true as const, data }; }
  catch (err) { return toErrorResponse(err); }
}
async function read<T>(fn: () => Promise<T>) {
  try { return { success: true as const, data: await fn() }; } catch (err) { return toErrorResponse(err); }
}

// --- Tickets: Lifecycle, Assignment, Department Routing ---
export const createSupportTicket = async (input: unknown) => run(() => tickets.createSupportTicket(input));
export const getSupportTicketDetail = async (id: string) => read(() => tickets.getSupportTicketDetail(id));
export const listSupportTickets = async (input: Parameters<typeof tickets.listSupportTickets>[0]) => read(() => tickets.listSupportTickets(input));
export const assignTicket = async (id: string, v: number, assignedToId: string) => run(() => tickets.assignTicket(id, v, assignedToId));
export const transferDepartment = async (id: string, v: number, departmentId: string) => run(() => tickets.transferDepartment(id, v, departmentId));
export const setPriority = async (id: string, v: number, priority: string) => run(() => tickets.setPriority(id, v, priority));
export const transitionTicketStatus = async (id: string, v: number, status: string, reason?: string) => run(() => tickets.transitionTicketStatus(id, v, status, reason));
export const reopenTicket = async (id: string, v: number, reason: string) => run(() => tickets.reopenTicket(id, v, reason));
export const createDepartment = async (input: { code: string; name: string }) => run(() => tickets.createDepartment(input));
export const listDepartments = async () => read(() => tickets.listDepartments());

// --- SLA ---
export const createSlaPolicy = async (input: unknown) => run(() => sla.createSlaPolicy(input));
export const listSlaPolicies = async () => read(() => sla.listSlaPolicies());
export const setBusinessHours = async (input: { dayOfWeek: number; startTime: string; endTime: string }) => run(() => sla.setBusinessHours(input));
export const listBusinessHours = async () => read(() => sla.listBusinessHours());
export const addHoliday = async (input: { date: string; name: string }) => run(() => sla.addHoliday(input));
export const listHolidays = async () => read(() => sla.listHolidays());
export const sweepSlaBreaches = async () => run(() => sla.sweepSlaBreaches());
export const getSlaPerformance = async (input: { from?: Date; to?: Date }) => read(() => sla.getSlaPerformance(input));

// --- Escalation ---
export const createEscalationRule = async (input: unknown) => run(() => escalation.createEscalationRule(input));
export const listEscalationRules = async () => read(() => escalation.listEscalationRules());
export const escalateTicket = async (ticketId: string, reason: string, level?: number, ruleId?: string) => run(() => escalation.escalateTicket(ticketId, reason, level, ruleId));
export const resolveEscalation = async (id: string) => run(() => escalation.resolveEscalation(id));
export const listEscalations = async (input: Parameters<typeof escalation.listEscalations>[0]) => read(() => escalation.listEscalations(input));
export const sweepAutomaticEscalations = async () => run(() => escalation.sweepAutomaticEscalations());

// --- Communication: Messages, Notes, Attachments, Follow-ups ---
export const addSupportMessage = async (input: unknown) => run(() => communication.addSupportMessage(input));
export const listSupportMessages = async (ticketId: string) => read(() => communication.listSupportMessages(ticketId));
export const addTicketNote = async (input: unknown) => run(() => communication.addTicketNote(input));
export const listTicketNotes = async (ticketId: string) => read(() => communication.listTicketNotes(ticketId));
export const addAttachment = async (input: unknown) => run(() => communication.addAttachment(input));
export const listAttachments = async (ticketId: string) => read(() => communication.listAttachments(ticketId));
export const scheduleFollowUp = async (input: unknown) => run(() => communication.scheduleFollowUp(input));
export const completeFollowUp = async (id: string) => run(() => communication.completeFollowUp(id));
export const listMyFollowUps = async (includeDone?: boolean) => read(() => communication.listMyFollowUps(includeDone));

// --- Product Issue + Manufacturing Batch Lookup ---
export const createProductIssueReport = async (input: unknown) => run(() => productIssue.createProductIssueReport(input));
export const updateRootCauseNotes = async (ticketId: string, notes: string) => run(() => productIssue.updateRootCauseNotes(ticketId, notes));
export const getProductIssueReport = async (ticketId: string) => read(() => productIssue.getProductIssueReport(ticketId));
export const lookupBatch = async (batchId: string) => read(() => productIssue.lookupBatch(batchId));
export const getTicketCountByBatch = async (batchId: string) => read(() => productIssue.getTicketCountByBatch(batchId));
export const listProductComplaints = async (input: Parameters<typeof productIssue.listProductComplaints>[0]) => read(() => productIssue.listProductComplaints(input));

// --- Returns, Refunds, Warranty ---
export const createReturnRequest = async (input: unknown) => run(() => returnRefundWarranty.createReturnRequest(input));
export const approveReturnRequest = async (ticketId: string, v: number) => run(() => returnRefundWarranty.approveReturnRequest(ticketId, v));
export const listReturnRequests = async (input: Parameters<typeof returnRefundWarranty.listReturnRequests>[0]) => read(() => returnRefundWarranty.listReturnRequests(input));
export const createRefundRequest = async (input: unknown) => run(() => returnRefundWarranty.createRefundRequest(input));
export const approveRefundRequest = async (ticketId: string, v: number) => run(() => returnRefundWarranty.approveRefundRequest(ticketId, v));
export const rejectRefundRequest = async (ticketId: string, v: number, reason: string) => run(() => returnRefundWarranty.rejectRefundRequest(ticketId, v, reason));
export const listRefundRequests = async (input: Parameters<typeof returnRefundWarranty.listRefundRequests>[0]) => read(() => returnRefundWarranty.listRefundRequests(input));
export const registerWarranty = async (input: unknown) => run(() => returnRefundWarranty.registerWarranty(input));
export const getWarrantyStatus = async (customerId: string, productId: string) => read(() => returnRefundWarranty.getWarrantyStatus(customerId, productId));
export const listWarrantyRegistrations = async (customerId?: string) => read(() => returnRefundWarranty.listWarrantyRegistrations(customerId));

// --- Feedback, CSAT, NPS ---
export const submitFeedback = async (input: unknown) => run(() => feedback.submitFeedback(input));
export const listFeedback = async (input: Parameters<typeof feedback.listFeedback>[0]) => read(() => feedback.listFeedback(input));
export const submitCsatResponse = async (input: unknown) => run(() => feedback.submitCsatResponse(input));
export const getCsatTrend = async (input: { from?: Date; to?: Date }) => read(() => feedback.getCsatTrend(input));
export const submitNpsResponse = async (input: unknown) => run(() => feedback.submitNpsResponse(input));
export const getNpsScore = async (surveyRound?: string) => read(() => feedback.getNpsScore(surveyRound));

// --- Knowledge Base, FAQ, Resolution Templates ---
export const createKbCategory = async (input: { name: string; parentId?: string }) => run(() => knowledge.createKbCategory(input));
export const listKbCategories = async () => read(() => knowledge.listKbCategories());
export const createKbArticleDraft = async (input: unknown) => run(() => knowledge.createKbArticleDraft(input));
export const updateKbArticleBody = async (id: string, v: number, body: string) => run(() => knowledge.updateKbArticleBody(id, v, body));
export const submitKbArticleForReview = async (id: string, v: number) => run(() => knowledge.submitKbArticleForReview(id, v));
export const approveKbArticle = async (id: string, v: number) => run(() => knowledge.approveKbArticle(id, v));
export const publishKbArticle = async (id: string, v: number) => run(() => knowledge.publishKbArticle(id, v));
export const listKbArticles = async (input: Parameters<typeof knowledge.listKbArticles>[0]) => read(() => knowledge.listKbArticles(input));
export const recordKbArticleView = async (articleId: string) => run(() => knowledge.recordKbArticleView(articleId));
export const getKnowledgeUsage = async () => read(() => knowledge.getKnowledgeUsage());
export const createFaq = async (input: unknown) => run(() => knowledge.createFaq(input));
export const listFaqs = async (publicOnly?: boolean) => read(() => knowledge.listFaqs(publicOnly));
export const createResolutionTemplate = async (input: unknown) => run(() => knowledge.createResolutionTemplate(input));
export const listResolutionTemplates = async (category?: string) => read(() => knowledge.listResolutionTemplates(category));
export const recordTemplateUsage = async (templateId: string, ticketId: string) => run(() => knowledge.recordTemplateUsage(templateId, ticketId));

// --- Customer Timeline ---
export const getCustomerUnifiedTimeline = async (customerId: string) => read(() => timeline.getCustomerUnifiedTimeline(customerId));

// --- Reporting ---
export const getOpenClosedTicketCounts = async () => read(() => reporting.getOpenClosedTicketCounts());
export const getAgentProductivity = async (input: { from?: Date; to?: Date }) => read(() => reporting.getAgentProductivity(input));
export const getComplaintCategories = async () => read(() => reporting.getComplaintCategories());
export const getEscalationReport = async () => read(() => reporting.getEscalationReport());
export const getSupportTrends = async (input: { fromDays?: number }) => read(() => reporting.getSupportTrends(input));

// --- Founder Integration ---
export const syncFounderAlerts = async () => run(() => founderIntegration.syncFounderAlerts());
export const getFounderSupportDashboard = async () => read(() => founderIntegration.getFounderSupportDashboard());
