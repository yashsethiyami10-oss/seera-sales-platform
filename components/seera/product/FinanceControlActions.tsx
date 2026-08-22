"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string; meta?: string };
type Kind = "allocate" | "reverse" | "settle-claim" | "approve-ta" | "decide-credit-extension";

export function FinanceControlActions({
  kind,
  language,
  primary,
  secondary = [],
  approvers = [],
  companyId,
}: {
  kind: Kind;
  language: "EN" | "HI";
  primary: Option[];
  secondary?: Option[];
  approvers?: Option[];
  companyId?: string;
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const title = {
    allocate: hi ? "सत्यापित भुगतान आवंटित करें" : "Allocate verified payment",
    reverse: hi ? "पोस्ट की गई प्रविष्टि पलटें" : "Reverse posted entry",
    "settle-claim": hi ? "दावा निपटान" : "Settle claim",
    "approve-ta": hi ? "स्वीकृत TA भुगतान दर्ज करें" : "Mark approved TA paid",
    "decide-credit-extension": hi ? "क्रेडिट विस्तार तय करें" : "Decide credit extension",
  }[kind];
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वित्तीय नियंत्रण" : "FINANCIAL CONTROL"}</small>
        <h2>{title}</h2>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            const key = crypto.randomUUID();
            let url = "/api/finance/operations";
            let body: unknown;
            if (kind === "allocate")
              body = {
                action: "allocate-payment",
                payload: {
                  paymentId: String(form.get("primary")),
                  allocations: [
                    {
                      documentId: String(form.get("secondary")),
                      amount: Number(form.get("amount")),
                      reason: String(form.get("reason")),
                      idempotencyKey: key,
                    },
                  ],
                },
              };
            else if (kind === "reverse")
              body = {
                action: "reverse-entry",
                payload: {
                  entryId: String(form.get("primary")),
                  reason: String(form.get("reason")),
                  idempotencyKey: key,
                },
              };
            else if (kind === "settle-claim")
              body = {
                action: "settle-claim",
                payload: {
                  claimId: String(form.get("primary")),
                  outcome: String(form.get("outcome")),
                  approvedAmount: Number(form.get("amount")),
                  rejectedAmount: Number(form.get("rejectedAmount")),
                  reason: String(form.get("reason")),
                },
              };
            else if (kind === "decide-credit-extension")
              body = {
                action: "decide-credit-extension",
                payload: {
                  extensionId: String(form.get("primary")),
                  decision: String(form.get("decision")),
                  reason: String(form.get("reason")),
                },
              };
            else {
              url = "/api/travel/operations";
              body = {
                action: "pay",
                payload: {
                  claimId: String(form.get("primary")),
                  employeePartyId: String(form.get("secondary")),
                  companyPartyId: companyId,
                  idempotencyKey: key,
                  paymentReference: String(form.get("paymentReference")),
                },
              };
            }
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
              throw new Error(
                result?.error?.message ??
                  result?.error?.code ??
                  "Action failed",
              );
            setMessage(
              hi
                ? "वित्तीय कार्रवाई सफलतापूर्वक पूरी हुई।"
                : "Financial action completed successfully.",
            );
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
          {kind === "settle-claim"
            ? hi
              ? "दावा"
              : "Claim"
            : kind === "approve-ta"
              ? hi
                ? "TA दावा"
                : "TA claim"
              : kind === "reverse"
                ? hi
                  ? "लेजर प्रविष्टि"
                  : "Ledger entry"
                : kind === "decide-credit-extension"
                  ? hi
                    ? "आदेश"
                    : "Order"
                  : hi
                    ? "भुगतान"
                    : "Payment"}
          <select name="primary" required>
            <option value="">
              {hi ? "व्यावसायिक नंबर से चुनें" : "Choose by business number"}
            </option>
            {primary.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.meta ? ` · ${option.meta}` : ""}
              </option>
            ))}
          </select>
        </label>
        {(kind === "allocate" || kind === "approve-ta") && (
          <label>
            {kind === "allocate"
              ? hi
                ? "दस्तावेज़"
                : "Document"
              : hi
                ? "कर्मचारी"
                : "Employee"}
            <select name="secondary" required>
              <option value="">
                {hi ? "नाम/नंबर से चुनें" : "Choose by name/number"}
              </option>
              {secondary.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.meta ? ` · ${option.meta}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "settle-claim" && (
          <label>
            {hi ? "परिणाम" : "Outcome"}
            <select name="outcome">
              <option>CREDIT_NOTE</option>
              <option>DEBIT_NOTE</option>
              <option>REPLACEMENT</option>
              <option>NO_FINANCIAL_EFFECT</option>
            </select>
          </label>
        )}
        {kind === "decide-credit-extension" && (
          <label>
            {hi ? "निर्णय" : "Decision"}
            <select name="decision" required>
              <option value="APPROVED">{hi ? "स्वीकृत" : "APPROVED"}</option>
              <option value="REJECTED">{hi ? "अस्वीकृत" : "REJECTED"}</option>
            </select>
          </label>
        )}
        {(kind === "allocate" || kind === "settle-claim") && (
          <label>
            {hi ? "स्वीकृत/आवंटित राशि" : "Approved / allocated amount"}
            <input name="amount" type="number" min="0" step="0.01" required />
          </label>
        )}
        {kind === "settle-claim" && (
          <label>
            {hi ? "अस्वीकृत राशि" : "Rejected amount"}
            <input
              name="rejectedAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
        )}
        {kind === "approve-ta" && (
          <label>
            {hi ? "भुगतान संदर्भ" : "Payment reference"}
            <input name="paymentReference" minLength={2} required />
          </label>
        )}
        {kind !== "approve-ta" && (
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" minLength={3} required />
          </label>
        )}
        <button disabled={busy || !primary.length}>
          {hi ? "नियंत्रित कार्रवाई करें" : "Run governed action"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
