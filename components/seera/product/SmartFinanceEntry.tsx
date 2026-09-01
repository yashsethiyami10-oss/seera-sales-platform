"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

type TreasuryOpt = {
  id: string;
  name: string;
  displayName: string;
  kind: string;
  coaCode: string;
  balance: number;
  maskedAccountNumber: string | null;
  lastEntryAt: string | null;
  recentEntries: { date: string; description: string; amount: number; direction: "IN" | "OUT" }[];
  selectable: boolean;
};
type PartyCandidate = { id: string; name: string; type: string; territoryId?: string | null };
type PersonResolution = {
  subjectText: string;
  role: "EMPLOYEE" | "OTHER_PARTY" | "UNRESOLVED";
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
  employee?: { id: string; name: string };
  otherParty?: { id: string; name: string };
  candidates?: { id: string; name: string; role: "EMPLOYEE" | "OTHER_PARTY" }[];
  proposal?: { suggestedName: string; suggestedType: string; note: string; fields: { key: string; label: string; required: boolean; value: string; options?: string[] }[] };
  priorActivity?: { count: number; netPaid: number; lastDate: string | null };
  explanation: string;
};
type Draft = {
  originalText: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  understood: boolean;
  postAction: "money-desk-create" | "guided-receipt" | "settle-advance" | null;
  settlePayload: Record<string, unknown> | null;
  skuLine: {
    status: "MATCHED" | "AMBIGUOUS" | "UNKNOWN";
    sku: { id: string; code: string; productName: string; unitType: string; mrp: number; taxRatePct: number | null } | null;
    candidates: { id: string; code: string; productName: string; mrp: number }[];
    quantity: number | null;
    unitOfMeasure: string | null;
    rate: number | null;
    taxRatePct: number | null;
    lineTotal: number | null;
    explanation: string;
    missing: string[];
  } | null;
  direction: "MONEY_IN" | "MONEY_OUT" | null;
  purposeCode: string | null;
  purposeLabel: string | null;
  purposeHindiLabel: string | null;
  intentLabel: string | null;
  categoryAccount: { code: string; name: string; type: string } | null;
  amount: number | null;
  date: string;
  paymentMode: "CASH" | "BANK" | "UPI";
  treasury: TreasuryOpt | null;
  treasuryAssumed: boolean;
  treasuryOptions: TreasuryOpt[];
  treasuryEmptyState: { title: string; message: string; actionLabel: string; actionSlug: string } | null;
  party: PartyCandidate | null;
  partyType: string | null;
  partyText: string | null;
  partyCandidates: PartyCandidate[];
  partyNotFound: boolean;
  employee: { id: string; name: string } | null;
  personResolution: PersonResolution | null;
  territory: { id: string; name: string } | null;
  territorySource: "distributor" | "employee-auto" | null;
  costCentre: string | null;
  explanations: Partial<Record<"amount" | "category" | "direction" | "treasury" | "party" | "person" | "territory" | "product", string>>;
  purposeNote: string | null;
  missingRequired: string[];
  notes: string[];
  parsed: Record<string, unknown>;
};
type PurposeDef = { code: string; label: string; hindiLabel: string };

const uuid = () => crypto.randomUUID();

export function SmartFinanceEntry({
  language,
  portal,
  territories,
  purposes,
}: {
  language: "EN" | "HI";
  portal: string;
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
  const [otherPartyId, setOtherPartyId] = useState("");
  const [otherPartyName, setOtherPartyName] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [date, setDate] = useState("");
  // "Add as Other Person" inline form.
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [np, setNp] = useState<{ name: string; mobile: string; partyType: string; purpose: string }>({ name: "", mobile: "", partyType: "Other Person", purpose: "" });

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
        setEmployeeId(d.employee?.id ?? d.personResolution?.employee?.id ?? "");
        setEmployeeName(d.employee?.name ?? d.personResolution?.employee?.name ?? "");
        setOtherPartyId(d.personResolution?.role === "OTHER_PARTY" && d.personResolution.status === "MATCHED" ? d.personResolution.otherParty?.id ?? "" : "");
        setOtherPartyName(d.personResolution?.role === "OTHER_PARTY" && d.personResolution.status === "MATCHED" ? d.personResolution.otherParty?.name ?? "" : "");
        setAddPersonOpen(false);
        setNp({ name: d.personResolution?.proposal?.suggestedName ?? d.partyText ?? "", mobile: "", partyType: d.personResolution?.proposal?.suggestedType ?? "Other Person", purpose: d.personResolution?.proposal?.fields.find((f) => f.key === "purpose")?.value ?? "" });
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
  const isSettlement = draft?.postAction === "settle-advance";
  const PERSON_PURPOSES = ["SAL-EMP", "EXP-ADVANCE", "EXP-REIMBURSEMENT"];
  const needsEmployee = !isSettlement && purposeCode === "SAL-EMP";
  // Mirror the server's involvesPerson decision (lib/finance/smart-finance/service.ts) exactly —
  // it now resolves a named person for ANY purpose, not only the 3 hardcoded ones, so a bare name
  // like "Ramesh" on a diesel/travel/etc. entry still surfaces the Employee/Other-Party/"add as
  // Other Person" review UI instead of silently disappearing. PERSON_PURPOSES stays as a fallback
  // for the rare case a draft hasn't loaded yet.
  const needsPerson = !isSettlement && (draft?.personResolution != null || PERSON_PURPOSES.includes(purposeCode));
  const needsPartyName = !isSettlement && purposeCode === "REC-INS";
  const needsTreasury = !isSettlement && !isGuidedReceipt && purposeCode !== "ADJ-GOV" && !draft?.treasuryEmptyState;
  const partyChoices = draft?.partyCandidates ?? [];
  const personResolved = Boolean(employeeId || otherPartyId);
  const selectedTreasury = draft?.treasuryOptions.find((t) => t.id === treasuryId) ?? null;

  const outstanding = useMemo(() => {
    const m: string[] = [];
    if (draft?.treasuryEmptyState && !isSettlement) { m.push(hi ? "ट्रेजरी खाता कॉन्फ़िगर करें" : "Configure a Treasury account"); return m; }
    if (!(Number(amount) > 0)) m.push(hi ? "राशि" : "Amount");
    if (isSettlement) {
      const map: Record<string, string> = {
        person: hi ? "ज्ञात Other Person चुनें" : "Resolve a known Other Person",
        "no-outstanding-advance": hi ? "कोई बकाया अग्रिम नहीं" : "No outstanding advance",
        "amount-exceeds-outstanding": hi ? "राशि बकाया से अधिक है" : "Amount exceeds outstanding",
        treasury: hi ? "ट्रेजरी खाता" : "Treasury account",
      };
      (draft?.missingRequired ?? []).filter((x) => x in map).forEach((x) => m.push(map[x]!));
      return m;
    }
    if (!purposeCode) m.push(hi ? "श्रेणी" : "Category");
    if (needsTreasury && !treasuryId) m.push(hi ? "ट्रेजरी खाता" : "Treasury account");
    if (needsEmployee && !employeeId) m.push(hi ? "कर्मचारी" : "Employee");
    if (needsPerson && !needsEmployee && !personResolved) m.push(hi ? "व्यक्ति" : "Person");
    if (needsPartyName && !partyName.trim()) m.push(hi ? "पार्टी" : "Party");
    if (partyChoices.length > 1 && !partyId) m.push(hi ? "पार्टी चुनें" : "Select party");
    return m;
  }, [draft?.treasuryEmptyState, draft?.missingRequired, isSettlement, amount, purposeCode, needsTreasury, treasuryId, needsEmployee, employeeId, needsPerson, personResolved, needsPartyName, partyName, partyChoices.length, partyId, hi]);

  function addOtherPerson() {
    if (np.name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    void post("money-desk-confirm-other-party", { name: np.name.trim(), mobile: np.mobile.trim() || undefined, partyType: np.partyType, purpose: np.purpose.trim() || undefined })
      .then((r: { dimension: { id: string; name: string } }) => {
        setOtherPartyId(r.dimension.id);
        setOtherPartyName(r.dimension.name);
        setEmployeeId("");
        setEmployeeName("");
        setAddPersonOpen(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not add person"))
      .finally(() => setBusy(false));
  }

  function confirmPost() {
    if (!draft || outstanding.length > 0) return;
    setBusy(true);
    setError(null);
    const dateIso = new Date(`${date || draft.date}T00:00:00`).toISOString();
    const smartMeta = { originalText: draft.originalText, confidence: draft.confidence, parsed: draft.parsed };

    let run: Promise<{ status?: string }>;
    if (draft.postAction === "settle-advance" && draft.settlePayload) {
      const sp = draft.settlePayload as Record<string, unknown>;
      run = post("money-desk-settle-advance", {
        ...sp,
        amount: Number(amount) || sp.amount,
        date: dateIso,
        idempotencyKey: idemRef.current,
      }).then((r) => ({ status: (r as { outstandingAfter?: number }).outstandingAfter != null ? `outstanding now ₹${(r as { outstandingAfter: number }).outstandingAfter}` : "POSTED" }));
    } else if (isGuidedReceipt && draft.party) {
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
        counterpartyType: employeeId ? "EMPLOYEE" : otherPartyId ? "OTHER_PARTY" : needsPartyName ? "CUSTOMER" : undefined,
        counterpartyName: (partyName || employeeName || otherPartyName || undefined)?.slice(0, 160),
        description: draft.originalText.slice(0, 240),
        formData: {
          paymentMode,
          ...(employeeId ? { employeeId } : {}),
          ...(otherPartyId ? { partyType: "OTHER_PARTY", partyId: otherPartyId } : {}),
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
  const whyStyle: CSSProperties = { fontSize: "0.72rem", opacity: 0.7, marginTop: 3, lineHeight: 1.35 };

  // Plain-language accounting effect for the "what will happen" line — built ONLY from data the
  // server already resolved from the database (draft.categoryAccount, draft.treasury), never a
  // fabricated code or balance. Debit/credit direction mirrors the real posting in
  // expense-service.ts's postExpense (Dr category account / Cr treasury for money out, reversed
  // for money in) and standard accounting normal-balance rules (ASSET/EXPENSE = debit-normal,
  // LIABILITY/EQUITY/INCOME = credit-normal) — not a guess specific to this feature.
  function accountingEffectLines(d: Draft, amt: number, treasuryName: string | null): string[] {
    const lines: string[] = [];
    const debitNormal = (t: string) => t === "ASSET" || t === "EXPENSE";
    const line = (name: string, increases: boolean) =>
      hi ? `${name} ${money(amt)} से ${increases ? "बढ़ेगा" : "घटेगा"}` : `${name} will ${increases ? "increase" : "decrease"} by ${money(amt)}`;
    if (d.direction === "MONEY_OUT") {
      if (d.categoryAccount) lines.push(line(d.categoryAccount.name, debitNormal(d.categoryAccount.type)));
      if (treasuryName) lines.push(line(treasuryName, false));
    } else if (d.direction === "MONEY_IN") {
      if (treasuryName) lines.push(line(treasuryName, true));
      if (d.categoryAccount) lines.push(line(d.categoryAccount.name, !debitNormal(d.categoryAccount.type)));
    }
    lines.push(hi ? "एक लेजर/जर्नल प्रविष्टि बनेगी" : "A ledger/journal entry will be created");
    return lines;
  }
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
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", opacity: 0.8, lineHeight: 1.4 }}>
        {hi
          ? "स्मार्ट फाइनेंस आपके वाक्य को एक प्रस्तावित लेखा प्रविष्टि में बदलता है। आप पहले इसकी समीक्षा करते हैं। जब तक आप पुष्टि नहीं करते, कुछ भी पोस्ट नहीं होता।"
          : "Smart Finance converts your sentence into a proposed accounting entry. You review it first. Nothing is posted until you confirm."}
      </p>

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
            {draft.intentLabel && <strong style={{ fontSize: "0.9rem" }}>{draft.intentLabel}</strong>}
            <small style={{ opacity: 0.7 }}>“{draft.originalText}”</small>
          </div>

          {!isSettlement && (
            <div style={{ border: "1px solid #c7d2fe", borderRadius: 10, padding: "0.65rem 0.85rem", display: "grid", gap: 6, background: "#fff" }}>
              <strong style={{ fontSize: "0.82rem" }}>{hi ? "मैंने क्या समझा" : "WHAT I UNDERSTOOD"}</strong>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem", display: "grid", gap: 2 }}>
                <li>{hi ? "राशि" : "Amount"}: {Number(amount) > 0 ? <strong>{money(amount)}</strong> : <em style={{ color: "#991b1b" }}>{hi ? "अस्पष्ट — कृपया दर्ज करें" : "unclear — please enter"}</em>}</li>
                <li>{hi ? "व्यय / श्रेणी" : "Expense / category"}: {purposeCode ? <strong>{selectedPurpose ? (hi ? selectedPurpose.hindiLabel : selectedPurpose.label) : purposeCode}</strong> : <em style={{ color: "#991b1b" }}>{hi ? "मैं व्यय श्रेणी यकीन से तय नहीं कर सका" : "I couldn't confidently determine the expense category"}</em>}</li>
                <li>
                  {hi ? "भुगतान माध्यम" : "Paid through"}: {selectedTreasury ? <strong>{selectedTreasury.displayName}</strong> : draft.treasuryEmptyState ? <em style={{ color: "#991b1b" }}>{hi ? "अभी कोई ट्रेजरी खाता नहीं है" : "no Treasury account configured yet"}</em> : <em style={{ color: "#991b1b" }}>{hi ? "मुझे ट्रेजरी खाता चुनना होगा।" : "I need you to choose the Treasury account."}</em>}
                </li>
                {(needsPerson || needsPartyName || draft.party || draft.partyText) && (
                  <li>
                    {hi ? "पार्टी" : "Party"}: {personResolved ? <strong>{employeeName || otherPartyName}</strong> : partyName.trim() ? <strong>{partyName}</strong> : draft.personResolution?.status === "AMBIGUOUS" ? <em style={{ color: "#854d0e" }}>{hi ? "मुझे कई संभावित लोग मिले। कृपया एक चुनें।" : "I found multiple possible people. Please choose one."}</em> : draft.partyText ? <em style={{ color: "#991b1b" }}>{hi ? "मैं इस व्यक्ति की पहचान नहीं कर सका।" : "I couldn't identify this person."}</em> : <em style={{ opacity: 0.6 }}>—</em>}
                  </li>
                )}
                <li>{hi ? "दिनांक" : "Date"}: <strong>{date || draft.date}</strong></li>
                <li>{hi ? "लेजर खाता" : "Ledger account"}: {draft.categoryAccount ? <strong>{draft.categoryAccount.code} · {draft.categoryAccount.name}</strong> : <em style={{ opacity: 0.6 }}>{hi ? "इस श्रेणी के लिए लागू नहीं" : "not applicable for this category"}</em>}</li>
              </ul>
              {(draft.explanations.category || draft.explanations.direction) && (
                <div style={{ fontSize: "0.76rem", opacity: 0.8, borderTop: "1px dashed #c7d2fe", paddingTop: 5 }}>
                  <strong>{hi ? "क्यों: " : "Why: "}</strong>{[draft.explanations.category, draft.explanations.direction].filter(Boolean).join(" ")}
                </div>
              )}
              {Number(amount) > 0 && purposeCode && draft.direction && (
                <div style={{ fontSize: "0.76rem", background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 8, padding: "0.4rem 0.6rem" }}>
                  <strong>{hi ? "क्या होगा: " : "What will happen: "}</strong>
                  {accountingEffectLines(draft, Number(amount), selectedTreasury?.displayName ?? null).join(". ")}
                  {". "}
                  <strong>{hi ? "पुष्टि करने तक कुछ भी पोस्ट नहीं होता।" : "This is NOT posted until you confirm."}</strong>
                </div>
              )}
            </div>
          )}

          {draft.treasuryEmptyState && (
            <div style={{ border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 10, padding: "0.75rem" }}>
              <strong>{hi ? "अभी कोई ट्रेजरी खाता कॉन्फ़िगर नहीं है" : draft.treasuryEmptyState.title}</strong>
              <p style={{ margin: "0.35rem 0" }}><small>{draft.treasuryEmptyState.message}</small></p>
              <a className={styles.secondaryBig} href={`/portal/${portal}/${draft.treasuryEmptyState.actionSlug}`}>{draft.treasuryEmptyState.actionLabel}</a>
            </div>
          )}

          {!draft.understood && !draft.treasuryEmptyState && (
            <p role="status" data-ok="false">
              {hi ? "पूरी तरह समझ नहीं आया — नीचे विवरण भरें या दोबारा लिखें।" : "Not fully understood — fill the details below or rephrase."}
            </p>
          )}

          {isSettlement && (
            <div style={{ border: "1px solid #a7f3d0", background: "#f0fdf4", borderRadius: 10, padding: "0.6rem 0.75rem", display: "grid", gap: 4 }}>
              <strong>{hi ? "अग्रिम " + (draft.parsed?.advanceSettlement === "RECOVERY" ? "वापसी" : "समायोजन") : draft.intentLabel}</strong>
              <div style={{ fontSize: "0.8rem" }}>
                {hi ? "व्यक्ति" : "Person"}: <strong>{otherPartyName || draft.personResolution?.otherParty?.name || draft.partyText}</strong>
                {draft.explanations.person && <span style={{ opacity: 0.75 }}> — {draft.explanations.person}</span>}
              </div>
              <div style={{ fontSize: "0.8rem" }}>{hi ? "समायोजन राशि" : "Settlement amount"}: <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} /></div>
              <div style={whyStyle}>{draft.explanations.category}</div>
            </div>
          )}

          {draft.skuLine && (
            <div style={{ border: "1px solid #ddd6fe", background: "#faf5ff", borderRadius: 10, padding: "0.6rem 0.75rem", display: "grid", gap: 3 }}>
              <strong>{hi ? "उत्पाद पंक्ति" : "Product line"}</strong>
              <div style={{ fontSize: "0.8rem" }}>
                {draft.skuLine.sku
                  ? <>{draft.skuLine.sku.code} — {draft.skuLine.sku.productName} · {hi ? "मात्रा" : "Qty"} {draft.skuLine.quantity ?? "?"} {draft.skuLine.unitOfMeasure ?? ""} · {hi ? "दर" : "Rate"} {draft.skuLine.rate != null ? money(draft.skuLine.rate) : "?"}{draft.skuLine.taxRatePct != null ? ` · GST ${draft.skuLine.taxRatePct}%` : ""}{draft.skuLine.lineTotal != null ? ` · ${money(draft.skuLine.lineTotal)}` : ""}</>
                  : draft.skuLine.candidates.length
                    ? `${draft.skuLine.candidates.length} ${hi ? "उत्पाद मिले — चुनें" : "products match — choose one"}: ${draft.skuLine.candidates.map((c) => c.code).join(", ")}`
                    : (hi ? "उत्पाद नहीं मिला" : "Product not found")}
              </div>
              <div style={whyStyle}>{draft.skuLine.explanation}</div>
              <div style={{ ...whyStyle, color: "#7c3aed" }}>{hi ? "उत्पाद बिक्री पोस्टिंग अभी सेल्स वॉक-इन ऑर्डर पथ से होती है।" : "Product-sale posting still goes through the Sales walk-in order path — this line is a checked reference."}</div>
            </div>
          )}

          {!isSettlement && (
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
                <td>
                  <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 140 }} />
                  {draft.explanations.amount && <div style={whyStyle}>{draft.explanations.amount}</div>}
                </td>
              </tr>
              <tr>
                <td>{hi ? "श्रेणी" : "Category"}{!purposeCode && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                <td>
                  <select value={purposeCode} onChange={(e) => setPurposeCode(e.target.value)}>
                    <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                    {purposes.map((p) => <option key={p.code} value={p.code}>{hi ? p.hindiLabel : p.label}</option>)}
                  </select>
                  {draft.explanations.category && <div style={whyStyle}>{draft.explanations.category}</div>}
                  {draft.explanations.direction && <div style={whyStyle}>{draft.explanations.direction}</div>}
                </td>
              </tr>
              {(needsPartyName || draft.partyText || draft.party) && !needsPerson && (
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
                    {draft.explanations.party && <div style={whyStyle}>{draft.explanations.party}</div>}
                    {draft.partyNotFound && <small style={{ display: "block", color: "#854d0e" }}>{hi ? "मास्टर में नहीं मिला — नाम से जारी रख सकते हैं या सही करें।" : "Not found in master — you can continue by name or correct it."}</small>}
                  </td>
                </tr>
              )}
              {needsPerson && (
                <tr>
                  <td>{hi ? "व्यक्ति" : "Person"}{!personResolved && <span style={{ color: "#b91c1c" }}> ⚠</span>}</td>
                  <td>
                    {personResolved ? (
                      <div>
                        <strong>{employeeName || otherPartyName}</strong>{" "}
                        <span style={{ fontSize: "0.72rem", background: employeeId ? "#dbeafe" : "#e9d5ff", color: employeeId ? "#1e40af" : "#6b21a8", borderRadius: 999, padding: "1px 8px", fontWeight: 700 }}>
                          {employeeId ? (hi ? "कर्मचारी" : "Employee") : (hi ? "अन्य व्यक्ति" : "Other Person")}
                        </span>
                        {draft.personResolution?.priorActivity && draft.personResolution.priorActivity.count > 0 && otherPartyId && (
                          <div style={whyStyle}>{hi ? "पिछली गतिविधि" : "Prior activity"}: {draft.personResolution.priorActivity.count} · {money(draft.personResolution.priorActivity.netPaid)}</div>
                        )}
                        {draft.explanations.person && <div style={whyStyle}>{draft.explanations.person}</div>}
                        <button type="button" className={styles.secondaryBig} style={{ marginTop: 4 }} onClick={() => { setEmployeeId(""); setEmployeeName(""); setOtherPartyId(""); setOtherPartyName(""); setAddPersonOpen(false); }}>{hi ? "बदलें" : "Change"}</button>
                      </div>
                    ) : draft.personResolution?.status === "AMBIGUOUS" && draft.personResolution.candidates ? (
                      <div>
                        <div style={{ ...whyStyle, marginTop: 0 }}>{draft.explanations.person}</div>
                        <select
                          value={employeeId || otherPartyId}
                          onChange={(e) => {
                            const c = draft.personResolution!.candidates!.find((x) => x.id === e.target.value);
                            if (!c) return;
                            if (c.role === "EMPLOYEE") { setEmployeeId(c.id); setEmployeeName(c.name); setOtherPartyId(""); setOtherPartyName(""); }
                            else { setOtherPartyId(c.id); setOtherPartyName(c.name); setEmployeeId(""); setEmployeeName(""); }
                          }}
                        >
                          <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                          {draft.personResolution.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role === "EMPLOYEE" ? "Employee" : "Other"})</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <div style={{ ...whyStyle, marginTop: 0, color: "#854d0e" }}>{draft.explanations.person ?? `“${draft.partyText}” ${hi ? "पहचान नहीं हुई" : "not recognised"}`}</div>
                        {!addPersonOpen ? (
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: 4 }}>
                            <button type="button" className={styles.secondaryBig} onClick={() => setAddPersonOpen(true)}>{hi ? "+ अन्य व्यक्ति जोड़ें" : "+ Add as Other Person"}</button>
                            <span style={{ alignSelf: "center", fontSize: "0.75rem", opacity: 0.6 }}>{hi ? "या मौजूदा कर्मचारी चुनें:" : "or pick an existing employee:"}</span>
                            <EmployeePicker hi={hi} initial={otherPartyName || draft.partyText || ""} onPick={(id, name) => { setEmployeeId(id); setEmployeeName(name); }} />
                          </div>
                        ) : (
                          <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.5rem", marginTop: 4, display: "grid", gap: 6 }}>
                            <label style={{ fontSize: "0.78rem" }}>{hi ? "पूरा नाम" : "Full name"} *<input value={np.name} onChange={(e) => setNp((s) => ({ ...s, name: e.target.value }))} /></label>
                            <label style={{ fontSize: "0.78rem" }}>{hi ? "मोबाइल (वैकल्पिक)" : "Mobile (optional)"}<input value={np.mobile} onChange={(e) => setNp((s) => ({ ...s, mobile: e.target.value }))} inputMode="tel" /></label>
                            <label style={{ fontSize: "0.78rem" }}>{hi ? "प्रकार" : "Type"}
                              <select value={np.partyType} onChange={(e) => setNp((s) => ({ ...s, partyType: e.target.value }))}>
                                {(draft.personResolution?.proposal?.fields.find((f) => f.key === "partyType")?.options ?? ["Other Person", "Labour / Contractor", "Agent / Broker", "Transporter", "Landlord", "Other"]).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </label>
                            <label style={{ fontSize: "0.78rem" }}>{hi ? "प्रयोजन" : "Purpose"}<input value={np.purpose} onChange={(e) => setNp((s) => ({ ...s, purpose: e.target.value }))} /></label>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setAddPersonOpen(false)}>{hi ? "रद्द" : "Cancel"}</button>
                              <button type="button" className={styles.primaryBig} disabled={busy || np.name.trim().length < 2} onClick={addOtherPerson}>{busy ? "…" : (hi ? "जोड़ें और उपयोग करें" : "Add & use")}</button>
                            </div>
                            <div style={whyStyle}>{draft.personResolution?.proposal?.note}</div>
                          </div>
                        )}
                      </div>
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
                      {draft.treasuryOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName} · {t.kind} · {money(t.balance)}{t.lastEntryAt ? ` · ${hi ? "अंतिम" : "last"} ${t.lastEntryAt.slice(0, 10)}` : ""}
                        </option>
                      ))}
                    </select>
                    {draft.explanations.treasury && <div style={whyStyle}>{draft.explanations.treasury}</div>}
                    {draft.treasuryAssumed && treasuryId && <small style={{ display: "block", color: "#854d0e" }}>{hi ? "मान लिया गया — पुष्टि करें" : "Assumed — please confirm"}</small>}
                    {selectedTreasury && (
                      <div style={{ marginTop: 4, fontSize: "0.72rem", opacity: 0.8 }}>
                        {hi ? "शेष" : "Balance"}: <strong>{money(selectedTreasury.balance)}</strong>
                        {selectedTreasury.recentEntries.length > 0 && (
                          <ul style={{ margin: "2px 0 0", paddingLeft: "1rem" }}>
                            {selectedTreasury.recentEntries.map((e, i) => (
                              <li key={i}>{e.direction === "IN" ? "+" : "−"}{money(e.amount)} — {e.description || "—"} · {e.date.slice(0, 10)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
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
                  {draft.explanations.territory && <div style={whyStyle}>{draft.explanations.territory}</div>}
                </td>
              </tr>
              <tr>
                <td>{hi ? "तिथि" : "Date"}</td>
                <td><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></td>
              </tr>
              <tr><td>{hi ? "स्रोत" : "Source"}</td><td>{hi ? "स्मार्ट फाइनेंस प्रविष्टि" : "Smart Finance Entry"}</td></tr>
            </tbody>
          </table>
          )}

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
