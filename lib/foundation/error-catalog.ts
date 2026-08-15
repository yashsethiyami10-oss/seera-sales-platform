// Governed error UX catalog. Every FoundationError code (there are ~250+
// across the Seera codebase) gets classified into one of 8 categories and
// enriched with a userMessage/nextAction/retryable/supportRequired shape —
// without hand-writing unique prose for every code. Strategy:
//   1. An explicit override table for the ~40 highest-traffic/most
//      user-facing codes (auth, Daily Working, common validation/workflow).
//   2. A systematic name-pattern + HTTP-status fallback for everything else,
//      reusing the FoundationError's own hand-written `message` (already a
//      reasonable domain-specific sentence in nearly every throw site) as
//      the userMessage, with a categorical nextAction/retryable/supportRequired.
// This guarantees every known and unknown-but-classifiable code gets a safe,
// actionable response — never a bare code or a raw exception.

export type ErrorCategory =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "VALIDATION"
  | "WORKFLOW"
  | "CONFIGURATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INFRASTRUCTURE";

export type GovernedErrorInfo = {
  category: ErrorCategory;
  userMessage: string;
  nextAction: string;
  retryable: boolean;
  supportRequired: boolean;
};

const CATEGORY_DEFAULTS: Record<ErrorCategory, Omit<GovernedErrorInfo, "userMessage" | "category">> = {
  AUTHENTICATION: { nextAction: "Please log in again to continue.", retryable: false, supportRequired: false },
  AUTHORIZATION: { nextAction: "You don't have permission for this action. Contact your Admin or Founder if you believe this is incorrect.", retryable: false, supportRequired: true },
  VALIDATION: { nextAction: "Please review the highlighted information and try again.", retryable: true, supportRequired: false },
  WORKFLOW: { nextAction: "This action isn't available for the current status. Refresh the page to see the latest state before trying again.", retryable: false, supportRequired: false },
  CONFIGURATION: { nextAction: "This requires setup that hasn't been completed yet. Ask your Founder/Admin to complete the required configuration.", retryable: false, supportRequired: true },
  CONFLICT: { nextAction: "This conflicts with an existing record or an action already taken. Refresh and check the current state before retrying.", retryable: false, supportRequired: false },
  NOT_FOUND: { nextAction: "The record could not be found. It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },
  INFRASTRUCTURE: { nextAction: "Please try again in a moment. If this keeps happening, share the Error ID below with your Admin.", retryable: true, supportRequired: true },
};

// Explicit overrides for the highest-traffic / most user-facing codes.
// userMessage here intentionally keeps close to the existing hand-authored
// FoundationError message so this stays consistent with what's already in
// the codebase, rather than inventing new wording wholesale.
const OVERRIDES: Record<string, GovernedErrorInfo> = {
  // --- Authentication ---
  AUTHENTICATION_REQUIRED: { category: "AUTHENTICATION", userMessage: "You need to be logged in to do this.", nextAction: "Please log in and try again.", retryable: false, supportRequired: false },
  INVALID_CREDENTIALS: { category: "AUTHENTICATION", userMessage: "The email or password you entered is incorrect.", nextAction: "Check your details and try again.", retryable: true, supportRequired: false },
  SESSION_INVALID: { category: "AUTHENTICATION", userMessage: "Your session is no longer valid.", nextAction: "Please log in again.", retryable: false, supportRequired: false },
  SESSION_STALE: { category: "AUTHENTICATION", userMessage: "Your session has changed since you logged in (your access was updated).", nextAction: "Please log in again to refresh your session.", retryable: false, supportRequired: false },
  USER_ACCESS_DISABLED: { category: "AUTHENTICATION", userMessage: "Your account access has been disabled.", nextAction: "Contact your Admin or Founder to restore access.", retryable: false, supportRequired: true },
  WEAK_PASSWORD: { category: "VALIDATION", userMessage: "This password doesn't meet the minimum security requirements.", nextAction: "Choose a stronger password and try again.", retryable: true, supportRequired: false },
  RATE_LIMITED: { category: "INFRASTRUCTURE", userMessage: "Too many attempts in a short time.", nextAction: "Please wait a moment before trying again.", retryable: true, supportRequired: false },

  // --- Authorization ---
  ACCESS_DENIED: { category: "AUTHORIZATION", userMessage: "You don't have permission to do this.", nextAction: "Contact your Admin or Founder if you believe you should have access.", retryable: false, supportRequired: true },
  PORTAL_DISABLED: { category: "AUTHORIZATION", userMessage: "This section is currently unavailable.", nextAction: "Contact your Admin or Founder for access.", retryable: false, supportRequired: true },

  // --- Daily Working / field workflow (explicit, task-required) ---
  WORKDAY_NOT_ACTIVE: { category: "WORKFLOW", userMessage: "No active work day was found.", nextAction: "Start your work day first, then try again.", retryable: false, supportRequired: false },
  ACTIVE_WORKDAY_EXISTS: { category: "CONFLICT", userMessage: "You already have an active work day.", nextAction: "End your current work day before starting a new one.", retryable: false, supportRequired: false },
  ACTIVE_WORKDAY_REQUIRED: { category: "WORKFLOW", userMessage: "You need an active work day to do this.", nextAction: "Start your work day first, then try again.", retryable: false, supportRequired: false },
  OPEN_JOINT_WORK_EXISTS: { category: "CONFLICT", userMessage: "A joint working session is already open.", nextAction: "Close the existing session before starting a new one.", retryable: false, supportRequired: false },
  OPEN_VISIT_EXISTS: { category: "CONFLICT", userMessage: "You already have an open visit.", nextAction: "Check out of the current visit before starting another.", retryable: false, supportRequired: false },

  // --- Not found ---
  DISTRIBUTOR_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That distributor could not be found.", nextAction: "It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },
  SUPER_STOCKIST_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That Super Stockist could not be found.", nextAction: "It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },
  PARTNER_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That partner account could not be found.", nextAction: "It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },
  USER_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That user could not be found.", nextAction: "Double-check and try again.", retryable: false, supportRequired: false },
  DOCUMENT_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That document could not be found.", nextAction: "It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },
  QUOTATION_NOT_FOUND: { category: "NOT_FOUND", userMessage: "That quotation could not be found.", nextAction: "It may have been removed, or you may not have access to it.", retryable: false, supportRequired: false },

  // --- Configuration / master data ---
  SYSTEM_ACCOUNT_MISSING: { category: "CONFIGURATION", userMessage: "A required system account hasn't been set up yet.", nextAction: "Ask your Founder/Admin to complete the finance configuration.", retryable: false, supportRequired: true },
  OUTBOX_WORKER_NOT_CONFIGURED: { category: "CONFIGURATION", userMessage: "Background processing isn't configured yet.", nextAction: "Ask your Admin to complete this setup.", retryable: false, supportRequired: true },
  DISTRIBUTED_RATE_LIMIT_REQUIRED: { category: "CONFIGURATION", userMessage: "This deployment needs additional configuration before it can run with multiple instances.", nextAction: "Contact your Admin.", retryable: false, supportRequired: true },

  // --- Conflicts / duplicates ---
  DUPLICATE_PAYMENT_REFERENCE: { category: "CONFLICT", userMessage: "A payment with this reference has already been recorded.", nextAction: "Check existing payments before submitting again.", retryable: false, supportRequired: false },
  DUPLICATE_VENDOR_INVOICE: { category: "CONFLICT", userMessage: "This vendor invoice has already been recorded.", nextAction: "Check existing invoices before submitting again.", retryable: false, supportRequired: false },
  QUOTATION_ALREADY_CONVERTED: { category: "CONFLICT", userMessage: "This quotation has already been converted to an order.", nextAction: "Check the resulting order instead.", retryable: false, supportRequired: false },
  BEAT_PLAN_ALREADY_EXISTS: { category: "CONFLICT", userMessage: "A beat plan already exists for this day/employee.", nextAction: "Edit the existing plan instead of creating a new one.", retryable: false, supportRequired: false },
};

// Systematic fallback: derive a category (and therefore nextAction/
// retryable/supportRequired) from the code's own naming convention. Applied
// only when no explicit override exists above.
function classifyByName(code: string): ErrorCategory | null {
  if (/_SCOPE_DENIED$|_DENIED$|^ACCESS_DENIED$/.test(code)) return "AUTHORIZATION";
  if (/_REQUIRED$/.test(code)) return "VALIDATION";
  if (/^INVALID_/.test(code)) return "VALIDATION";
  if (/_MISMATCH$/.test(code)) return "VALIDATION";
  if (/_NOT_FOUND$/.test(code)) return "NOT_FOUND";
  if (/^DUPLICATE_|_ALREADY_|_EXISTS$/.test(code)) return "CONFLICT";
  if (/_NOT_DRAFT$|_NOT_APPROVED$|_NOT_ISSUED$|_NOT_ELIGIBLE$|_NOT_ACTIVE$|_NOT_REVERSIBLE$|_NOT_ACCRUED$|_NOT_PAID$|_NOT_POSTED$|_NOT_SUBMITTED$|_NOT_PAYABLE$|_NOT_FUTURE$|_NOT_CONFIGURED$|_NOT_READY$|_NOT_CANCELLABLE$|_NOT_LOCKED$|_NOT_UNDER_REVIEW$|_NOT_DECIDED$/.test(code)) return "WORKFLOW";
  if (/^INSUFFICIENT_|_SHORTAGE$|_HELD$|_INSUFFICIENT$/.test(code)) return "WORKFLOW";
  if (/_MISSING$|^UNKNOWN_|_NOT_CONFIGURED$|_PROHIBITED$|_PROTECTED$/.test(code)) return "CONFIGURATION";
  if (/^SESSION_|^AUTHENTICATION_/.test(code)) return "AUTHENTICATION";
  if (/^RATE_LIMITED$|_TIMEOUT$|_UNAVAILABLE$/.test(code)) return "INFRASTRUCTURE";
  return null;
}

function classifyByStatus(status: number): ErrorCategory {
  if (status === 401) return "AUTHENTICATION";
  if (status === 403) return "AUTHORIZATION";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "INFRASTRUCTURE";
  return "VALIDATION";
}

// Turns a title-case-from-SCREAMING_SNAKE code into readable words, used
// only as an absolute last-resort userMessage fragment when even the
// FoundationError's own message is somehow empty.
function humanizeCode(code: string): string {
  return code.toLowerCase().replace(/_/g, " ");
}

export function classifyError(code: string, status: number, originalMessage: string): GovernedErrorInfo {
  const override = OVERRIDES[code];
  if (override) return override;
  const category = classifyByName(code) ?? classifyByStatus(status);
  const defaults = CATEGORY_DEFAULTS[category];
  return {
    category,
    userMessage: originalMessage?.trim() || `Could not complete this action (${humanizeCode(code)}).`,
    ...defaults,
  };
}

// Generic fallback for genuinely unexpected errors (not a FoundationError,
// not a recognized Zod/Prisma shape) — the ONLY place "An internal error
// occurred"-style text used to be the final word. Never includes any detail
// about the underlying exception; the requestId is the sole trace link back
// to the full server-side log entry.
export function unexpectedErrorInfo(requestId: string): GovernedErrorInfo {
  return {
    category: "INFRASTRUCTURE",
    userMessage: "An unexpected system error occurred.",
    nextAction: `Please try again. If this keeps happening, share Error ID ${requestId} with your Admin.`,
    retryable: true,
    supportRequired: true,
  };
}
