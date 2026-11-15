"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { renderPreview, VARIABLE_SOURCES, type VariableMapping, type VariableSource } from "@/lib/seera-whatsapp/rules";
import type { AreaGroup } from "@/lib/seera-whatsapp/areas";
import s from "./WhatsAppHub.module.css";

// Seera WhatsApp Hub — Founder / Admin. Templates are created and approved in Meta WhatsApp
// Manager; this screen syncs them, sends them to retailers / distributors / super stockists
// (once or every N days), and shows every reply in one inbox.

type Template = { name: string; language: string; status: string; category: string | null; headerFormat: string | null; bodyText: string | null; variableNames: string[]; syncedAt: string };
type Campaign = {
  id: string; name: string; templateName: string; language: string; category: string | null; audience: { partyTypes: string[]; distributorIds?: string[]; areaKeys?: string[]; excludeAreaKeys?: string[]; manualGroups?: string[] };
  variableMap: VariableMapping[]; headerMediaUrl: string | null; status: string; repeatEveryDays: number | null; nextRunAt: string | null; lastRunAt: string | null; runCount: number;
  lastRunSummary: { audience?: number; queued?: number; skipped?: number; error?: string } | null; stats: Record<string, number>;
};
type Settings = { sendEnabled: boolean; quietHoursEnabled: boolean; quietStartMinute: number; quietEndMinute: number; marketingGapDays: number };
type Boot = {
  stats: { last7Days: Record<string, number>; unread: number; activeCampaigns: number; optOuts: number; approvedTemplates: number };
  settings: Settings; templates: Template[]; campaigns: Campaign[]; distributors: { id: string; name: string }[]; contactGroups?: { name: string; count: number }[];
  config: { problems: string[]; connected: boolean };
};
type Thread = { phone: string; name: string | null; partyType: string | null; lastText: string | null; lastAt: string; unread: number; optedOut: boolean };
type ThreadDetail = { phone: string; messages: { id: string; direction: string; text: string | null; at: string; status: string | null }[]; templatesSent: { template: string; status: string; at: string }[]; canReply: boolean; optedOut: boolean; partyName: string | null };
type Profile = { displayPhoneNumber: string | null; verifiedName: string | null; nameStatus: string | null; newDisplayName: string | null; newNameStatus: string | null; qualityRating: string | null; messagingLimitTier: string | null; isOfficialBusinessAccount: boolean | null };

async function api<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/whatsapp-hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? `Request failed (${r.status})`);
  return d as T;
}

const PARTY = { RETAILER: ["Retailers", "रिटेलर"], DISTRIBUTOR: ["Distributors", "डिस्ट्रीब्यूटर"], SUPER_STOCKIST: ["Super stockists", "सुपर स्टॉकिस्ट"], SURVEY: ["Survey shops / wholesalers", "सर्वे की दुकानें / होलसेलर"], PROSPECT: ["Distributor prospects", "डिस्ट्रीब्यूटर प्रॉस्पेक्ट"], MANUAL: ["Numbers I added", "खुद जोड़े नंबर"] } as const;
const ALL_PARTIES = Object.keys(PARTY);
const NO_GROUP = "__none__";
const groupLabel = (g: string, t: T) => (g === NO_GROUP ? t("No group", "बिना ग्रुप") : g);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const pill = (st: string) => (["APPROVED", "SCHEDULED", "SENT", "DELIVERED", "READ", "COMPLETED"].includes(st) ? s.pillGreen : ["PENDING", "PAUSED", "DRAFT", "QUEUED", "IN_APPEAL"].includes(st) ? s.pillAmber : ["REJECTED", "FAILED", "CANCELLED", "DISABLED", "DELETED_ON_META", "PAUSED_ON_META"].includes(st) ? s.pillRed : "");

export function WhatsAppHub({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI";
  const t = (en: string, h: string) => (hi ? h : en);
  const [tab, setTab] = useState<"overview" | "campaigns" | "contacts" | "inbox" | "settings">("overview");
  // "Send a campaign to this group" from Contacts opens a new campaign pre-set to that group.
  const [campaignSeed, setCampaignSeed] = useState<{ manualGroups: string[] } | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBoot(await api<Boot>({ action: "bootstrap" })); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setErr(null); setNote(null);
    try { await fn(); if (ok) setNote(ok); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!boot) return <div className={s.hub}>{err ? <div className={s.err}>{err}</div> : <div className={s.muted}>{t("Loading WhatsApp Hub…", "व्हाट्सऐप हब खुल रहा है…")}</div>}</div>;

  return (
    <div className={s.hub}>
      <div className={s.tabs}>
        {([["overview", "📊", t("Overview", "सारांश")], ["campaigns", "📣", t("Campaigns", "कैंपेन")], ["contacts", "📇", t("Contacts", "नंबर")], ["inbox", "💬", t("Inbox", "इनबॉक्स")], ["settings", "⚙️", t("Settings", "सेटिंग")]] as const).map(([k, icon, label]) => (
          <button key={k} type="button" className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => setTab(k)}>
            {icon} {label} {k === "inbox" && boot.stats.unread > 0 && <span className={s.badge}>{boot.stats.unread}</span>}
          </button>
        ))}
      </div>
      {err && <div className={s.err}>{err}</div>}
      {note && <div className={s.ok}>{note}</div>}
      {tab === "overview" && <Overview boot={boot} t={t} busy={busy} run={run} goto={setTab} />}
      {tab === "campaigns" && <Campaigns boot={boot} t={t} hi={hi} busy={busy} run={run} seed={campaignSeed} onSeedUsed={() => setCampaignSeed(null)} />}
      {tab === "contacts" && <Contacts t={t} onChange={load} onSendToGroup={(g) => { setCampaignSeed({ manualGroups: g ? [g] : [] }); setTab("campaigns"); }} />}
      {tab === "inbox" && <Inbox t={t} onChange={load} />}
      {tab === "settings" && <SettingsTab boot={boot} t={t} busy={busy} run={run} />}
    </div>
  );
}

type T = (en: string, hi: string) => string;
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function Overview({ boot, t, busy, run, goto }: { boot: Boot; t: T; busy: boolean; run: Run; goto: (k: "campaigns" | "inbox" | "settings") => void }) {
  const d = boot.stats.last7Days;
  const sent = (d.SENT ?? 0) + (d.DELIVERED ?? 0) + (d.READ ?? 0);
  return (
    <>
      <div className={s.stats}>
        <div className={s.stat}><b>{sent}</b><span>{t("Sent (7 days)", "भेजे (7 दिन)")}</span></div>
        <div className={s.stat}><b>{(d.DELIVERED ?? 0) + (d.READ ?? 0)}</b><span>{t("Delivered", "पहुँचे")}</span></div>
        <div className={s.stat}><b>{d.READ ?? 0}</b><span>{t("Read", "पढ़े गए")}</span></div>
        <div className={s.stat}><b>{d.FAILED ?? 0}</b><span>{t("Failed", "फ़ेल")}</span></div>
        <div className={s.stat}><b>{boot.stats.unread}</b><span>{t("Unread replies", "नए जवाब")}</span></div>
        <div className={s.stat}><b>{boot.stats.activeCampaigns}</b><span>{t("Running campaigns", "चालू कैंपेन")}</span></div>
        <div className={s.stat}><b>{boot.stats.approvedTemplates}</b><span>{t("Approved templates", "मंज़ूर टेम्पलेट")}</span></div>
        <div className={s.stat}><b>{boot.stats.optOuts}</b><span>{t("Opted out (STOP)", "STOP किया")}</span></div>
      </div>
      {!boot.settings.sendEnabled && (
        <div className={s.warn}>⏸ {t("Sending is OFF. Campaigns will queue but nothing goes out until you switch it on in Settings.", "भेजना बंद है। कैंपेन कतार में रहेंगे, पर सेटिंग में चालू करने तक कुछ नहीं जाएगा।")} <button type="button" className={s.btnGhost} onClick={() => goto("settings")}>{t("Open settings", "सेटिंग खोलें")}</button></div>
      )}
      {boot.config.problems.length > 0 && (
        <div className={s.warn}><b>{t("Server setup needed", "सर्वर सेटअप बाकी")}</b><ul>{boot.config.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      <div className={s.card}>
        <h3>🚀 {t("How it works", "कैसे काम करता है")}</h3>
        <ol className={s.steps}>
          <li>{t("Create the template in Meta WhatsApp Manager → Message templates (use {{1}}, {{2}} for name, city etc.) and wait for Approved.", "Meta WhatsApp Manager → Message templates में टेम्पलेट बनाएँ ({{1}}, {{2}} नाम, शहर के लिए) और Approved होने दें।")}</li>
          <li>{t("Press Sync templates here — approved ones appear in the campaign form.", "यहाँ Sync templates दबाएँ — मंज़ूर टेम्पलेट कैंपेन में दिखेंगे।")}</li>
          <li>{t("New campaign → choose retailers / distributors / super stockists → fill each {{variable}} → Test on your phone.", "नया कैंपेन → रिटेलर / डिस्ट्रीब्यूटर / सुपर स्टॉकिस्ट चुनें → हर {{variable}} भरें → अपने फ़ोन पर टेस्ट करें।")}</li>
          <li>{t("Area-wise: tick a whole state (e.g. Uttar Pradesh) or single cities (Gangapur, Bhilwara…). Use 'City / area' or 'Different text for each city / state' in a {{variable}} so each shop gets its own city's message.", "इलाके के हिसाब से: पूरा राज्य (जैसे उत्तर प्रदेश) या अलग शहर (गंगापुर, भीलवाड़ा…) चुनें। {{variable}} में 'शहर' या 'हर शहर / राज्य के लिए अलग टेक्स्ट' चुनें ताकि हर दुकान को अपने शहर का मैसेज जाए।")}</li>
          <li>{t("Start now or schedule, and choose 'repeat every N days' for regular offers.", "अभी शुरू करें या समय तय करें, और नियमित ऑफ़र के लिए 'हर N दिन दोहराएँ' चुनें।")}</li>
          <li>{t("Replies land in the Inbox. You can answer free-text within 24 hours of their message. STOP replies are opted out automatically.", "जवाब इनबॉक्स में आते हैं। उनके मैसेज के 24 घंटे तक जवाब दे सकते हैं। STOP लिखने वाले अपने आप हट जाते हैं।")}</li>
        </ol>
        <div className={s.row}>
          <button type="button" className={s.btn} disabled={busy} onClick={() => run(() => api({ action: "sync_templates" }), t("Templates synced from Meta ✓", "Meta से टेम्पलेट आ गए ✓"))}>🔄 {t("Sync templates", "टेम्पलेट सिंक करें")}</button>
          <button type="button" className={s.btnGhost} onClick={() => goto("campaigns")}>📣 {t("Campaigns", "कैंपेन")}</button>
          <button type="button" className={s.btnGhost} onClick={() => goto("inbox")}>💬 {t("Inbox", "इनबॉक्स")}</button>
        </div>
      </div>
      <div className={s.card}>
        <h3>📄 {t("Templates from Meta", "Meta के टेम्पलेट")} ({boot.templates.length})</h3>
        {boot.templates.length === 0 ? <div className={s.muted}>{t("None yet — press Sync templates.", "अभी कोई नहीं — Sync templates दबाएँ।")}</div> : (
          <table className={s.table}><thead><tr><th>{t("Name", "नाम")}</th><th>{t("Status", "स्थिति")}</th><th>{t("Type", "प्रकार")}</th><th>{t("Text", "टेक्स्ट")}</th></tr></thead>
            <tbody>{boot.templates.map((x) => (
              <tr key={`${x.name}|${x.language}`}><td><b>{x.name}</b><div className={s.muted}>{x.language}{x.headerFormat ? ` · ${x.headerFormat} header` : ""}</div></td>
                <td><span className={`${s.pill} ${pill(x.status)}`}>{x.status}</span></td><td>{x.category ?? "—"}</td><td style={{ whiteSpace: "pre-wrap", maxWidth: 380 }}>{x.bodyText}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </>
  );
}

const emptyForm = { id: undefined as string | undefined, name: "", templateKey: "", partyTypes: [...ALL_PARTIES] as string[], distributorIds: [] as string[], areaKeys: [] as string[], areaMode: "include" as "include" | "exclude", manualGroups: [] as string[], variableMap: [] as VariableMapping[], headerMediaUrl: "", repeat: true, repeatEveryDays: 4, startAt: "" };

function Campaigns({ boot, t, hi, busy, run, seed, onSeedUsed }: { boot: Boot; t: T; hi: boolean; busy: boolean; run: Run; seed?: { manualGroups: string[] } | null; onSeedUsed?: () => void }) {
  const [form, setForm] = useState<typeof emptyForm | null>(seed ? { ...emptyForm, partyTypes: ["MANUAL"], manualGroups: seed.manualGroups } : null);
  useEffect(() => { if (seed) onSeedUsed?.(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);
  const [preview, setPreview] = useState<{ total: number; optedOut: number; byType: Record<string, number>; byArea?: Record<string, number>; sample: { name: string; area?: string; text: string }[] } | null>(null);
  const [areas, setAreas] = useState<AreaGroup[] | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const approved = boot.templates.filter((x) => x.status === "APPROVED");
  const tpl = form ? boot.templates.find((x) => `${x.name}|${x.language}` === form.templateKey) : undefined;
  const mediaHeader = tpl && ["IMAGE", "VIDEO", "DOCUMENT"].includes((tpl.headerFormat ?? "").toUpperCase());

  const payload = () => {
    const [templateName, language] = (form!.templateKey || "|").split("|");
    return {
      name: form!.name, templateName: templateName!, language: language!,
      audience: { partyTypes: form!.partyTypes, ...(form!.distributorIds.length ? { distributorIds: form!.distributorIds } : {}), ...(form!.areaKeys.length ? (form!.areaMode === "exclude" ? { excludeAreaKeys: form!.areaKeys } : { areaKeys: form!.areaKeys }) : {}), ...(form!.partyTypes.includes("MANUAL") && form!.manualGroups.length ? { manualGroups: form!.manualGroups } : {}) },
      variableMap: form!.variableMap, headerMediaUrl: form!.headerMediaUrl || null, repeatEveryDays: form!.repeat ? form!.repeatEveryDays : null,
    };
  };

  useEffect(() => {
    if (!form || !form.partyTypes.length) { setPreview(null); return; }
    const p = payload();
    const h = setTimeout(() => { api<typeof preview>({ action: "preview", audience: p.audience, templateName: tpl?.name, language: tpl?.language, variableMap: form.variableMap }).then(setPreview).catch(() => setPreview(null)); }, 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.partyTypes.join(), form?.distributorIds.join(), form?.areaKeys.join(), form?.areaMode, form?.manualGroups.join(), form?.templateKey, JSON.stringify(form?.variableMap)]);

  // State → city list for the area picker (counts follow the chosen party types / distributors).
  useEffect(() => {
    if (!form || !form.partyTypes.length) { setAreas(null); return; }
    const h = setTimeout(() => {
      api<{ areas: AreaGroup[] }>({ action: "areas", audience: { partyTypes: form.partyTypes, ...(form.distributorIds.length ? { distributorIds: form.distributorIds } : {}), ...(form.partyTypes.includes("MANUAL") && form.manualGroups.length ? { manualGroups: form.manualGroups } : {}) } })
        .then((r) => setAreas(r.areas))
        .catch(() => setAreas(null));
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.partyTypes.join(), form?.distributorIds.join(), form?.manualGroups.join()]);

  const pickTemplate = (key: string) => {
    const x = boot.templates.find((y) => `${y.name}|${y.language}` === key);
    setForm((f) => f && ({ ...f, templateKey: key, variableMap: (x?.variableNames ?? []).map((v, i) => f.variableMap.find((m) => m.variable === v) ?? { variable: v, source: (i === 0 ? "CONTACT_NAME" : "CUSTOM") as VariableSource, value: "" }) }));
  };
  const livePreview = useMemo(() => {
    if (!tpl) return "";
    const sample = { CONTACT_NAME: "Ramesh Sharma", BUSINESS_NAME: "Sharma General Store", OWNER_NAME: "Ramesh Sharma", CITY: "Jaipur", STATE: "Rajasthan", DISTRIBUTOR_NAME: "Seera Distributor", PARTY_CODE: "RT-0012" } as Record<string, string>;
    return renderPreview(tpl.bodyText, Object.fromEntries((form?.variableMap ?? []).map((m) => [m.variable, m.source === "CUSTOM" || m.source === "AREA_TEXT" ? (m.value || `{{${m.variable}}}`) : sample[m.source]!])));
  }, [tpl, form?.variableMap]);

  const save = async (andStart: boolean) => {
    const r = await api<{ campaign: { id: string } }>({ action: "save_campaign", id: form!.id, campaign: payload() });
    if (andStart) await api({ action: "schedule", id: r.campaign.id, startAt: form!.startAt ? new Date(form!.startAt).toISOString() : null });
    setForm(null);
  };

  if (form) return (
    <div className={s.card}>
      <h3>{form.id ? t("Edit campaign", "कैंपेन बदलें") : t("New campaign", "नया कैंपेन")}</h3>
      <label className={s.field}>{t("Campaign name", "कैंपेन का नाम")}<input className={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("e.g. Diwali scheme – retailers", "जैसे दिवाली स्कीम – रिटेलर")} /></label>
      <label className={s.field}>{t("Approved template", "मंज़ूर टेम्पलेट")}
        <select className={s.select} value={form.templateKey} onChange={(e) => pickTemplate(e.target.value)}>
          <option value="">{approved.length ? t("Choose…", "चुनें…") : t("No approved template — sync from Meta first", "कोई मंज़ूर टेम्पलेट नहीं — पहले सिंक करें")}</option>
          {approved.map((x) => <option key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>{x.name} · {x.language} · {x.category}</option>)}
        </select>
      </label>
      <div className={s.field}>{t("Send to", "किसे भेजें")}
        <div className={s.chips}><button type="button" className={`${s.chip} ${form.partyTypes.length === ALL_PARTIES.length ? s.chipOn : ""}`} onClick={() => setForm({ ...form, partyTypes: form.partyTypes.length === ALL_PARTIES.length ? [] : [...ALL_PARTIES] })}>{form.partyTypes.length === ALL_PARTIES.length ? "✓ " : ""}{t("Everyone", "सबको")}</button>{(Object.keys(PARTY) as (keyof typeof PARTY)[]).map((k) => {
          const on = form.partyTypes.includes(k);
          return <button key={k} type="button" className={`${s.chip} ${on ? s.chipOn : ""}`} onClick={() => setForm({ ...form, partyTypes: on ? form.partyTypes.filter((x) => x !== k) : [...form.partyTypes, k] })}>{on ? "✓ " : ""}{PARTY[k][hi ? 1 : 0]}</button>;
        })}</div>
      </div>
      {boot.distributors.length > 0 && (form.partyTypes.includes("RETAILER") || form.partyTypes.includes("DISTRIBUTOR")) && (
        <label className={s.field}>{t("Only these distributors (and their retailers) — leave empty for all", "सिर्फ़ ये डिस्ट्रीब्यूटर (और उनके रिटेलर) — सबके लिए खाली छोड़ें")}
          <select className={s.select} multiple size={Math.min(6, boot.distributors.length)} value={form.distributorIds} onChange={(e) => setForm({ ...form, distributorIds: [...e.target.selectedOptions].map((o) => o.value) })}>
            {boot.distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {form.partyTypes.includes("MANUAL") && (
        <div className={s.field}>{t("Which of my added numbers? (none ticked = all of them)", "कौन से जोड़े हुए नंबर? (कुछ नहीं चुना = सभी)")}
          {(boot.contactGroups ?? []).length === 0 ? <div className={s.muted}>{t("No numbers added yet — add them in the 📇 Contacts tab.", "अभी कोई नंबर नहीं जोड़ा — 📇 नंबर टैब में जोड़ें।")}</div> : (
            <div className={s.chips}>{(boot.contactGroups ?? []).map((g) => {
              const on = form.manualGroups.includes(g.name);
              return <button key={g.name} type="button" className={`${s.chip} ${on ? s.chipOn : ""}`} onClick={() => setForm({ ...form, manualGroups: on ? form.manualGroups.filter((x) => x !== g.name) : [...form.manualGroups, g.name] })}>{on ? "✓ " : ""}{groupLabel(g.name, t)} <span style={{ opacity: 0.7 }}>{g.count}</span></button>;
            })}</div>
          )}
        </div>
      )}
      {form.partyTypes.length > 0 && (
        <div className={s.chips}>
          <button type="button" className={`${s.chip} ${form.areaMode === "include" ? s.chipOn : ""}`} onClick={() => setForm({ ...form, areaMode: "include" })}>{form.areaMode === "include" ? "✓ " : ""}{t("Only the areas I tick", "सिर्फ़ चुने इलाकों को")}</button>
          <button type="button" className={`${s.chip} ${form.areaMode === "exclude" ? s.chipOn : ""}`} onClick={() => setForm({ ...form, areaMode: "exclude" })}>{form.areaMode === "exclude" ? "✓ " : ""}{t("Everyone except the areas I tick", "चुने इलाकों को छोड़कर सबको")}</button>
        </div>
      )}
      {form.partyTypes.length > 0 && <AreaPicker areas={areas} selected={form.areaKeys} exclude={form.areaMode === "exclude"} onChange={(areaKeys) => setForm({ ...form, areaKeys })} t={t} />}
      {preview && <div className={s.ok}>👥 <b>{preview.total - preview.optedOut}</b> {t("will receive it", "को जाएगा")} {Object.entries(preview.byType).map(([k, v]) => `· ${PARTY[k as keyof typeof PARTY]?.[hi ? 1 : 0] ?? k} ${v}`).join(" ")}{preview.optedOut ? ` · ${preview.optedOut} ${t("opted out (skipped)", "STOP किए (छोड़े जाएँगे)")}` : ""}
        {preview.byArea && Object.keys(preview.byArea).length > 1 && <div className={s.muted} style={{ marginTop: 4 }}>📍 {Object.entries(preview.byArea).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(" · ")}{Object.keys(preview.byArea).length > 12 ? " …" : ""}</div>}</div>}
      {tpl && tpl.variableNames.map((v, i) => {
        const m = form.variableMap[i] ?? { variable: v, source: "CUSTOM" as VariableSource };
        const set = (patch: Partial<VariableMapping>) => setForm({ ...form, variableMap: form.variableMap.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        return (
          <div key={v} className={s.row}>
            <b style={{ minWidth: 70 }}>{`{{${v}}}`}</b>
            <select className={s.select} style={{ maxWidth: 280 }} value={m.source} onChange={(e) => set({ source: e.target.value as VariableSource })}>
              {Object.entries(VARIABLE_SOURCES).map(([k, l]) => <option key={k} value={k}>{hi ? l.hi : l.en}</option>)}
            </select>
            {m.source === "CUSTOM" && <input className={s.input} style={{ flex: 1, minWidth: 180 }} value={m.value ?? ""} onChange={(e) => set({ value: e.target.value })} placeholder={t("Text for everyone, e.g. 10% off on 5 cases", "सबके लिए टेक्स्ट, जैसे 5 पेटी पर 10% छूट")} />}
            {m.source === "AREA_TEXT" && <AreaTextEditor mapping={m} areas={areas} selected={form.areaKeys} onChange={(patch) => set(patch)} t={t} />}
          </div>
        );
      })}
      {mediaHeader && <label className={s.field}>{t(`${tpl!.headerFormat} header — public https link`, `${tpl!.headerFormat} हेडर — पब्लिक https लिंक`)}<input className={s.input} value={form.headerMediaUrl} onChange={(e) => setForm({ ...form, headerMediaUrl: e.target.value })} placeholder="https://…" /></label>}
      {tpl && <div><div className={s.muted}>{t("Preview", "झलक")}</div><div className={s.bubble}>{livePreview}</div>
        {preview?.sample?.length ? <div style={{ marginTop: 8, display: "grid", gap: 6 }}><div className={s.muted}>{t("Real examples — one per area", "असली उदाहरण — हर इलाके का एक")}</div>
          {preview.sample.map((x, i) => <div key={i} className={s.muted} style={{ borderLeft: "3px solid #25d366", paddingLeft: 8 }}><b>{x.area || "—"}</b> · {x.name}: {x.text}</div>)}</div> : null}</div>}
      <div className={s.switch}>
        <label className={s.row}><input type="checkbox" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.checked })} /> <b>{t("Repeat every", "हर")}</b></label>
        <div className={s.row}><input className={s.input} style={{ width: 80 }} type="number" min={1} max={90} value={form.repeatEveryDays} disabled={!form.repeat} onChange={(e) => setForm({ ...form, repeatEveryDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })} /> {t("days", "दिन में दोहराएँ")}
          {[3, 4, 5, 7].map((d) => <button key={d} type="button" className={`${s.chip} ${form.repeat && form.repeatEveryDays === d ? s.chipOn : ""}`} onClick={() => setForm({ ...form, repeat: true, repeatEveryDays: d })}>{t(`${d} days`, `${d} दिन`)}</button>)}</div>
      </div>
      <label className={s.field}>{t("Start at (empty = now)", "कब शुरू करें (खाली = अभी)")}<input className={s.input} type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></label>
      <div className={s.card} style={{ background: "#f8fafc" }}>
        <b>🧪 {t("Test on your own phone first", "पहले अपने फ़ोन पर टेस्ट करें")}</b>
        <div className={s.row}><input className={s.input} style={{ maxWidth: 220 }} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="98XXXXXXXX" inputMode="tel" />
          <button type="button" className={s.btnGhost} disabled={busy || !tpl || !testPhone} onClick={() => run(() => api({ action: "test_send", phone: testPhone, campaign: { ...payload(), name: form.name || "Test" } }), t("Test sent — check WhatsApp ✓", "टेस्ट भेजा — व्हाट्सऐप देखें ✓"))}>{t("Send test", "टेस्ट भेजें")}</button></div>
      </div>
      <div className={s.row}>
        <button type="button" className={s.btn} disabled={busy || !tpl} onClick={() => run(() => save(true), form.startAt ? t("Campaign scheduled ✓", "कैंपेन तय हो गया ✓") : t("Campaign started — sending in the next few minutes ✓", "कैंपेन शुरू — अगले कुछ मिनट में जाएगा ✓"))}>🚀 {form.startAt ? t("Schedule", "समय तय करें") : t("Start now", "अभी शुरू करें")}</button>
        <button type="button" className={s.btnGhost} disabled={busy || !tpl} onClick={() => run(() => save(false), t("Saved as draft", "ड्राफ़्ट सेव हुआ"))}>{t("Save draft", "ड्राफ़्ट सेव करें")}</button>
        <button type="button" className={s.btnGhost} onClick={() => setForm(null)}>{t("Back", "वापस")}</button>
      </div>
    </div>
  );

  return (
    <>
      <div className={s.row}><button type="button" className={s.btn} onClick={() => setForm({ ...emptyForm })}>＋ {t("New campaign", "नया कैंपेन")}</button></div>
      {boot.campaigns.length === 0 && <div className={s.card}><div className={s.muted}>{t("No campaigns yet.", "अभी कोई कैंपेन नहीं।")}</div></div>}
      {boot.campaigns.map((c) => {
        const delivered = (c.stats.DELIVERED ?? 0) + (c.stats.READ ?? 0);
        const sent = (c.stats.SENT ?? 0) + delivered;
        return (
          <div key={c.id} className={s.card}>
            <div className={s.row} style={{ justifyContent: "space-between" }}>
              <div><h3>{c.name}</h3><div className={s.muted}>{c.templateName} · {c.audience.partyTypes.map((k) => PARTY[k as keyof typeof PARTY]?.[hi ? 1 : 0] ?? k).join(", ")}{c.audience.areaKeys?.length ? ` · 📍 ${t(`${c.audience.areaKeys.length} area(s)`, `${c.audience.areaKeys.length} इलाके`)}` : c.audience.excludeAreaKeys?.length ? ` · 📍 ${t(`all except ${c.audience.excludeAreaKeys.length} area(s)`, `${c.audience.excludeAreaKeys.length} इलाके छोड़कर सब`)}` : ` · 📍 ${t("all areas", "सभी इलाके")}`}{c.repeatEveryDays ? ` · 🔁 ${t(`every ${c.repeatEveryDays} days`, `हर ${c.repeatEveryDays} दिन`)}` : ""}</div></div>
              <span className={`${s.pill} ${pill(c.status)}`}>{c.status}</span>
            </div>
            <div className={s.muted}>{t("Runs", "बार चला")}: {c.runCount} · {t("Last", "पिछला")}: {fmt(c.lastRunAt)} · {t("Next", "अगला")}: {fmt(c.nextRunAt)}</div>
            <div className={s.row}>
              <span className={s.pill}>⏳ {c.stats.QUEUED ?? 0} {t("queued", "कतार")}</span>
              <span className={`${s.pill} ${s.pillGreen}`}>✓ {sent} {t("sent", "भेजे")}</span>
              <span className={`${s.pill} ${s.pillGreen}`}>✓✓ {delivered} {t("delivered", "पहुँचे")}</span>
              <span className={`${s.pill} ${s.pillGreen}`}>👁 {c.stats.READ ?? 0} {t("read", "पढ़े")}</span>
              <span className={`${s.pill} ${s.pillRed}`}>✗ {c.stats.FAILED ?? 0} {t("failed", "फ़ेल")}</span>
              <span className={s.pill}>↷ {c.stats.SKIPPED ?? 0} {t("skipped", "छोड़े")}</span>
            </div>
            {c.lastRunSummary?.error && <div className={s.err}>{c.lastRunSummary.error}</div>}
            <div className={s.row}>
              {["DRAFT", "PAUSED"].includes(c.status) && <button type="button" className={s.btn} disabled={busy} onClick={() => run(() => api({ action: "schedule", id: c.id }), t("Started ✓", "शुरू हुआ ✓"))}>▶ {c.status === "PAUSED" ? t("Resume", "फिर चालू") : t("Start now", "अभी शुरू")}</button>}
              {["DRAFT", "PAUSED"].includes(c.status) && <button type="button" className={s.btnGhost} onClick={() => setForm({ ...emptyForm, id: c.id, name: c.name, templateKey: `${c.templateName}|${c.language}`, partyTypes: c.audience.partyTypes, distributorIds: c.audience.distributorIds ?? [], areaKeys: c.audience.areaKeys ?? c.audience.excludeAreaKeys ?? [], areaMode: c.audience.excludeAreaKeys?.length ? "exclude" : "include", manualGroups: c.audience.manualGroups ?? [], variableMap: c.variableMap ?? [], headerMediaUrl: c.headerMediaUrl ?? "", repeat: !!c.repeatEveryDays, repeatEveryDays: c.repeatEveryDays ?? 7 })}>✎ {t("Edit", "बदलें")}</button>}
              {c.status === "SCHEDULED" && <button type="button" className={s.btnGhost} disabled={busy} onClick={() => run(() => api({ action: "campaign_state", id: c.id, state: "PAUSE" }), t("Paused", "रोका गया"))}>⏸ {t("Pause", "रोकें")}</button>}
              {!["CANCELLED", "COMPLETED"].includes(c.status) && <button type="button" className={s.btnDanger} disabled={busy} onClick={() => confirm(t("Cancel this campaign? Messages not yet sent will be dropped.", "यह कैंपेन रद्द करें? जो मैसेज नहीं गए वो नहीं जाएँगे।")) && run(() => api({ action: "campaign_state", id: c.id, state: "CANCEL" }), t("Cancelled", "रद्द हुआ"))}>✕ {t("Cancel", "रद्द करें")}</button>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// Area-wise audience: tick whole states or single cities. Nothing ticked = every area.
function AreaPicker({ areas, selected, exclude = false, onChange, t }: { areas: AreaGroup[] | null; selected: string[]; exclude?: boolean; onChange: (keys: string[]) => void; t: T }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!areas) return <div className={s.muted}>📍 {t("Loading areas…", "इलाके लोड हो रहे हैं…")}</div>;
  const sel = new Set(selected);
  const term = q.trim().toLowerCase();
  const toggle = (key: string, extraRemove: string[] = []) => {
    const next = new Set(sel);
    extraRemove.forEach((k) => next.delete(k));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };
  const total = areas.reduce((n, g) => n + g.total, 0);
  return (
    <div className={s.card} style={{ background: "#f8fafc" }}>
      <div className={s.row} style={{ justifyContent: "space-between" }}>
        <b>📍 {exclude ? t("Which areas should NOT get it?", "किन इलाकों को नहीं भेजना?") : t("Area-wise — which cities?", "इलाके के हिसाब से — कौन से शहर?")}</b>
        <button type="button" className={`${s.chip} ${selected.length === 0 ? s.chipOn : ""}`} onClick={() => onChange([])}>{selected.length === 0 ? "✓ " : ""}{exclude ? t("Skip none", "कोई नहीं छोड़ना") : t(`All areas (${total})`, `सभी इलाके (${total})`)}</button>
      </div>
      <div className={s.muted}>{t("Tick a whole state or single cities. Every message still carries that shop's own city name.", "पूरा राज्य या अलग-अलग शहर चुनें। हर मैसेज में उस दुकान का अपना शहर ही जाएगा।")}</div>
      {areas.length > 3 || areas.some((g) => g.cities.length > 8) ? <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search city…", "शहर खोजें…")} /> : null}
      {areas.map((g) => {
        const cities = g.cities.filter((c) => !term || c.city.toLowerCase().includes(term) || g.state.toLowerCase().includes(term));
        if (!cities.length) return null;
        const wholeState = sel.has(g.stateKey);
        const expanded = open[g.stateKey] ?? (term !== "" || g.cities.length <= 12);
        const shown = expanded ? cities : cities.slice(0, 12);
        return (
          <div key={g.stateKey} style={{ display: "grid", gap: 6, paddingTop: 6, borderTop: "1px solid #e2e8f0" }}>
            <label className={s.row} style={{ fontWeight: 800 }}>
              <input type="checkbox" checked={wholeState} onChange={() => toggle(g.stateKey, g.cities.map((c) => c.key))} />
              {g.state} <span className={s.muted}>({g.total} · {g.cities.length} {t("cities", "शहर")})</span>
            </label>
            <div className={s.chips}>
              {shown.map((c) => {
                const on = wholeState || sel.has(c.key);
                return (
                  <button key={c.key} type="button" disabled={wholeState} className={`${s.chip} ${on ? s.chipOn : ""}`} onClick={() => toggle(c.key)} title={c.optedOut ? `${c.optedOut} STOP` : undefined}>
                    {on ? "✓ " : ""}{c.city} <span style={{ opacity: 0.7 }}>{c.count}</span>
                  </button>
                );
              })}
              {!expanded && cities.length > 12 && <button type="button" className={s.btnGhost} onClick={() => setOpen({ ...open, [g.stateKey]: true })}>+{cities.length - 12} {t("more", "और")}</button>}
            </div>
          </div>
        );
      })}
      {areas.some((g) => g.cities.some((c) => c.city === "City not known")) && (
        <div className={s.muted}>ℹ️ {t("'City not known' = shops saved without a city, distributor or territory. Ask executives to tap 📍 'Fill address from my location' when adding shops.", "'शहर नहीं पता' = ऐसी दुकानें जिनमें शहर / डिस्ट्रीब्यूटर / टेरिटरी नहीं है। दुकान जोड़ते समय 📍 'मेरी लोकेशन से पता भरें' दबवाएँ।")}</div>
      )}
    </div>
  );
}

// AREA_TEXT variable: one text per chosen state / city, plus a fallback for everywhere else.
function AreaTextEditor({ mapping, areas, selected, onChange, t }: { mapping: VariableMapping; areas: AreaGroup[] | null; selected: string[]; onChange: (patch: Partial<VariableMapping>) => void; t: T }) {
  const values = mapping.areaValues ?? {};
  const rows: { key: string; label: string }[] = [];
  for (const g of areas ?? []) {
    if (!selected.length || selected.includes(g.stateKey)) rows.push({ key: g.stateKey, label: `${g.state} — ${t("whole state", "पूरा राज्य")}` });
    for (const c of g.cities) if (selected.length ? selected.includes(c.key) : g.cities.length > 1) rows.push({ key: c.key, label: `${c.city} (${c.count})` });
  }
  const setValue = (key: string, v: string) => {
    const next = { ...values, [key]: v };
    if (!v.trim()) delete next[key];
    onChange({ areaValues: next });
  };
  return (
    <div style={{ flex: "1 1 100%", display: "grid", gap: 6, padding: 10, border: "1px dashed #cbd5e1", borderRadius: 10 }}>
      <div className={s.muted}>{t("City text beats state text; anything left empty uses the fallback.", "शहर का टेक्स्ट राज्य से ऊपर; खाली छोड़ा तो नीचे वाला टेक्स्ट जाएगा।")}</div>
      {rows.slice(0, 60).map((r) => (
        <label key={r.key} className={s.row}>
          <span style={{ minWidth: 170, fontSize: 13, fontWeight: r.key.startsWith("state:") ? 800 : 600 }}>{r.label}</span>
          <input className={s.input} style={{ flex: 1, minWidth: 180 }} value={values[r.key] ?? ""} onChange={(e) => setValue(r.key, e.target.value)} placeholder={t("e.g. free delivery from Sahu Kirana", "जैसे साहू किराना से फ्री डिलीवरी")} />
        </label>
      ))}
      <label className={s.row}>
        <span style={{ minWidth: 170, fontSize: 13, fontWeight: 800 }}>{t("All other areas *", "बाकी सभी इलाके *")}</span>
        <input className={s.input} style={{ flex: 1, minWidth: 180 }} value={mapping.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} placeholder={t("Text for every other area", "बाकी सब इलाकों के लिए टेक्स्ट")} />
      </label>
    </div>
  );
}

type Contact = { id: string; phone: string; name: string | null; businessName: string | null; city: string | null; state: string | null; groupName: string | null; notes: string | null; optedOut: boolean; createdAt: string };
const emptyContact = { id: undefined as string | undefined, phone: "", name: "", businessName: "", city: "", state: "", groupName: "", notes: "" };

// Numbers added by hand (expo leads, new wholesalers, a list from a distributor…). They can be
// sent campaigns like any retailer: choose "Numbers I added" in a campaign, optionally by group.
function Contacts({ t, onChange, onSendToGroup }: { t: T; onChange: () => void; onSendToGroup: (group: string | null) => void }) {
  const [data, setData] = useState<{ total: number; contacts: Contact[]; groups: { name: string; count: number }[] } | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [form, setForm] = useState({ ...emptyContact });
  const [bulk, setBulk] = useState({ text: "", groupName: "", city: "", state: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; invalid?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api({ action: "contacts", q: q || undefined, group: group || undefined })); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, [q, group]);
  useEffect(() => { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h); }, [load]);
  const act = async (fn: () => Promise<{ text: string; invalid?: string[] }>) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, ...r }); await load(); onChange(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const groups = data?.groups ?? [];
  const groupNames = groups.map((g) => g.name).filter((g) => g !== NO_GROUP);
  const saveOne = () => act(async () => {
    const { id, ...contact } = form;
    await api({ action: "save_contact", id, contact });
    setForm({ ...emptyContact, groupName: form.groupName });
    return { text: id ? t("Number updated ✓", "नंबर बदला ✓") : t("Number added ✓", "नंबर जुड़ गया ✓") };
  });
  const importBulk = () => act(async () => {
    const r = await api<{ added: number; updated: number; invalid: string[] }>({ action: "import_contacts", text: bulk.text, groupName: bulk.groupName || null, city: bulk.city || null, state: bulk.state || null });
    setBulk({ ...bulk, text: "" });
    return { text: t(`${r.added} added, ${r.updated} already there (updated)${r.invalid.length ? `, ${r.invalid.length} lines had no valid number` : ""}`, `${r.added} जुड़े, ${r.updated} पहले से थे (अपडेट)${r.invalid.length ? `, ${r.invalid.length} लाइनों में सही नंबर नहीं` : ""}`), invalid: r.invalid };
  });
  const bulkCount = bulk.text.split(/\r?\n/).filter((l) => l.replace(/\D/g, "").length >= 10).length;
  return (
    <>
      {msg && <div className={msg.ok ? s.ok : s.err}>{msg.text}{msg.invalid?.length ? <div className={s.muted}>{msg.invalid.slice(0, 8).join(" · ")}{msg.invalid.length > 8 ? " …" : ""}</div> : null}</div>}
      <datalist id="wa-contact-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
      <div className={s.card}>
        <h3>{form.id ? `✎ ${t("Edit number", "नंबर बदलें")}` : `＋ ${t("Add a number", "नंबर जोड़ें")}`}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
          <label className={s.field}>{t("Mobile / WhatsApp *", "मोबाइल / व्हाट्सऐप *")}<input className={s.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" inputMode="tel" /></label>
          <label className={s.field}>{t("Name", "नाम")}<input className={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Ramesh Sharma", "रमेश शर्मा")} /></label>
          <label className={s.field}>{t("Shop / firm", "दुकान / फ़र्म")}<input className={s.input} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></label>
          <label className={s.field}>{t("City", "शहर")}<input className={s.input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Gangapur" /></label>
          <label className={s.field}>{t("State", "राज्य")}<input className={s.input} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Rajasthan / UP" /></label>
          <label className={s.field}>{t("Group (optional)", "ग्रुप (ज़रूरी नहीं)")}<input className={s.input} list="wa-contact-groups" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} placeholder={t("e.g. Expo leads", "जैसे मेला लीड")} /></label>
        </div>
        <div className={s.row}>
          <button type="button" className={s.btn} disabled={busy || form.phone.replace(/\D/g, "").length < 10} onClick={saveOne}>{form.id ? t("Save", "सेव करें") : t("Add number", "नंबर जोड़ें")}</button>
          {form.id && <button type="button" className={s.btnGhost} onClick={() => setForm({ ...emptyContact })}>{t("Cancel", "रद्द")}</button>}
        </div>
      </div>
      <div className={s.card}>
        <h3>📋 {t("Add many at once (paste)", "एक साथ कई नंबर (पेस्ट करें)")}</h3>
        <div className={s.muted}>{t("One per line: number, name, shop, city, state — only the number is required. Copy straight from Excel / Google Sheets works too.", "हर लाइन में एक: नंबर, नाम, दुकान, शहर, राज्य — सिर्फ़ नंबर ज़रूरी है। Excel / Google Sheet से सीधे कॉपी भी चलेगा।")}</div>
        <textarea className={s.textarea} rows={6} value={bulk.text} onChange={(e) => setBulk({ ...bulk, text: e.target.value })} placeholder={"9876543210, Ramesh, Sharma Store, Gangapur, Rajasthan\n9812345678, Suresh, , Jhansi, UP\n9900112233"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
          <label className={s.field}>{t("Put them in group", "इन्हें ग्रुप में डालें")}<input className={s.input} list="wa-contact-groups" value={bulk.groupName} onChange={(e) => setBulk({ ...bulk, groupName: e.target.value })} placeholder={t("e.g. Jhansi wholesalers", "जैसे झाँसी थोक")} /></label>
          <label className={s.field}>{t("City for lines without one", "जिन लाइनों में शहर नहीं")}<input className={s.input} value={bulk.city} onChange={(e) => setBulk({ ...bulk, city: e.target.value })} /></label>
          <label className={s.field}>{t("State for lines without one", "जिन लाइनों में राज्य नहीं")}<input className={s.input} value={bulk.state} onChange={(e) => setBulk({ ...bulk, state: e.target.value })} /></label>
        </div>
        <div className={s.row}><button type="button" className={s.btn} disabled={busy || !bulk.text.trim()} onClick={importBulk}>⬆ {t(`Add ${bulkCount || ""} numbers`, `${bulkCount || ""} नंबर जोड़ें`)}</button></div>
        <div className={s.muted}>⚠️ {t("Only add people who agreed to hear from Seera — numbers that report or block lower the WhatsApp number's quality rating.", "सिर्फ़ उन्हीं को जोड़ें जो Seera से मैसेज लेने को राज़ी हों — रिपोर्ट / ब्लॉक होने से व्हाट्सऐप नंबर की रेटिंग गिरती है।")}</div>
      </div>
      <div className={s.card}>
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <h3>📇 {t("My numbers", "मेरे नंबर")} ({data?.total ?? "…"})</h3>
          <button type="button" className={s.btn} disabled={!data?.total} onClick={() => onSendToGroup(group || null)}>📣 {group ? t(`Send campaign to “${groupLabel(group, t)}”`, `“${groupLabel(group, t)}” को कैंपेन भेजें`) : t("Send campaign to these numbers", "इन नंबरों को कैंपेन भेजें")}</button>
        </div>
        <div className={s.chips}>
          <button type="button" className={`${s.chip} ${!group ? s.chipOn : ""}`} onClick={() => setGroup("")}>{t("All", "सभी")}</button>
          {groups.map((g) => <button key={g.name} type="button" className={`${s.chip} ${group === g.name ? s.chipOn : ""}`} onClick={() => setGroup(g.name)}>{groupLabel(g.name, t)} <span style={{ opacity: 0.7 }}>{g.count}</span></button>)}
        </div>
        <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name / shop / city / number", "नाम / दुकान / शहर / नंबर खोजें")} />
        {picked.length > 0 && <div className={s.row}><button type="button" className={s.btnDanger} disabled={busy} onClick={() => confirm(t(`Delete ${picked.length} number(s)?`, `${picked.length} नंबर हटाएँ?`)) && act(async () => { const r = await api<{ deleted: number }>({ action: "delete_contacts", ids: picked }); setPicked([]); return { text: t(`${r.deleted} deleted`, `${r.deleted} हटाए`) }; })}>🗑 {t(`Delete ${picked.length} selected`, `${picked.length} चुने हुए हटाएँ`)}</button></div>}
        {data && data.contacts.length === 0 ? <div className={s.muted}>{t("No numbers yet.", "अभी कोई नंबर नहीं।")}</div> : (
          <table className={s.table}><thead><tr><th><input type="checkbox" checked={!!data?.contacts.length && picked.length === data.contacts.length} onChange={(e) => setPicked(e.target.checked ? (data?.contacts ?? []).map((c) => c.id) : [])} /></th><th>{t("Name / shop", "नाम / दुकान")}</th><th>{t("Number", "नंबर")}</th><th>{t("City", "शहर")}</th><th>{t("Group", "ग्रुप")}</th><th /></tr></thead>
            <tbody>{data?.contacts.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} /></td>
                <td><b>{c.businessName || c.name || "—"}</b>{c.businessName && c.name ? <div className={s.muted}>{c.name}</div> : null}</td>
                <td>+{c.phone}{c.optedOut && <span className={`${s.pill} ${s.pillRed}`} style={{ marginLeft: 6 }}>STOP</span>}</td>
                <td>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                <td>{c.groupName ?? "—"}</td>
                <td><button type="button" className={s.btnGhost} onClick={() => { setForm({ id: c.id, phone: c.phone.slice(2), name: c.name ?? "", businessName: c.businessName ?? "", city: c.city ?? "", state: c.state ?? "", groupName: c.groupName ?? "", notes: c.notes ?? "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>✎</button></td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
    </>
  );
}

function Inbox({ t, onChange }: { t: T; onChange: () => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const loadThreads = useCallback(async () => { try { setThreads((await api<{ threads: Thread[] }>({ action: "threads", q })).threads); } catch (e) { setErr((e as Error).message); } }, [q]);
  const open = async (phone: string) => { try { setActive(await api<ThreadDetail>({ action: "thread", phone })); setErr(null); void loadThreads(); onChange(); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { void loadThreads(); const h = setInterval(() => void loadThreads(), 20_000); return () => clearInterval(h); }, [loadThreads]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    try { await api({ action: "reply", phone: active.phone, text: reply }); setReply(""); await open(active.phone); } catch (e) { setErr((e as Error).message); }
  };
  const toggleOpt = async () => { if (!active) return; try { await api({ action: "opt_out", phone: active.phone, optOut: !active.optedOut }); await open(active.phone); } catch (e) { setErr((e as Error).message); } };

  return (
    <div className={s.card}>
      {err && <div className={s.err}>{err}</div>}
      <div className={s.inbox}>
        <div className={s.threads}>
          <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name / number", "नाम / नंबर खोजें")} />
          {threads?.length === 0 && <div className={s.muted}>{t("No replies yet. When a retailer or distributor answers a message, it shows up here.", "अभी कोई जवाब नहीं। जब कोई रिटेलर या डिस्ट्रीब्यूटर जवाब देगा, यहाँ दिखेगा।")}</div>}
          {threads?.map((th) => (
            <button key={th.phone} type="button" className={`${s.thread} ${active?.phone === th.phone ? s.threadOn : ""}`} onClick={() => open(th.phone)}>
              <div className={s.row} style={{ justifyContent: "space-between" }}><b>{th.name ?? `+${th.phone}`}</b>{th.unread > 0 && <span className={s.badge}>{th.unread}</span>}</div>
              <span className={s.muted}>{th.partyType ?? t("Unknown number", "अनजान नंबर")} · +{th.phone}{th.optedOut ? " · STOP" : ""}</span>
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.lastText}</span>
              <span className={s.muted}>{fmt(th.lastAt)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {!active ? <div className={s.muted}>{t("Choose a conversation", "बातचीत चुनें")}</div> : (
            <>
              <div className={s.row} style={{ justifyContent: "space-between" }}>
                <div><b>{active.partyName ?? `+${active.phone}`}</b><div className={s.muted}>+{active.phone}</div></div>
                <button type="button" className={active.optedOut ? s.btnGhost : s.btnDanger} onClick={toggleOpt}>{active.optedOut ? t("Allow messages again", "फिर से मैसेज चालू") : t("Stop campaigns to this number", "इस नंबर पर कैंपेन बंद")}</button>
              </div>
              {active.optedOut && <div className={s.warn}>{t("This number has opted out — campaigns skip it.", "इस नंबर ने STOP किया है — कैंपेन इसे छोड़ देंगे।")}</div>}
              <div className={s.chat}>
                {active.messages.map((m) => (
                  <div key={m.id} className={m.direction === "IN" ? s.msgIn : s.msgOut}>{m.text ?? "—"}<div className={s.msgMeta}>{fmt(m.at)}{m.direction === "OUT" && m.status ? ` · ${m.status}` : ""}</div></div>
                ))}
              </div>
              {active.templatesSent.length > 0 && <div className={s.muted}>{t("Campaign messages to this number", "इस नंबर पर कैंपेन मैसेज")}: {active.templatesSent.slice(0, 5).map((x) => `${x.template} (${x.status}, ${fmt(x.at)})`).join(" · ")}</div>}
              {active.canReply ? (
                <div className={s.row}>
                  <textarea className={s.textarea} style={{ flex: 1 }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("Type a reply…", "जवाब लिखें…")} />
                  <button type="button" className={s.btn} disabled={!reply.trim()} onClick={send}>➤ {t("Send", "भेजें")}</button>
                </div>
              ) : <div className={s.warn}>{t("More than 24 hours since their last message — WhatsApp only allows an approved template now. Use a campaign / test send.", "उनके आख़िरी मैसेज को 24 घंटे से ज़्यादा हो गए — अब सिर्फ़ मंज़ूर टेम्पलेट भेज सकते हैं।")}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ boot, t, busy, run }: { boot: Boot; t: T; busy: boolean; run: Run }) {
  const st = boot.settings;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [perr, setPerr] = useState<string | null>(null);
  const [optOuts, setOptOuts] = useState<{ phone: string; source: string; reason: string | null; createdAt: string }[] | null>(null);
  const [newOpt, setNewOpt] = useState("");
  const save = (patch: Partial<Settings>, ok?: string) => run(() => api({ action: "settings", patch }), ok ?? t("Saved ✓", "सेव हुआ ✓"));
  const loadOpt = async () => setOptOuts((await api<{ optOuts: typeof optOuts }>({ action: "opt_outs" })).optOuts);
  useEffect(() => { void loadOpt().catch(() => undefined); }, []);
  const checkProfile = async () => { setPerr(null); try { setProfile((await api<{ profile: Profile }>({ action: "phone_profile" })).profile); } catch (e) { setPerr((e as Error).message); } };

  return (
    <>
      <div className={s.card}>
        <h3>🔌 {t("Sending", "भेजना")}</h3>
        <div className={s.switch}>
          <div><b>{st.sendEnabled ? t("Sending is ON", "भेजना चालू है") : t("Sending is OFF", "भेजना बंद है")}</b><div className={s.muted}>{t("Master switch for all campaigns. Test sends always work.", "सभी कैंपेन का मुख्य स्विच। टेस्ट हमेशा चलता है।")}</div></div>
          <button type="button" className={st.sendEnabled ? s.btnDanger : s.btn} disabled={busy} onClick={() => (st.sendEnabled || confirm(t("Turn sending ON? Running campaigns will start going out.", "भेजना चालू करें? चालू कैंपेन जाने लगेंगे।"))) && save({ sendEnabled: !st.sendEnabled })}>{st.sendEnabled ? t("Turn OFF", "बंद करें") : t("Turn ON", "चालू करें")}</button>
        </div>
        <div className={s.switch}>
          <div><b>{t("Quiet hours (IST)", "शांत समय (IST)")}</b><div className={s.muted}>{t("Nothing is sent in this window; it waits until the morning.", "इस समय कुछ नहीं जाता; सुबह तक रुकता है।")}</div></div>
          <div className={s.row}>
            <input type="checkbox" checked={st.quietHoursEnabled} onChange={(e) => save({ quietHoursEnabled: e.target.checked })} />
            <input className={s.input} style={{ width: 110 }} type="time" defaultValue={hhmm(st.quietStartMinute)} onBlur={(e) => save({ quietStartMinute: toMin(e.target.value) })} />
            <span>→</span>
            <input className={s.input} style={{ width: 110 }} type="time" defaultValue={hhmm(st.quietEndMinute)} onBlur={(e) => save({ quietEndMinute: toMin(e.target.value) })} />
          </div>
        </div>
        <div className={s.switch}>
          <div><b>{t("Gap between marketing messages", "मार्केटिंग मैसेज के बीच गैप")}</b><div className={s.muted}>{t("A party gets at most one offer/scheme message in this many days. Utility messages are not limited.", "एक पार्टी को इतने दिनों में एक ही ऑफ़र/स्कीम मैसेज। यूटिलिटी पर रोक नहीं।")}</div></div>
          <div className={s.row}><input className={s.input} style={{ width: 80 }} type="number" min={0} max={30} defaultValue={st.marketingGapDays} onBlur={(e) => save({ marketingGapDays: Number(e.target.value) || 0 })} /> {t("days", "दिन")}</div>
        </div>
      </div>

      <div className={s.card}>
        <h3>🏷️ {t("Business name on WhatsApp", "व्हाट्सऐप पर बिज़नेस नाम")}</h3>
        <div className={s.muted}>{t("Partners see only the number until Meta approves the display name. Check its live status:", "Meta डिस्प्ले नाम मंज़ूर करने तक पार्टनर को सिर्फ़ नंबर दिखता है। अभी की स्थिति देखें:")}</div>
        <div className={s.row}><button type="button" className={s.btnGhost} onClick={checkProfile}>🔍 {t("Check number status", "नंबर की स्थिति देखें")}</button></div>
        {perr && <div className={s.err}>{perr}</div>}
        {profile && (
          <table className={s.table}><tbody>
            <tr><th>{t("Number", "नंबर")}</th><td>{profile.displayPhoneNumber ?? "—"}</td></tr>
            <tr><th>{t("Display name", "डिस्प्ले नाम")}</th><td><b>{profile.verifiedName ?? "—"}</b></td></tr>
            <tr><th>{t("Name status", "नाम की स्थिति")}</th><td><span className={`${s.pill} ${profile.nameStatus === "APPROVED" ? s.pillGreen : profile.nameStatus?.includes("DECLINED") ? s.pillRed : s.pillAmber}`}>{profile.nameStatus ?? "—"}</span></td></tr>
            <tr><th>{t("Requested new name", "माँगा गया नया नाम")}</th><td><b>{profile.newDisplayName ?? "—"}</b></td></tr>
            <tr><th>{t("New name review", "नए नाम की समीक्षा")}</th><td>{profile.newNameStatus ? <span className={`${s.pill} ${profile.newNameStatus === "APPROVED" ? s.pillGreen : profile.newNameStatus.includes("DECLINED") || profile.newNameStatus.includes("REJECT") ? s.pillRed : s.pillAmber}`}>{profile.newNameStatus}</span> : "—"}</td></tr>
            <tr><th>{t("Quality", "गुणवत्ता")}</th><td>{profile.qualityRating ?? "—"}</td></tr>
            <tr><th>{t("Daily limit tier", "रोज़ की सीमा")}</th><td>{profile.messagingLimitTier ?? "—"}</td></tr>
            <tr><th>{t("Green tick", "ग्रीन टिक")}</th><td>{profile.isOfficialBusinessAccount ? "✓" : "—"}</td></tr>
          </tbody></table>
        )}
        {profile?.newNameStatus === "APPROVED" && profile.newDisplayName !== profile.verifiedName && <div className={s.warn}>{t("The new name is approved but not live yet — the number must be re-registered on the Cloud API for it to show.", "नया नाम मंज़ूर है पर अभी लागू नहीं — दिखाने के लिए नंबर को Cloud API पर दोबारा रजिस्टर करना होगा।")}</div>}
        <ol className={s.steps}>
          <li>{t("Open business.facebook.com → WhatsApp Manager → Phone numbers → Seera's number → Profile.", "business.facebook.com → WhatsApp Manager → Phone numbers → सीरा का नंबर → Profile खोलें।")}</li>
          <li>{t("Display name → Edit → enter the exact brand name (e.g. \"Seera Detergent\") — it must match your website / GST / packaging.", "Display name → Edit → ब्रांड का सही नाम (जैसे \"Seera Detergent\") — वेबसाइट / GST / पैकिंग से मेल खाना चाहिए।")}</li>
          <li>{t("Business portfolio must be verified (Security Centre → Business verification).", "बिज़नेस पोर्टफ़ोलियो वेरिफ़ाइड होना चाहिए (Security Centre → Business verification)।")}</li>
          <li>{t("After approval (usually 1–3 days) the name shows on every message. If DECLINED, fix the name per Meta's reason and resubmit.", "मंज़ूरी के बाद (आमतौर पर 1–3 दिन) हर मैसेज पर नाम दिखेगा। DECLINED हो तो Meta का कारण देखकर सुधारें और दोबारा भेजें।")}</li>
        </ol>
      </div>

      <div className={s.card}>
        <h3>🚫 {t("Opted-out numbers", "STOP किए नंबर")} ({optOuts?.length ?? 0})</h3>
        <div className={s.row}>
          <input className={s.input} style={{ maxWidth: 220 }} value={newOpt} onChange={(e) => setNewOpt(e.target.value)} placeholder="98XXXXXXXX" />
          <button type="button" className={s.btnGhost} disabled={!newOpt} onClick={() => run(async () => { await api({ action: "opt_out", phone: newOpt, optOut: true }); setNewOpt(""); await loadOpt(); }, t("Added", "जोड़ा गया"))}>{t("Add", "जोड़ें")}</button>
        </div>
        {optOuts?.map((o) => (
          <div key={o.phone} className={s.row} style={{ justifyContent: "space-between" }}>
            <span>+{o.phone} <span className={s.muted}>· {o.source === "STOP_REPLY" ? t("replied STOP", "STOP लिखा") : t("added by admin", "एडमिन ने जोड़ा")} · {fmt(o.createdAt)}</span></span>
            <button type="button" className={s.btnGhost} onClick={() => run(async () => { await api({ action: "opt_out", phone: o.phone, optOut: false }); await loadOpt(); })}>{t("Remove", "हटाएँ")}</button>
          </div>
        ))}
      </div>

      <div className={s.card}>
        <h3>🛠 {t("Server connection", "सर्वर कनेक्शन")}</h3>
        {boot.config.problems.length === 0 ? <div className={s.ok}>✓ {t("Everything is configured.", "सब सेट है।")}</div> : <div className={s.warn}><ul>{boot.config.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
        <div className={s.muted}>{t("Webhook URL to set in Meta App → WhatsApp → Configuration (subscribe to 'messages'):", "Meta App → WhatsApp → Configuration में यह Webhook URL लगाएँ ('messages' सब्सक्राइब करें):")} <code>https://www.seeradetergent.in/api/webhooks/whatsapp</code></div>
      </div>
    </>
  );
}
