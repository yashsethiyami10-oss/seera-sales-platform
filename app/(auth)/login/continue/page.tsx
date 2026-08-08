import { redirect } from "next/navigation";
import { resolveAuthorizedDestination } from "@/lib/auth/redirect-policy";

/**
 * Stage 1 (Authentication and Role-Aware Entry). NextAuth's OAuth flow
 * (Google/Apple, `components/auth/social-sign-in.tsx`) redirects here on
 * its own after establishing the session, rather than straight to the
 * originally-requested page — so both the OAuth and credentials
 * (`login-form.tsx`) flows resolve their final destination through the
 * exact same server-side, authorization-aware logic
 * (`resolveAuthorizedDestination`), never two separate implementations
 * of "where does this person belong."
 */
export default async function LoginContinuePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = await resolveAuthorizedDestination(next ?? null);
  redirect(destination);
}
