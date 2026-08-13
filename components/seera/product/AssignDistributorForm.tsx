"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/manager/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

export function AssignDistributorForm({
  language,
  orderId,
  distributors,
}: {
  language: "EN" | "HI";
  orderId: string;
  distributors: { value: string; label: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  return (
    <form
      style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          distributorId = String(f.get("distributorId") || ""),
          reason = String(f.get("reason") || "");
        if (!distributorId) return;
        setBusy(true);
        setError("");
        void post("assign-distributor", { orderId, distributorId, reason })
          .then(() => router.refresh())
          .catch((err) => setError(err instanceof Error ? err.message : "Could not assign"))
          .finally(() => setBusy(false));
      }}
    >
      <select name="distributorId" required defaultValue="">
        <option value="" disabled>
          {hi ? "वितरक चुनें" : "Choose Distributor"}
        </option>
        {distributors.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <input name="reason" placeholder={hi ? "कारण" : "Reason"} required minLength={3} style={{ minWidth: 140 }} />
      <button disabled={busy}>{hi ? "असाइन करें" : "ASSIGN"}</button>
      {error && (
        <span role="status" style={{ color: "#b4232d", fontSize: 12 }}>
          {error}
        </span>
      )}
    </form>
  );
}
