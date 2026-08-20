"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type RosterEntry = {
  userId: string;
  name: string;
  roleCode: string;
  roleName: string;
  companyDirectEligible: boolean;
};

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/distribution/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

// GAP-004 addendum (Founder decision): Company Direct is a Founder-approved EXCEPTION per Sales
// Manager/Executive, never a default and never inferred from territory/name — the default supply
// model stays Company -> Super Stockist -> Distributor -> Retailer. This is the only surface that
// grants/revokes that eligibility; every backend enforcement point (retailer creation, commercial
// -party reassignment, order placement) checks the governed SeeraAssignment row this writes, never
// this UI. Disabling a user who still owns Company Direct-routed retailers is rejected by the
// backend with a "reassign first" error, surfaced here as a plain message, not a silent no-op.
export function CompanyDirectEligibilityPanel({ language, roster }: { language: "EN" | "HI"; roster: RosterEntry[] }) {
  const hi = language === "HI",
    router = useRouter(),
    [busyId, setBusyId] = useState<string | null>(null),
    [reasonFor, setReasonFor] = useState<string | null>(null),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(userId: string, nextEligible: boolean, reason: string) {
    if (!reason.trim()) {
      setMessage({ ok: false, text: hi ? "एक कारण आवश्यक है।" : "A reason is required." });
      return;
    }
    setBusyId(userId);
    setMessage(null);
    void post("set-company-direct-eligibility", { userId, eligible: nextEligible, reason })
      .then(() => {
        setMessage({ ok: true, text: hi ? "अपडेट किया गया।" : "Updated." });
        setReasonFor(null);
        router.refresh();
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update eligibility" }))
      .finally(() => setBusyId(null));
  }

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "कंपनी डायरेक्ट गवर्नेंस" : "COMPANY DIRECT GOVERNANCE"}</small>
        <h2>{hi ? "कंपनी डायरेक्ट पात्रता" : "Company Direct Eligibility"}</h2>
      </div>
      <p style={{ gridColumn: "1/-1" }}>
        {hi
          ? "डिफ़ॉल्ट आपूर्ति: सुपर स्टॉकिस्ट → वितरक। कंपनी डायरेक्ट केवल स्पष्ट रूप से स्वीकृत मैनेजर/एग्जीक्यूटिव के लिए है।"
          : "Default supply: Super Stockist → Distributor. Company Direct is only available to explicitly approved Managers/Executives below."}
      </p>
      {!roster.length && <EmptyOptionHint language={language} fallback={hi ? "कोई सक्रिय सेल्स मैनेजर/एग्जीक्यूटिव नहीं मिला।" : "No active Sales Manager/Executive found."} />}
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <ul className={styles.list}>
          {roster.map((r) => (
            <li key={r.userId}>
              <p>
                <strong>{r.name}</strong> · {r.roleName}
                {" — "}
                <span data-ok={r.companyDirectEligible}>
                  {hi ? "कंपनी डायरेक्ट पात्र" : "Company Direct Eligible"}: {r.companyDirectEligible ? (hi ? "हाँ" : "YES") : (hi ? "नहीं" : "NO")}
                </span>
              </p>
              {reasonFor === r.userId ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    toggle(r.userId, !r.companyDirectEligible, String(f.get("reason") || ""));
                  }}
                >
                  <input name="reason" required minLength={3} placeholder={hi ? "कारण" : "Reason"} />
                  <button disabled={busyId === r.userId} className={styles.secondaryBig}>
                    {hi ? "पुष्टि करें" : "CONFIRM"}
                  </button>
                  <button type="button" className={styles.secondaryBig} disabled={busyId === r.userId} onClick={() => setReasonFor(null)}>
                    {hi ? "रद्द करें" : "Cancel"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryBig}
                  disabled={busyId === r.userId}
                  onClick={() => setReasonFor(r.userId)}
                >
                  {r.companyDirectEligible ? (hi ? "अक्षम करें" : "DISABLE") : (hi ? "सक्षम करें" : "ENABLE")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {message && (
        <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError} style={{ gridColumn: "1/-1" }}>
          {message.text}
        </p>
      )}
    </section>
  );
}
