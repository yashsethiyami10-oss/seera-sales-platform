"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { addAddress, updateAddress, deleteAddress } from "@/actions/customers";
import { detectPincodeStateMismatch } from "@/lib/utils/pincode";

type Address = { id: string; label: string; line1: string; line2: string | null; city: string; state: string; pincode: string; phone: string; isDefault: boolean };
const EMPTY_FORM = { label: "Home", line1: "", line2: "", city: "", state: "", pincode: "", phone: "" };

/**
 * Wires up `addAddress`/`updateAddress`/`deleteAddress` (actions/customers.ts)
 * — all three already existed, fully real, before this phase; no page
 * called `updateAddress` or `deleteAddress` at all. This is the missing UI
 * for existing backend functionality, not new business logic.
 */
export function AddressManager({ customerId, addresses }: { customerId: string; addresses: Address[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  function startEdit(a: Address) {
    setEditingId(a.id);
    setAdding(false);
    setForm({ label: a.label, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode, phone: a.phone });
  }

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    setSaving(true);
    const result = editingId
      ? await updateAddress({ id: editingId, ...form })
      : await addAddress({ customerId, ...form, isDefault: addresses.length === 0 });
    setSaving(false);
    if (result.success) {
      showToast(editingId ? "Address updated" : "Address added");
      cancel();
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteAddress(id);
    if (result.success) {
      showToast("Address removed");
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  const showForm = adding || editingId;
  // Founder Final Consolidated Polish, Part 3 — this form previously had no
  // validation at all (unlike checkout's guest address form, which already
  // checked PIN/phone format). Same rules applied here for parity, plus the
  // same real PIN/state postal-zone mismatch check (lib/utils/pincode.ts).
  const validPincode = /^\d{6}$/.test(form.pincode);
  const validPhone = /^[6-9]\d{9}$/.test(form.phone);
  const pincodeMismatch = detectPincodeStateMismatch(form.pincode, form.state);
  const formComplete = form.line1.trim().length > 0 && form.city.trim().length > 0 && form.state.trim().length > 0 && validPincode && validPhone;

  return (
    <div className="space-y-3">
      {addresses.map((a) => (
        <div key={a.id} className="muv-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="muv-tag-pill">{a.label}</span>
              {a.isDefault && <span className="muv-tag-pill ml-2">Default</span>}
              <p className="muv-text-body text-sm mt-2">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} – {a.pincode}</p>
              <p className="muv-text-meta text-xs mt-1">{a.phone}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => startEdit(a)} aria-label={`Edit ${a.label} address`} className="muv-icon-circle" style={{ width: 30, height: 30 }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => handleDelete(a.id)} aria-label={`Delete ${a.label} address`} className="muv-icon-circle" style={{ width: 30, height: 30 }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {addresses.length === 0 && !showForm && <p className="muv-text-meta text-sm">No saved addresses yet.</p>}

      {showForm ? (
        <div className="muv-card grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="Label (e.g. Home)" aria-label="Address label" className="muv-input sm:col-span-2" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input placeholder="Address line 1" aria-label="Address line 1" className="muv-input sm:col-span-2" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          <input placeholder="Address line 2 (optional)" aria-label="Address line 2" className="muv-input sm:col-span-2" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          <input placeholder="City" aria-label="City" className="muv-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input placeholder="State" aria-label="State" className="muv-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <input placeholder="PIN code" aria-label="PIN code" className="muv-input" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} maxLength={6} inputMode="numeric" aria-invalid={form.pincode.length > 0 && !validPincode} />
          <input placeholder="Phone" aria-label="Phone" className="muv-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={form.phone.length > 0 && !validPhone} />
          {form.pincode.length > 0 && !validPincode && <p className="sm:col-span-2 text-xs" style={{ color: "#f87171" }}>PIN code must be exactly 6 digits.</p>}
          {form.phone.length > 0 && !validPhone && <p className="sm:col-span-2 text-xs" style={{ color: "#f87171" }}>Enter a valid 10-digit Indian mobile number.</p>}
          {pincodeMismatch && <p className="sm:col-span-2 text-xs" style={{ color: "#f0b429" }}>⚠ {pincodeMismatch}</p>}
          <div className="sm:col-span-2 flex gap-3">
            <Button variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !formComplete}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Address"}</Button>
          </div>
        </div>
      ) : (
        <button onClick={startAdd} className="muv-btn-ghost flex items-center gap-2">
          <Plus size={14} /> Add New Address
        </button>
      )}
    </div>
  );
}
