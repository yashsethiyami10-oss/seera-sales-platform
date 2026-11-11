"use client";
import Link from "@/components/seera/foundation/PortalLink";
import { useEffect, useMemo, useState } from "react";
import styles from "./PartnerKyc.module.css";

// Partner KYC: pick a prospect / partner, then tap 📷 (camera) or 📄 (PDF / gallery) next to each
// document. Uploads go straight to the private server store; nothing is kept on the phone.

type Subject = { subjectType: "PROSPECT" | "PARTNER"; subjectId: string; name: string; kind: string; meta: string; requiredDone: number; requiredTotal: number };
type KycDoc = { id: string; docType: string; originalName: string; mimeType: string; sizeBytes: number; note: string | null; createdAt: string };
type Details = { gstin: string | null; pan: string | null; aadhaarLast4: string | null; bankAccountName: string | null; bankAccountNumber: string | null; ifsc: string | null; bankName: string | null };
type SubjectDetail = { subjectType: Subject["subjectType"]; subjectId: string; name: string; kind: string; mobile: string | null; stage: string; documents: KycDoc[]; details: Details | null };

const DOCS: { type: string; en: string; hi: string; icon: string; required: boolean; hint?: [string, string] }[] = [
  { type: "GST_CERTIFICATE", en: "GST certificate", hi: "GST प्रमाणपत्र", icon: "🧾", required: true },
  { type: "PAN_CARD", en: "PAN card", hi: "PAN कार्ड", icon: "🪪", required: true },
  { type: "AADHAAR_CARD", en: "Aadhaar card", hi: "आधार कार्ड", icon: "🆔", required: true, hint: ["Use masked Aadhaar if possible", "हो सके तो मास्क्ड आधार दें"] },
  { type: "CANCELLED_CHEQUE", en: "Cancelled cheque / bank proof", hi: "कैंसिल चेक / बैंक प्रमाण", icon: "🏦", required: true },
  { type: "APPLICATION_FORM", en: "Signed application form", hi: "हस्ताक्षरित आवेदन फ़ॉर्म", icon: "📝", required: true },
  { type: "BANK_STATEMENT", en: "Bank statement", hi: "बैंक स्टेटमेंट", icon: "📊", required: false },
  { type: "SHOP_PHOTO", en: "Shop / godown photo", hi: "दुकान / गोदाम फ़ोटो", icon: "🏬", required: false },
  { type: "OTHER", en: "Other document", hi: "अन्य दस्तावेज़", icon: "📎", required: false },
];

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/partner-kyc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Request failed");
  return d as T;
}

// Big phone photos are re-encoded to a ≤2000px JPEG before upload so a 12 MB camera image still
// fits the 10 MB limit and uploads quickly on 4G. PDFs and small images go up untouched.
async function shrinkIfLargeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 2_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PartnerKycPanel({ language, portal, initial }: { language: "EN" | "HI"; portal: string; initial?: string }) {
  const hi = language === "HI";
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ subjectType: Subject["subjectType"]; subjectId: string } | null>(() => {
    const [t, id] = (initial ?? "").split(":");
    return (t === "PROSPECT" || t === "PARTNER") && id ? { subjectType: t, subjectId: id } : null;
  });
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = () => post<{ subjects: Subject[] }>({ action: "list" }).then((d) => setSubjects(d.subjects)).catch((e) => setMessage({ ok: false, text: String(e.message ?? e) }));
  const loadDetail = (s: { subjectType: Subject["subjectType"]; subjectId: string }) =>
    post<SubjectDetail>({ action: "subject", ...s })
      .then(setDetail)
      .catch((e) => setMessage({ ok: false, text: String(e.message ?? e) }));

  useEffect(() => {
    void loadList();
  }, []);
  useEffect(() => {
    setDetail(null);
    if (selected) void loadDetail(selected);
  }, [selected?.subjectType, selected?.subjectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (subjects ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.meta.toLowerCase().includes(q));
  }, [subjects, query]);

  const upload = async (docType: string, file: File | undefined) => {
    if (!file || !selected) return;
    setBusyType(docType);
    setMessage(null);
    try {
      const ready = await shrinkIfLargeImage(file);
      if (ready.size > 10_000_000) throw new Error(hi ? "फ़ाइल 10 MB से बड़ी है।" : "File is larger than 10 MB.");
      const form = new FormData();
      form.set("file", ready);
      form.set("subjectType", selected.subjectType);
      form.set("subjectId", selected.subjectId);
      form.set("docType", docType);
      const r = await fetch("/api/partner-kyc", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Upload failed");
      setMessage({ ok: true, text: hi ? "दस्तावेज़ अपलोड हुआ ✓" : "Document uploaded ✓" });
      await Promise.all([loadDetail(selected), loadList()]);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setBusyType(null);
    }
  };

  const remove = async (doc: KycDoc) => {
    if (!selected) return;
    const reason = window.prompt(hi ? "हटाने का कारण" : "Reason for removing", hi ? "गलत फ़ाइल" : "Wrong file");
    if (!reason) return;
    try {
      await post({ action: "remove", documentId: doc.id, reason });
      await Promise.all([loadDetail(selected), loadList()]);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    }
  };

  if (!selected)
    return (
      <section className={styles.panel}>
        <header className={styles.head}>
          <small>{hi ? "पार्टनर KYC" : "PARTNER KYC"}</small>
          <h2>{hi ? "किसके दस्तावेज़ जोड़ने हैं?" : "Whose documents are you adding?"}</h2>
          <p>{hi ? "नया वितरक / सुपर स्टॉकिस्ट चुनें। सूची में नहीं है? पहले प्रॉस्पेक्ट जोड़ें।" : "Pick the new distributor / super stockist. Not in the list? Add them as a prospect first."}</p>
        </header>
        <div className={styles.searchRow}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={hi ? "नाम या मोबाइल से खोजें" : "Search by name or mobile"} />
          <Link className={styles.addLink} href={`/portal/${portal}/${portal === "sales-manager" ? "distributor-search" : "prospects"}`}>
            + {hi ? "नया प्रॉस्पेक्ट" : "New prospect"}
          </Link>
        </div>
        {subjects === null && <p className={styles.muted}>{hi ? "लोड हो रहा है…" : "Loading…"}</p>}
        {subjects && !filtered.length && <p className={styles.muted}>{hi ? "कोई प्रॉस्पेक्ट नहीं मिला।" : "No prospects found."}</p>}
        <div className={styles.subjectGrid}>
          {filtered.map((s) => (
            <button key={`${s.subjectType}:${s.subjectId}`} type="button" className={styles.subject3d} onClick={() => setSelected({ subjectType: s.subjectType, subjectId: s.subjectId })}>
              <span className={styles.kind}>{s.kind === "SUPER_STOCKIST" ? "S.S." : hi ? "वितरक" : "Distributor"}{s.subjectType === "PARTNER" ? (hi ? " · नियुक्त" : " · appointed") : ""}</span>
              <strong>{s.name}</strong>
              <small>{s.meta}</small>
              <span className={styles.progressLine}>
                <i style={{ width: `${Math.round((s.requiredDone / s.requiredTotal) * 100)}%` }} />
              </span>
              <small data-complete={s.requiredDone === s.requiredTotal}>
                {s.requiredDone === s.requiredTotal ? (hi ? "✓ KYC पूरा" : "✓ KYC complete") : `${s.requiredDone}/${s.requiredTotal} ${hi ? "ज़रूरी दस्तावेज़" : "required documents"}`}
              </small>
            </button>
          ))}
        </div>
        {message && <p className={styles.message} data-ok={message.ok}>{message.text}</p>}
      </section>
    );

  const docsByType = new Map<string, KycDoc[]>();
  for (const d of detail?.documents ?? []) docsByType.set(d.docType, [...(docsByType.get(d.docType) ?? []), d]);
  const requiredDone = DOCS.filter((d) => d.required && docsByType.has(d.type)).length;
  const requiredTotal = DOCS.filter((d) => d.required).length;

  return (
    <section className={styles.panel}>
      <button type="button" className={styles.back} onClick={() => { setSelected(null); setMessage(null); }}>
        ← {hi ? "सभी प्रॉस्पेक्ट" : "All prospects"}
      </button>
      <header className={styles.head}>
        <small>{detail ? `${detail.kind === "SUPER_STOCKIST" ? "SUPER STOCKIST" : "DISTRIBUTOR"} · ${detail.stage}` : "…"}</small>
        <h2>{detail?.name ?? (hi ? "लोड हो रहा है…" : "Loading…")}</h2>
        <div className={styles.bigProgress} role="progressbar" aria-valuemin={0} aria-valuemax={requiredTotal} aria-valuenow={requiredDone}>
          <i style={{ width: `${(requiredDone / requiredTotal) * 100}%` }} />
        </div>
        <p>
          {requiredDone === requiredTotal
            ? hi ? "✓ सभी ज़रूरी दस्तावेज़ मिल गए। बढ़िया काम!" : "✓ All required documents received. Great job!"
            : hi ? `${requiredDone}/${requiredTotal} ज़रूरी दस्तावेज़ — बाकी के लिए 📷 या 📄 दबाएँ` : `${requiredDone}/${requiredTotal} required documents — tap 📷 or 📄 for the rest`}
        </p>
      </header>
      {message && <p className={styles.message} data-ok={message.ok}>{message.text}</p>}
      <div className={styles.docGrid}>
        {DOCS.map((d) => {
          const uploaded = docsByType.get(d.type) ?? [];
          const busy = busyType === d.type;
          return (
            <div key={d.type} className={styles.docCard} data-done={uploaded.length > 0}>
              <div className={styles.docTitle}>
                <b aria-hidden>{uploaded.length ? "✓" : d.icon}</b>
                <span>
                  <strong>{hi ? d.hi : d.en}</strong>
                  <small>{d.required ? (hi ? "ज़रूरी" : "Required") : hi ? "वैकल्पिक" : "Optional"}{d.hint ? ` · ${hi ? d.hint[1] : d.hint[0]}` : ""}</small>
                </span>
              </div>
              {uploaded.map((u) => (
                <div key={u.id} className={styles.fileRow}>
                  <a href={`/api/partner-kyc/file/${u.id}`} target="_blank" rel="noopener noreferrer">
                    {u.mimeType === "application/pdf" ? "📄" : "🖼"} {u.originalName}
                  </a>
                  <button type="button" onClick={() => void remove(u)} aria-label={hi ? "हटाएँ" : "Remove"}>×</button>
                </div>
              ))}
              <div className={styles.uploadRow}>
                <label className={styles.btn3d} data-disabled={busy || !detail}>
                  <input type="file" accept="image/*" capture="environment" disabled={busy || !detail} onChange={(e) => { void upload(d.type, e.target.files?.[0]); e.target.value = ""; }} />
                  📷 {busy ? (hi ? "अपलोड…" : "Uploading…") : hi ? "फ़ोटो" : "Photo"}
                </label>
                <label className={styles.btn3d} data-variant="ghost" data-disabled={busy || !detail}>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy || !detail} onChange={(e) => { void upload(d.type, e.target.files?.[0]); e.target.value = ""; }} />
                  📄 {hi ? "PDF / फ़ाइल" : "PDF / file"}
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {detail && <KycDetailsForm language={language} detail={detail} onSaved={(d) => { setDetail(d); setMessage({ ok: true, text: hi ? "विवरण सहेजा गया ✓" : "Details saved ✓" }); }} onError={(text) => setMessage({ ok: false, text })} />}
    </section>
  );
}

function KycDetailsForm({ language, detail, onSaved, onError }: { language: "EN" | "HI"; detail: SubjectDetail; onSaved: (d: SubjectDetail) => void; onError: (t: string) => void }) {
  const hi = language === "HI";
  const [busy, setBusy] = useState(false);
  const d = detail.details;
  const field = (name: keyof Details, en: string, hiLabel: string, extra: Record<string, string | number> = {}) => (
    <label>
      {hi ? hiLabel : en}
      <input name={name} defaultValue={d?.[name] ?? ""} autoComplete="off" {...extra} />
    </label>
  );
  return (
    <form
      className={styles.detailsForm}
      key={`${detail.subjectType}:${detail.subjectId}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const value = (k: string) => String(f.get(k) ?? "");
        setBusy(true);
        try {
          const saved = await post<SubjectDetail>({
            action: "details",
            subjectType: detail.subjectType,
            subjectId: detail.subjectId,
            details: {
              gstin: value("gstin"),
              pan: value("pan"),
              aadhaarLast4: value("aadhaarLast4"),
              bankAccountName: value("bankAccountName"),
              bankAccountNumber: value("bankAccountNumber"),
              ifsc: value("ifsc"),
              bankName: value("bankName"),
            },
          });
          onSaved(saved);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Save failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong className={styles.formTitle}>{hi ? "KYC नंबर और बैंक विवरण" : "KYC numbers & bank details"}</strong>
      {field("gstin", "GSTIN", "GSTIN", { placeholder: "27ABCDE1234F1Z5", maxLength: 15 })}
      {field("pan", "PAN", "PAN", { placeholder: "ABCDE1234F", maxLength: 10 })}
      {field("aadhaarLast4", "Aadhaar (last 4 digits only)", "आधार (सिर्फ़ आख़िरी 4 अंक)", { placeholder: "1234", maxLength: 4, inputMode: "numeric" })}
      {field("bankAccountName", "Account holder name", "खाताधारक का नाम")}
      {field("bankAccountNumber", "Bank account number", "बैंक खाता संख्या", { inputMode: "numeric", maxLength: 18 })}
      {field("ifsc", "IFSC", "IFSC", { placeholder: "SBIN0001234", maxLength: 11 })}
      {field("bankName", "Bank & branch", "बैंक और शाखा")}
      <button className={styles.save3d} disabled={busy}>{busy ? (hi ? "सहेज रहे हैं…" : "Saving…") : hi ? "विवरण सहेजें" : "Save details"}</button>
    </form>
  );
}
