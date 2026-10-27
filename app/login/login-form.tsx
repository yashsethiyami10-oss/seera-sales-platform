"use client";

import { useEffect, useState } from "react";
import styles from "./login.module.css";

const text = {
  EN: { welcome: "Welcome back", intro: "Sign in to your Seera workspace.", email: "Email or mobile number", password: "Password", show: "Show", hide: "Hide", submit: "Sign in securely", loading: "Signing in…", required: "Enter your email/mobile number and password.", invalid: "The credentials are incorrect or the account is unavailable.", network: "Seera could not reach the server. Check your connection and try again.", language: "हिन्दी", hint: "Distributors & stockists can use their 10-digit mobile number.", caps: "Caps Lock is on", help: "Authorized Seera users only · Forgot password? Ask your manager or admin." },
  HI: { welcome: "वापसी पर स्वागत है", intro: "अपने नियंत्रित सीरा कार्यक्षेत्र में साइन इन करें।", email: "ईमेल या मोबाइल नंबर", password: "पासवर्ड", show: "दिखाएँ", hide: "छिपाएँ", submit: "सुरक्षित साइन इन", loading: "साइन इन हो रहा है…", required: "अपना ईमेल/मोबाइल नंबर और पासवर्ड दर्ज करें।", invalid: "जानकारी गलत है या खाता उपलब्ध नहीं है।", network: "सीरा सर्वर से संपर्क नहीं कर सका। कनेक्शन जाँचें और फिर प्रयास करें।", language: "English", hint: "वितरक और स्टॉकिस्ट अपना 10 अंकों का मोबाइल नंबर डाल सकते हैं।", caps: "Caps Lock चालू है", help: "केवल अधिकृत सीरा उपयोगकर्ता · पासवर्ड भूल गए? अपने मैनेजर या एडमिन से पूछें।" },
} as const;

export function LoginForm() {
  const [language, setLanguage] = useState<keyof typeof text>("EN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const t = text[language];
  // Remember the last chosen language on this device (best-effort; storage may be blocked).
  useEffect(() => { try { if (localStorage.getItem("seera.loginLanguage") === "HI") setLanguage("HI"); } catch {} }, []);
  const toggleLanguage = () => { const next = language === "EN" ? "HI" : "EN"; setLanguage(next); try { localStorage.setItem("seera.loginLanguage", next); } catch {} };
  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState?.("CapsLock") ?? false);

  return <div className={styles.card}>
    <button className={styles.language} type="button" onClick={toggleLanguage}>{t.language}</button>
    <p className={styles.eyebrow}>SEERA ACCESS</p>
    <h2 className={styles.title}>{t.welcome}</h2>
    <p className={styles.intro}>{t.intro}</p>
    <form method="post" className={styles.form} onSubmit={async event => {
      event.preventDefault(); setError("");
      const form = new FormData(event.currentTarget), email = String(form.get("email") ?? "").trim(), password = String(form.get("password") ?? "");
      if (!email || !password) { setError(t.required); return; }
      setLoading(true);
      try {
        const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        if (!response.ok) { setError(t.invalid); return; }
        const result = await response.json() as { landingPath?: string };
        // Return to the portal page that sent the user here (layout redirects add ?next=/portal/...),
        // but only same-site portal paths — never an absolute or protocol-relative URL.
        const next = new URLSearchParams(location.search).get("next");
        location.assign(next && next.startsWith("/portal/") && !next.startsWith("//") ? next : result.landingPath ?? "/");
      } catch { setError(t.network); } finally { setLoading(false); }
    }} aria-busy={loading}>
      {/* type="text" (not "email"): Distributor/Super Stockist accounts are provisioned with a
          synthetic dist.<mobile>@seera.local-style identifier a user would never type from memory
          — the server now also accepts a plain 10-digit mobile number (see
          lib/foundation/auth-service.ts's login()), so the field can't be HTML5-email-constrained
          or a mobile-number entry would be silently blocked by the browser before it ever reaches
          the server. */}
      <label>{t.email}<span className={styles.field}><i aria-hidden>@</i><input required name="email" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} /></span></label>
      <p className={styles.hint}>{t.hint}</p>
      <label>{t.password}<span className={styles.field}><i aria-hidden>🔒</i><input required name="password" type={visible ? "text" : "password"} autoComplete="current-password" onKeyUp={onKey} onKeyDown={onKey} /><button className={styles.reveal} type="button" onClick={() => setVisible(!visible)} aria-label={visible ? t.hide : t.show}>{visible ? t.hide : t.show}</button></span></label>
      {caps && <p className={styles.caps} role="status">⇪ {t.caps}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={loading}>{loading ? <><span className={styles.spinner} aria-hidden />{t.loading}</> : <>{t.submit} →</>}</button>
    </form>
    <p className={styles.help}>{t.help}</p>
  </div>;
}
