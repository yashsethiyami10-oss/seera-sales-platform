"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

export function TravelPolicyActions({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI"; const router = useRouter(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  return <section className={styles.panel}><div><small>{hi ? "टीए नीति" : "TA POLICY"}</small><h2>{hi ? "प्रभावी-दिनांक नीति बनाएँ" : "Configure effective-dated policy"}</h2></div><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void (async () => { setBusy(true); setMessage(""); try { const response = await fetch("/api/travel/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure-policy", payload: { employeeRole: String(form.get("employeeRole") || "") || undefined, vehicleType: "STANDARD_FIELD", policyType: String(form.get("policyType")), ratePerKm: form.get("ratePerKm") ? Number(form.get("ratePerKm")) : undefined, fixedAllowance: form.get("fixedAllowance") ? Number(form.get("fixedAllowance")) : undefined, effectiveFrom: String(form.get("effectiveFrom")), effectiveTo: String(form.get("effectiveTo") || "") || undefined, status: String(form.get("status")) } }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result?.error?.message ?? "Action failed"); setMessage(hi ? "नीति बनाई गई।" : "Policy configured."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); } finally { setBusy(false); } })(); }}>
    <label>{hi ? "भूमिका" : "Role"}<select name="employeeRole"><option>SALES_EXECUTIVE</option><option>SALES_MANAGER</option></select></label>
    <label>{hi ? "गणना मोड" : "Calculation mode"}<select name="policyType"><option>PER_KM</option><option>FIXED_DAILY</option><option>PER_KM_PLUS_FIXED</option><option>NONE</option></select></label>
    <label>{hi ? "₹ प्रति किमी" : "₹ per km"}<input name="ratePerKm" type="number" min="0" step="0.01" /></label>
    <label>{hi ? "स्थिर दैनिक राशि" : "Fixed daily amount"}<input name="fixedAllowance" type="number" min="0" step="0.01" /></label>
    <label>{hi ? "प्रभावी से" : "Effective from"}<input name="effectiveFrom" type="date" required /></label><label>{hi ? "प्रभावी तक" : "Effective to"}<input name="effectiveTo" type="date" /></label>
    <label>{hi ? "स्थिति" : "Status"}<select name="status"><option>ACTIVE</option><option>INACTIVE</option></select></label><button disabled={busy}>{hi ? "नीति सहेजें" : "Save policy"}</button>
  </form>{message && <p role="status">{message}</p>}</section>;
}
