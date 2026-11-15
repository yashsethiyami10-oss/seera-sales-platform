"use client";

import { useState } from "react";
import { downloadUrl, shareFile } from "@/lib/seera/file-actions";

// Executive's "Today's Counter Report" card: download the day's counters + orders as a branded PDF
// and send it to the distributor on WhatsApp. In the Seera Android app, Download saves it to
// Downloads/Seera and opens it, and "Send on WhatsApp" opens WhatsApp directly with the PDF
// attached (lib/seera/file-actions.ts). In a browser: normal download / the phone's share sheet.
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

  const working = (text: string) => setState({ busy: true, note: text });
  const done = (r: { ok: boolean; message: string }) => setState({ busy: false, ok: r.ok, note: r.message || null });

  async function download() {
    working(hi ? "PDF तैयार हो रही है…" : "Preparing PDF…");
    done(await downloadUrl(href, `Seera-Daily-Counter-Report-${date}.pdf`));
  }

  async function share() {
    working(hi ? "PDF तैयार हो रही है… WhatsApp खुलेगा" : "Preparing PDF… WhatsApp will open");
    const distributor = distributorOptions.find((d) => d.value === distributorId)?.label;
    done(
      await shareFile(href, {
        fileName: `Seera-Daily-Counter-Report-${date}.pdf`,
        title: "Seera Daily Counter Report",
        text: `Seera Daily Counter Report — ${date}${distributor ? ` — ${distributor}` : ""}`,
        whatsapp: true,
      }),
    );
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
        <button type="button" disabled={state.busy} onClick={() => void download()} style={{ ...btn, background: "#12214f", color: "#fff", border: "1px solid #12214f" }}>
          ⬇ {hi ? "PDF डाउनलोड" : "Download PDF"}
        </button>
        <button type="button" disabled={state.busy} onClick={() => void share()} style={{ ...btn, background: "#e9f9ef", color: "#0f7a3d", border: "1px solid #9fdcb5" }}>
          🟢 {state.busy ? (hi ? "तैयार हो रही है…" : "Preparing…") : hi ? "WhatsApp पर भेजें" : "Send on WhatsApp"}
        </button>

      </div>
      {state.note && <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: state.ok === false ? "#b91c1c" : "#0f7a3d" }}>{state.note}</p>}
    </section>
  );
}
