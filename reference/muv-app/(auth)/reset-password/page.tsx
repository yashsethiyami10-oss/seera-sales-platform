"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword } from "@/actions/auth";

/**
 * Completes a flow that was previously only half-built: `resetPassword`
 * (actions/auth.ts) has existed and been fully real since before this
 * phase, but no page consumed it — a customer who requested a reset email
 * would have landed on a 404. This page adds the missing half using the
 * existing action unmodified, not new authentication logic.
 */
function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await resetPassword({ email, token, newPassword: password });
    setLoading(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (!token || !email) {
    return (
      <div className="text-center">
        <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Invalid reset link</h1>
        <p className="muv-text-body text-sm mb-6">This link is missing required information. Request a new one from the login page.</p>
        <Link href="/login" style={{ color: "var(--lavender)" }}>Back to login</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Password updated</h1>
        <p className="muv-text-body text-sm">Redirecting you to log in…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Set a new password</h1>
      <p className="muv-text-body text-sm mb-7">For {email}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required ariaLabel="New password" />
        {error && <p className="muv-text-meta text-xs">{error}</p>}
        <Button variant="primary" type="submit" className="w-full" disabled={loading}>
          {loading ? "Updating…" : <>Update Password <ArrowRight size={15} /></>}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
