"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

const STAGES: [string, string, string][] = [
  ["NEW", "New", "नया"],
  ["CONTACTED", "Contacted", "संपर्क किया"],
  ["INTERESTED", "Interested", "रुचि रखता है"],
  ["FOLLOW_UP", "Follow-up", "फॉलो-अप"],
  ["EVALUATION", "Evaluation", "मूल्यांकन"],
  ["APPROVAL", "Approval", "स्वीकृति"],
  ["ACTIVATED", "Activated", "सक्रिय"],
  ["NOT_INTERESTED", "Not interested", "रुचि नहीं"],
];

async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

type Prospect = {
  id: string;
  businessName: string;
  normalizedMobile: string;
  prospectType: string;
  stage: string;
  followUpAt: string | null;
  notes: string | null;
};

export function ProspectPipelineActions({ language, prospects }: { language: "EN" | "HI"; prospects: Prospect[] }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const run = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await send(body);
      setMessage(hi ? "अद्यतन किया गया।" : "Updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वितरक पाइपलाइन" : "DISTRIBUTOR PIPELINE"}</small>
        <h2>{hi ? "मेरी संभावनाएँ" : "My prospects"}</h2>
      </div>
      {!prospects.length && <EmptyOptionHint language={language} fallback={hi ? "ऊपर के फॉर्म से नई संभावना जोड़ें।" : "Add a new prospect using the form above."} />}
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <ul className={styles.list}>
          {prospects.map((p) => (
            <li key={p.id} id={`prospect-${p.id}`}>
              <p>
                <strong>{p.businessName}</strong> · {p.prospectType} · {p.normalizedMobile}
              </p>
              <p>
                <span className={styles.badge}>{p.stage}</span>
                {p.followUpAt ? ` · ${hi ? "फॉलो-अप" : "Follow-up"}: ${new Date(p.followUpAt).toLocaleDateString(hi ? "hi-IN" : "en-IN")}` : ""}
              </p>
              {p.notes && <p>{p.notes}</p>}
              <form
                className={styles.inlineActions}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run({
                    action: "update-prospect",
                    payload: {
                      prospectId: p.id,
                      stage: String(form.get("stage")),
                      notes: String(form.get("notes") || "") || undefined,
                      followUpAt: String(form.get("followUpAt") || "") || undefined,
                    },
                  });
                }}
              >
                <select name="stage" defaultValue={p.stage}>
                  {STAGES.map(([v, en, hiLabel]) => <option key={v} value={v}>{hi ? hiLabel : en}</option>)}
                </select>
                <input name="followUpAt" type="date" />
                <input name="notes" placeholder={hi ? "टिप्पणी अपडेट करें" : "Update note"} />
                <button disabled={busy}>{hi ? "अपडेट करें" : "Update"}</button>
              </form>
              <div className={styles.inlineActions}>
                <button type="button" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  {expanded === p.id ? (hi ? "इतिहास छुपाएं" : "Hide history") : hi ? "इतिहास देखें" : "View history"}
                </button>
              </div>
              {expanded === p.id && <ProspectTimeline prospectId={p.id} language={language} />}
            </li>
          ))}
        </ul>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function ProspectTimeline({ prospectId, language }: { prospectId: string; language: "EN" | "HI" }) {
  const hi = language === "HI";
  const [events, setEvents] = useState<{ id: string; action: string; occurredAt: string }[] | null>(null);
  if (events === null) {
    void fetch(`/api/manager/operations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prospect-timeline", payload: { prospectId } }) })
      .then((r) => r.json())
      .then((data) => setEvents(data?.events ?? []))
      .catch(() => setEvents([]));
    return <p className={styles.emptyHint}>{hi ? "लोड हो रहा है…" : "Loading…"}</p>;
  }
  if (!events.length) return <p className={styles.emptyHint}>{hi ? "कोई इतिहास दर्ज नहीं।" : "No history recorded."}</p>;
  return (
    <ul className={styles.list}>
      {events.map((e) => (
        <li key={e.id}>{new Date(e.occurredAt).toLocaleString(hi ? "hi-IN" : "en-IN")} · {e.action}</li>
      ))}
    </ul>
  );
}
