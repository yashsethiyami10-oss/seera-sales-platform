import { auth } from "@/lib/auth";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

type Role = "ADMIN" | "STAFF" | "CUSTOMER";

/**
 * Every server action and API route that touches non-public data calls one
 * of these instead of reading `auth()` directly — centralizing the checks
 * means a role rule only ever needs to change in one place, and it's
 * impossible to "forget" the unauthenticated case since the return type
 * guarantees a session.
 */

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/** Admin dashboard mutations: Product/Order/Coupon/etc CRUD. */
export const requireStaff = () => requireRole("ADMIN", "STAFF");

/** Destructive or business-sensitive actions: user role changes, refunds. */
export const requireAdmin = () => requireRole("ADMIN");

/**
 * A customer acting on their own data (addresses, wishlist, own orders).
 * Returns the Customer row (not just the User), since almost every
 * customer-facing action needs `customerId` for its `where` clause.
 */
export async function requireCustomer() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new ForbiddenError("This action is for customer accounts only");
  return user;
}
