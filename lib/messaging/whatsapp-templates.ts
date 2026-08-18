/**
 * Governed WhatsApp template registry for Seera.
 *
 * Meta's Cloud API only accepts pre-created, Meta-approved template messages — this
 * codebase cannot invent template body copy at send time. This file is the single,
 * governed map from an internal business event to the exact template name/language/
 * category/parameter contract this code will submit to Meta. It does NOT create or
 * approve anything in the Meta WhatsApp Manager — that is a manual Founder/operator
 * action. Every field below for the six live templates was read directly off the
 * Founder's live Seera WABA (via /api/founder/whatsapp-diagnostics), not guessed —
 * see the reconciliation history in git log for this file for the exact live values
 * as read at the time. `approvalStatus`/`languageCode`/`category` are this codebase's
 * own record of what Meta reported, not a live read on every request — re-reconcile
 * against the diagnostics route if templates are ever edited/recreated in Meta.
 *
 * Naming convention: `seera_<domain>_<event>[_<language>]` in snake_case, matching
 * Meta's template naming rules (lowercase letters, numbers, underscores only).
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
  /** Meta's own exact language code for this specific template, read live from Meta —
   *  never a single global default. `null` until a template has actually been created
   *  and reconciled; a `null` here must block sending (see whatsapp-business.ts /
   *  the pre-queue validation in retailer-communication-service.ts /
   *  partner-communication-service.ts), not fall back to a guessed value. */
  languageCode: string | null;
  /** Meta's own reported template category ("MARKETING", "UTILITY", "AUTHENTICATION").
   *  Read live, never assumed — `null` until reconciled. */
  category: string | null;
  /** Ordered description of each {{1}}..{{n}} body placeholder, for manual template
   *  authoring in Meta AND as documentation for call sites building `templateParams`. */
  paramLabels: string[];
  /** This codebase's own record of Meta approval state — see file header. Not a live
   *  Meta read on every request. Only ever set to APPROVED because a live Graph API
   *  response actually reported the template as APPROVED. */
  approvalStatus: TemplateApprovalStatus;
}

// clang-format off
export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, WhatsAppTemplateDefinition> = {
  // Live-reconciled against the Founder's Seera WABA — status=APPROVED, category=MARKETING,
  // language=hi, 5 body parameters, all confirmed via Graph API (not assumed).
  RETAILER_ORDER_PLACED: {
    key: "RETAILER_ORDER_PLACED",
    metaTemplateName: "seera_retailer_order_placed",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["Retailer/contact name", "Representative name", "Outlet name", "Visit date", "Order number/status"],
    approvalStatus: "APPROVED",
  },
  RETAILER_NO_ORDER: {
    key: "RETAILER_NO_ORDER",
    metaTemplateName: "seera_retailer_visit_no_order",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["Retailer/contact name", "Representative name", "Outlet name", "Visit date", "No-order update"],
    approvalStatus: "APPROVED",
  },
  RETAILER_FOLLOW_UP: {
    key: "RETAILER_FOLLOW_UP",
    metaTemplateName: "seera_retailer_follow_up",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["Retailer/contact name", "Representative name", "Outlet name", "Visit date", "Next follow-up date"],
    approvalStatus: "APPROVED",
  },
  DISTRIBUTOR_VISIT_COMPLETED: {
    key: "DISTRIBUTOR_VISIT_COMPLETED",
    metaTemplateName: "seera_distributor_visit_completed",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["Distributor contact name", "Representative name", "Distributor firm name", "Visit date", "Visit outcome/update"],
    approvalStatus: "APPROVED",
  },
  SUPER_STOCKIST_VISIT_COMPLETED: {
    key: "SUPER_STOCKIST_VISIT_COMPLETED",
    metaTemplateName: "seera_super_stockist_visit_completed",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["S.S. contact name", "Representative name", "Super Stockist firm name", "Visit date", "Visit outcome/update"],
    approvalStatus: "APPROVED",
  },
  // Recreated template — the earlier Hindi delivery template had a param mismatch and was
  // deleted; `seera_retailer_order_delivered` (the old name) is no longer authoritative.
  RETAILER_ORDER_DELIVERED: {
    key: "RETAILER_ORDER_DELIVERED",
    metaTemplateName: "seera_retailer_order_delivered_hi",
    languageCode: "hi",
    category: "MARKETING",
    paramLabels: ["Retailer/contact name", "Outlet/shop name", "Order number", "Distributor firm name", "Delivery date"],
    approvalStatus: "APPROVED",
  },

  // Not present in the live Seera WABA as of the last reconciliation — approvalStatus stays
  // PENDING_META_APPROVAL, languageCode/category stay null, and the pre-queue validation gate
  // (retailer-communication-service.ts) refuses to queue a live send for any of these until
  // this record is updated to reflect a real Meta-created, APPROVED template.
  RETAILER_ORDER_ACCEPTED: {
    key: "RETAILER_ORDER_ACCEPTED",
    metaTemplateName: "seera_retailer_order_accepted",
    languageCode: null,
    category: null,
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_ORDER_PARTIAL: {
    key: "RETAILER_ORDER_PARTIAL",
    metaTemplateName: "seera_retailer_order_partial",
    languageCode: null,
    category: null,
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
  RETAILER_OUT_FOR_DELIVERY: {
    key: "RETAILER_OUT_FOR_DELIVERY",
    metaTemplateName: "seera_retailer_out_for_delivery",
    languageCode: null,
    category: null,
    paramLabels: ["Retailer/outlet name", "Order number"],
    approvalStatus: "PENDING_META_APPROVAL",
  },
};
// clang-format on

export function templateFor(key: WhatsAppTemplateKey): WhatsAppTemplateDefinition {
  return WHATSAPP_TEMPLATES[key];
}

/** True only when a template is actually safe to queue for a live Meta send: this
 *  codebase's own record says APPROVED, and it has a real (non-null) language code to
 *  send with. Every queue-time call site must check this before creating a PENDING
 *  outbox row — see the Founder directive "template validation before queue." */
export function isTemplateSendable(template: WhatsAppTemplateDefinition): template is WhatsAppTemplateDefinition & { languageCode: string } {
  return template.approvalStatus === "APPROVED" && typeof template.languageCode === "string" && template.languageCode.length > 0;
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
