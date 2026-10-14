import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { PrismaClient } from "@prisma/client";
import { PageHeading } from "@/components/seera/foundation/States";
import ws from "@/components/seera/foundation/Workspace.module.css";
import styles from "./MarketSurvey.module.css";
import { MarketSurveyForm } from "./MarketSurveyForm";
import { MarketSurveyActions } from "./MarketSurveyActions";
import {
  ACTION_OPTIONS,
  CONSENT_OPTIONS,
  CONSENT_SCOPE_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  ISSUE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  TRI_OPTIONS,
  WHATSAPP_STATE_LABELS,
  getMarketSurveyDetail,
  labelFor,
  listMarketSurveys,
  marketSurveyDashboard,
  type SurveyFilters,
} from "@/lib/sales-distribution/market-survey-service";

type Lang = "EN" | "HI";
const EXTRA_STATES: Record<string, [string, string]> = {
  SENT: ["Sent", "भेजा गया"],
  DELIVERED: ["Delivered", "पहुँचा"],
  READ: ["Read", "पढ़ा गया"],
  RETRYING: ["Failed, will retry", "विफल, फिर कोशिश होगी"],
  FAILED: ["Failed", "विफल"],
};
const waLabel = (state: string, language: Lang) => {
  const l = WHATSAPP_STATE_LABELS[state] ?? EXTRA_STATES[state];
  return l ? (language === "HI" ? l[1] : l[0]) : state;
};
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-");
const yesNo = (v: boolean | null | undefined, language: Lang) => (v === null || v === undefined ? "-" : v ? (language === "HI" ? "हाँ" : "Yes") : language === "HI" ? "नहीं" : "No");

export async function MarketSurveySection({
  db, userId, portal, slug, language, query,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  slug: string;
  language: Lang;
  query: Record<string, string | undefined>;
}) {
  const base = `/portal/${portal}/${slug}`;
  if (query.survey) return <SurveyDetail db={db} userId={userId} surveyId={query.survey} back={base} language={language} />;
  if (slug === "market-recovery") return <RecoveryDashboard db={db} userId={userId} base={base} portal={portal} language={language} query={query} />;

  const mine = await listMarketSurveys(db, userId, { staffId: userId }, 1);
  const own = mine.rows.slice(0, 10);
  return (
    <>
      <PageHeading
        title={language === "HI" ? "मार्केट सर्वे" : "Retailer market survey"}
        description={language === "HI" ? "रिटेलर के असली कारण दर्ज करें — दबाव नहीं, सच्ची जानकारी।" : "Record the retailer's real reasons — truthful market feedback, not pressure to order."}
      />
      <MarketSurveyForm
        language={language}
        options={{ relationship: RELATIONSHIP_OPTIONS, issues: ISSUE_OPTIONS, actions: ACTION_OPTIONS, tri: TRI_OPTIONS, consent: CONSENT_OPTIONS, consentScopes: CONSENT_SCOPE_OPTIONS, whatsappStates: WHATSAPP_STATE_LABELS }}
      />
      <h2 style={{ marginTop: 28 }}>{language === "HI" ? "मेरे हाल के सर्वे" : "My recent surveys"}</h2>
      {own.length ? (
        <div className={ws.stack}>
          {own.map((r) => (
            <Link key={r.id} href={`${base}?survey=${r.id}`} className={ws.card}>
              <strong>{r.shopName}</strong> · {r.market}
              <br />
              <small>
                {r.reference} · {fmt(r.createdAt)} · {waLabel(r.whatsapp, language)}
              </small>
            </Link>
          ))}
        </div>
      ) : (
        <p className={ws.empty}>{language === "HI" ? "अभी कोई सर्वे नहीं।" : "No surveys yet."}</p>
      )}
    </>
  );
}

async function RecoveryDashboard({ db, userId, base, portal, language, query }: { db: PrismaClient; userId: string; base: string; portal: string; language: Lang; query: Record<string, string | undefined> }) {
  const filters: SurveyFilters = { q: query.q, issue: query.issue, from: query.from, to: query.to, staffId: query.staff, willing: query.willing, consent: query.consent, status: query.status, market: query.market };
  const page = Math.max(1, Number(query.page) || 1);
  const [stats, list] = await Promise.all([marketSurveyDashboard(db, userId, filters), listMarketSurveys(db, userId, filters, page)]);
  const hi = language === "HI";
  const exportQuery = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const cards: [string, string, number][] = [
    ["Surveys submitted", "कुल सर्वे", stats.total],
    ["Previously / currently active", "पहले / अभी सक्रिय", stats.previouslyActive],
    ["Quality problems", "क्वालिटी समस्या", stats.quality],
    ["Supply / visit problems", "सप्लाई / विज़िट समस्या", stats.supply],
    ["Price / margin concerns", "रेट / मार्जिन", stats.price],
    ["Willing to test Seera (yes/maybe)", "सीरा आज़माने को तैयार", stats.willing],
    ["Shelf space available", "शेल्फ़ में जगह", stats.shelf],
    ["Open follow-ups", "खुले फ़ॉलो-अप", stats.followUp],
    ["Declined contact / opted out", "मना किया", stats.declined],
  ];
  const statusOptions = (list: readonly (readonly [string, string, string])[]) => list.map((o) => <option key={o[0]} value={o[0]}>{hi ? o[2] : o[1]}</option>);
  return (
    <>
      <PageHeading
        title={hi ? "मार्केट रिकवरी / रिटेलर सर्वे" : "Market recovery / retailer survey"}
        description={hi ? "फ़ील्ड सर्वे से असली कारण, रुचि और फ़ॉलो-अप।" : "Real reasons, interest and follow-up from field surveys. Surveys, interested retailers and orders are counted separately."}
        action={<a className={ws.button} href={`/api/market-survey/export${exportQuery ? `?${exportQuery}` : ""}`}>{hi ? "CSV डाउनलोड" : "Export CSV"}</a>}
      />
      <div className={styles.stats}>
        {cards.map(([en, h, n]) => (
          <div key={en} className={styles.stat}><strong>{n}</strong><span>{hi ? h : en}</span></div>
        ))}
        <div className={styles.stat}><strong>{stats.retailersOrderedSinceSurvey}</strong><span>{hi ? "सर्वे के बाद ऑर्डर देने वाले (जुड़े) रिटेलर" : `Linked retailers with an order since survey (of ${stats.linkedRetailers} linked)`}</span></div>
        <div className={styles.stat}><strong>{stats.retailersRepeatOrderedSinceSurvey}</strong><span>{hi ? "दोबारा ऑर्डर (2+)" : "Repeat ordering since survey (2+ orders)"}</span></div>
      </div>
      <p className={ws.notice} style={{ marginTop: 12 }}>
        {hi
          ? "ऑर्डर केवल मौजूदा रिटेलर से जुड़े सर्वे के लिए गिने जाते हैं; भुगतान की स्थिति यहाँ नहीं मानी गई।"
          : "Orders are counted only for surveys linked to an existing retailer, from the first survey date; payment status is not inferred here."}
      </p>

      <h2>{hi ? "WhatsApp स्थिति" : "WhatsApp follow-up status"}</h2>
      <div className={styles.stats}>
        {Object.entries(stats.whatsapp).length ? Object.entries(stats.whatsapp).map(([state, n]) => (
          <div key={state} className={styles.stat}><strong>{n}</strong><span>{waLabel(state, language)}</span></div>
        )) : <p>{hi ? "अभी कोई नहीं।" : "None yet."}</p>}
      </div>
      <div className={`${ws.notice} ${stats.dispatchEnabled ? ws.success : ""}`} style={{ marginTop: 12 }}>
        <strong>{hi ? "टेम्पलेट कॉन्फ़िगरेशन" : "Template configuration"}</strong>
        <ul>
          {stats.templates.map((tpl) => (
            <li key={tpl.key}>
              {tpl.key}: <code>{tpl.name}</code> — {tpl.approvalStatus}
              {tpl.languageCode ? ` (${tpl.languageCode})` : ""} — {hi ? "पैरामीटर" : "params"}: {tpl.params.join(", ")} — {tpl.sendable ? (hi ? "भेजने योग्य" : "sendable") : hi ? "अभी भेजने योग्य नहीं" : "not sendable yet"}
            </li>
          ))}
          <li>SEERA_MARKET_SURVEY_WHATSAPP_ENABLED: {stats.dispatchEnabled ? "true" : hi ? "बंद" : "off"}</li>
        </ul>
      </div>

      <h2>{hi ? "एरिया अनुसार" : "By area (top 15)"}</h2>
      <div className={ws.tableWrap}>
        <table className={ws.table}>
          <thead><tr><th>{hi ? "एरिया" : "Area"}</th><th>{hi ? "सर्वे" : "Surveys"}</th><th>{hi ? "तैयार" : "Willing"}</th><th>{hi ? "शेल्फ़" : "Shelf space"}</th></tr></thead>
          <tbody>
            {stats.areas.map((a) => (
              <tr key={a.market}><td><Link href={`${base}?market=${encodeURIComponent(a.market)}`}>{a.market}</Link></td><td>{a.surveys}</td><td>{a.willing}</td><td>{a.shelf}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{hi ? "सर्वे" : "Surveys"} ({list.total})</h2>
      <form className={ws.filters} method="get" action={base}>
        <input name="q" defaultValue={query.q} placeholder={hi ? "दुकान, फ़ोन, एरिया, ब्रांड, रेफ़रेंस" : "Shop, phone, area, competitor, reference"} />
        <select name="issue" defaultValue={query.issue ?? ""}><option value="">{hi ? "सभी कारण" : "All issues"}</option>{statusOptions(ISSUE_OPTIONS)}</select>
        <select name="willing" defaultValue={query.willing ?? ""}><option value="">{hi ? "रुचि: सभी" : "Interest: all"}</option>{statusOptions(TRI_OPTIONS)}</select>
        <select name="consent" defaultValue={query.consent ?? ""}><option value="">{hi ? "सहमति: सभी" : "Consent: all"}</option>{statusOptions(CONSENT_OPTIONS)}</select>
        <select name="status" defaultValue={query.status ?? ""}><option value="">{hi ? "फ़ॉलो-अप: सभी" : "Follow-up: all"}</option>{statusOptions(FOLLOW_UP_STATUS_OPTIONS)}</select>
        <input type="date" name="from" defaultValue={query.from} aria-label="From" />
        <input type="date" name="to" defaultValue={query.to} aria-label="To" />
        {query.market && <input type="hidden" name="market" value={query.market} />}
        <button className={ws.button}>{hi ? "फ़िल्टर" : "Filter"}</button>
        <Link className={`${ws.button} ${ws.secondary}`} href={base}>{hi ? "साफ़" : "Clear"}</Link>
      </form>
      <div className={ws.tableWrap}>
        <table className={ws.table}>
          <thead><tr><th>{hi ? "दुकान" : "Shop"}</th><th>{hi ? "एरिया" : "Area"}</th><th>{hi ? "कारण" : "Issues"}</th><th>{hi ? "तैयार" : "Willing"}</th><th>{hi ? "फ़ॉलो-अप" : "Follow-up"}</th><th>WhatsApp</th><th>{hi ? "स्टाफ़ / तारीख" : "Staff / date"}</th></tr></thead>
          <tbody>
            {list.rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`${base}?survey=${r.id}`}>{r.shopName}</Link><br /><small>{r.reference}</small></td>
                <td>{r.market}</td>
                <td>{r.issues.map((i) => labelFor(ISSUE_OPTIONS, i, language)).join(", ") || "-"}</td>
                <td>{labelFor(TRI_OPTIONS, r.willingToReconsider, language)}</td>
                <td>{labelFor(FOLLOW_UP_STATUS_OPTIONS, r.followUpStatus, language)}</td>
                <td>{waLabel(r.whatsapp, language)}</td>
                <td>{r.staff.name ?? r.staff.email}<br /><small>{fmt(r.createdAt)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager base={base} query={query} page={page} total={list.total} size={list.pageSize} portal={portal} />
    </>
  );
}

function Pager({ base, query, page, total, size }: { base: string; query: Record<string, string | undefined>; page: number; total: number; size: number; portal: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1]))), page: String(p) })}`;
  return (
    <div className={ws.filters} style={{ marginTop: 12 }}>
      {page > 1 && <Link className={`${ws.button} ${ws.secondary}`} href={href(page - 1)}>‹</Link>}
      <span>{page} / {pages}</span>
      {page < pages && <Link className={`${ws.button} ${ws.secondary}`} href={href(page + 1)}>›</Link>}
    </div>
  );
}

async function SurveyDetail({ db, userId, surveyId, back, language }: { db: PrismaClient; userId: string; surveyId: string; back: string; language: Lang }) {
  const { access, survey: s, whatsapp, followUpOutbox, links } = await getMarketSurveyDetail(db, userId, surveyId);
  const hi = language === "HI";
  const staff = access.manage
    ? await db.user.findMany({
        where: { status: "ACTIVE", roleAssignments: { some: { status: "ACTIVE", role: { status: "ACTIVE", permissions: { some: { permission: { code: { in: ["market_survey:create", "market_survey:manage"] } } } } } } } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 200,
      })
    : [];
  const rows: [string, ReactNode][] = [
    [hi ? "रेफ़रेंस" : "Reference", s.reference],
    [hi ? "तारीख" : "Submitted", fmt(s.createdAt)],
    [hi ? "स्टाफ़" : "Staff", s.staff.name ?? s.staff.email],
    [hi ? "दुकान" : "Shop", s.shopName],
    [hi ? "संपर्क" : "Contact", s.contactName ?? "-"],
    [hi ? "मोबाइल" : "Mobile", s.mobile ?? "-"],
    [hi ? "एरिया" : "Market / area", s.market],
    [hi ? "पता" : "Address", s.address ?? "-"],
    ["GPS", s.latitude && s.longitude ? `${s.latitude}, ${s.longitude} (±${s.gpsAccuracyM ?? "?"} m)` : "-"],
    [hi ? "मौजूदा रिटेलर" : "Linked retailer", s.retailer ? `${s.retailer.businessName} (${s.retailer.code})` : "-"],
    [hi ? "सीरा इतिहास" : "History with Seera", labelFor(RELATIONSHIP_OPTIONS, s.relationship, language)],
    [hi ? "कारण" : "Reasons", s.issues.map((i) => labelFor(ISSUE_OPTIONS, i, language)).join(", ") || "-"],
    [hi ? "अन्य कारण" : "Other reason", s.issueOther ?? "-"],
    [hi ? "रिटेलर के शब्द" : "Retailer's own words", s.retailerWords ?? "-"],
    [hi ? "स्टाफ़ की राय" : "Staff interpretation", s.staffInterpretation ?? "-"],
    [hi ? "प्रतियोगी" : "Competitor", [s.competitorBrand, s.competitorPackSize].filter(Boolean).join(" · ") || "-"],
    [hi ? "प्रतियोगी रेट" : "Competitor price (buy / MRP)", `${s.competitorPurchasePrice ?? "-"} / ${s.competitorMrp ?? "-"}`],
    [hi ? "हफ़्ते की बिक्री" : "Competitor units / week", s.competitorWeeklyUnits ?? "-"],
    [hi ? "पसंद का कारण" : "Why preferred", s.competitorReason ?? "-"],
    [hi ? "प्रतियोगी विज़िट" : "Competitor supply / visits", s.competitorVisitFrequency ?? "-"],
    [hi ? "फिर रखेंगे?" : "Willing to reconsider", labelFor(TRI_OPTIONS, s.willingToReconsider, language)],
    [hi ? "शेल्फ़" : "Shelf space", labelFor(TRI_OPTIONS, s.shelfSpace, language)],
    [hi ? "ट्रायल माल" : "Small trial quantity", labelFor(TRI_OPTIONS, s.trialQuantityOk, language)],
    [hi ? "माँगें" : "Requests", [s.wantsTesting && (hi ? "टेस्ट" : "testing"), s.wantsQuotation && (hi ? "कोटेशन" : "quotation"), s.wantsFollowUp && (hi ? "फ़ॉलो-अप" : "follow-up"), s.notInterested && (hi ? "अभी रुचि नहीं" : "not interested now")].filter(Boolean).join(", ") || "-"],
    [hi ? "पसंदीदा फ़ॉलो-अप" : "Preferred follow-up", fmt(s.preferredFollowUpAt)],
    [hi ? "नोट्स" : "Notes", s.notes ?? "-"],
    [hi ? "सुझाए कार्य" : "Recommended actions", [...s.recommendedActions.map((a) => labelFor(ACTION_OPTIONS, a, language)), s.recommendedActionOther].filter(Boolean).join(", ") || "-"],
    [hi ? "सहमति" : "Consent", `${labelFor(CONSENT_OPTIONS, s.consentStatus, language)}${s.consentScopes.length ? ` — ${s.consentScopes.map((c) => labelFor(CONSENT_SCOPE_OPTIONS, c, language)).join(", ")}` : ""}${s.consentOther ? ` (${s.consentOther})` : ""}`],
    [hi ? "सहमति समय / स्रोत" : "Consent time / source", `${fmt(s.consentAt)} · ${s.consentSource ?? "-"}`],
    [hi ? "फ़ॉलो-अप स्थिति" : "Follow-up status", labelFor(FOLLOW_UP_STATUS_OPTIONS, s.followUpStatus, language)],
    [hi ? "सौंपा गया" : "Assigned to", s.assignee ? s.assignee.name ?? s.assignee.email : "-"],
    [hi ? "तारीख" : "Due", fmt(s.followUpDueAt)],
    [hi ? "ट्रायल सहमति" : "Trial agreed", yesNo(s.trialAgreed, language)],
    [hi ? "अंतिम परिणाम" : "Last outcome", s.lastOutcome ?? "-"],
    ["WhatsApp", `${waLabel(whatsapp, language)}${followUpOutbox ? ` · attempts ${followUpOutbox.attempts}${followUpOutbox.lastErrorCode ? ` · ${followUpOutbox.lastErrorCode}` : ""}${followUpOutbox.sentAt ? ` · sent ${fmt(followUpOutbox.sentAt)}` : ""}` : ""}`],
  ];
  const activeLinks = links.filter((l) => !l.revokedAt && l.expiresAt > new Date());
  return (
    <>
      <PageHeading title={s.shopName} description={`${s.reference} · ${s.market}`} action={<Link className={`${ws.button} ${ws.secondary}`} href={back}>{hi ? "वापस" : "Back"}</Link>} />
      <div className={styles.detail}>
        <section className={ws.card}>
          <dl className={styles.kv}>{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        </section>
        {access.manage && (
          <section className={ws.card}>
            <MarketSurveyActions
              surveyId={s.id}
              language={language}
              statuses={FOLLOW_UP_STATUS_OPTIONS}
              staff={staff.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
              current={{ status: s.followUpStatus, assigneeId: s.followUpAssigneeId, dueAt: s.followUpDueAt ? s.followUpDueAt.toISOString().slice(0, 10) : null, trialAgreed: s.trialAgreed }}
              activeLinks={activeLinks.map((l) => ({ id: l.id, label: `${hi ? "लिंक" : "Link"} ${fmt(l.createdAt)} · ${hi ? "देखा" : "views"} ${l.viewCount}${l.whatsapp ? ` · WhatsApp ${waLabel(l.whatsapp, language)}` : ""}` }))}
              canSendCatalogue={s.consentStatus === "GRANTED" && s.consentScopes.includes("CATALOGUE_ORDER_INFO")}
            />
          </section>
        )}
        <section className={ws.card}>
          <h2>{hi ? "इतिहास" : "History"}</h2>
          <ul>
            {s.activities.map((a) => (
              <li key={a.id}>
                {fmt(a.createdAt)} · {a.actor?.name ?? a.actor?.email ?? "system"} · {a.type}
                {a.fromStatus || a.toStatus ? ` (${a.fromStatus ?? "-"} → ${a.toStatus ?? "-"})` : ""}
                {a.note ? ` — ${a.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
