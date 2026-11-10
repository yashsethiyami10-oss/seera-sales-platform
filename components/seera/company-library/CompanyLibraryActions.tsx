"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./CompanyLibrary.module.css";

type Lang = "EN" | "HI";

export function PrintPriceListButton({ language }: { language: Lang }) {
  return (
    <button type="button" className={styles.ghost} onClick={() => window.print()}>
      {language === "HI" ? "प्रिंट / PDF सेव करें" : "Print / save as PDF"}
    </button>
  );
}

async function errorMessage(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    return body.error?.message ?? body.error?.code ?? fallback;
  } catch {
    return fallback;
  }
}

export function LibraryUploadForm({ language, categories }: { language: Lang; categories: { value: string; label: string }[] }) {
  const router = useRouter();
  const hi = language === "HI";
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className={styles.upload}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setStatus(null);
        try {
          const res = await fetch("/api/company-library", { method: "POST", body: new FormData(form) });
          if (!res.ok) throw new Error(await errorMessage(res, hi ? "अपलोड विफल" : "Upload failed"));
          form.reset();
          setStatus({ ok: true, text: hi ? "दस्तावेज़ जोड़ा गया — सभी एग्ज़ीक्यूटिव/मैनेजर को दिखेगा।" : "Document added — now visible to every executive and manager." });
          router.refresh();
        } catch (error) {
          setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {hi ? "शीर्षक" : "Title"}
        <input name="title" required minLength={3} maxLength={160} placeholder={hi ? "जैसे: दिवाली स्कीम सर्कुलर" : "e.g. Diwali scheme circular"} />
      </label>
      <label>
        {hi ? "श्रेणी" : "Category"}
        <select name="category" required defaultValue="GENERAL">
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      <label>
        {hi ? "विवरण (वैकल्पिक)" : "Description (optional)"}
        <textarea name="description" maxLength={500} rows={2} />
      </label>
      <label>
        {hi ? "फ़ाइल (PDF, PNG या JPEG, 25 MB तक)" : "File (PDF, PNG or JPEG, up to 25 MB)"}
        <input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" />
      </label>
      <div>
        <button className={styles.primary} disabled={busy}>
          {busy ? (hi ? "अपलोड हो रहा है…" : "Uploading…") : hi ? "अपलोड करें" : "Upload document"}
        </button>
      </div>
      {status && <p className={status.ok ? styles.ok : styles.err}>{status.text}</p>}
    </form>
  );
}

export function ArchiveLibraryDocumentButton({ id, language }: { id: string; language: Lang }) {
  const router = useRouter();
  const hi = language === "HI";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.ghost}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(hi ? "यह दस्तावेज़ लाइब्रेरी से हटाएँ?" : "Remove this document from the library?")) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/company-library/${encodeURIComponent(id)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "archive" }),
            });
            if (!res.ok) throw new Error(await errorMessage(res, hi ? "हटाना विफल" : "Remove failed"));
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {hi ? "हटाएँ" : "Remove"}
      </button>
      {error && <span className={styles.err}>{error}</span>}
    </>
  );
}
