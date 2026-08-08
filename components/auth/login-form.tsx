"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/password-input";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { resolveLoginDestination } from "@/actions/auth";
import { isSafeInternalPath } from "@/lib/auth/safe-path";

export function LoginForm({ googleEnabled, appleEnabled }: { googleEnabled: boolean; appleEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
    </Suspense>
  );
}

function LoginFormInner({ googleEnabled, appleEnabled }: { googleEnabled: boolean; appleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Stage 1 (Authentication and Role-Aware Entry): the raw query param is
  // untrusted client input — validated for *shape* here (rejects an
  // absolute/external URL outright before it's used anywhere, including
  // handing it to NextAuth's own OAuth `callbackUrl`), but never trusted
  // as an *authorized* destination on its own. The credentials flow below
  // re-validates it server-side (with real session/permission context)
  // via `resolveLoginDestination` before ever navigating anywhere.
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const safeCallbackUrl = isSafeInternalPath(rawCallbackUrl) ? rawCallbackUrl : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });

    if (result?.error) {
      setLoading(false);
      // Phase 1D — the one case that's now distinguished: rate-limited
      // attempts get an accurate, actionable message. Everything else
      // (wrong password, unknown email) still shares one generic message —
      // see lib/auth.ts's RateLimitedError comment for why that's still
      // correct for those cases specifically (never reveal which failed).
      setError(
        result.code === "rate_limited"
          ? "Too many attempts. Please wait a few minutes and try again."
          : "Incorrect email or password."
      );
      return;
    }
    // Session is established now — resolve the real, authorized
    // destination server-side rather than trusting the raw query param.
    const resolved = await resolveLoginDestination(safeCallbackUrl);
    setLoading(false);
    router.push(resolved.data.destination);
  }

  return (
    <>
      <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Welcome back</h1>
      <p className="muv-text-body text-sm mb-7">Log in to continue your Muv journey.</p>

      <SocialSignIn
        googleEnabled={googleEnabled}
        appleEnabled={appleEnabled}
        // OAuth completes on NextAuth's own redirect, outside this
        // component entirely — routed through the same server-side
        // resolution the credentials flow above uses (rather than
        // trusting NextAuth's callbackUrl directly) via a small
        // continuation page. See app/(auth)/login/continue/page.tsx.
        callbackUrl={`/login/continue${safeCallbackUrl ? `?next=${encodeURIComponent(safeCallbackUrl)}` : ""}`}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="muv-input" />
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs muv-text-meta cursor-pointer">
            {/* A 30-day persistent JWT session (lib/auth.ts) already applies
                to every login regardless of this checkbox — real "remember
                me" behavior already happens by default. This stays purely
                informational rather than wiring a second, shorter-session
                code path for the unchecked case, which would need its own
                cookie-lifetime logic in the JWT callback for a genuinely
                marginal benefit over what's already true today. */}
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: "var(--lavender)" }} />
            Remember me
          </label>
          <Link href="/reset-password" className="muv-text-meta text-xs hover:text-white">Forgot password?</Link>
        </div>
        {error && <p className="muv-text-meta text-xs">{error}</p>}
        <Button variant="primary" type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging in…" : <>Log In <ArrowRight size={15} /></>}
        </Button>
      </form>

      <p className="muv-text-meta text-sm text-center mt-6">
        New to Muv? <Link href="/signup" style={{ color: "var(--lavender)" }}>Create an account</Link>
      </p>
    </>
  );
}
