import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe subset of the auth config — no providers (Credentials pulls in
 * bcryptjs, which uses Node APIs the Edge Runtime doesn't support), no
 * Prisma adapter. Middleware only needs to read/shape the JWT session, never
 * to run `authorize()` itself, so this is enough for route protection.
 * The full config (lib/auth.ts) extends this with providers + adapter and
 * only ever runs in the Node.js runtime (Server Components, Route Handlers,
 * Server Actions).
 */
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  providers: [],
  // Auth.js refuses requests whose Host header it doesn't recognize
  // ("UntrustedHost") unless the deploy platform is auto-detected (Vercel)
  // or this is explicitly opted into — required for any self-hosted
  // deployment (a VPS, GoDaddy hosting, etc. behind a reverse proxy).
  // Safe as long as the reverse proxy in front of this app only forwards
  // requests for this app's actual domain (the normal Nginx/Apache
  // `server_name` setup) — see PRODUCTION_READY.md.
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "CUSTOMER";
        token.id = user.id as string;
      }
      if (!token.role) token.role = "CUSTOMER";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "STAFF" | "CUSTOMER";
      }
      return session;
    },
  },
};
