"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Grant = {
  id: string;
  recipientType: string;
  recipientId: string;
  expiresAt: string;
  revokedAt?: string | null;
  accessCount: number;
};

export function DocumentShareActions({
  language,
  documentId,
  grants,
}: {
  language: "EN" | "HI";
  documentId: string;
  grants: Grant[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [link, setLink] = useState("");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "सुरक्षित साझा" : "SECURE SHARE"}</small>
        <h2>{hi ? "दस्तावेज़ साझा करें" : "Share this document"}</h2>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          setLink("");
          try {
            const f = new FormData(e.currentTarget);
            const response = await fetch(`/api/documents/${documentId}/share`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipientType: String(f.get("recipientType")),
                recipientId: String(f.get("recipientId")),
                expiresAt: new Date(String(f.get("expiresAt"))).toISOString(),
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
              throw new Error(data?.error?.message ?? data?.error?.code ?? "Share failed");
            setLink(data.secureUrl);
            setMessage(hi ? "साझा लिंक बनाया गया।" : "Share link created.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Share failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "प्राप्तकर्ता प्रकार" : "Recipient type"}
          <select name="recipientType" required>
            <option value="USER">USER</option>
            <option value="PARTNER">PARTNER</option>
          </select>
        </label>
        <label>
          {hi ? "प्राप्तकर्ता आईडी" : "Recipient ID"}
          <input name="recipientId" required />
        </label>
        <label>
          {hi ? "समाप्ति" : "Expires at"}
          <input name="expiresAt" type="datetime-local" required />
        </label>
        <button disabled={busy}>{hi ? "साझा लिंक बनाएँ" : "Create share link"}</button>
      </form>
      {link && (
        <p role="status" data-ok="true">
          {link}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "प्राप्तकर्ता" : "Recipient"}</th>
              <th>{hi ? "समाप्ति" : "Expires"}</th>
              <th>{hi ? "पहुँच" : "Accessed"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
              <th>{hi ? "कार्रवाई" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.recipientType} · {g.recipientId}
                </td>
                <td>{g.expiresAt}</td>
                <td>{g.accessCount}</td>
                <td>{g.revokedAt ? (hi ? "निरस्त" : "Revoked") : hi ? "सक्रिय" : "Active"}</td>
                <td>
                  {!g.revokedAt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await fetch(`/api/document-shares/${g.id}/revoke`, { method: "POST" });
                          router.refresh();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {hi ? "निरस्त करें" : "Revoke"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!grants.length && (
              <tr>
                <td colSpan={5}>{hi ? "अभी तक कोई साझा नहीं" : "No shares yet"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
