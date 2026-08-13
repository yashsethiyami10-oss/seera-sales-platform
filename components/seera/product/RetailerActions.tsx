"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type FollowUp = {
  id: string;
  type: string;
  dueDate: string;
  priority: string;
  note: string;
};
type Photo = { id: string; photoType: string; capturedAt: string };

async function send(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/field/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data?.error?.message ?? data?.error?.code ?? "Action failed");
  return data;
}

export function RetailerActions({
  language,
  retailerId,
  followUps,
  photos,
}: {
  language: "EN" | "HI";
  retailerId: string;
  followUps: FollowUp[];
  photos: Photo[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const resolve = async (followUpId: string) => {
    setBusy(followUpId);
    setMessage("");
    try {
      await send("resolve-follow-up", { followUpId });
      setMessage(hi ? "फॉलो-अप पूर्ण के रूप में चिह्नित।" : "Follow-up marked resolved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resolve failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "रिटेलर 360" : "RETAILER 360"}</small>
        <h2>{hi ? "फॉलो-अप और फ़ोटो" : "Follow-ups & photos"}</h2>
      </div>
      {followUps.length === 0 ? (
        <p>{hi ? "कोई खुला फॉलो-अप नहीं है।" : "No open follow-ups."}</p>
      ) : (
        <ul className={styles.list}>
          {followUps.map((f) => (
            <li key={f.id}>
              <strong>{f.type}</strong> · {new Date(f.dueDate).toLocaleDateString(hi ? "hi-IN" : "en-IN")} ·{" "}
              {f.priority}
              <p>{f.note}</p>
              <button disabled={busy === f.id} onClick={() => resolve(f.id)}>
                {hi ? "पूर्ण चिह्नित करें" : "Mark resolved"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy("create");
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            await send("create-follow-up", {
              type: String(form.get("type")),
              retailerId,
              dueDate: String(form.get("dueDate")),
              priority: String(form.get("priority")),
              note: String(form.get("note")),
              idempotencyKey: crypto.randomUUID(),
            });
            setMessage(hi ? "फॉलो-अप जोड़ा गया।" : "Follow-up added.");
            event.currentTarget.reset();
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Follow-up failed");
          } finally {
            setBusy(null);
          }
        }}
      >
        <label>
          {hi ? "प्रकार" : "Type"}
          <select name="type" required>
            <option value="RETAILER_CALLBACK">{hi ? "रिटेलर कॉलबैक" : "Retailer callback"}</option>
            <option value="PAYMENT_COLLECTION">{hi ? "भुगतान संग्रह" : "Payment collection"}</option>
            <option value="ORDER_FOLLOW_UP">{hi ? "ऑर्डर फॉलो-अप" : "Order follow-up"}</option>
            <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
          </select>
        </label>
        <label>
          {hi ? "नियत तिथि" : "Due date"}
          <input name="dueDate" type="date" required />
        </label>
        <label>
          {hi ? "प्राथमिकता" : "Priority"}
          <select name="priority">
            <option value="NORMAL">{hi ? "सामान्य" : "Normal"}</option>
            <option value="HIGH">{hi ? "उच्च" : "High"}</option>
          </select>
        </label>
        <label>
          {hi ? "टिप्पणी" : "Note"}
          <input name="note" required />
        </label>
        <button disabled={busy === "create"}>{hi ? "फॉलो-अप जोड़ें" : "Add follow-up"}</button>
      </form>
      {message && <p role="status">{message}</p>}
      <div>
        <small>{hi ? "हाल की फ़ोटो" : "RECENT PHOTOS"}</small>
        {photos.length === 0 ? (
          <p>{hi ? "कोई फ़ोटो उपलब्ध नहीं है।" : "No photos available."}</p>
        ) : (
          <div className={styles.photoGrid}>
            {photos.map((photo) => (
              <figure key={photo.id}>
                <img src={`/api/field/photos/${photo.id}`} alt={photo.photoType} />
                <figcaption>
                  {photo.photoType} · {new Date(photo.capturedAt).toLocaleDateString(hi ? "hi-IN" : "en-IN")}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
