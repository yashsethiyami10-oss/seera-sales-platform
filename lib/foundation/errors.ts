export class FoundationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "FoundationError";
  }
}

export function deny(code = "ACCESS_DENIED", message = "Access denied"): never {
  throw new FoundationError(code, message, 403);
}
