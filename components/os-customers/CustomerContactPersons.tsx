"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";
import { addContactPerson, deleteContactPerson } from "@/actions/customers";
import { useToast } from "@/components/ui/toast";

type ContactPerson = {
  id: string; name: string; designation: string | null; mobile: string | null;
  whatsapp: string | null; email: string | null; isDecisionMaker: boolean;
};

const fieldClass = "muv-os-field rounded-lg px-2 py-1.5 text-sm bg-transparent";
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/** MUV OS™ — Milestone 2, Customer Profile "Contact Persons" (multiple per customer). */
export function CustomerContactPersons({ customerId, contacts }: { customerId: string; contacts: ContactPerson[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await addContactPerson({
      customerId,
      name: form.get("name"),
      designation: form.get("designation") || undefined,
      mobile: form.get("mobile") || undefined,
      whatsapp: form.get("whatsapp") || undefined,
      email: form.get("email") || undefined,
      isDecisionMaker: form.get("isDecisionMaker") === "on",
    });
    setSaving(false);
    if (result.success) {
      setAdding(false);
      showToast("Contact person added", { tone: "dark" });
      router.refresh();
    } else {
      showToast(result.error.message, { tone: "dark" });
    }
  }

  async function onDelete(id: string) {
    const result = await deleteContactPerson(id);
    if (result.success) {
      showToast("Contact person removed", { tone: "dark" });
      router.refresh();
    } else {
      showToast(result.error.message, { tone: "dark" });
    }
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 && !adding && (
        <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No contact persons added yet.</p>
      )}
      {contacts.map((c) => (
        <div key={c.id} className="muv-os-row flex items-start justify-between rounded-lg px-3 py-2" style={{ border: "1px solid var(--card-border)" }}>
          <div>
            <p className="text-sm flex items-center gap-1.5" style={{ color: "rgba(var(--text-rgb),0.9)" }}>
              {c.name} {c.isDecisionMaker && <Star size={12} style={{ color: "var(--lavender)" }} aria-label="Decision maker" />}
              {c.designation && <span style={{ color: "rgba(var(--text-rgb),0.5)" }}> — {c.designation}</span>}
            </p>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
              {[c.mobile, c.email].filter(Boolean).join(" · ") || "No contact details"}
            </p>
          </div>
          <button type="button" onClick={() => onDelete(c.id)} aria-label={`Remove ${c.name}`} className="muv-os-btn-ghost p-1" style={{ color: "rgba(var(--text-rgb),0.4)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={onSubmit} className="space-y-2 rounded-lg p-3" style={{ border: "1px solid var(--card-border)" }}>
          <div className="grid grid-cols-2 gap-2">
            <input name="name" required placeholder="Name *" className={fieldClass} style={fieldStyle} />
            <input name="designation" placeholder="Designation" className={fieldClass} style={fieldStyle} />
            <input name="mobile" placeholder="Mobile" className={fieldClass} style={fieldStyle} />
            <input name="whatsapp" placeholder="WhatsApp" className={fieldClass} style={fieldStyle} />
            <input name="email" type="email" placeholder="Email" className={`${fieldClass} col-span-2`} style={fieldStyle} />
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
            <input type="checkbox" name="isDecisionMaker" /> Decision maker
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="muv-os-interactive flex items-center gap-1.5 text-xs px-2 py-1" style={{ color: "var(--lavender)" }}>
          <Plus size={13} /> Add contact person
        </button>
      )}
    </div>
  );
}
