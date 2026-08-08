import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  // Phase 1D correction pass — trim + lowercase so a customer who signed up
  // as "Jane@Example.com" and later types "jane@example.com" (or vice
  // versa) doesn't get a false "Incorrect email or password". Every write
  // path (signup, password reset) normalizes the same way — see
  // actions/auth.ts and lib/validations/customer.ts — so lookups always
  // compare like-for-like.
  // Order matters: .trim()/.toLowerCase() must run BEFORE .email()'s format
  // check, or a leading/trailing space fails validation before it's ever
  // stripped (caught live during this pass's own testing — see
  // PHASE_1D_DEFECT_LOG.md).
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

/**
 * Distinguishable from a genuine bad-password failure so the login form can
 * show an accurate "too many attempts" message instead of the misleading
 * generic one — without leaking account existence, since this check runs
 * (and this error can therefore fire) before the user lookup even happens.
 * `code` is deliberately generic per Auth.js's own guidance for this field
 * ("make sure it does not hint at sensitive errors").
 */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The Prisma adapter persists OAuth accounts/sessions to Postgres. We still
  // use JWT (not database) session strategy below — the adapter is only
  // responsible for account linking here, session lookups stay stateless.
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Rate-limited by email — 5 attempts per 5 minutes. This is the one
        // spot flagged in SECURITY.md/AUDIT.md as written-but-not-wired-in
        // prior to this pass; it's wired in now. Note the limitation: keyed
        // by email only, not email+IP, because NextAuth's `authorize`
        // signature doesn't hand this callback the request object to read
        // an IP from — acceptable for launch (it still stops credential
        // stuffing against one account), but revisit with IP-aware limiting
        // once on Redis-backed storage (see lib/rate-limit.ts's own caveat
        // about in-memory limiting not surviving multiple instances).
        const { allowed } = checkRateLimit(`login:${email}`, 5, 5 * 60 * 1000);
        if (!allowed) {
          logger.warn("auth:login-rate-limited", { email });
          // Phase 1D — distinguishable from a bad-password failure (via
          // RateLimitedError's `code`) so the UI can show an accurate
          // message, but this still runs before the user lookup below, so
          // it never confirms or denies that the account exists.
          throw new RateLimitedError();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        // Deliberately identical failure path whether the user exists or the
        // password is wrong — never reveal which one failed (user enumeration).
        if (!user || !user.passwordHash || !user.active) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await prisma.salesAuditLog.create({
          data: { userId: user.id, module: "auth", action: "LOGIN" },
        });
        return { id: user.id, name: user.name, email: user.email, role: user.role, image: user.image };
      },
    }),

    // Social login: wire real credentials via env vars in production.
    // Falls back to being silently unavailable if unset, rather than crashing.
    ...(process.env.GOOGLE_CLIENT_ID
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
      : []),
    // Apple Sign In (Phase 18) — same conditional pattern as Google above.
    // Genuinely inactive until real credentials exist: Apple requires an
    // Apple Developer Program enrollment, a Services ID, a private key
    // (.p8) used to generate APPLE_CLIENT_SECRET as a signed JWT, a Team
    // ID, and a verified return URL — none of which can be provisioned in
    // this environment. The code path is real and ready; only the
    // credentials are missing, so no login/signup UI shows an Apple button
    // until APPLE_ID is actually set (see app/(auth)/login/page.tsx).
    ...(process.env.APPLE_ID
      ? [Apple({ clientId: process.env.APPLE_ID, clientSecret: process.env.APPLE_CLIENT_SECRET! })]
      : []),
  ],

  // jwt/session callbacks live in lib/auth.config.ts — shared with the
  // edge-safe middleware instance so both agree on token shape.

  // Signed with AUTH_SECRET (or NEXTAUTH_SECRET) env var — required in
  // production; NextAuth throws on boot if it's missing, by design.
});
