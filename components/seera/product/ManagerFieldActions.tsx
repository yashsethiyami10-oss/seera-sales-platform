"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string; meta?: string };
async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result?.error?.message ?? result?.error?.code ?? "Action failed",
    );
  return result;
}

export function ManagerFieldActions({
  kind,
  language,
  sessionId,
  activeVisit,
  activeJoint,
  retailers = [],
  executives = [],
  visits = [],
}: {
  kind: "retailing" | "joint";
  language: "EN" | "HI";
  sessionId?: string;
  activeVisit?: string;
  activeJoint?: string;
  retailers?: Option[];
  executives?: Option[];
  visits?: Option[];
}) {
  const hi = language === "HI",
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const execute = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await send(body);
      setMessage(
        hi
          ? "कार्रवाई सफलतापूर्वक पूरी हुई।"
          : "Action completed successfully.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>
          {kind === "joint"
            ? hi
              ? "संयुक्त कार्य"
              : "JOINT WORKING"
            : hi
              ? "मैनेजर रिटेलिंग"
              : "MANAGER RETAILING"}
        </small>
        <h2>
          {kind === "joint"
            ? activeJoint
              ? hi
                ? "संयुक्त कार्य पूरा करें"
                : "Close joint work"
              : hi
                ? "टीम के साथ कार्य शुरू करें"
                : "Start work with team"
            : activeVisit
              ? hi
                ? "रिटेलर विज़िट पूरी करें"
                : "Complete retailer visit"
              : hi
                ? "रिटेलर पर चेक-इन"
                : "Check in at retailer"}
        </h2>
      </div>
      {kind === "retailing" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void execute(
              activeVisit
                ? {
                    action: "retailer-check-out",
                    payload: {
                      visitId: activeVisit,
                      outcome: String(form.get("outcome")),
                      noOrderReason:
                        String(form.get("reason") || "") || undefined,
                      notes: String(form.get("notes") || "") || undefined,
                    },
                  }
                : {
                    action: "retailer-check-in",
                    payload: {
                      workSessionId: sessionId,
                      retailerId: String(form.get("retailerId")),
                      idempotencyKey: crypto.randomUUID(),
                    },
                  },
            );
          }}
        >
          {!activeVisit && (
            <label>
              {hi ? "रिटेलर" : "Retailer"}
              <select name="retailerId" required>
                <option value="">
                  {hi ? "नाम से चुनें" : "Choose by name"}
                </option>
                {retailers.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                    {x.meta ? ` · ${x.meta}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {activeVisit && (
            <>
              <label>
                {hi ? "परिणाम" : "Outcome"}
                <select name="outcome">
                  <option>ORDER_BOOKED</option>
                  <option>NO_ORDER</option>
                  <option>FOLLOW_UP</option>
                  <option>COLLECTION</option>
                  <option>MARKET_INTELLIGENCE</option>
                </select>
              </label>
              <label>
                {hi ? "बिना ऑर्डर का कारण" : "No-order reason"}
                <input name="reason" />
              </label>
              <label>
                {hi ? "टिप्पणी" : "Notes"}
                <input name="notes" />
              </label>
            </>
          )}
          <button
            disabled={
              busy || (!activeVisit && (!sessionId || !retailers.length))
            }
          >
            {activeVisit
              ? hi
                ? "चेक-आउट"
                : "Check out"
              : hi
                ? "चेक-इन"
                : "Check in"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void execute(
              activeJoint
                ? {
                    action: "close-joint",
                    payload: {
                      jointWorkId: activeJoint,
                      visitId: String(form.get("visitId")),
                      observations: String(form.get("observations")),
                      coaching: String(form.get("coaching")),
                    },
                  }
                : {
                    action: "start-joint",
                    payload: {
                      salesExecutiveId: String(form.get("executiveId")),
                    },
                  },
            );
          }}
        >
          {!activeJoint ? (
            <label>
              {hi ? "सेल्स एग्जीक्यूटिव" : "Sales Executive"}
              <select name="executiveId" required>
                <option value="">
                  {hi ? "नाम से चुनें" : "Choose by name"}
                </option>
                {executives.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                    {x.meta ? ` · ${x.meta}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                {hi ? "लिंक की गई विज़िट" : "Linked visit"}
                <select name="visitId" required>
                  <option value="">
                    {hi ? "विज़िट चुनें" : "Choose visit"}
                  </option>
                  {visits.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                      {x.meta ? ` · ${x.meta}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {hi ? "अवलोकन" : "Observations"}
                <input name="observations" required />
              </label>
              <label>
                {hi ? "कोचिंग" : "Coaching"}
                <input name="coaching" required />
              </label>
            </>
          )}
          <button disabled={busy || (!activeJoint && !executives.length)}>
            {activeJoint
              ? hi
                ? "संयुक्त कार्य पूरा करें"
                : "Close joint work"
              : hi
                ? "संयुक्त कार्य शुरू करें"
                : "Start joint work"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
