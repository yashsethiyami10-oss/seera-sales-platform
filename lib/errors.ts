import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Thrown deliberately by application code for expected failure cases
 * (not found, forbidden, conflict, etc). `statusCode` maps to the HTTP
 * response in API routes; server actions read `.code`/`.message` directly.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BAD_REQUEST"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super(`${entity} not found`, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do this") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/** Shape every API route and server action should resolve to on failure. */
export type ErrorResponse = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
};

/**
 * Normalizes any thrown value into a safe, consistent error response.
 * Never leaks raw Prisma/DB error internals to the client — logs them
 * server-side instead, since stack traces and constraint names can reveal
 * schema details to an attacker.
 */
function isZodError(err: unknown): err is ZodError {
  return err != null && typeof err === "object" && "name" in err && (err as { name?: string }).name === "ZodError";
}

function isAppError(err: unknown): err is AppError {
  return err != null && typeof err === "object" && "statusCode" in err && "code" in err;
}

function isPrismaKnownRequestError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err != null && typeof err === "object" && "code" in err && "meta" in err;
}

export function toErrorResponse(err: unknown): ErrorResponse {
  if (isZodError(err)) {
    return {
      success: false,
      error: {
        message: "Invalid input",
        code: "VALIDATION_ERROR",
        fieldErrors: err.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }

  if (isAppError(err)) {
    return { success: false, error: { message: err.message, code: err.code } };
  }

  if (isPrismaKnownRequestError(err)) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return { success: false, error: { message: `A record with this ${target} already exists`, code: "CONFLICT" } };
    }
    if (err.code === "P2025") {
      return { success: false, error: { message: "Record not found", code: "NOT_FOUND" } };
    }
  }

  // Unrecognized error — log full detail server-side, return a generic
  // message to the client so internals are never exposed.
  console.error("[unhandled error]", err);
  return { success: false, error: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" } };
}

export function statusForError(err: unknown): number {
  if (isZodError(err)) return 422;
  if (isAppError(err)) return err.statusCode;
  if (isPrismaKnownRequestError(err)) {
    if (err.code === "P2002") return 409;
    if (err.code === "P2025") return 404;
  }
  return 500;
}
