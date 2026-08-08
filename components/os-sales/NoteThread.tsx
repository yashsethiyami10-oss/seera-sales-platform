"use client";

import { useEffect, useState, useTransition } from "react";
import { addInstNote, listInstNotes } from "@/actions/inst-shared";
import { useToast } from "@/components/ui/toast";

type Note = { id: string; body: string; createdAt: string | Date; author: { name: string | null } };

/** Shared thread used by Lead/Opportunity/Visit/Sample/Quotation/Order detail pages — one implementation over InstNote's generic entityType+entityId shape. */
export function NoteThread({ entityType, entityId }: { entityType: "LEAD" | "OPPORTUNITY" | "VISIT" | "SAMPLE" | "QUOTATION" | "ORDER"; entityId: string }) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listInstNotes(entityType, entityId).then((result) => {
      if (result.success) setNotes(result.data as Note[]);
      setLoading(false);
    });
  }, [entityType, entityId]);

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addInstNote({ entityType, entityId, body });
      if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
      setNotes((prev) => [result.data as Note, ...prev]);
      setBody("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…"
          className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent flex-1"
          style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        <button type="button" onClick={submit} disabled={isPending || !body.trim()} className="muv-os-btn-ghost rounded-lg px-3 py-2 text-sm disabled:opacity-50" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Add</button>
      </div>
      {loading ? (
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(var(--text-rgb),0.04)" }}>
              <p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{n.body}</p>
              <p className="mt-1 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{n.author.name} · {new Date(n.createdAt).toLocaleString("en-IN")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
