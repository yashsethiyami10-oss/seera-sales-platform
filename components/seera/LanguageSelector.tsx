"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UiLanguage } from "@/lib/sales-distribution/localization";

export function LanguageSelector({ initialLanguage, labels }: { initialLanguage: UiLanguage; labels: { language: string; english: string; hindi: string } }) {
  const [language, setLanguage] = useState(initialLanguage); const [busy, setBusy] = useState(false); const router = useRouter();
  async function change(next: UiLanguage) { if (next === language || busy) return; setBusy(true); try { const response = await fetch("/api/foundation/language", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) }); if (!response.ok) throw new Error("LANGUAGE_UPDATE_FAILED"); setLanguage(next); router.refresh(); } finally { setBusy(false); } }
  return <fieldset aria-label={labels.language} disabled={busy} style={{ display: "flex", gap: 8, border: 0, padding: 0 }}><legend>{labels.language}</legend><button type="button" aria-pressed={language === "EN"} onClick={() => change("EN")}>{labels.english}</button><button type="button" aria-pressed={language === "HI"} onClick={() => change("HI")}>{labels.hindi}</button></fieldset>;
}
