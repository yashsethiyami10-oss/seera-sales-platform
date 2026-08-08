"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { createCoupon, updateCoupon, deleteCoupon } from "@/actions/coupons";
import { useToast } from "@/components/ui/toast";
import { Badge, Button } from "@/components/ui/primitives";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Modal } from "@/components/ui/modal";

type Coupon = { id: string; code: string; type: "PERCENT" | "FLAT"; value: number; minOrderValue: number; maxUses: number | null; usedCount: number; active: boolean; expiresAt: string | null };

const EMPTY_FORM = { code: "", type: "PERCENT" as "PERCENT" | "FLAT", value: "", minOrderValue: "0", maxUses: "", expiresAt: "" };

/**
 * Reuses createCoupon/updateCoupon/deleteCoupon (actions/coupons.ts) —
 * already real, already had full validation (percent-cap, code format),
 * already correctly deactivates-rather-than-deletes a used coupon. No new
 * business logic; this is the missing UI for a fully complete backend.
 * "Customer Restriction" and a separate "Maximum Discount" cap are
 * deliberately not fields here — neither exists on the Coupon model
 * (checked prisma/schema.prisma) — see the implementation report.
 */
export function CouponsTableClient({ coupons }: { coupons: Coupon[] }) {
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function startEdit(c: Coupon) {
    setEditing(c);
    setAdding(false);
    setForm({ code: c.code, type: c.type, value: String(c.value), minOrderValue: String(c.minOrderValue), maxUses: c.maxUses != null ? String(c.maxUses) : "", expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "" });
  }

  function startAdd() {
    setAdding(true);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function close() {
    setAdding(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      minOrderValue: Number(form.minOrderValue || 0),
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt) : null,
    };
    const result = editing ? await updateCoupon({ id: editing.id, ...payload }) : await createCoupon(payload);
    setSaving(false);
    if (result.success) {
      showToast(editing ? "Coupon updated" : "Coupon created");
      close();
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  async function toggleActive(c: Coupon) {
    const result = await updateCoupon({ id: c.id, active: !c.active });
    if (result.success) {
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCoupon(deleteTarget.id);
      if (result.success) {
        showToast(deleteTarget.usedCount > 0 ? "Coupon deactivated (it's been used, so it's kept for order history)" : "Coupon deleted");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
      setDeleteTarget(null);
    });
  }

  const showForm = adding || editing;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="primary" onClick={startAdd}><Plus size={14} /> Add Coupon</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Code", "Type", "Value", "Min Order", "Uses", "Expires", "Status", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.code}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.type === "PERCENT" ? "Percentage" : "Flat"}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.type === "PERCENT" ? `${c.value}%` : `₹${c.value}`}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.minOrderValue > 0 ? `₹${c.minOrderValue}` : "—"}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN") : "Never"}</td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <button onClick={() => toggleActive(c)}><Badge tone={c.active ? "positive" : "muted"}>{c.active ? "Active" : "Inactive"}</Badge></button>
                </td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <div className="flex gap-1.5">
                    <button className="muv-icon-circle" style={{ width: 30, height: 30 }} onClick={() => startEdit(c)} aria-label={`Edit ${c.code}`}><Pencil size={13} /></button>
                    <button className="muv-icon-circle" style={{ width: 30, height: 30 }} onClick={() => setDeleteTarget(c)} aria-label={`Delete ${c.code}`}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center muv-text-meta text-sm">No coupons yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? "Edit Coupon" : "Add Coupon"} onClose={close}>
          <div className="space-y-4">
            <div>
              <label htmlFor="coupon-code" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Code</label>
              <input id="coupon-code" className="muv-input" style={{ textTransform: "uppercase" }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MUV10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-type" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Type</label>
                <select id="coupon-type" className="muv-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "PERCENT" | "FLAT" })}>
                  <option value="PERCENT">Percentage</option>
                  <option value="FLAT">Flat Amount</option>
                </select>
              </div>
              <div>
                <label htmlFor="coupon-value" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Value {form.type === "PERCENT" ? "(%)" : "(₹)"}</label>
                <input id="coupon-value" type="number" className="muv-input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-min" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Min Order Value (₹)</label>
                <input id="coupon-min" type="number" className="muv-input" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
              </div>
              <div>
                <label htmlFor="coupon-maxuses" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Usage Limit (optional)</label>
                <input id="coupon-maxuses" type="number" className="muv-input" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Unlimited" />
              </div>
            </div>
            <div>
              <label htmlFor="coupon-expiry" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Expiry Date (optional)</label>
              <input id="coupon-expiry" type="date" className="muv-input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <Button variant="primary" onClick={handleSave} disabled={saving || !form.code || !form.value} className="w-full">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Coupon"}
            </Button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={`Delete ${deleteTarget.code}?`} onClose={() => setDeleteTarget(null)}>
          <p className="muv-text-body text-sm mb-5">
            {deleteTarget.usedCount > 0
              ? "This coupon has been used on real orders — it will be deactivated instead of deleted, so those orders keep an accurate record."
              : "This can't be undone."}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={confirmDelete} disabled={isPending}>{isPending ? "Removing…" : "Confirm"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
