"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type SessionOption = { value: string; label: string; distanceKm: number };
type Claim = {
  id: string;
  claimNumber: string;
  claimDate: string;
  vehicleType: string;
  claimedDistanceKm: number;
  totalClaimed: number;
  status: string;
  purpose: string | null;
  hotelStay: boolean;
  hotelAmount: number;
  employeeName?: string;
};

async function send(endpoint: string, body: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

export function MyTaClaimActions({
  language,
  claimableSessions,
  vehicleTypes,
  claims,
}: {
  language: "EN" | "HI";
  claimableSessions: SessionOption[];
  vehicleTypes: string[];
  claims: Claim[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selectedSession, setSelectedSession] = useState(""),
    [hotelStay, setHotelStay] = useState(false);
  const selected = claimableSessions.find((s) => s.value === selectedSession);
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "मेरी यात्रा भत्ता" : "MY TA"}</small>
        <h2>{hi ? "नया यात्रा दावा" : "New travel claim"}</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void (async () => {
            setBusy(true);
            setMessage("");
            try {
              await send("/api/manager/operations", {
                action: "submit-ta-claim",
                payload: {
                  workSessionId: selectedSession,
                  vehicleType: String(form.get("vehicleType")),
                  claimedDistanceKm: selected?.distanceKm ?? 0,
                  purpose: String(form.get("purpose") || "") || undefined,
                  fromLocation: String(form.get("fromLocation") || "") || undefined,
                  toLocation: String(form.get("toLocation") || "") || undefined,
                  hotelStay,
                  hotelName: hotelStay ? String(form.get("hotelName") || "") || undefined : undefined,
                  hotelAmount: hotelStay ? Number(form.get("hotelAmount") || 0) : undefined,
                  tollAmount: Number(form.get("tollAmount") || 0),
                  parkingAmount: Number(form.get("parkingAmount") || 0),
                  otherExpenseAmount: Number(form.get("otherExpenseAmount") || 0),
                  otherExpenseNote: String(form.get("otherExpenseNote") || "") || undefined,
                  dailyAllowance: 0,
                  proofFileIds: [],
                  remarks: String(form.get("remarks") || "") || undefined,
                  idempotencyKey: crypto.randomUUID(),
                },
              });
              setMessage(hi ? "दावा सफलतापूर्वक सबमिट किया गया।" : "Claim submitted successfully.");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Action failed");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label>
          {hi ? "कार्य दिवस" : "Work day"}
          <select name="workSessionId" required value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">{hi ? "दिन चुनें" : "Choose a day"}</option>
            {claimableSessions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        {!claimableSessions.length && <EmptyOptionHint language={language} fallback={hi ? "GPS दूरी वाले कार्य दिवस के बाद ही दावा किया जा सकता है।" : "A claim is available once a work day has a GPS distance."} />}
        {selected && (
          <p className={styles.emptyHint} style={{ background: "#effaf2", color: "#177245" }}>
            {hi ? `GPS चेकपॉइंट से अनुमानित दूरी: ${selected.distanceKm.toFixed(1)} किमी — यह वास्तविक सड़क दूरी नहीं है।` : `Estimated travel distance from GPS checkpoints: ${selected.distanceKm.toFixed(1)} km — not actual road distance.`}
          </p>
        )}
        <label>
          {hi ? "यात्रा माध्यम" : "Travel mode"}
          <select name="vehicleType" required>
            {vehicleTypes.length ? vehicleTypes.map((v) => <option key={v} value={v}>{v}</option>) : <option value="STANDARD_FIELD">STANDARD_FIELD</option>}
          </select>
        </label>
        <label>{hi ? "उद्देश्य" : "Purpose"}<input name="purpose" /></label>
        <label>{hi ? "से" : "From"}<input name="fromLocation" /></label>
        <label>{hi ? "तक" : "To"}<input name="toLocation" /></label>
        <label>
          {hi ? "होटल में रुके?" : "Hotel stay?"}
          <select value={hotelStay ? "yes" : "no"} onChange={(e) => setHotelStay(e.target.value === "yes")}>
            <option value="no">{hi ? "नहीं" : "No"}</option>
            <option value="yes">{hi ? "हाँ" : "Yes"}</option>
          </select>
        </label>
        {hotelStay && (
          <>
            <label>{hi ? "होटल का नाम" : "Hotel name"}<input name="hotelName" /></label>
            <label>{hi ? "होटल राशि" : "Hotel amount"}<input name="hotelAmount" type="number" min="0" step="0.01" /></label>
          </>
        )}
        <label>{hi ? "टोल" : "Toll"}<input name="tollAmount" type="number" min="0" step="0.01" /></label>
        <label>{hi ? "पार्किंग" : "Parking"}<input name="parkingAmount" type="number" min="0" step="0.01" /></label>
        <label>{hi ? "अन्य स्वीकृत खर्च" : "Other approved expense"}<input name="otherExpenseAmount" type="number" min="0" step="0.01" /></label>
        <label>{hi ? "अन्य खर्च विवरण" : "Other expense note"}<input name="otherExpenseNote" /></label>
        <label>{hi ? "टिप्पणी" : "Remarks"}<input name="remarks" /></label>
        <button disabled={busy || !claimableSessions.length}>{hi ? "दावा सबमिट करें" : "Submit claim"}</button>
      </form>
      {message && <p role="status">{message}</p>}
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <strong>{hi ? "मेरे दावे" : "My claims"}</strong>
        {!claims.length && <EmptyOptionHint language={language} fallback={hi ? "अभी तक कोई दावा नहीं।" : "No claims yet."} />}
        <ul className={styles.list}>
          {claims.map((c) => (
            <li key={c.id}>
              <p>
                <strong>{c.claimNumber}</strong> · {new Date(c.claimDate).toLocaleDateString(hi ? "hi-IN" : "en-IN")} · {c.claimedDistanceKm.toFixed(1)} km
                {c.hotelStay ? ` · ${hi ? "होटल" : "Hotel"} ₹${c.hotelAmount.toLocaleString("en-IN")}` : ""}
              </p>
              <p>₹{c.totalClaimed.toLocaleString("en-IN")} · <span className={styles.badge}>{c.status}</span></p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TeamTaClaimsPanel({ language, claims }: { language: "EN" | "HI"; claims: Claim[] }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "टीम टीए सत्यापन" : "TEAM TA VERIFICATION"}</small>
        <h2>{hi ? "लंबित दावे" : "Pending claims"}</h2>
      </div>
      {!claims.length && <EmptyOptionHint language={language} fallback={hi ? "सत्यापन के लिए कोई दावा लंबित नहीं।" : "No claims pending verification."} />}
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <ul className={styles.list}>
          {claims.map((c) => (
            <li key={c.id}>
              <p>
                <strong>{c.employeeName}</strong> · {c.claimNumber} · {new Date(c.claimDate).toLocaleDateString(hi ? "hi-IN" : "en-IN")}
              </p>
              <p>
                {hi ? "दावा की गई दूरी" : "Claimed"}: {c.claimedDistanceKm.toFixed(1)} km · ₹{c.totalClaimed.toLocaleString("en-IN")}
                {c.hotelStay ? ` · ${hi ? "होटल" : "Hotel"} ₹${c.hotelAmount.toLocaleString("en-IN")}` : ""}
                {c.purpose ? ` · ${c.purpose}` : ""}
              </p>
              <form
                className={styles.inlineActions}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void (async () => {
                    setBusy(true);
                    setMessage("");
                    try {
                      await send("/api/travel/operations", {
                        action: "verify",
                        payload: { claimId: c.id, approvedDistanceKm: Number(form.get("distance")), reason: String(form.get("reason")) },
                      });
                      setMessage(hi ? "सत्यापित किया गया।" : "Verified.");
                      router.refresh();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Action failed");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <input name="distance" type="number" min="0" step="0.1" defaultValue={c.claimedDistanceKm} required />
                <input name="reason" placeholder={hi ? "कारण" : "Reason"} required />
                <button disabled={busy}>{hi ? "सत्यापित करें" : "Verify"}</button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={(event) => {
                    const form = new FormData(event.currentTarget.closest("form")!);
                    void (async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        await send("/api/travel/operations", { action: "reject", payload: { claimId: c.id, reason: String(form.get("reason")) } });
                        setMessage(hi ? "दावा अस्वीकृत किया गया।" : "Claim rejected.");
                        router.refresh();
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Action failed");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  {hi ? "अस्वीकार करें" : "Reject"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
