"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./MarketSurvey.module.css";

type Option = readonly [string, string, string];
type Lang = "EN" | "HI";

const t = {
  EN: {
    followUp: "Follow-up", status: "Status", assignee: "Assign to", none: "Unassigned", due: "Due date", trial: "Trial agreed?", unknown: "Not recorded", yes: "Yes", no: "No",
    outcome: "Follow-up outcome", note: "Internal note", save: "Save follow-up", saved: "Saved",
    whatsapp: "WhatsApp", retry: "Retry / re-check WhatsApp", optOut: "Record opt-out", basis: "How did the retailer opt out? (required)",
    retailer: "Link existing retailer (code)", link: "Link retailer",
    catalogue: "Catalogue link & QR", create: "Create link (show QR)", createSend: "Create link and send on WhatsApp", revoke: "Revoke",
    linkOnce: "Copy or scan now — this link is shown only once.", failed: "Action failed",
  },
  HI: {
    followUp: "फ़ॉलो-अप", status: "स्थिति", assignee: "किसे सौंपें", none: "किसी को नहीं", due: "तारीख", trial: "ट्रायल के लिए सहमत?", unknown: "दर्ज नहीं", yes: "हाँ", no: "नहीं",
    outcome: "फ़ॉलो-अप परिणाम", note: "आंतरिक नोट", save: "फ़ॉलो-अप सेव करें", saved: "सेव हुआ",
    whatsapp: "WhatsApp", retry: "WhatsApp फिर से जाँचें / भेजें", optOut: "मना करना दर्ज करें", basis: "रिटेलर ने कैसे मना किया? (ज़रूरी)",
    retailer: "मौजूदा रिटेलर जोड़ें (कोड)", link: "रिटेलर जोड़ें",
    catalogue: "कैटलॉग लिंक और QR", create: "लिंक बनाएँ (QR दिखाएँ)", createSend: "लिंक बनाकर WhatsApp पर भेजें", revoke: "रद्द करें",
    linkOnce: "अभी कॉपी या स्कैन करें — यह लिंक केवल एक बार दिखेगा।", failed: "कार्य विफल",
  },
} as const;

export function MarketSurveyActions({
  surveyId, language, statuses, staff, current, activeLinks, canSendCatalogue,
}: {
  surveyId: string;
  language: Lang;
  statuses: readonly Option[];
  staff: { id: string; label: string }[];
  current: { status: string; assigneeId: string | null; dueAt: string | null; trialAgreed: boolean | null };
  activeLinks: { id: string; label: string }[];
  canSendCatalogue: boolean;
}) {
  const L = t[language];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState<{ url: string; qrSvg: string; whatsappState: string | null } | null>(null);

  async function act(action: string, data?: unknown) {
    if (busy) return null;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/market-survey/${encodeURIComponent(surveyId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body?.error?.userMessage ?? body?.error?.message ?? L.failed);
        return null;
      }
      setMessage(body?.state ? `${L.whatsapp}: ${body.state}` : L.saved);
      router.refresh();
      return body;
    } catch {
      setMessage(L.failed);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.detail}>
      {message && <p className={styles.banner} role="status">{message}</p>}
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const trial = String(f.get("trialAgreed"));
          void act("update-follow-up", {
            status: String(f.get("status")),
            assigneeId: String(f.get("assigneeId")) || null,
            dueAt: f.get("dueAt") ? new Date(String(f.get("dueAt"))).toISOString() : null,
            trialAgreed: trial === "" ? null : trial === "true",
            outcome: String(f.get("outcome") ?? "").trim() || undefined,
            note: String(f.get("note") ?? "").trim() || undefined,
          });
        }}
      >
        <fieldset>
          <legend>{L.followUp}</legend>
          <label>{L.status}<select name="status" defaultValue={current.status}>{statuses.map((s) => <option key={s[0]} value={s[0]}>{language === "HI" ? s[2] : s[1]}</option>)}</select></label>
          <label>{L.assignee}<select name="assigneeId" defaultValue={current.assigneeId ?? ""}><option value="">{L.none}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>{L.due}<input type="date" name="dueAt" defaultValue={current.dueAt ?? ""} /></label>
          <label>{L.trial}<select name="trialAgreed" defaultValue={current.trialAgreed === null ? "" : String(current.trialAgreed)}><option value="">{L.unknown}</option><option value="true">{L.yes}</option><option value="false">{L.no}</option></select></label>
          <label>{L.outcome}<textarea name="outcome" rows={2} maxLength={1000} /></label>
          <label>{L.note}<textarea name="note" rows={2} maxLength={2000} /></label>
          <button className={styles.primary} disabled={busy}>{L.save}</button>
        </fieldset>
      </form>

      <fieldset className={styles.form}>
        <legend>{L.whatsapp}</legend>
        <div className={styles.row}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => void act("retry-whatsapp")}>{L.retry}</button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              const basis = window.prompt(L.basis)?.trim();
              if (basis) void act("opt-out", { basis });
            }}
          >
            {L.optOut}
          </button>
        </div>
      </fieldset>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get("retailerCode") ?? "").trim();
          if (code) void act("link-retailer", { retailerCode: code });
        }}
      >
        <fieldset>
          <legend>{L.retailer}</legend>
          <div className={styles.row}>
            <input name="retailerCode" maxLength={40} />
            <button className={styles.secondary} disabled={busy}>{L.link}</button>
          </div>
        </fieldset>
      </form>

      <fieldset className={styles.form}>
        <legend>{L.catalogue}</legend>
        <div className={styles.row}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={async () => setLink(await act("create-link", { send: false }))}>{L.create}</button>
          {canSendCatalogue && <button type="button" className={styles.secondary} disabled={busy} onClick={async () => setLink(await act("create-link", { send: true }))}>{L.createSend}</button>}
        </div>
        {link && (
          <div className={styles.detail}>
            <small>{L.linkOnce}</small>
            <code style={{ overflowWrap: "anywhere" }}>{link.url}</code>
            {/* SVG is generated server-side by the qrcode library from our own HTTPS URL only. */}
            <span className={styles.qr} dangerouslySetInnerHTML={{ __html: link.qrSvg }} />
            {link.whatsappState && <span className={styles.pill}>{L.whatsapp}: {link.whatsappState}</span>}
          </div>
        )}
        {activeLinks.map((l) => (
          <div key={l.id} className={styles.row}>
            <small>{l.label}</small>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void act("revoke-link", { linkId: l.id })}>{L.revoke}</button>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
