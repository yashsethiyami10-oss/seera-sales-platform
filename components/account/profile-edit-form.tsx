"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { updateCustomer } from "@/actions/customers";

/**
 * Wires up `updateCustomer` (actions/customers.ts) — already existed, fully
 * real, already used by the admin customer editor, but no customer-facing
 * page called it for self-service editing. Email is intentionally not
 * editable here — it's also the NextAuth login identifier, and changing it
 * is a real identity-and-verification concern this phase doesn't decide.
 */
export function ProfileEditForm({ customerId, name, email, phone }: { customerId: string; name: string; email: string; phone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name, phone: phone ?? "" });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    const result = await updateCustomer({ id: customerId, name: form.name, phone: form.phone || undefined });
    setSaving(false);
    if (result.success) {
      showToast("Profile updated");
      setEditing(false);
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  if (!editing) {
    return (
      <div className="muv-card">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="muv-text-solid text-sm">{name}</p>
            <p className="muv-text-meta text-sm">{email}</p>
            {phone && <p className="muv-text-meta text-sm">{phone}</p>}
          </div>
          <button onClick={() => setEditing(true)} aria-label="Edit profile" className="muv-icon-circle flex-shrink-0" style={{ width: 30, height: 30 }}>
            <Pencil size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="muv-card space-y-3">
      <div>
        <label htmlFor="profile-name" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Name</label>
        <input id="profile-name" className="muv-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Email</label>
        <input value={email} disabled className="muv-input" style={{ opacity: 0.6 }} aria-label="Email (not editable)" />
      </div>
      <div>
        <label htmlFor="profile-phone" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Phone</label>
        <input id="profile-phone" className="muv-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => { setEditing(false); setForm({ name, phone: phone ?? "" }); }}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}
