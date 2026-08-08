"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "@/actions/suppliers";
import { useToast } from "@/components/ui/toast";

export function SupplierForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await createSupplier({
      legalName: form.get("legalName"),
      displayName: form.get("displayName"),
      currency: form.get("currency") || "INR",
      leadTimeDays: form.get("leadTimeDays") ? Number(form.get("leadTimeDays")) : undefined,
      primaryContactName: form.get("primaryContactName") || undefined,
      primaryContactEmail: form.get("primaryContactEmail") || undefined,
      primaryContactPhone: form.get("primaryContactPhone") || undefined,
      paymentTerms: form.get("paymentTerms") || undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      return;
    }
    showToast("Supplier created", { tone: "dark" });
    router.push("/os/suppliers");
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-xl">
      {error && (
        <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {error}
        </p>
      )}
      <div><label className={label} style={labelStyle}>Legal Name *</label><input name="legalName" required className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Display Name *</label><input name="displayName" required className={field} style={fieldStyle} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} style={labelStyle}>Currency</label><input name="currency" defaultValue="INR" className={field} style={fieldStyle} /></div>
        <div><label className={label} style={labelStyle}>Lead Time (days)</label><input type="number" name="leadTimeDays" className={field} style={fieldStyle} /></div>
      </div>
      <div><label className={label} style={labelStyle}>Primary Contact Name</label><input name="primaryContactName" className={field} style={fieldStyle} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} style={labelStyle}>Contact Email</label><input type="email" name="primaryContactEmail" className={field} style={fieldStyle} /></div>
        <div><label className={label} style={labelStyle}>Contact Phone</label><input name="primaryContactPhone" className={field} style={fieldStyle} /></div>
      </div>
      <div><label className={label} style={labelStyle}>Payment Terms</label><input name="paymentTerms" className={field} style={fieldStyle} /></div>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Saving…" : "Create Supplier"}
      </button>
    </form>
  );
}
