"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFaq } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function FaqManager({ faqs }: { faqs: { id: string; question: string; answer: string; isPublic: boolean }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function submit() {
    setPending(true);
    const result = await createFaq({ question, answer, isPublic: true });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("FAQ added", { tone: "dark" });
    setQuestion(""); setAnswer("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <button type="button" onClick={submit} disabled={pending || !question || !answer} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Add FAQ</button>
      </div>
      <div className="space-y-3">
        {faqs.length === 0 ? <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No FAQs yet.</p> :
          faqs.map((f) => (
            <div key={f.id} className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{f.question}</p>
              <p className="text-xs mt-1" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.answer}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
