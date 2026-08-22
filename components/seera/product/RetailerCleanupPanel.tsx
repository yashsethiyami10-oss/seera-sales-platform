"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function send(body: unknown) {
  const r = await fetch("/api/distribution/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

export type CleanupRetailer = {
  id: string;
  code: string;
  businessName: string;
  mobile: string | null;
  executive: string | null;
  distributor: string | null;
  createdAt: string;
  dependencies: { orders: number; visits: number; documents: number; ledger: number; total: number };
  recommendedAction: "ARCHIVE" | "HARD_DELETE";
};

const REASON = "Final Retailer Cleanup + Handover: Founder-confirmed test/UAT retailer, cleared before team handover.";

// Final Retailer Cleanup + Handover (22-Aug): the actual execution surface for Part A. Production
// database writes are categorically blocked outside the running app (lib/database/identity-guard.ts
// forbids any script from writing to production), so this panel — reachable only by
// master:manage — IS the governed path: one button per retailer, calling the exact same
// archiveRetailer/hardDeleteRetailer service the API already exposes, with the safe rule
// (zero dependencies -> hard delete, any dependency -> archive) pre-selected but never hidden.
export function RetailerCleanupPanel({ language, retailers }: { language: "EN" | "HI"; retailers: CleanupRetailer[] }) {
  const hi = language === "HI",
    router = useRouter(),
    [busyId, setBusyId] = useState<string | null>(null),
    [message, setMessage] = useState("");

  const act = async (r: CleanupRetailer) => {
    setBusyId(r.id);
    setMessage("");
    try {
      if (r.recommendedAction === "HARD_DELETE") {
        await send({ action: "hard-delete-retailer", payload: { retailerId: r.id, reason: REASON } });
        setMessage(hi ? `${r.businessName} स्थायी रूप से हटाया गया।` : `${r.businessName} permanently deleted.`);
      } else {
        await send({ action: "archive-retailer", payload: { retailerId: r.id, reason: REASON } });
        setMessage(hi ? `${r.businessName} संग्रहीत किया गया।` : `${r.businessName} archived.`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "हैंडओवर" : "HANDOVER"}</small>
        <h2>{hi ? "रिटेलर क्लीनअप" : "Retailer Cleanup"}</h2>
        <p>
          {hi
            ? "टीम हैंडओवर से पहले सभी टेस्ट/UAT रिटेलर्स साफ़ करें — निर्भरता वाले संग्रहीत होंगे, बिना निर्भरता वाले स्थायी रूप से हटेंगे।"
            : "Clear every test/UAT retailer before team handover — retailers with dependencies get archived, retailers with zero dependencies get permanently deleted."}
        </p>
      </div>
      {!retailers.length ? (
        <p className={styles.emptyHint}>{hi ? "कोई भी रिटेलर लंबित नहीं — क्लीनअप पूरा।" : "No retailers pending — cleanup is complete."}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "फर्म" : "Firm"}</th>
                <th>{hi ? "मोबाइल" : "Mobile"}</th>
                <th>{hi ? "एग्जीक्यूटिव" : "Executive"}</th>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "निर्भरताएँ" : "Dependencies"}</th>
                <th>{hi ? "अनुशंसित कार्रवाई" : "Recommended action"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {retailers.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.businessName}
                    <br />
                    <small>{r.code}</small>
                  </td>
                  <td>{r.mobile ?? "—"}</td>
                  <td>{r.executive ?? "—"}</td>
                  <td>{r.distributor ?? "—"}</td>
                  <td>
                    {r.dependencies.total === 0
                      ? hi
                        ? "कोई नहीं"
                        : "None"
                      : `${r.dependencies.orders} orders · ${r.dependencies.visits} visits · ${r.dependencies.documents} docs · ${r.dependencies.ledger} ledger`}
                  </td>
                  <td>
                    <span className={styles.badge}>{r.recommendedAction === "HARD_DELETE" ? (hi ? "स्थायी हटाएँ" : "Hard delete") : hi ? "संग्रह करें" : "Archive"}</span>
                  </td>
                  <td>
                    <button type="button" disabled={busyId === r.id} onClick={() => void act(r)}>
                      {busyId === r.id ? (hi ? "कार्य जारी…" : "Working…") : r.recommendedAction === "HARD_DELETE" ? (hi ? "हटाएँ" : "Delete") : hi ? "संग्रह करें" : "Archive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
