"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function patchJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Request failed");
  return d;
}

// P1 22-Aug self-service account security fix (shared across every portal via the "profile"
// section — see app/portal/[portal]/[section]/page.tsx): identity-scoped only, grants no new
// permission, so it is safe on every role, not just Distributor.
export function ChangePasswordActions({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "सुरक्षा" : "SECURITY"}</small>
        <h2>{hi ? "पासवर्ड बदलें" : "Change password"}</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const newPassword = String(data.get("newPassword") || "");
          const confirmPassword = String(data.get("confirmPassword") || "");
          setMessage(null);
          if (newPassword !== confirmPassword) {
            setMessage({ ok: false, text: hi ? "नया पासवर्ड और पुष्टि मेल नहीं खाते।" : "New password and confirmation do not match." });
            return;
          }
          setBusy(true);
          void patchJson("/api/foundation/account/password", {
            currentPassword: String(data.get("currentPassword") || ""),
            newPassword,
          })
            .then(() => {
              form.reset();
              setMessage({ ok: true, text: hi ? "पासवर्ड बदल दिया गया। अन्य सभी सत्र साइन आउट कर दिए गए हैं।" : "Password changed. All other sessions have been signed out." });
              router.refresh();
            })
            .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : hi ? "पासवर्ड नहीं बदला जा सका" : "Could not change password" }))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          {hi ? "वर्तमान पासवर्ड" : "Current password"}
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label>
          {hi ? "नया पासवर्ड" : "New password"}
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" placeholder={hi ? "कम से कम 12 अक्षर" : "At least 12 characters"} />
        </label>
        <label>
          {hi ? "नए पासवर्ड की पुष्टि करें" : "Confirm new password"}
          <input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <button disabled={busy} className={styles.primaryBig}>
          {hi ? "पासवर्ड बदलें" : "CHANGE PASSWORD"}
        </button>
      </form>
      {message && (
        <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError}>
          {message.text}
        </p>
      )}
    </section>
  );
}
