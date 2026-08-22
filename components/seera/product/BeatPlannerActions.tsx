"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type Option = { value: string; label: string };
type Plan = {
  id: string;
  employeeName: string;
  territoryName?: string;
  beatName?: string;
  geographyName?: string;
  geographyType: string;
  distributorId?: string | null;
  distributorNameSnapshot?: string | null;
  dayOfWeek: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  retailerCount?: number;
  notes: string | null;
  isFuture: boolean;
};

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const GEOGRAPHY_TYPES: [string, string, string][] = [
  ["VILLAGE", "Village", "गाँव"],
  ["TOWN", "Town", "कस्बा"],
  ["CITY", "City", "शहर"],
  ["AREA_LOCALITY", "Area / Locality", "क्षेत्र / इलाका"],
  ["DISTRICT", "District", "जिला"],
  ["OTHER", "Other", "अन्य"],
];

async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

export function BeatPlannerActions({
  language,
  executives,
  territorySuggestions,
  beatSuggestions,
  geographySuggestions,
  distributors,
  plans,
}: {
  language: "EN" | "HI";
  executives: Option[];
  territorySuggestions: string[];
  beatSuggestions: string[];
  geographySuggestions: string[];
  distributors: Option[];
  plans: Plan[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reassignPlanId, setReassignPlanId] = useState<string | null>(null),
    [duplicatePlanId, setDuplicatePlanId] = useState<string | null>(null),
    [editPlanId, setEditPlanId] = useState<string | null>(null);
  // P1 22-Aug stuck-save fix: returns whether the action actually succeeded so the create-plan
  // form (below) can reset itself and show a distinct "Beat saved" confirmation only on success —
  // previously the form stayed filled with the just-submitted values and the only feedback was a
  // generic message detached from the Save button, reading as "stuck" even though the save worked.
  const run = async (body: unknown, successMessage?: string): Promise<boolean> => {
    setBusy(true);
    setMessage("");
    try {
      // Founder-final rule (23-Aug): publishing a Beat with zero active retailers mapped is now
      // BLOCKED server-side (createBeatPlan/publishBeatPlan throw BEAT_HAS_NO_RETAILERS) rather
      // than a soft warning after the fact — the catch block below surfaces that message directly.
      await send(body);
      setMessage(successMessage ?? (hi ? "कार्रवाई सफलतापूर्वक पूरी हुई।" : "Action completed successfully."));
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "बीट और मार्ग योजना" : "BEAT & ROUTE PLANNER"}</small>
        <h2>{hi ? "नई योजना बनाएं" : "Create a new plan"}</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formEl = event.currentTarget;
          const form = new FormData(formEl);
          const publish = String(form.get("submitAction")) === "publish";
          void run(
            {
              action: "create-beat-plan",
              payload: {
                employeeId: String(form.get("employeeId")),
                territoryName: String(form.get("territoryName")),
                beatName: String(form.get("beatName")),
                geographyType: String(form.get("geographyType")),
                geographyName: String(form.get("geographyName")),
                distributorName: String(form.get("distributorName") || "") || undefined,
                dayOfWeek: Number(form.get("dayOfWeek")),
                effectiveFrom: String(form.get("effectiveFrom")),
                effectiveTo: String(form.get("effectiveTo") || "") || undefined,
                notes: String(form.get("notes") || "") || undefined,
                publish,
              },
            },
            publish
              ? hi
                ? "बीट सहेजी और प्रकाशित की गई। नीचे सूची में देखें — अगली बीट जोड़ने के लिए फ़ॉर्म तैयार है।"
                : "Beat saved and published — see it in the list below. The form is ready for your next Beat."
              : hi
                ? "बीट ड्राफ़्ट के रूप में सहेजी गई। नीचे सूची में देखें — अगली बीट जोड़ने के लिए फ़ॉर्म तैयार है।"
                : "Beat saved as a draft — see it in the list below. The form is ready for your next Beat.",
          ).then((ok) => {
            if (ok) formEl.reset();
          });
        }}
      >
        <label>
          {hi ? "सेल्स एग्जीक्यूटिव" : "Sales Executive"}
          <select name="employeeId" required>
            <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
            {executives.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        {!executives.length && <EmptyOptionHint language={language} fallback={hi ? "पहले टीम में एक्ज़ीक्यूटिव जोड़ें।" : "Add an Executive to your team first."} />}
        <label>
          {hi ? "क्षेत्र (टेरिटरी)" : "Territory"}
          <input name="territoryName" list="territory-suggestions" required placeholder={hi ? "जैसे उत्तर क्षेत्र" : "e.g. North Territory"} />
          <datalist id="territory-suggestions">{territorySuggestions.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label>
          {hi ? "बीट" : "Beat"}
          <input name="beatName" list="beat-suggestions" required placeholder={hi ? "जैसे उत्तर बाज़ार बीट" : "e.g. North Market Beat"} />
          <datalist id="beat-suggestions">{beatSuggestions.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
        <label>
          {hi ? "भौगोलिक प्रकार" : "Geography type"}
          <select name="geographyType" required defaultValue="AREA_LOCALITY">
            {GEOGRAPHY_TYPES.map(([value, en, hiLabel]) => (
              <option key={value} value={value}>{hi ? hiLabel : en}</option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "स्थान का नाम" : "Place name"}
          <input name="geographyName" list="geography-suggestions" required placeholder={hi ? "जैसे चोमू" : "e.g. Chomu"} />
          <datalist id="geography-suggestions">{geographySuggestions.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        <label>
          {hi ? "वितरक (वैकल्पिक)" : "Distributor (optional)"}
          <input
            name="distributorName"
            list="distributor-suggestions"
            placeholder={hi ? "नाम टाइप करें — जरूरी नहीं कि सहेजा गया हो" : "Type a name — doesn't need to be a saved one"}
          />
          <datalist id="distributor-suggestions">{distributors.map((x) => <option key={x.value} value={x.label} />)}</datalist>
        </label>
        <p className={styles.emptyHint}>
          {hi
            ? "यदि नाम किसी सहेजे गए वितरक से मेल खाता है तो वह स्वतः जुड़ जाएगा। कोई मेल नहीं मिलने पर भी योजना सहेजी जाएगी — कोई वितरक मास्टर बनाना आवश्यक नहीं।"
            : "If the name matches a saved Distributor it links automatically. No match still saves the plan — no Distributor master is required."}
        </p>
        <label>
          {hi ? "दिन" : "Day"}
          <select name="dayOfWeek" required defaultValue={String(new Date().getDay())}>
            {(hi ? DAYS_HI : DAYS_EN).map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
        <label>
          {hi ? "प्रभावी तिथि" : "Effective from"}
          <input name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>
          {hi ? "समाप्ति तिथि (वैकल्पिक)" : "Effective to (optional)"}
          <input name="effectiveTo" type="date" />
        </label>
        <label>
          {hi ? "निर्देश / टिप्पणी" : "Notes / instructions"}
          <textarea name="notes" rows={3} maxLength={500} />
        </label>
        <div className={styles.inlineActions} style={{ gridColumn: "1/-1" }}>
          <button type="submit" name="submitAction" value="draft" disabled={busy || !executives.length}>
            {hi ? "ड्राफ़्ट सहेजें" : "Save draft"}
          </button>
          <button type="submit" name="submitAction" value="publish" disabled={busy || !executives.length}>
            {hi ? "प्रकाशित करें" : "Publish"}
          </button>
        </div>
      </form>
      {message && <p role="status">{message}</p>}
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <strong>{hi ? "योजनाएँ" : "Plans"}</strong>
        {!plans.length && <EmptyOptionHint language={language} fallback={hi ? "अभी तक कोई योजना नहीं बनाई गई।" : "No plans created yet."} />}
        <ul className={styles.list}>
          {plans.map((p) => (
            <li key={p.id}>
              <p>
                <strong>{p.employeeName}</strong> · {p.territoryName ?? "—"} / {p.beatName ?? "—"} / {p.geographyName ?? "—"} ·{" "}
                {(hi ? DAYS_HI : DAYS_EN)[p.dayOfWeek]} · {new Date(p.effectiveFrom).toLocaleDateString(hi ? "hi-IN" : "en-IN")}
                {p.effectiveTo ? ` – ${new Date(p.effectiveTo).toLocaleDateString(hi ? "hi-IN" : "en-IN")}` : ""}
              </p>
              <p>
                {hi ? "स्थिति" : "Status"}: <strong>{p.status}</strong>
                {typeof p.retailerCount === "number" && (
                  <>
                    {" · "}
                    <span className={p.retailerCount === 0 ? styles.shortHint : undefined}>
                      {hi ? `इस योजना में रिटेलर्स: ${p.retailerCount}` : `Retailers in this plan: ${p.retailerCount}`}
                    </span>
                  </>
                )}
                {p.distributorNameSnapshot ? ` · ${hi ? "वितरक" : "Distributor"}: ${p.distributorNameSnapshot}${p.distributorId ? "" : ` (${hi ? "असहेजा नाम" : "unsaved name"})`}` : ""}
                {p.notes ? ` · ${p.notes}` : ""}
              </p>
              <div className={styles.inlineActions}>
                {p.status === "DRAFT" && (
                  <button disabled={busy} onClick={() => run({ action: "publish-plan", payload: { planId: p.id } })}>
                    {hi ? "प्रकाशित करें" : "Publish"}
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => setDuplicatePlanId(duplicatePlanId === p.id ? null : p.id)}
                >
                  {hi ? "पिछली योजना दोहराएं" : "Duplicate"}
                </button>
                {p.isFuture && p.status !== "CANCELLED" && (
                  <>
                    <button disabled={busy} onClick={() => setEditPlanId(editPlanId === p.id ? null : p.id)}>
                      {hi ? "संपादित करें" : "Edit"}
                    </button>
                    <button disabled={busy} onClick={() => setReassignPlanId(reassignPlanId === p.id ? null : p.id)}>
                      {hi ? "एग्जीक्यूटिव बदलें" : "Reassign"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(hi ? "रद्द करने का कारण" : "Reason for cancelling");
                        if (!reason) return;
                        void run({ action: "cancel-plan", payload: { planId: p.id, reason } });
                      }}
                    >
                      {hi ? "रद्द करें" : "Cancel"}
                    </button>
                  </>
                )}
              </div>
              {duplicatePlanId === p.id && (
                <form
                  className={styles.inlineActions}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run({ action: "duplicate-plan", payload: { planId: p.id, effectiveFrom: String(form.get("effectiveFrom")) } });
                    setDuplicatePlanId(null);
                  }}
                >
                  <input name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  <button disabled={busy}>{hi ? "पुष्टि करें" : "Confirm duplicate"}</button>
                </form>
              )}
              {editPlanId === p.id && (
                <form
                  className={styles.inlineActions}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run({
                      action: "edit-plan",
                      payload: {
                        planId: p.id,
                        notes: String(form.get("notes") || "") || undefined,
                        distributorName: String(form.get("distributorName") || "") || undefined,
                        effectiveTo: String(form.get("effectiveTo") || "") || undefined,
                      },
                    });
                    setEditPlanId(null);
                  }}
                >
                  <input
                    name="distributorName"
                    list="distributor-suggestions"
                    defaultValue={p.distributorNameSnapshot ?? ""}
                    placeholder={hi ? "वितरक (वैकल्पिक)" : "Distributor (optional)"}
                  />
                  <input name="effectiveTo" type="date" defaultValue={p.effectiveTo ? p.effectiveTo.slice(0, 10) : ""} />
                  <input name="notes" defaultValue={p.notes ?? ""} placeholder={hi ? "टिप्पणी" : "Notes"} />
                  <button disabled={busy}>{hi ? "बदलाव सहेजें" : "Save changes"}</button>
                </form>
              )}
              {reassignPlanId === p.id && (
                <form
                  className={styles.inlineActions}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run({ action: "reassign-plan", payload: { planId: p.id, employeeId: String(form.get("employeeId")), reason: String(form.get("reason")) } });
                    setReassignPlanId(null);
                  }}
                >
                  <select name="employeeId" required>
                    <option value="">{hi ? "नया एग्ज़ीक्यूटिव" : "New Executive"}</option>
                    {executives.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                  <input name="reason" required placeholder={hi ? "कारण" : "Reason"} />
                  <button disabled={busy}>{hi ? "पुनःसौंपें" : "Reassign"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
