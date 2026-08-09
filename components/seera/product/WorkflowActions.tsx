"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
type Option = { value: string; label: string; meta?: string };
async function send(url: string, body: unknown) {
  const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      data?.error?.message ?? data?.error?.code ?? "Request failed",
    );
  return data;
}
const key = () => crypto.randomUUID();
export function WorkflowActions({
  kind,
  language,
  options = [],
  activeId,
}: {
  kind: "manager-day" | "prospect" | "finance-payment" | "ta-verify";
  language: "EN" | "HI";
  options?: Option[];
  activeId?: string;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
      null,
    );
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({
        ok: true,
        text: hi
          ? "कार्रवाई सफलतापूर्वक पूरी हुई।"
          : "Action completed successfully.",
      });
      router.refresh();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setBusy(false);
    }
  };
  if (kind === "manager-day")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "दैनिक कार्य" : "DAILY WORKING"}</small>
          <h2>
            {activeId
              ? hi
                ? "सक्रिय कार्य दिवस"
                : "Active work day"
              : hi
                ? "आज का काम शुरू करें"
                : "Start today’s work"}
          </h2>
        </div>
        {activeId ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                send("/api/manager/operations", {
                  action: "end-day",
                  payload: {
                    sessionId: activeId,
                    outcome: String(f.get("outcome")),
                    remarks: String(f.get("remarks") ?? ""),
                  },
                }),
              );
            }}
          >
            <label>
              {hi ? "परिणाम" : "Outcome"}
              <select name="outcome">
                <option>COMPLETED</option>
                <option>PARTIAL</option>
              </select>
            </label>
            <label>
              {hi ? "टिप्पणी" : "Remarks"}
              <input name="remarks" />
            </label>
            <button disabled={busy}>
              {hi ? "दिन समाप्त करें" : "End day"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                send("/api/manager/operations", {
                  action: "start-day",
                  payload: {
                    workingType: String(f.get("workingType")),
                    remarks: String(f.get("remarks") ?? ""),
                  },
                }),
              );
            }}
          >
            <label>
              {hi ? "कार्य प्रकार" : "Working type"}
              <select name="workingType">
                <option value="RETAILING">
                  {hi ? "रिटेलिंग" : "Retailing"}
                </option>
                <option value="MARKET_WORKING">
                  {hi ? "बाज़ार कार्य" : "Market working"}
                </option>
                <option value="JOINT_WORKING">
                  {hi ? "संयुक्त कार्य" : "Joint working"}
                </option>
              </select>
            </label>
            <label>
              {hi ? "दिन की टिप्पणी" : "Day note"}
              <input name="remarks" />
            </label>
            <button disabled={busy}>
              {hi ? "दिन शुरू करें" : "Start day"}
            </button>
          </form>
        )}
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  if (kind === "prospect")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "वितरक विकास" : "DISTRIBUTOR DEVELOPMENT"}</small>
          <h2>{hi ? "नई संभावना दर्ज करें" : "Add a prospect"}</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              send("/api/manager/operations", {
                action: "create-distributor-prospect",
                payload: {
                  businessName: String(f.get("businessName")),
                  mobile: String(f.get("mobile")),
                  areaId: String(f.get("areaId") ?? "") || undefined,
                  profile: { source: "PORTAL" },
                  followUpAt: String(f.get("followUpAt") ?? "") || undefined,
                },
              }),
            );
          }}
        >
          <label>
            {hi ? "व्यवसाय का नाम" : "Business name"}
            <input name="businessName" required />
          </label>
          <label>
            {hi ? "मोबाइल" : "Mobile"}
            <input name="mobile" inputMode="tel" required />
          </label>
          <label>
            {hi ? "क्षेत्र" : "Area"}
            <input name="areaId" />
          </label>
          <label>
            {hi ? "अगला फॉलो-अप" : "Follow-up date"}
            <input type="date" name="followUpAt" />
          </label>
          <button disabled={busy}>
            {hi ? "संभावना सहेजें" : "Save prospect"}
          </button>
        </form>
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  if (kind === "finance-payment")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "निर्माता-जाँचकर्ता" : "MAKER-CHECKER"}</small>
          <h2>
            {hi
              ? "भुगतान सत्यापन / मिलान"
              : "Payment verification / reconciliation"}
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              action = String(f.get("action")),
              paymentId = String(f.get("paymentId"));
            void run(() =>
              send(
                "/api/finance/operations",
                action === "verify"
                  ? {
                      action: "verify-payment",
                      payload: {
                        paymentId,
                        matchedAmount: Number(f.get("amount")),
                        reason: String(f.get("reason")),
                      },
                    }
                  : {
                      action: "reconcile-payment",
                      payload: { paymentId, idempotencyKey: key() },
                    },
              ),
            );
          }}
        >
          <label>
            {hi ? "भुगतान चुनें" : "Select payment"}
            <select name="paymentId" required>
              <option value="">
                {hi ? "व्यावसायिक नंबर से चुनें" : "Choose by business number"}
              </option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.meta ? ` · ${o.meta}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "कार्रवाई" : "Action"}
            <select name="action">
              <option value="verify">
                {hi ? "धन सत्यापित करें" : "Verify funds"}
              </option>
              <option value="reconcile">
                {hi ? "मिलान करें" : "Reconcile"}
              </option>
            </select>
          </label>
          <label>
            {hi ? "मिलान राशि" : "Matched amount"}
            <input
              type="number"
              min="0"
              step="0.01"
              name="amount"
              defaultValue="0"
            />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" defaultValue="Portal review" required />
          </label>
          <button disabled={busy || !options.length}>
            {hi ? "नियंत्रित कार्रवाई करें" : "Run governed action"}
          </button>
        </form>
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "यात्रा दावा" : "TA CLAIM"}</small>
        <h2>{hi ? "दावे का सत्यापन" : "Verify claim"}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            send("/api/travel/operations", {
              action: "verify",
              payload: {
                claimId: String(f.get("claimId")),
                approvedDistanceKm: Number(f.get("distance")),
                reason: String(f.get("reason")),
              },
            }),
          );
        }}
      >
        <label>
          {hi ? "दावा चुनें" : "Select claim"}
          <select name="claimId" required>
            <option value="">
              {hi ? "दावा नंबर चुनें" : "Choose claim number"}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.meta ? ` · ${o.meta}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "स्वीकृत दूरी (किमी)" : "Approved distance (km)"}
          <input type="number" min="0" step="0.1" name="distance" required />
        </label>
        <label>
          {hi ? "सत्यापन कारण" : "Verification reason"}
          <input name="reason" required />
        </label>
        <button disabled={busy || !options.length}>
          {hi ? "सत्यापित करें" : "Verify claim"}
        </button>
      </form>
      {message && (
        <p role="status" data-ok={message.ok}>
          {message.text}
        </p>
      )}
    </section>
  );
}

export function PartnerLifecycleActions({
  partnerId,
  lifecycle,
  language,
  approvers,
}: {
  partnerId: string;
  lifecycle: string;
  language: "EN" | "HI";
  approvers: Option[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const actions =
    lifecycle === "ACTIVE"
      ? ["SUSPEND", "DEACTIVATE", "CLOSE"]
      : ["SUSPENDED", "DEACTIVATED"].includes(lifecycle)
        ? ["REACTIVATE"]
        : [];
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "भागीदार जीवनचक्र" : "PARTNER LIFECYCLE"}</small>
        <h2>
          {hi ? "नियंत्रित स्थिति परिवर्तन" : "Governed status transition"}
        </h2>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            await send(`/api/partners/${partnerId}/lifecycle`, {
              action: String(form.get("action")),
              reason: String(form.get("reason")),
              approverId: String(form.get("approverId")),
              idempotencyKey: key(),
            });
            setMessage(hi ? "जीवनचक्र अपडेट हुआ।" : "Lifecycle updated.");
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Action failed",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "वर्तमान स्थिति" : "Current status"}
          <input value={lifecycle} readOnly />
        </label>
        <label>
          {hi ? "अगली कार्रवाई" : "Next action"}
          <select name="action" required>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "अनुमोदक" : "Approver"}
          <select name="approverId" required>
            <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
            {approvers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "कारण" : "Reason"}
          <input name="reason" minLength={3} required />
        </label>
        <button disabled={busy || !actions.length || !approvers.length}>
          {hi ? "स्थिति अपडेट करें" : "Update lifecycle"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
