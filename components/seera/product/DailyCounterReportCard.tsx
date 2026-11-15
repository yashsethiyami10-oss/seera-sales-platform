"use client";

import { useState } from "react";

// Executive's "Today's Counter Report" card: download the day's counters + orders as a branded PDF
// and send it to the distributor on WhatsApp. Download is a plain link (the Android app hands it to
// DownloadManager, so the file lands in Downloads, ready to attach in WhatsApp); "Send on WhatsApp"
// uses the phone's share sheet with the PDF attached where the browser supports file sharing.
export function DailyCounterReportCard({
  language,
  distributorOptions,
  defaultDistributorId,
}: {
  language: "EN" | "HI";
  distributorOptions: { value: string; label: string }[];
  defaultDistributorId: string | null;
}) {
  const hi = language === "HI";
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [distributorId, setDistributorId] = useState(defaultDistributorId && distributorOptions.some((d) => d.value === defaultDistributorId) ? defaultDistributorId : "");
  const [state, setState] = useState<{ busy: boolean; note: string | null; ok?: boolean }>({ busy: false, note: null });
  const params = new URLSearchParams({ date, ...(distributorId ? { distributorId } : {}) });
  const href = `/api/field/daily-counter-report?${params.toString()}`;

  async function share() {
    setState({ busy: true, note: hi ? "PDF तैयार हो रही है…" : "Preparing PDF…" });
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `Seera-Daily-Counter-Report-${date}.pdf`;
      const file = new File([blob], name, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void> };
      const distributor = distributorOptions.find((d) => d.value === distributorId)?.label;
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: "Seera Daily Counter Report", text: `Seera Daily Counter Report — ${date}${distributor ? ` — ${distributor}` : ""}` });
        setState({ busy: false, note: null });
        return;
      }
      // No file sharing here (e.g. inside the Android app): save the PDF, then the Executive
      // attaches it in WhatsApp from Downloads.
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setState({
        busy: false,
        ok: true,
        note: hi
          ? "PDF डाउनलोड हो गई — WhatsApp खोलें → वितरक की चैट → 📎 → Document → Downloads से यह PDF भेजें।"
          : "PDF downloaded — open WhatsApp → distributor's chat → 📎 → Document → pick this PDF from Downloads.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setState({ busy: false, note: null });
        return;
      }
      setState({ busy: false, ok: false, note: hi ? "PDF नहीं बन सकी — इंटरनेट जाँचें और फिर कोशिश करें।" : "Could not prepare the PDF — check the internet and try again." });
    }
  }

  const btn: React.CSSProperties = { minHeight: 44, borderRadius: 12, fontWeight: 800, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 14 };
  return (
    <section style={{ border: "1px solid #dbe3f0", borderRadius: 16, padding: 14, margin: "12px 0", background: "linear-gradient(180deg,#f8fafe,#fff)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, background: "#12214f", color: "#fff", display: "grid", placeItems: "center", fontSize: 18 }}>📄</span>
        <div>
          <strong style={{ display: "block", color: "#12214f", fontSize: 15 }}>{hi ? "आज की काउंटर रिपोर्ट (PDF)" : "Today's Counter Report (PDF)"}</strong>
          <small style={{ color: "#64748b" }}>
            {hi ? "सभी दुकानें, ऑर्डर और कुल माल — वितरक को WhatsApp पर भेजें" : "All shops, orders and loading total — send it to the distributor on WhatsApp"}
          </small>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#475569" }}>
          {hi ? "वितरक" : "Distributor"}
          <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)} style={{ minHeight: 40 }}>
            <option value="">{hi ? "सभी वितरक" : "All distributors"}</option>
            {distributorOptions.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#475569" }}>
          {hi ? "तारीख" : "Date"}
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} style={{ minHeight: 40 }} />
        </label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <a href={href} download style={{ ...btn, background: "#12214f", color: "#fff", border: "1px solid #12214f" }}>
          ⬇ {hi ? "PDF डाउनलोड" : "Download PDF"}
        </a>
        <button type="button" disabled={state.busy} onClick={() => void share()} style={{ ...btn, background: "#e9f9ef", color: "#0f7a3d", border: "1px solid #9fdcb5" }}>
          🟢 {state.busy ? (hi ? "तैयार हो रही है…" : "Preparing…") : hi ? "WhatsApp पर भेजें" : "Send on WhatsApp"}
        </button>

      </div>
      {state.note && <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: state.ok === false ? "#b91c1c" : "#0f7a3d" }}>{state.note}</p>}
    </section>
  );
}
