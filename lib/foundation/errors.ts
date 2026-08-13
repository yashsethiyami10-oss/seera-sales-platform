export class FoundationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
    this.name = "FoundationError";
  }
}

export function deny(code = "ACCESS_DENIED", message = "Access denied"): never {
  throw new FoundationError(code, message, 403);
}

export function safeError(error: unknown, requestId: string) {
  if (error instanceof FoundationError) return { status: error.status, body: { error: { code: error.code, message: error.message, requestId, ...(error.details != null ? { details: error.details } : {}) } } };
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "issues" in error) {
    // Central fix (was: a flat, useless "Request validation failed" for every request-shape
    // problem across every API route — the actual field and reason were only ever in the
    // server log, never in the response the UI could show). Surfaces which field failed and why,
    // e.g. "workSessionId: Required" — without leaking the raw Zod issue objects or stack.
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    const fieldMessage = issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: fieldMessage || "Request validation failed",
          requestId,
          details: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        },
      },
    };
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") return { status: 404, body: { error: { code: "NOT_FOUND", message: "Resource not found", requestId } } };
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "An internal error occurred", requestId } } };
}
