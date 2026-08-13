"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string; meta?: string };
type Instruction = {
  id: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  dueAt: string | null;
  acknowledgedAt: string | null;
};

async function send(endpoint: string, action: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data?.error?.message ?? data?.error?.code ?? "Action failed");
  return data;
}

export function IssueInstructionActions({
  language,
  executives,
}: {
  language: "EN" | "HI";
  executives: Option[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "टीम निर्देश" : "TEAM INSTRUCTIONS"}</small>
        <h2>{hi ? "कार्यकारी को निर्देश असाइन करें" : "Assign an instruction to an Executive"}</h2>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            await send("/api/manager/operations", "create-instruction", {
              assignedEmployeeId: String(form.get("assignedEmployeeId")),
              title: String(form.get("title")),
              body: String(form.get("body")),
              priority: String(form.get("priority")),
              dueAt: String(form.get("dueAt") ?? "") || undefined,
            });
            setMessage(hi ? "निर्देश असाइन किया गया।" : "Instruction assigned.");
            event.currentTarget.reset();
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Assignment failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "कार्यकारी" : "Executive"}
          <select name="assignedEmployeeId" required>
            <option value="">{hi ? "चुनें" : "Choose"}</option>
            {executives.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "प्राथमिकता" : "Priority"}
          <select name="priority">
            <option value="NORMAL">{hi ? "सामान्य" : "Normal"}</option>
            <option value="HIGH">{hi ? "उच्च" : "High"}</option>
          </select>
        </label>
        <label>
          {hi ? "शीर्षक" : "Title"}
          <input name="title" required />
        </label>
        <label>
          {hi ? "नियत तिथि (वैकल्पिक)" : "Due date (optional)"}
          <input name="dueAt" type="date" />
        </label>
        <label>
          {hi ? "विवरण" : "Body"}
          <input name="body" required />
        </label>
        <button disabled={busy || !executives.length}>{hi ? "असाइन करें" : "Assign"}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function RespondInstructionActions({
  language,
  instructions,
}: {
  language: "EN" | "HI";
  instructions: Instruction[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const acknowledge = async (id: string) => {
    setBusy(id);
    setMessage("");
    try {
      await send("/api/field/operations", "acknowledge-instruction", { instructionId: id });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };
  const complete = async (id: string, remarks: string) => {
    setBusy(id);
    setMessage("");
    try {
      await send("/api/field/operations", "complete-instruction", { instructionId: id, remarks: remarks || undefined });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const open = instructions.filter((i) => i.status !== "COMPLETED");
  if (open.length === 0)
    return (
      <p className={styles.readOnly}>
        {hi ? "कोई लंबित निर्देश नहीं है।" : "No pending instructions."}
      </p>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "प्रबंधक निर्देश" : "MANAGER INSTRUCTIONS"}</small>
        <h2>{hi ? "लंबित निर्देश" : "Pending instructions"}</h2>
      </div>
      <ul className={styles.list}>
        {open.map((i) => (
          <li key={i.id}>
            <strong>{i.title}</strong> · <span className={styles.badge}>{i.priority}</span>{" "}
            <span className={styles.badge}>{i.status}</span>
            <p>{i.body}</p>
            {i.dueAt && (
              <p>
                {hi ? "देय" : "Due"}: {new Date(i.dueAt).toLocaleDateString(hi ? "hi-IN" : "en-IN")}
              </p>
            )}
            {!i.acknowledgedAt && (
              <button disabled={busy === i.id} onClick={() => acknowledge(i.id)}>
                {hi ? "स्वीकार करें" : "Acknowledge"}
              </button>
            )}{" "}
            <input
              placeholder={hi ? "टिप्पणी (वैकल्पिक)" : "Remarks (optional)"}
              value={remarks[i.id] ?? ""}
              onChange={(event) => setRemarks((prev) => ({ ...prev, [i.id]: event.target.value }))}
            />
            <button disabled={busy === i.id} onClick={() => complete(i.id, remarks[i.id] ?? "")}>
              {hi ? "पूर्ण करें" : "Mark complete"}
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
