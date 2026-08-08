import type { IntelligenceContext, IntelligenceLevel, PriorityCategory, PriorityResult } from "./types";
import type { RetrievalResult } from "@/lib/retrieval/types";

/**
 * MUV AI — Intelligence Core (Module 6) Priority Engine.
 *
 * "The engine only assigns priority. It never decides responses." — this
 * file returns a `PriorityResult`, nothing else; no recommendation, no
 * customer-facing text.
 *
 * Deterministic rule-based classification, evaluated in a fixed priority
 * order (first match wins) — Safety always outranks a sales opportunity,
 * by design, not by learned weighting. Every signal that fires is listed
 * in `evidence`, so the category is always traceable back to a concrete
 * cause, never a black box.
 */

const SAFETY_KEYWORDS = ["injury", "injured", "burn", "burned", "allergic", "allergy", "emergency", "hazard", "poison", "toxic", "fire", "danger", "dangerous", "unsafe", "hospital"];
const COMPLAINT_KEYWORDS = ["complaint", "disappointed", "refund", "broken", "wrong item", "not working", "defective", "unacceptable"];
const URGENCY_KEYWORDS = ["urgent", "asap", "immediately", "right now", "today", "emergency"];
const SALES_KEYWORDS = ["buy", "purchase", "quote", "quotation", "price", "bulk order", "wholesale", "discount"];

const BUSINESS_CATEGORY_HINTS = ["institutional support", "distributor support", "dealer support", "franchise support"];
const SALES_CATEGORY_HINTS = ["quotation support", "sample request", "lead qualification", "negotiation guidance", "contract support", "account management"];
const COMPLAINT_CATEGORY_HINTS = ["complaint handling", "refund request", "replacement request", "damaged product", "wrong product"];

function textContainsAny(text: string | null | undefined, terms: string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t));
}

function hasHighRiskSignal(results: RetrievalResult[]): boolean {
  return results.some((r) => {
    const meta = r.internalMetadata as Record<string, unknown> | null;
    if (!meta) return false;
    const risk = meta.riskLevel;
    const escalation = meta.escalationRequired;
    return risk === "CRITICAL" || risk === "HIGH" || escalation === true;
  });
}

function categoryHintMatch(results: RetrievalResult[], hints: string[]): boolean {
  return results.some((r) => {
    const meta = r.internalMetadata as Record<string, unknown> | null;
    const cat = typeof meta?.["category"] === "string" ? (meta!["category"] as string).toLowerCase() : "";
    return hints.some((h) => cat.includes(h));
  });
}

const SCORE_BY_CATEGORY: Record<PriorityCategory, number> = {
  SAFETY: 100,
  CUSTOMER_RISK: 90,
  BUSINESS_CRITICAL: 75,
  PRODUCT_ISSUE: 65,
  COMPLAINT: 60,
  URGENCY: 55,
  SALES_OPPORTUNITY: 45,
  CUSTOMER_GOAL: 30,
  GENERAL_INQUIRY: 10,
};

function levelForScore(score: number): IntelligenceLevel {
  if (score >= 85) return "URGENT";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function evaluatePriority(retrievedKnowledge: RetrievalResult[], request: { customerMessage?: string; customerGoal?: string; businessContext?: Record<string, unknown> | null; institutionalContext?: Record<string, unknown> | null }): PriorityResult {
  const evidence: string[] = [];

  const safetyKeywordHits = textContainsAny(request.customerMessage, SAFETY_KEYWORDS);
  if (safetyKeywordHits.length || hasHighRiskSignal(retrievedKnowledge)) {
    evidence.push(...safetyKeywordHits.map((k) => `message mentions "${k}"`));
    if (hasHighRiskSignal(retrievedKnowledge)) evidence.push("retrieved knowledge flags high/critical risk or escalation");
    return build("SAFETY", evidence, "A safety-relevant signal was found in the customer message or the retrieved knowledge — safety always takes precedence.");
  }

  if (hasHighRiskSignal(retrievedKnowledge)) {
    evidence.push("retrieved knowledge flags escalation or elevated risk");
    return build("CUSTOMER_RISK", evidence, "Retrieved knowledge indicates elevated risk to the customer, short of an explicit safety signal.");
  }

  if (request.businessContext || request.institutionalContext || categoryHintMatch(retrievedKnowledge, BUSINESS_CATEGORY_HINTS)) {
    if (request.businessContext) evidence.push("businessContext provided");
    if (request.institutionalContext) evidence.push("institutionalContext provided");
    if (categoryHintMatch(retrievedKnowledge, BUSINESS_CATEGORY_HINTS)) evidence.push("retrieved care workflow tagged for institutional/business support");
    return build("BUSINESS_CRITICAL", evidence, "Business or institutional context was supplied, or the retrieved care workflow is institutional-support-flavored.");
  }

  const hasProductOrProblem = retrievedKnowledge.some((r) => r.sourceType === "PRODUCT_INTELLIGENCE" || r.sourceType === "PROBLEM_INTELLIGENCE");
  const complaintKeywordHits = textContainsAny(request.customerMessage, COMPLAINT_KEYWORDS);
  if (complaintKeywordHits.length || categoryHintMatch(retrievedKnowledge, COMPLAINT_CATEGORY_HINTS)) {
    evidence.push(...complaintKeywordHits.map((k) => `message mentions "${k}"`));
    if (categoryHintMatch(retrievedKnowledge, COMPLAINT_CATEGORY_HINTS)) evidence.push("retrieved care workflow tagged as complaint/refund/replacement handling");
    return build("COMPLAINT", evidence, "The message or retrieved care workflow indicates a complaint, refund, or replacement situation.");
  }

  if (hasProductOrProblem) {
    evidence.push("retrieved knowledge includes product or problem intelligence relevant to the query");
    return build("PRODUCT_ISSUE", evidence, "Retrieved knowledge is anchored to a specific product or problem.");
  }

  const urgencyHits = textContainsAny(request.customerMessage, URGENCY_KEYWORDS);
  if (urgencyHits.length) {
    evidence.push(...urgencyHits.map((k) => `message mentions "${k}"`));
    return build("URGENCY", evidence, "The customer message itself signals time pressure.");
  }

  const salesHits = textContainsAny(request.customerMessage, SALES_KEYWORDS);
  if (salesHits.length || categoryHintMatch(retrievedKnowledge, SALES_CATEGORY_HINTS)) {
    evidence.push(...salesHits.map((k) => `message mentions "${k}"`));
    if (categoryHintMatch(retrievedKnowledge, SALES_CATEGORY_HINTS)) evidence.push("retrieved care workflow tagged as a sales/quotation workflow");
    return build("SALES_OPPORTUNITY", evidence, "The message or retrieved care workflow indicates a commercial opportunity.");
  }

  if (request.customerGoal) {
    evidence.push("customerGoal provided with no higher-priority signal detected");
    return build("CUSTOMER_GOAL", evidence, "No safety, risk, business, product, complaint, urgency, or sales signal was found — falling back to the customer's stated goal.");
  }

  evidence.push("no specific signal detected");
  return build("GENERAL_INQUIRY", evidence, "No category-specific signal was found in the request or retrieved knowledge.");
}

function build(category: PriorityCategory, evidence: string[], reasoning: string): PriorityResult {
  const score = SCORE_BY_CATEGORY[category];
  return { category, level: levelForScore(score), score, evidence, reasoning };
}
