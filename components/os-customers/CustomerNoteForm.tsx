"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCustomerNote } from "@/actions/customers";
import { useToast } from "@/components/ui/toast";

/** MUV OS™ — Milestone 2, Customer Activity "Notes" — reuses the existing `addCustomerNote` action unchanged. */
export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const result = await addCustomerNote({ customerId, body });
    setSaving(false);
    if (result.success) {
      setBody("");
      showToast("Note added", { tone: "dark" });
      router.refresh();
    } else {
      showToast(result.error.message, { tone: "dark" });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <label className="sr-only" htmlFor="customer-note-body">Add an internal note</label>
      <input
        id="customer-note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an internal note…"
        className="muv-os-field flex-1 rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
      />
      <button
        type="submit"
        disabled={saving || !body.trim()}
        className="muv-os-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--lavender)", color: "#0b0b0f" }}
      >
        {saving ? "…" : "Add"}
      </button>
    </form>
  );
}
