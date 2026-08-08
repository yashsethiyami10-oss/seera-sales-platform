"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCustomerNote } from "@/actions/customers";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";

type Note = { id: string; body: string; createdAt: string; authorName: string | null };

/** Reuses the existing, real, staff-only `addCustomerNote` action
 * (actions/customers.ts) — internal notes are never exposed to the
 * customer themselves, per that action's own existing documentation. */
export function CustomerNotesClient({ customerId, notes }: { customerId: string; notes: Note[] }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    const result = await addCustomerNote({ customerId, body });
    setSaving(false);
    if (result.success) {
      setBody("");
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {notes.map((n) => (
          <div key={n.id} className="muv-card" style={{ padding: 14 }}>
            <p className="muv-text-body text-sm">{n.body}</p>
            <p className="muv-text-faint text-xs mt-2">{n.authorName ?? "Staff"} · {new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="muv-text-meta text-sm">No internal notes yet.</p>}
      </div>
      <div className="flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an internal note…" className="muv-input flex-1" aria-label="New internal note" />
        <Button variant="ghost" onClick={handleAdd} disabled={saving || !body.trim()}>{saving ? "Adding…" : "Add"}</Button>
      </div>
    </div>
  );
}
