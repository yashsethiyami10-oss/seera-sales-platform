import { classifyError, unexpectedErrorInfo, type GovernedErrorInfo } from "./error-catalog";

export class FoundationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
    this.name = "FoundationError";
  }
}

export function deny(code = "ACCESS_DENIED", message = "Access denied"): never {
  throw new FoundationError(code, message, 403);
}

// Governed error response shape. `message` stays the primary, backward-compatible field every
// existing client already reads (`data?.error?.message`) — its CONTENT is now the full actionable
// sentence (userMessage + nextAction), so every unmigrated call site gets better UX for free.
// `userMessage`/`nextAction`/`retryable`/`supportRequired`/`category` are additive, for richer UI
// that wants to render them as separate elements (title/reason/next-step/support-badge).
type GovernedErrorBody = {
  error: {
    code: string;
    message: string;
    userMessage: string;
    nextAction: string;
    retryable: boolean;
    supportRequired: boolean;
    category: GovernedErrorInfo["category"];
    requestId: string;
    details?: unknown;
  };
};

function governedBody(code: string, status: number, info: GovernedErrorInfo, requestId: string, details?: unknown): { status: number; body: GovernedErrorBody } {
  return {
    status,
    body: {
      error: {
        code,
        message: `${info.userMessage} ${info.nextAction}`.trim(),
        userMessage: info.userMessage,
        nextAction: info.nextAction,
        retryable: info.retryable,
        supportRequired: info.supportRequired,
        category: info.category,
        requestId,
        ...(details != null ? { details } : {}),
      },
    },
  };
}

// A conservative allowlist of Prisma error codes worth distinguishing for the user — never
// forwards Prisma's own message (which can include table/column/constraint names) verbatim.
function classifyPrismaError(code: string): { code: string; status: number; userMessage: string } | null {
  switch (code) {
    case "P2025": return { code: "NOT_FOUND", status: 404, userMessage: "That record could not be found." };
    case "P2002": return { code: "DUPLICATE_RECORD", status: 409, userMessage: "This conflicts with an existing record." };
    case "P2003": return { code: "REFERENCE_CONFLICT", status: 409, userMessage: "This is linked to related data that must be handled first." };
    case "P2028": return { code: "OPERATION_TIMED_OUT", status: 503, userMessage: "The operation took too long and was cancelled." };
    case "P1001": case "P1002": case "P1008": case "P1017": return { code: "DATABASE_UNAVAILABLE", status: 503, userMessage: "The system is temporarily unable to reach the database." };
    default: return null;
  }
}

export function safeError(error: unknown, requestId: string) {
  if (error instanceof FoundationError) {
    const info = classifyError(error.code, error.status, error.message);
    return governedBody(error.code, error.status, info, requestId, error.details);
  }
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "issues" in error) {
    // Central fix (was: a flat, useless "Request validation failed" for every request-shape
    // problem across every API route — the actual field and reason were only ever in the
    // server log, never in the response the UI could show). Surfaces which field failed and why,
    // e.g. "workSessionId: Required" — without leaking the raw Zod issue objects or stack.
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    const fieldMessage = issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    const info = classifyError("VALIDATION_ERROR", 400, fieldMessage || "Request validation failed");
    return governedBody(
      "VALIDATION_ERROR",
      400,
      info,
      requestId,
      issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    );
  }
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const prisma = classifyPrismaError(error.code);
    if (prisma) {
      const info = classifyError(prisma.code, prisma.status, prisma.userMessage);
      return governedBody(prisma.code, prisma.status, info, requestId);
    }
  }
  return governedBody("INTERNAL_ERROR", 500, unexpectedErrorInfo(requestId), requestId);
}
