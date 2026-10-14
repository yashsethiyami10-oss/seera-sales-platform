"use client";

import { useMemo, useState } from "react";
import styles from "./MarketSurvey.module.css";

type Option = readonly [string, string, string];
type Options = {
  relationship: readonly Option[];
  issues: readonly Option[];
  actions: readonly Option[];
  tri: readonly Option[];
  consent: readonly Option[];
  consentScopes: readonly Option[];
  whatsappStates: Record<string, [string, string]>;
};
type Lang = "EN" | "HI";
type FieldErrors = Record<string, string>;
type Result = { id: string; reference: string; whatsappState: string; replayed: boolean };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

const t = {
  EN: {
    a: "Retailer", b: "History with Seera", c: "Why they stopped / don't buy", d: "Competitor", e: "Readiness", f: "What should Seera do?", g: "WhatsApp consent",
    shop: "Shop / retailer name *", contact: "Contact person", mobile: "Mobile number", market: "Market / area / locality *", address: "Address / landmark",
    gps: "Add GPS location (optional)", gpsOk: "GPS added", gpsClear: "Remove GPS", gpsDenied: "Location not available — the survey can be saved without it.",
    issueOther: "Other reason (describe)", words: "Retailer's own words", interpretation: "Your interpretation (salesperson)",
    brand: "Main competing brand", pack: "Competitor pack size", buy: "Retailer purchase price ₹", mrp: "Retail price / MRP ₹", units: "Units sold per week", reason: "Why customers prefer it", freq: "Competitor supply / visit frequency",
    unknownHint: "Leave blank if not known — do not guess.",
    willing: "Willing to consider Seera again?", shelf: "Shelf space available?", trial: "Can take a small trial quantity?",
    testing: "Wants to test product first", quotation: "Wants a quotation", followUp: "Wants a future follow-up", notInterested: "Not interested at present",
    followAt: "Preferred follow-up date / time", notes: "Additional notes", actionOther: "Other action (describe)",
    consentHelp: "Ask clearly. Giving a phone number is not consent to messages.", consentOther: "Describe the other communication",
    submit: "Save survey", saving: "Saving…", retry: "Not saved — check the connection and tap Save again. Your answers are kept.",
    fix: "Please correct the highlighted fields.", saved: "Survey saved", replayed: "Already saved earlier (no duplicate created)",
    ref: "Reference", wa: "WhatsApp thank-you", another: "Start a new survey", linkHint: "Existing retailer with this number:", link: "Link", linked: "Linked",
  },
  HI: {
    a: "रिटेलर", b: "सीरा के साथ इतिहास", c: "खरीद बंद / न करने का कारण", d: "प्रतियोगी", e: "तैयारी", f: "सीरा को क्या करना चाहिए?", g: "WhatsApp सहमति",
    shop: "दुकान / रिटेलर का नाम *", contact: "संपर्क व्यक्ति", mobile: "मोबाइल नंबर", market: "मार्केट / एरिया *", address: "पता / लैंडमार्क",
    gps: "GPS लोकेशन जोड़ें (वैकल्पिक)", gpsOk: "GPS जोड़ा गया", gpsClear: "GPS हटाएँ", gpsDenied: "लोकेशन नहीं मिली — सर्वे इसके बिना सेव हो सकता है।",
    issueOther: "अन्य कारण (लिखें)", words: "रिटेलर के अपने शब्द", interpretation: "आपकी राय (सेल्समैन)",
    brand: "मुख्य प्रतियोगी ब्रांड", pack: "प्रतियोगी पैक साइज़", buy: "रिटेलर खरीद रेट ₹", mrp: "बिक्री रेट / MRP ₹", units: "हफ़्ते में बिक्री (यूनिट)", reason: "ग्राहक इसे क्यों पसंद करते हैं", freq: "प्रतियोगी सप्लाई / विज़िट कितनी बार",
    unknownHint: "पता न हो तो खाली छोड़ें — अंदाज़ा न लगाएँ।",
    willing: "क्या सीरा फिर से रखेंगे?", shelf: "शेल्फ़ में जगह है?", trial: "छोटा ट्रायल माल ले सकते हैं?",
    testing: "पहले प्रोडक्ट टेस्ट करना चाहते हैं", quotation: "रेट / कोटेशन चाहिए", followUp: "बाद में फ़ॉलो-अप चाहिए", notInterested: "अभी रुचि नहीं",
    followAt: "फ़ॉलो-अप की पसंदीदा तारीख / समय", notes: "अन्य नोट्स", actionOther: "अन्य कार्य (लिखें)",
    consentHelp: "साफ़ पूछें। नंबर देना मैसेज की सहमति नहीं है।", consentOther: "अन्य संदेश का विवरण",
    submit: "सर्वे सेव करें", saving: "सेव हो रहा है…", retry: "सेव नहीं हुआ — कनेक्शन जाँचें और फिर सेव दबाएँ। आपके जवाब सुरक्षित हैं।",
    fix: "कृपया लाल फ़ील्ड ठीक करें।", saved: "सर्वे सेव हो गया", replayed: "पहले ही सेव हो चुका था (डुप्लिकेट नहीं बना)",
    ref: "रेफ़रेंस", wa: "WhatsApp धन्यवाद", another: "नया सर्वे शुरू करें", linkHint: "इस नंबर से मौजूद रिटेलर:", link: "जोड़ें", linked: "जुड़ा",
  },
} as const;

export function MarketSurveyForm({ language, options }: { language: Lang; options: Options }) {
  const L = t[language];
  const label = (o: Option) => (language === "HI" ? o[2] : o[1]);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number; gpsAccuracyM: number } | null>(null);
  const [gpsNote, setGpsNote] = useState("");
  const [matches, setMatches] = useState<{ id: string; code: string; businessName: string }[]>([]);
  const [retailerId, setRetailerId] = useState<string | null>(null);
  const [consent, setConsent] = useState("NOT_ASKED");
  const [formKey, setFormKey] = useState(0);
  const fieldClass = useMemo(() => (name: string) => (errors[name] ? styles.invalid : undefined), [errors]);

  function reset() {
    setKey(newKey());
    setResult(null);
    setErrors({});
    setBanner("");
    setGps(null);
    setGpsNote("");
    setMatches([]);
    setRetailerId(null);
    setConsent("NOT_ASKED");
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }

  function captureGps() {
    setGpsNote("");
    if (!("geolocation" in navigator)) return setGpsNote(L.gpsDenied);
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ latitude: Number(p.coords.latitude.toFixed(7)), longitude: Number(p.coords.longitude.toFixed(7)), gpsAccuracyM: Math.round(p.coords.accuracy) }),
      () => setGpsNote(L.gpsDenied),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function lookup(mobile: string) {
    setMatches([]);
    setRetailerId(null);
    if (mobile.replace(/\D/g, "").length < 10) return;
    try {
      const res = await fetch(`/api/market-survey?mobile=${encodeURIComponent(mobile)}`, { cache: "no-store" });
      if (res.ok) setMatches(((await res.json()) as { matches: typeof matches }).matches);
    } catch {
      // Lookup is a convenience; the survey works without it.
    }
  }

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const f = new FormData(form);
    const s = (name: string) => String(f.get(name) ?? "").trim();
    const opt = (name: string) => s(name) || undefined;
    const num = (name: string) => (s(name) === "" ? undefined : Number(s(name)));
    const payload = {
      idempotencyKey: key,
      shopName: s("shopName"), contactName: opt("contactName"), mobile: opt("mobile"), market: s("market"), address: opt("address"),
      ...(gps ?? {}), ...(retailerId ? { retailerId } : {}),
      relationship: s("relationship"), issues: f.getAll("issues").map(String), issueOther: opt("issueOther"), retailerWords: opt("retailerWords"), staffInterpretation: opt("staffInterpretation"),
      competitorBrand: opt("competitorBrand"), competitorPackSize: opt("competitorPackSize"), competitorPurchasePrice: num("competitorPurchasePrice"), competitorMrp: num("competitorMrp"),
      competitorWeeklyUnits: num("competitorWeeklyUnits"), competitorReason: opt("competitorReason"), competitorVisitFrequency: opt("competitorVisitFrequency"),
      willingToReconsider: s("willingToReconsider"), shelfSpace: s("shelfSpace"), trialQuantityOk: s("trialQuantityOk"),
      wantsTesting: f.has("wantsTesting"), wantsQuotation: f.has("wantsQuotation"), wantsFollowUp: f.has("wantsFollowUp"), notInterested: f.has("notInterested"),
      preferredFollowUpAt: s("preferredFollowUpAt") ? new Date(s("preferredFollowUpAt")).toISOString() : undefined, notes: opt("notes"),
      recommendedActions: f.getAll("recommendedActions").map(String), recommendedActionOther: opt("recommendedActionOther"),
      consentStatus: consent, consentScopes: consent === "GRANTED" ? f.getAll("consentScopes").map(String) : [], consentOther: consent === "GRANTED" ? opt("consentOther") : undefined,
    };
    setBusy(true);
    setBanner("");
    setErrors({});
    try {
      const res = await fetch("/api/market-survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(body as Result);
        window.scrollTo({ top: 0 });
        return;
      }
      const details = (body?.error?.details ?? []) as { field: string; message: string }[];
      if (details.length) {
        setErrors(Object.fromEntries(details.map((d) => [d.field.split(".")[0], d.message])));
        setBanner(L.fix);
      } else setBanner(body?.error?.userMessage ?? body?.error?.message ?? L.retry);
    } catch {
      // Network failure: keep every answer and the same idempotency key, so a retry can never
      // create a second survey even if the first request actually reached the server.
      setBanner(L.retry);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const wa = options.whatsappStates[result.whatsappState];
    return (
      <section className={styles.success} aria-live="polite">
        <h2>{result.replayed ? L.replayed : L.saved}</h2>
        <p>
          {L.ref}: <strong>{result.reference}</strong>
        </p>
        <p>
          {L.wa}: <span className={styles.pill}>{wa ? (language === "HI" ? wa[1] : wa[0]) : result.whatsappState}</span>
        </p>
        <button type="button" className={styles.primary} onClick={reset}>
          {L.another}
        </button>
      </section>
    );
  }

  const err = (name: string) => (errors[name] ? <small className={styles.error}>{errors[name]}</small> : null);
  const chips = (name: string, list: readonly Option[]) => (
    <div className={styles.chips}>
      {list.map((o) => (
        <label key={o[0]} className={styles.chip}>
          <input type="checkbox" name={name} value={o[0]} />
          <span>{label(o)}</span>
        </label>
      ))}
    </div>
  );
  const radios = (name: string, list: readonly Option[], value?: string, onChange?: (v: string) => void) => (
    <div className={`${styles.chips} ${fieldClass(name) ?? ""}`} role="radiogroup">
      {list.map((o) => (
        <label key={o[0]} className={styles.chip}>
          <input type="radio" name={name} value={o[0]} required {...(onChange ? { checked: value === o[0], onChange: () => onChange(o[0]) } : {})} />
          <span>{label(o)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <form
      key={formKey}
      className={styles.form}
      noValidate
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      {banner && <p className={styles.banner} role="alert">{banner}</p>}

      <fieldset>
        <legend>A · {L.a}</legend>
        <label>{L.shop}<input name="shopName" required maxLength={160} autoComplete="off" className={fieldClass("shopName")} />{err("shopName")}</label>
        <label>{L.contact}<input name="contactName" maxLength={120} autoComplete="off" /></label>
        <label>
          {L.mobile}
          <input name="mobile" type="tel" inputMode="numeric" maxLength={14} placeholder="98XXXXXXXX" className={fieldClass("mobile")} onBlur={(e) => void lookup(e.currentTarget.value)} />
          {err("mobile")}
        </label>
        {matches.length > 0 && (
          <div className={styles.matches}>
            <small>{L.linkHint}</small>
            {matches.map((m) => (
              <button type="button" key={m.id} className={retailerId === m.id ? styles.chipOn : styles.chipButton} onClick={() => setRetailerId(retailerId === m.id ? null : m.id)}>
                {m.businessName} · {m.code} · {retailerId === m.id ? L.linked : L.link}
              </button>
            ))}
          </div>
        )}
        <label>{L.market}<input name="market" required maxLength={120} className={fieldClass("market")} />{err("market")}</label>
        <label>{L.address}<textarea name="address" rows={2} maxLength={400} /></label>
        <div className={styles.row}>
          {gps ? (
            <>
              <span className={styles.pill}>{L.gpsOk} (±{gps.gpsAccuracyM} m)</span>
              <button type="button" className={styles.secondary} onClick={() => setGps(null)}>{L.gpsClear}</button>
            </>
          ) : (
            <button type="button" className={styles.secondary} onClick={captureGps}>{L.gps}</button>
          )}
        </div>
        {gpsNote && <small>{gpsNote}</small>}
      </fieldset>

      <fieldset>
        <legend>B · {L.b} *</legend>
        {radios("relationship", options.relationship)}
        {err("relationship")}
      </fieldset>

      <fieldset>
        <legend>C · {L.c}</legend>
        {chips("issues", options.issues)}
        <label>{L.issueOther}<input name="issueOther" maxLength={300} className={fieldClass("issueOther")} />{err("issueOther")}</label>
        <label>{L.words}<textarea name="retailerWords" rows={3} maxLength={2000} /></label>
        <label>{L.interpretation}<textarea name="staffInterpretation" rows={2} maxLength={2000} /></label>
      </fieldset>

      <fieldset>
        <legend>D · {L.d}</legend>
        <small>{L.unknownHint}</small>
        <label>{L.brand}<input name="competitorBrand" maxLength={120} /></label>
        <div className={styles.grid2}>
          <label>{L.pack}<input name="competitorPackSize" maxLength={60} /></label>
          <label>{L.units}<input name="competitorWeeklyUnits" type="number" inputMode="numeric" min={0} /></label>
          <label>{L.buy}<input name="competitorPurchasePrice" type="number" inputMode="decimal" min={0} step="0.01" /></label>
          <label>{L.mrp}<input name="competitorMrp" type="number" inputMode="decimal" min={0} step="0.01" /></label>
        </div>
        <label>{L.reason}<textarea name="competitorReason" rows={2} maxLength={600} /></label>
        <label>{L.freq}<input name="competitorVisitFrequency" maxLength={120} /></label>
      </fieldset>

      <fieldset>
        <legend>E · {L.e}</legend>
        <p className={styles.q}>{L.willing} *</p>
        {radios("willingToReconsider", options.tri)}
        {err("willingToReconsider")}
        <p className={styles.q}>{L.shelf} *</p>
        {radios("shelfSpace", options.tri)}
        <p className={styles.q}>{L.trial} *</p>
        {radios("trialQuantityOk", options.tri)}
        <div className={styles.chips}>
          {(["wantsTesting", "wantsQuotation", "wantsFollowUp", "notInterested"] as const).map((n) => (
            <label key={n} className={styles.chip}>
              <input type="checkbox" name={n} />
              <span>{L[n as keyof typeof L]}</span>
            </label>
          ))}
        </div>
        {err("notInterested")}
        <label>{L.followAt}<input name="preferredFollowUpAt" type="datetime-local" /></label>
        <label>{L.notes}<textarea name="notes" rows={2} maxLength={2000} /></label>
      </fieldset>

      <fieldset>
        <legend>F · {L.f}</legend>
        {chips("recommendedActions", options.actions)}
        <label>{L.actionOther}<input name="recommendedActionOther" maxLength={300} className={fieldClass("recommendedActionOther")} />{err("recommendedActionOther")}</label>
      </fieldset>

      <fieldset>
        <legend>G · {L.g} *</legend>
        <small>{L.consentHelp}</small>
        {radios("consentStatus", options.consent, consent, setConsent)}
        {consent === "GRANTED" && (
          <>
            {chips("consentScopes", options.consentScopes)}
            {err("consentScopes")}
            <label>{L.consentOther}<input name="consentOther" maxLength={300} className={fieldClass("consentOther")} />{err("consentOther")}</label>
          </>
        )}
      </fieldset>

      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? L.saving : L.submit}
      </button>
    </form>
  );
}
