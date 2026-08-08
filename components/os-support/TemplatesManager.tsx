"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createResolutionTemplate } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function TemplatesManager({ templates }: { templates: { id: string; title: string; body: string; category: string | null }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    setPending(true);
    const result = await createResolutionTemplate({ title, body });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Template created", { tone: "dark" });
    setTitle(""); setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <button type="button" onClick={submit} disabled={pending || !title || !body} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Template</button>
      </div>
      <div className="space-y-3">
        {templates.length === 0 ? <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No templates yet.</p> :
          templates.map((t) => (
            <div key={t.id} className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{t.title} {t.category && <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>({t.category})</span>}</p>
              <p className="text-xs mt-1" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t.body}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
