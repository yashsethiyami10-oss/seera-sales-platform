"use client";

import { useState } from "react";
import styles from "./login.module.css";

const text = {
  EN: { welcome: "Welcome back", intro: "Sign in to your governed Seera workspace.", email: "Email or username", password: "Password", show: "Show", hide: "Hide", submit: "Sign in securely", loading: "Signing in…", required: "Enter your email and password.", invalid: "The credentials are incorrect or the account is unavailable.", network: "Seera could not reach the server. Check your connection and try again.", language: "हिन्दी" },
  HI: { welcome: "वापसी पर स्वागत है", intro: "अपने नियंत्रित सीरा कार्यक्षेत्र में साइन इन करें।", email: "ईमेल या उपयोगकर्ता नाम", password: "पासवर्ड", show: "दिखाएँ", hide: "छिपाएँ", submit: "सुरक्षित साइन इन", loading: "साइन इन हो रहा है…", required: "अपना ईमेल और पासवर्ड दर्ज करें।", invalid: "जानकारी गलत है या खाता उपलब्ध नहीं है।", network: "सीरा सर्वर से संपर्क नहीं कर सका। कनेक्शन जाँचें और फिर प्रयास करें।", language: "English" },
} as const;

export function LoginForm() {
  const [language, setLanguage] = useState<keyof typeof text>("EN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const t = text[language];

  return <div style={{ boxSizing: "border-box" }}>
    <button className={styles.language} type="button" onClick={() => setLanguage(language === "EN" ? "HI" : "EN")}>{t.language}</button>
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
        location.assign(result.landingPath ?? "/");
      } catch { setError(t.network); } finally { setLoading(false); }
    }} aria-busy={loading}>
      <label>{t.email}<input required name="email" type="email" autoComplete="username" /></label>
      <label>{t.password}<span className={styles.password}><input required name="password" type={visible ? "text" : "password"} autoComplete="current-password" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? t.hide : t.show}>{visible ? t.hide : t.show}</button></span></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={loading}>{loading ? t.loading : t.submit}</button>
    </form>
    <p className={styles.help}>Authorized Seera users only · Local review on TEST</p>
  </div>;
}
