"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type Beat = { id: string; name: string; code: string; status: string };
type Territory = { id: string; name: string; code: string; status: string; headquarters: string; state: string; beats: Beat[] };
type Option = { value: string; label: string };
type Assignment = { id: string; userId: string; userName: string; territoryId: string; territoryName: string; effectiveFrom: string; reason: string };

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

// Bhilwara/Manoj onboarding gap fix: the ONLY prior write path for Territory/Beat master data
// (SeeraGeographyNode) was createBeatPlan, buried inside a full Sales Manager journey-plan flow
// (requires an assigned field employee, day-of-week, place). This is the direct, minimal
// Founder/Admin path the audit found missing — create a bare Territory, optionally a Beat under
// it, and assign a Sales Manager/Executive to it. Deliberately does not touch role assignments or
// Company Direct eligibility — purely additive record-keeping on top of both.
export function TerritoryBeatManagementPanel({
  language,
  territories,
  fieldUsers,
  assignments,
}: {
  language: "EN" | "HI";
  territories: Territory[];
  fieldUsers: Option[];
  assignments: Assignment[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [showAddTerritory, setShowAddTerritory] = useState(false),
    [addBeatFor, setAddBeatFor] = useState<string | null>(null),
    [showAssign, setShowAssign] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(action: string, payload: unknown, onOk: () => void) {
    setBusy(true);
    setMessage(null);
    void post(action, payload)
      .then(() => {
        onOk();
        router.refresh();
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save" }))
      .finally(() => setBusy(false));
  }

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "क्षेत्र और बीट" : "TERRITORIES & BEATS"}</small>
        <h2>{hi ? "क्षेत्र प्रबंधन" : "Territory Management"}</h2>
      </div>

      <div style={{ gridColumn: "1/-1", display: "flex", gap: "0.75rem" }}>
        <button type="button" className={styles.primaryBig} onClick={() => setShowAddTerritory((v) => !v)}>
          {hi ? "+ क्षेत्र जोड़ें" : "+ ADD TERRITORY"}
        </button>
        <button type="button" className={styles.secondaryBig} onClick={() => setShowAssign((v) => !v)}>
          {hi ? "कार्यकारी को क्षेत्र सौंपें" : "ASSIGN EXECUTIVE TO TERRITORY"}
        </button>
      </div>

      {showAddTerritory && (
        <form
          style={{ gridColumn: "1/-1" }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              "create-territory",
              { name: String(f.get("name") || ""), headquarters: String(f.get("headquarters") || "") || undefined, state: String(f.get("state") || "") || undefined, description: String(f.get("description") || "") || undefined, code: String(f.get("code") || "") || undefined, status: String(f.get("status") || "ACTIVE") },
              () => { setMessage({ ok: true, text: hi ? "क्षेत्र सहेजा गया।" : "Territory saved." }); setShowAddTerritory(false); },
            );
          }}
        >
          <label>{hi ? "क्षेत्र का नाम" : "Territory name"} *<input name="name" required /></label>
          <label>{hi ? "मुख्यालय / शहर" : "Headquarters / City"}<input name="headquarters" /></label>
          <label>{hi ? "राज्य" : "State"}<input name="state" /></label>
          <label>
            {hi ? "स्थिति" : "Status"}
            <select name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">ACTIVE</option>
              <option value="DRAFT">DRAFT</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
          <label>{hi ? "कोड (वैकल्पिक)" : "Code (optional)"}<input name="code" /></label>
          <label>{hi ? "विवरण (वैकल्पिक)" : "Description (optional)"}<input name="description" /></label>
          <button disabled={busy} className={styles.primaryBig}>{hi ? "सहेजें" : "SAVE"}</button>
          <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setShowAddTerritory(false)}>{hi ? "रद्द करें" : "Cancel"}</button>
        </form>
      )}

      {showAssign && (
        <form
          style={{ gridColumn: "1/-1" }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              "assign-executive-territory",
              { userId: String(f.get("userId")), territoryId: String(f.get("territoryId")), reason: String(f.get("reason")) },
              () => { setMessage({ ok: true, text: hi ? "असाइनमेंट सहेजा गया।" : "Assignment saved." }); setShowAssign(false); },
            );
          }}
        >
          <label>
            {hi ? "सेल्स मैनेजर/एग्जीक्यूटिव" : "Sales Manager/Executive"}
            <select name="userId" required>
              <option value="">{hi ? "चुनें" : "Choose"}</option>
              {fieldUsers.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </label>
          {!fieldUsers.length && <EmptyOptionHint language={language} fallback={hi ? "कोई सक्रिय सेल्स मैनेजर/एग्जीक्यूटिव नहीं मिला।" : "No active Sales Manager/Executive found."} />}
          <label>
            {hi ? "क्षेत्र" : "Territory"}
            <select name="territoryId" required>
              <option value="">{hi ? "चुनें" : "Choose"}</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {!territories.length && <EmptyOptionHint language={language} fallback={hi ? "पहले एक क्षेत्र जोड़ें।" : "Add a Territory first."} />}
          <label>{hi ? "कारण" : "Reason"}<input name="reason" required minLength={3} /></label>
          <button disabled={busy || !fieldUsers.length || !territories.length} className={styles.primaryBig}>{hi ? "सहेजें" : "SAVE"}</button>
          <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setShowAssign(false)}>{hi ? "रद्द करें" : "Cancel"}</button>
        </form>
      )}

      {message && <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError} style={{ gridColumn: "1/-1" }}>{message.text}</p>}

      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        {!territories.length && <EmptyOptionHint language={language} fallback={hi ? "अभी तक कोई क्षेत्र नहीं। ऊपर \"+ क्षेत्र जोड़ें\" से शुरू करें।" : 'No territories yet — start with "+ ADD TERRITORY" above.'} />}
        <ul className={styles.list}>
          {territories.map((t) => (
            <li key={t.id}>
              <p>
                <strong>{t.name}</strong> · {t.code} · {t.status}
                {(t.headquarters || t.state) && <> — {[t.headquarters, t.state].filter(Boolean).join(", ")}</>}
              </p>
              <p>
                <small>{hi ? "बीट" : "Beats"}: {t.beats.length ? t.beats.map((b) => b.name).join(", ") : hi ? "कोई नहीं" : "none"}</small>
              </p>
              {addBeatFor === t.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(
                      "create-beat",
                      { name: String(f.get("name") || ""), territoryId: t.id, description: String(f.get("description") || "") || undefined },
                      () => { setMessage({ ok: true, text: hi ? "बीट सहेजा गया।" : "Beat saved." }); setAddBeatFor(null); },
                    );
                  }}
                >
                  <input name="name" required placeholder={hi ? "बीट का नाम" : "Beat name"} />
                  <input name="description" placeholder={hi ? "विवरण (वैकल्पिक)" : "Description (optional)"} />
                  <button disabled={busy} className={styles.secondaryBig}>{hi ? "सहेजें" : "SAVE"}</button>
                  <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setAddBeatFor(null)}>{hi ? "रद्द करें" : "Cancel"}</button>
                </form>
              ) : (
                <button type="button" className={styles.secondaryBig} onClick={() => setAddBeatFor(t.id)}>{hi ? "+ बीट जोड़ें" : "+ ADD BEAT"}</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {assignments.length > 0 && (
        <div className={styles.list} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "वर्तमान क्षेत्र असाइनमेंट" : "Current territory assignments"}</strong>
          <ul className={styles.list}>
            {assignments.map((a) => (
              <li key={a.id}>
                <p><strong>{a.userName}</strong> → <strong>{a.territoryName}</strong></p>
                <p><small>{new Date(a.effectiveFrom).toLocaleDateString(hi ? "hi-IN" : "en-IN")} · {a.reason}</small></p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
