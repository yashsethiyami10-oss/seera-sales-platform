export class FoundationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "FoundationError";
  }
}

export function deny(code = "ACCESS_DENIED", message = "Access denied"): never {
  throw new FoundationError(code, message, 403);
}

export function safeError(error: unknown, requestId: string) {
  if (error instanceof FoundationError) return { status: error.status, body: { error: { code: error.code, message: error.message, requestId } } };
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Request validation failed", requestId } } };
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") return { status: 404, body: { error: { code: "NOT_FOUND", message: "Resource not found", requestId } } };
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "An internal error occurred", requestId } } };
}
