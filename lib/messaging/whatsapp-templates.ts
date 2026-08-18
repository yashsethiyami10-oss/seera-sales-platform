/**
 * Governed WhatsApp template registry for Seera.
 *
 * Meta's Cloud API only accepts pre-created, Meta-approved template messages — this
 * codebase cannot invent template body copy at send time. This file is the single,
 * governed map from an internal business event to the exact template name/language/
 * parameter contract this code will submit to Meta. It does NOT create or approve
 * anything in the Meta WhatsApp Manager — that is a manual Founder/operator action
 * (see MANUAL META ACTIONS in the audit report). `approvalStatus` here is this
 * codebase's own record of what it currently believes about each template, updated by
 * whoever performs that manual step — it is informational for the dispatcher's failure
 * classification (see lib/messaging/error-classification.ts), not a live read from Meta.
 *
 * Naming convention: `seera_<domain>_<event>` in snake_case, matching Meta's template
 * naming rules (lowercase letters, numbers, underscores only).
 */

export type WhatsAppTemplateKey =
  | "RETAILER_ORDER_PLACED"
  | "RETAILER_ORDER_ACCEPTED"
  | "RETAILER_ORDER_PARTIAL"
  | "RETAILER_OUT_FOR_DELIVERY"
  | "RETAILER_ORDER_DELIVERED"
  | "RETAILER_NO_ORDER"
  | "RETAILER_FOLLOW_UP"
  | "DISTRIBUTOR_VISIT_COMPLETED"
  | "SUPER_STOCKIST_VISIT_COMPLETED";

export type TemplateApprovalStatus = "PENDING_META_APPROVAL" | "APPROVED" | "REJECTED" | "DISABLED";

export interface WhatsAppTemplateDefinition {
  key: WhatsAppTemplateKey;
  /** Exact template name this code submits as `template.name` — must match a template
   *  actually created and APPROVED for the configured WABA in Meta WhatsApp Manager. */
  metaTemplateName: string;
  /** Meta template language code (must match the language the template was approved in). */
  language: string;
  /** Ordered description of each {{1}}..{{n}} body placeholder, for manual template
   *  authoring in Meta AND as documentation for call sites building `templateParams`. */
  paramLabels: string[];
  /** This codebase's own record of Meta approval state — see file header. Not a live Meta read. */
  approvalStatus: TemplateApprovalStatus;
}

// clang-format off
export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, WhatsAppTemplateDefinition> = {
  RETAILER_ORDER_PLACED: {
    key: "RETAILER_ORDER_PLACED",
    metaTemplateName: "seera_retailer_order_placed",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Order number", "Order value (₹)"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_ORDER_ACCEPTED: {
    key: "RETAILER_ORDER_ACCEPTED",
    metaTemplateName: "seera_retailer_order_accepted",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_ORDER_PARTIAL: {
    key: "RETAILER_ORDER_PARTIAL",
    metaTemplateName: "seera_retailer_order_partial",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_OUT_FOR_DELIVERY: {
    key: "RETAILER_OUT_FOR_DELIVERY",
    metaTemplateName: "seera_retailer_out_for_delivery",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_ORDER_DELIVERED: {
    key: "RETAILER_ORDER_DELIVERED",
    metaTemplateName: "seera_retailer_order_delivered",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Order number", "Distributor firm name", "Delivery date"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_NO_ORDER: {
    key: "RETAILER_NO_ORDER",
    metaTemplateName: "seera_retailer_visit_no_order",
    language: "en",
    paramLabels: ["Retailer/outlet name"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_FOLLOW_UP: {
    key: "RETAILER_FOLLOW_UP",
    metaTemplateName: "seera_retailer_follow_up",
    language: "en",
    paramLabels: ["Retailer/outlet name", "Follow-up date"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  DISTRIBUTOR_VISIT_COMPLETED: {
    key: "DISTRIBUTOR_VISIT_COMPLETED",
    metaTemplateName: "seera_distributor_visit_completed",
    language: "en",
    paramLabels: ["Distributor firm name", "Representative name", "Visit date"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  SUPER_STOCKIST_VISIT_COMPLETED: {
    key: "SUPER_STOCKIST_VISIT_COMPLETED",
    metaTemplateName: "seera_super_stockist_visit_completed",
    language: "en",
    paramLabels: ["Super Stockist firm name", "Representative name", "Visit date"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
};
// clang-format on

export function templateFor(key: WhatsAppTemplateKey): WhatsAppTemplateDefinition {
  return WHATSAPP_TEMPLATES[key];
}

/**
 * Never lets "undefined"/"null"/blank reach a WhatsApp template parameter. Meta template
 * parameters also reject leading/trailing whitespace runs and newlines/tabs — collapsed
 * here rather than left to fail at the API. `fallback` is what ships when the real value
 * is missing (e.g. a retailer with no recorded business name) — always a safe, non-blank,
 * non-PII-leaking placeholder, never the literal word "undefined"/"null".
 */
export function sanitizeTemplateParam(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!str || str === "undefined" || str === "null") return fallback;
  // Meta rejects parameters over 1024 chars; nothing this app sends is legitimately that
  // long, so a hard cap here is a safety net, not a real limitation.
  return str.slice(0, 1024);
}
