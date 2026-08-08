import { auth } from "@/lib/auth";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), User & Role Foundation.
 *
 * The Shell's own notion of "who is logged in" — deliberately just the base
 * identity NextAuth's session already carries (id, name, email, base
 * Role enum), never anything Sales-domain-specific. `lib/sales/authorization.ts`'s
 * `getSalesPrincipal()` already exists for that, but importing it here would
 * smuggle a business-domain dependency into the platform foundation, which
 * the Global Layout Specification's "no hardcoded business modules" rule
 * forbids. Once real Apps exist and register permissions (Manifest
 * Architecture §4), a future file layers App-scoped permission resolution
 * on top of this — this function only ever answers "who is this," not
 * "what can they do."
 *
 * No extra Prisma round-trip: `session.user.role` is already populated by
 * the JWT/session callbacks in lib/auth.ts, and an inactive user cannot
 * establish a session in the first place (checked in `authorize()`) — so
 * re-querying the User table here would be redundant, not more correct.
 */
export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    role: session.user.role,
  };
}
