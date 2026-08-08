"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/password-input";
import { signup } from "@/actions/auth";
import { SocialSignIn } from "@/components/auth/social-sign-in";

// Same two real rules actions/auth.ts's signupSchema enforces server-side
// (lib/validations/customer.ts) — mirrored here only to give live feedback
// while typing, not a second source of truth. The server is still what
// actually validates on submit.
const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "One uppercase letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "One number" },
];

export function SignupForm({ googleEnabled, appleEnabled }: { googleEnabled: boolean; appleEnabled: boolean }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const passwordChecks = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(form.password) })), [form.password]);
  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === form.password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmPassword !== form.password) {
      setFieldErrors({ confirmPassword: ["Passwords don't match"] });
      return;
    }
    setLoading(true);
    setFieldErrors({});

    const result = await signup(form);
    if (!result.success) {
      setFieldErrors(result.error.fieldErrors ?? { _: [result.error.message] });
      setLoading(false);
      return;
    }

    // Signup succeeded — sign the new user straight in rather than sending
    // them back to a login form they'd just have to fill out again.
    await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    router.push("/account");
  }

  return (
    <>
      <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Create your account</h1>
      <p className="muv-text-body text-sm mb-7">Join the movement — premium care, every day.</p>

      <SocialSignIn googleEnabled={googleEnabled} appleEnabled={appleEnabled} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="muv-input" />
        <input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="muv-input" />
        <input required placeholder="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="muv-input" />
        <div>
          <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" required />
          {form.password.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {passwordChecks.map((c) => (
                <span key={c.label} className="flex items-center gap-1 text-[11px]" style={{ color: c.passed ? "var(--lavender)" : "rgba(var(--text-rgb),0.4)" }}>
                  {c.passed ? <Check size={11} /> : <X size={11} />} {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required ariaInvalid={!passwordsMatch} />
          {!passwordsMatch && <p className="muv-text-meta text-xs mt-1.5">Passwords don't match</p>}
        </div>
        {Object.values(fieldErrors).flat().map((msg, i) => <p key={i} className="muv-text-meta text-xs">{msg}</p>)}
        <Button variant="primary" type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : <>Create Account <ArrowRight size={15} /></>}
        </Button>
      </form>

      <p className="muv-text-meta text-sm text-center mt-6">
        Already have an account? <Link href="/login" style={{ color: "var(--lavender)" }}>Log in</Link>
      </p>
    </>
  );
}
