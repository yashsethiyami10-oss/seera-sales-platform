import { LoginForm } from "@/components/auth/login-form";

/**
 * Server Component wrapper (Phase 18) — needed to read GOOGLE_CLIENT_ID/
 * APPLE_ID server-side and decide whether to show those sign-in buttons at
 * all. The actual interactive form (credentials submit, useSearchParams)
 * moved to components/auth/login-form.tsx, a Client Component, unchanged
 * in behavior otherwise.
 */
export default function LoginPage() {
  return <LoginForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} appleEnabled={!!process.env.APPLE_ID} />;
}
