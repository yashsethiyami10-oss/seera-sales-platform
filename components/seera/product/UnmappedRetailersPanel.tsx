"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function send(body: unknown) {
  const r = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

export type UnmappedRetailer = {
  id: string;
  businessName: string;
  ownerName: string | null;
  mobile: string | null;
  address: unknown;
  executive: string | null;
  distributor: string | null;
};

function formatAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const a = value as Record<string, unknown>;
  const parts = [a.line, a.area, a.city, a.state, a.pincode].filter((p) => typeof p === "string" && p.trim());
  return parts.length ? parts.join(", ") : "—";
}

// Final Retailer Cleanup + Handover (22-Aug): real retailers that exist but have no Beat/
// Territory assigned yet — surfaced explicitly (never silently invisible) so a Manager can assign
// them via governed action. Geography is picked from real, existing Beat nodes only — never
// guessed from free text.
export function UnmappedRetailersPanel({
  language,
  retailers,
  beatSuggestions,
}: {
  language: "EN" | "HI";
  retailers: UnmappedRetailer[];
  beatSuggestions: { value: string; label: string; territoryId: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  const assign = async (retailerId: string, beatId: string) => {
    if (!beatId) return;
    setBusy(true);
    setMessage("");
    try {
      const territoryId = beatSuggestions.find((b) => b.value === beatId)?.territoryId;
      await send({ action: "assign-retailer-geography", payload: { retailerId, beatId, territoryId, reason: "Manager unmapped-retailer assignment" } });
      setMessage(hi ? "बीट असाइन किया गया।" : "Beat assigned.");
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
        <small>{hi ? "रिटेलर्स" : "RETAILERS"}</small>
        <h2>{hi ? "अनमैप्ड रिटेलर्स" : "Unmapped Retailers"}</h2>
      </div>
      {!retailers.length ? (
        <p className={styles.emptyHint}>{hi ? "कोई अनमैप्ड रिटेलर नहीं — सभी सक्रिय रिटेलर्स में बीट/टेरिटरी असाइन है।" : "No unmapped retailers — every active retailer already has a Beat/Territory assigned."}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "फर्म" : "Firm"}</th>
                <th>{hi ? "संपर्क" : "Contact"}</th>
                <th>{hi ? "मोबाइल" : "Mobile"}</th>
                <th>{hi ? "पता" : "Address"}</th>
                <th>{hi ? "एग्जीक्यूटिव" : "Executive"}</th>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "बीट असाइन करें" : "Assign Beat"}</th>
              </tr>
            </thead>
            <tbody>
              {retailers.map((r) => (
                <tr key={r.id}>
                  <td>{r.businessName}</td>
                  <td>{r.ownerName ?? "—"}</td>
                  <td>{r.mobile ?? "—"}</td>
                  <td>{formatAddress(r.address)}</td>
                  <td>{r.executive ?? "—"}</td>
                  <td>{r.distributor ?? "—"}</td>
                  <td>
                    <select disabled={busy} defaultValue="" onChange={(e) => void assign(r.id, e.target.value)}>
                      <option value="">{hi ? "बीट चुनें" : "Choose Beat"}</option>
                      {beatSuggestions.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
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
