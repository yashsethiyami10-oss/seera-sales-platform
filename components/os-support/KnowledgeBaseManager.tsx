"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createKbCategory, createKbArticleDraft, submitKbArticleForReview, approveKbArticle, publishKbArticle } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
type Article = { id: string; title: string; slug: string; status: string; visibility: string; version: number; categoryName: string };

export function KnowledgeBaseManager({ categories, articles }: { categories: { id: string; name: string }[]; articles: Article[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("INTERNAL");

  async function act(fn: () => Promise<{ success: true; data: unknown } | { success: false; error: { message: string } }>, msg: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(msg, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <div className="flex gap-2">
          <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={() => { act(() => createKbCategory({ name: newCategoryName }), "Category created"); setNewCategoryName(""); }} disabled={pending || !newCategoryName} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add Category</button>
        </div>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Article Draft</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug-like-this" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="INTERNAL">INTERNAL</option>
            <option value="PUBLIC">PUBLIC</option>
          </select>
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={() => act(() => createKbArticleDraft({ categoryId, title, slug, body, visibility }), "Draft created")} disabled={pending || !categoryId || !title || !slug || !body} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Draft</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Title", "Category", "Visibility", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {articles.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No articles yet.</td></tr> :
              articles.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{a.title}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.categoryName}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.visibility}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.status}</td>
                  <td className="px-4 py-3 flex gap-1">
                    {a.status === "DRAFT" && <button type="button" onClick={() => act(() => submitKbArticleForReview(a.id, a.version), "Submitted for review")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Submit</button>}
                    {a.status === "IN_REVIEW" && <button type="button" onClick={() => act(() => approveKbArticle(a.id, a.version), "Approved")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Approve</button>}
                    {a.status === "APPROVED" && <button type="button" onClick={() => act(() => publishKbArticle(a.id, a.version), "Published")} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Publish</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
