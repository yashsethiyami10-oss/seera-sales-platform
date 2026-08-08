"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { useToast } from "@/components/ui/toast";

/**
 * Real — calls the existing `requestPasswordReset` action (actions/auth.ts,
 * unmodified) which sends a genuine email with a working reset link, now
 * that app/(auth)/reset-password/page.tsx exists to complete that link
 * instead of 404ing.
 */
export function ChangePasswordButton({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { showToast } = useToast();

  async function handleClick() {
    setSending(true);
    const result = await requestPasswordReset({ email });
    setSending(false);
    if (result.success) {
      setSent(true);
      showToast("Password reset link sent to your email");
    } else {
      showToast(result.error.message);
    }
  }

  return (
    <button onClick={handleClick} disabled={sending || sent} className="muv-footer-link muv-text-meta hover:text-white text-sm text-left">
      {sent ? "Reset link sent — check your email" : sending ? "Sending…" : "Change Password"}
    </button>
  );
}
