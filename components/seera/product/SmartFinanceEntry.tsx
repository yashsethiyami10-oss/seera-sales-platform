"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./WorkflowActions.module.css";

// SEERA SMART FINANCE — fast-entry front door for the Money Desk. The Founder types OR speaks a
// normal sentence ("2000 diesel ke diye Fatehnagar distributor dispatch ke liye"); the server's
// deterministic parser + governed resolver turns it into a structured draft; this component shows
// an EDITABLE review card; on confirm it posts through the SAME endpoints the guided Money Desk
// uses (`money-desk-create` / `guided-receipt`) — same RBAC, approval, maker-checker, idempotency
// and audit. No second accounting path. Voice just fills the same text box.

const money = (v: number | string | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

type TreasuryOpt = { id: string; name: string; kind: string; coaCode: string };
type PartyCandidate = { id: string; name: string; type: string; territoryId?: string | null };
type Draft = {
  originalText: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  understood: boolean;
  postAction: "money-desk-create" | "guided-receipt" | null;
  direction: "MONEY_IN" | "MONEY_OUT" | null;
  purposeCode: string | null;
  purposeLabel: string | null;
  purposeHindiLabel: string | null;
  amount: number | null;
  date: string;
  paymentMode: "CASH" | "BANK" | "UPI";
  treasury: TreasuryOpt | null;
  treasuryAssumed: boolean;
  treasuryOptions: TreasuryOpt[];
  party: PartyCandidate | null;
  partyType: string | null;
  partyText: string | null;
  partyCandidates: PartyCandidate[];
  partyNotFound: boolean;
  employee: { id: string; name: string } | null;
  territory: { id: string; name: string } | null;
  territorySource: "distributor" | "employee-auto" | null;
  costCentre: string | null;
  purposeNote: string | null;
  missingRequired: string[];
  notes: string[];
  parsed: Record<string, unknown>;
};
type PurposeDef = { code: string; label: string; hindiLabel: string };

const uuid = () => crypto.randomUUID();

export function SmartFinanceEntry({
  language,
  territories,
  purposes,
}: {
  language: "EN" | "HI";
  territories: { id: string; name: string }[];
  purposes: PurposeDef[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [text, setText] = useState("");
  const [stage, setStage] = useState<"input" | "review" | "done">("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [okText, setOkText] = useState<string | null>(null);

  // Editable review fields.
  const [amount, setAmount] = useState("");
  const [purposeCode, setPurposeCode] = useState("");
  const [direction, setDirection] = useState<"MONEY_IN" | "MONEY_OUT">("MONEY_OUT");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "BANK" | "UPI">("BANK");
  const [treasuryId, setTreasuryId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [date, setDate] = useState("");

  // One idempotency key per interpretation — reused across retries so a double-tap or a retry
  // after a network error can never create two financial entries (spec §17).
  const idemRef = useRef<string>(uuid());

  // ── Voice ───────────────────────────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "unsupported">("idle");
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setVoiceState("unsupported"); return; }
    try {
      const rec = new Ctor() as {
        lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
        start: () => void; stop: () => void;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null; onend: (() => void) | null;
      };
      rec.lang = hi ? "hi-IN" : "en-IN";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let t = "";
        for (let i = 0; i < e.results.length; i++) t += e.results[i]![0]!.transcript;
        setText(t);
      };
      rec.onerror = () => { setVoiceState("idle"); setError(hi ? "आवाज़ इनपुट विफल — कृपया टाइप करें।" : "Voice input failed. Type instead."); };
      rec.onend = () => setVoiceState((s) => (s === "listening" ? "idle" : s));
      recognitionRef.current = rec;
    } catch {
      setVoiceState("unsupported");
    }
  }, [hi]);

  function toggleVoice() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (voiceState === "listening") { rec.stop(); setVoiceState("idle"); return; }
    setError(null);
    try { rec.start(); setVoiceState("listening"); } catch { setVoiceState("idle"); }
  }

  // ── Interpret ───────────────────────────────────────────────────────────────────────────────
  function interpret() {
    if (text.trim().length < 2) return;
    setBusy(true);
    setError(null);
    idemRef.current = uuid();
    void post("money-desk-smart-interpret", { text: text.trim() })
      .then((d: Draft) => {
        setDraft(d);
        setAmount(d.amount != null ? String(d.amount) : "");
        setPurposeCode(d.purposeCode ?? "");
        setDirection(d.direction ?? "MONEY_OUT");
        setPaymentMode(d.paymentMode);
        setTreasuryId(d.treasury?.id ?? "");
        setPartyId(d.party?.id ?? (d.partyCandidates[0]?.id ?? ""));
        setPartyName(d.party?.name ?? d.partyText ?? "");
        setEmployeeId(d.employee?.id ?? "");
        setEmployeeName(d.employee?.name ?? "");
        setTerritoryId(d.territory?.id ?? "");
        setDate(d.date);
        setStage("review");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not interpret"))
      .finally(() => setBusy(false));
  }

  // ── Derived review state ────────────────────────────────────────────────────────────────────
  const selectedPurpose = purposes.find((p) => p.code === purposeCode);
  const isGuidedReceipt = draft?.postAction === "guided-receipt" && (draft.party?.type === "DISTRIBUTOR" || draft.party?.type === "SUPER_STOCKIST");
  const needsEmployee = purposeCode === "SAL-EMP";
  const needsPartyName = purposeCode === "REC-INS" || purposeCode === "EXP-REIMBURSEMENT";
  const needsTreasury = !isGuidedReceipt && purposeCode !== "ADJ-GOV";
  const partyChoices = draft?.partyCandidates ?? [];

  const outstanding = useMemo(() => {
    const m: string[] = [];
    if (!(Number(amount) > 0)) m.push(hi ? "राशि" : "Amount");
    if (!purposeCode) m.push(hi ? "श्रेणी" : "Category");
    if (needsTreasury && !treasuryId) m.push(hi ? "ट्रेजरी खाता" : "Treasury account");
    if (needsEmployee && !employeeId) m.push(hi ? "कर्मचारी" : "Employee");
    if (needsPartyName && !partyName.trim() && !employeeName.trim()) m.push(hi ? "पार्टी" : "Party");
    if (partyChoices.length > 1 && !partyId) m.push(hi ? "पार्टी चुनें" : "Select party");
    return m;
  }, [amount, purposeCode, needsTreasury, treasuryId, needsEmployee, employeeId, needsPartyName, partyName, employeeName, partyChoices.length, partyId, hi]);

  function confirmPost() {
    if (!draft || outstanding.length > 0) return;
    setBusy(true);
    setError(null);
    const dateIso = new Date(`${date || draft.date}T00:00:00`).toISOString();
    const smartMeta = { originalText: draft.originalText, confidence: draft.confidence, parsed: draft.parsed };

    let run: Promise<{ status?: string }>;
    if (isGuidedReceipt && draft.party) {
      run = post("guided-receipt", {
        payerType: draft.party.type,
        payerId: partyId || draft.party.id,
        payeeType: "COMPANY",
        payeeId: "COMPANY",
        amount: Number(amount),
        reference: `Smart Finance — ${draft.originalText}`.slice(0, 180),
        paymentMode: paymentMode === "UPI" ? "UPI" : paymentMode,
        paymentDate: dateIso,
        reason: `Smart Finance entry: ${draft.originalText}`.slice(0, 240),
        idempotencyKey: idemRef.current,
      });
    } else {
      const md = direction === "MONEY_OUT" ? (paymentMode === "CASH" ? "CASH_OUT" : "BANK_OUT") : paymentMode === "CASH" ? "CASH_IN" : "BANK_IN";
      const coaCode = draft.treasuryOptions.find((t) => t.id === treasuryId)?.coaCode;
      run = post("money-desk-create", {
        purposeCode,
        direction: md,
        amount: Number(amount),
        date: dateIso,
        treasuryAccountId: treasuryId || undefined,
        counterpartyType: needsEmployee ? "EMPLOYEE" : needsPartyName ? "CUSTOMER" : undefined,
        counterpartyName: (partyName || employeeName || undefined)?.slice(0, 160),
        description: draft.originalText.slice(0, 240),
        formData: {
          paymentMode,
          ...(employeeId ? { employeeId } : {}),
          ...(territoryId ? { territoryId } : {}),
          ...(coaCode ? { treasuryAccountCoaCode: coaCode } : {}),
          __smartFinance: smartMeta,
        },
        idempotencyKey: idemRef.current,
      });
    }

    run
      .then((r) => {
        setOkText(
          hi
            ? `पोस्ट किया गया${r?.status ? ` — स्थिति: ${r.status}` : ""}. ${r?.status === "PENDING_APPROVAL" ? "स्वतंत्र अनुमोदन प्रतीक्षित।" : ""}`
            : `Posted${r?.status ? ` — status: ${r.status}` : ""}. ${r?.status === "PENDING_APPROVAL" ? "Awaiting independent approval." : ""}`,
        );
        setStage("done");
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not post"))
      .finally(() => setBusy(false));
  }

  function reset() {
    setStage("input");
    setText("");
    setDraft(null);
    setOkText(null);
    setError(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  const confBadge = (c: "HIGH" | "MEDIUM" | "LOW") => {
    const map = { HIGH: { en: "High confidence", hi: "उच्च विश्वास", bg: "#dcfce7", fg: "#166534" }, MEDIUM: { en: "Please check", hi: "कृपया जाँचें", bg: "#fef9c3", fg: "#854d0e" }, LOW: { en: "Needs your input", hi: "आपकी जानकारी चाहिए", bg: "#fee2e2", fg: "#991b1b" } }[c];
    return <span style={{ background: map.bg, color: map.fg, borderRadius: 999, padding: "2px 10px", fontSize: "0.75rem", fontWeight: 800 }}>{hi ? map.hi : map.en}</span>;
  };

  return (
    <div className={styles.tableWrap} style={{ gridColumn: "1/-1", border: "1px solid #c7d2fe", borderRadius: 14, padding: "1rem", background: "#f5f7ff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1rem" }}>⚡ {hi ? "स्मार्ट फाइनेंस" : "SMART FINANCE"}</strong>
        <small style={{ opacity: 0.75 }}>{hi ? "जो हुआ वो लिखें या बोलें — बाकी सिस्टम समझ लेगा" : "Type or speak what happened — the system structures it"}</small>
      </div>

      {stage === "input" && (
        <div className={styles.list} style={{ marginTop: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch", flexWrap: "wrap" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              style={{ flex: "1 1 260px", minHeight: 46, fontSize: "1rem", padding: "0.5rem" }}
              placeholder={hi ? "₹2,000 diesel ke diye Fatehnagar distributor dispatch ke liye" : "₹2,000 diesel ke diye Fatehnagar distributor dispatch ke liye"}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) interpret(); }}
            />
            {voiceState !== "unsupported" && (
              <button
                type="button"
                className={styles.secondaryBig}
                onClick={toggleVoice}
                aria-pressed={voiceState === "listening"}
                style={{ flex: "0 0 auto", minWidth: 120, background: voiceState === "listening" ? "#fee2e2" : undefined }}
              >
                {voiceState === "listening" ? (hi ? "● सुन रहा है… रोकें" : "● Listening… stop") : (hi ? "🎙 बोलें" : "🎙 Speak")}
              </button>
            )}
          </div>
          {voiceState === "unsupported" && <small style={{ opacity: 0.7 }}>{hi ? "इस डिवाइस पर आवाज़ इनपुट उपलब्ध नहीं — कृपया टाइप करें।" : "Voice input unavailable on this device. Type instead."}</small>}
          {error && <p role="status" data-ok="false">{error}</p>}
          <div>
            <button type="button" className={styles.primaryBig} disabled={busy || text.trim().length < 2} onClick={interpret}>
              {busy ? (hi ? "समझ रहा है…" : "Understanding…") : (hi ? "समझें →" : "Understand →")}
            </button>
          </div>
        </div>
      )}

      {stage === "review" && draft && (
        <div className={styles.list} style={{ marginTop: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {confBadge(draft.confidence)}
            <small style={{ opacity: 0.7 }}>“{draft.originalText}”</small>
          </div>

          {!draft.understood && (
            <p role="status" data-ok="false">
              {hi ? "पूरी तरह समझ नहीं आया — नीचे विवरण भरें या दोबारा लिखें।" : "Not fully understood — fill the details below or rephrase."}
            </p>
          )}

          <table>
            <tbody>
              <tr>
                <td>{hi ? "प्रकार" : "Type"}</td>
                <td>
                  <select value={direction} onChange={(e) => setDirection(e.target.value as "MONEY_IN" | "MONEY_OUT")}>
                    <option value="MONEY_OUT">{hi ? "पैसा भुगतान (Money Out)" : "Money Out"}</option>
                    <option value="MONEY_IN">{hi ? "पैसा प्राप्त (Money In)" : "Money In"}</option>
                  </select>
                </td>
              </tr>
              <tr>
                <td>{hi ? "राशि" : "Amount"}{!(Number(amount) > 0) && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                <td><input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 140 }} /></td>
              </tr>
              <tr>
                <td>{hi ? "श्रेणी" : "Category"}{!purposeCode && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                <td>
                  <select value={purposeCode} onChange={(e) => setPurposeCode(e.target.value)}>
                    <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                    {purposes.map((p) => <option key={p.code} value={p.code}>{hi ? p.hindiLabel : p.label}</option>)}
                  </select>
                </td>
              </tr>
              {(needsPartyName || draft.partyText || draft.party) && !needsEmployee && (
                <tr>
                  <td>{hi ? "पार्टी" : "Party"}{needsPartyName && !partyName.trim() && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                  <td>
                    {partyChoices.length > 1 ? (
                      <select value={partyId} onChange={(e) => { setPartyId(e.target.value); setPartyName(partyChoices.find((c) => c.id === e.target.value)?.name ?? ""); }}>
                        <option value="">{hi ? "एकाधिक मिले — चुनें" : "Multiple matches — choose"}</option>
                        {partyChoices.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                      </select>
                    ) : (
                      <input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={hi ? "नाम" : "Name"} />
                    )}
                    {draft.partyNotFound && <small style={{ display: "block", color: "#854d0e" }}>{hi ? "मास्टर में नहीं मिला — नाम से जारी रख सकते हैं या सही करें।" : "Not found in master — you can continue by name or correct it."}</small>}
                  </td>
                </tr>
              )}
              {needsEmployee && (
                <tr>
                  <td>{hi ? "कर्मचारी" : "Employee"}{!employeeId && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                  <td>
                    {partyChoices.length > 0 ? (
                      <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setEmployeeName(partyChoices.find((c) => c.id === e.target.value)?.name ?? ""); }}>
                        <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                        {partyChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <EmployeePicker hi={hi} initial={employeeName} onPick={(id, name) => { setEmployeeId(id); setEmployeeName(name); }} />
                    )}
                  </td>
                </tr>
              )}
              {draft.purposeNote && (
                <tr><td>{hi ? "प्रयोजन" : "Purpose"}</td><td>{draft.purposeNote}</td></tr>
              )}
              {needsTreasury && (
                <tr>
                  <td>{hi ? "ट्रेजरी" : "Treasury"}{!treasuryId && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                  <td>
                    <select value={treasuryId} onChange={(e) => { setTreasuryId(e.target.value); const k = draft.treasuryOptions.find((t) => t.id === e.target.value)?.kind; if (k === "CASH") setPaymentMode("CASH"); else if (paymentMode === "CASH") setPaymentMode("BANK"); }}>
                      <option value="">{hi ? "खाता चुनें" : "Choose account"}</option>
                      {draft.treasuryOptions.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}
                    </select>
                    {draft.treasuryAssumed && treasuryId && <small style={{ display: "block", color: "#854d0e" }}>{hi ? "मान लिया गया — पुष्टि करें" : "Assumed — please confirm"}</small>}
                  </td>
                </tr>
              )}
              {(isGuidedReceipt || !needsTreasury) && (
                <tr>
                  <td>{hi ? "भुगतान माध्यम" : "Payment mode"}</td>
                  <td>
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as "CASH" | "BANK" | "UPI")}>
                      <option value="BANK">{hi ? "बैंक" : "Bank"}</option>
                      <option value="CASH">{hi ? "नकद" : "Cash"}</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </td>
                </tr>
              )}
              <tr>
                <td>{hi ? "क्षेत्र / कॉस्ट सेंटर" : "Territory / Cost Centre"}</td>
                <td>
                  <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
                    <option value="">{draft.territorySource === "employee-auto" ? (hi ? "कर्मचारी से स्वतः" : "Auto from employee") : draft.costCentre ? `${hi ? "कॉस्ट सेंटर" : "Cost Centre"}: ${draft.costCentre}` : (hi ? "स्वतः-व्युत्पन्न" : "Auto-derive")}</option>
                    {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {draft.territory && draft.territorySource === "distributor" && !territoryId && <small style={{ display: "block", opacity: 0.75 }}>{hi ? "वितरक भूगोल से" : "From distributor geography"}: {draft.territory.name}</small>}
                </td>
              </tr>
              <tr>
                <td>{hi ? "तिथि" : "Date"}</td>
                <td><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></td>
              </tr>
              <tr><td>{hi ? "स्रोत" : "Source"}</td><td>{hi ? "स्मार्ट फाइनेंस प्रविष्टि" : "Smart Finance Entry"}</td></tr>
            </tbody>
          </table>

          {draft.notes.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {draft.notes.map((n, i) => <li key={i}><small style={{ opacity: 0.8 }}>{n}</small></li>)}
            </ul>
          )}

          {outstanding.length > 0 && (
            <p role="status" data-ok="false">{hi ? "पहले भरें" : "Still needed"}: {outstanding.join(", ")}</p>
          )}
          {error && <p role="status" data-ok="false">{error}</p>}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={reset}>{hi ? "रद्द करें" : "Cancel"}</button>
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setStage("input")}>{hi ? "✎ वाक्य बदलें" : "✎ Edit sentence"}</button>
            <button type="button" className={styles.primaryBig} disabled={busy || outstanding.length > 0} onClick={confirmPost}>
              {busy ? (hi ? "पोस्ट हो रहा है…" : "Posting…") : `${hi ? "पुष्टि करें और पोस्ट करें" : "Confirm & Post"} ${Number(amount) > 0 ? money(amount) : ""}`}
            </button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className={styles.list} style={{ marginTop: "0.6rem" }}>
          <p role="status" data-ok="true">{okText}</p>
          <button type="button" className={styles.primaryBig} onClick={reset}>{hi ? "एक और प्रविष्टि" : "Another entry"}</button>
        </div>
      )}
    </div>
  );
}

// Minimal debounced employee search — hits the existing ledger-parties employee list via the same
// company-reports endpoint the guided screens already use.
function EmployeePicker({ hi, initial, onPick }: { hi: boolean; initial: string; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => {
      fetch(`/api/finance/company-reports?report=ledger-parties&partyType=EMPLOYEE`)
        .then((r) => r.json())
        .then((rows: { id: string; name: string }[]) => setResults((Array.isArray(rows) ? rows : []).filter((r) => r.name?.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} placeholder={hi ? "नाम टाइप करें" : "Type a name"} />
      {open && results.length > 0 && (
        <span style={{ position: "absolute", top: "100%", left: 0, zIndex: 5, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, minWidth: 200, display: "block" }}>
          {results.map((r) => (
            <button key={r.id} type="button" style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: 0, background: "transparent", cursor: "pointer" }} onClick={() => { onPick(r.id, r.name); setQ(r.name); setOpen(false); }}>
              {r.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
