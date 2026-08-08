import Link from "next/link";
import { createAiConversationAction } from "@/actions/muv-ai";
import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { listConversations } from "@/lib/muv-ai/conversations";
import { requireAiPermission } from "@/lib/muv-ai/security";

export default async function AiWorkspace({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}) {
  const principal=await getAiPrincipal();requireAiPermission(principal,"ai.conversations.use");const q=await searchParams;
  const data=await listConversations(principal,{search:q.q,page:Number(q.page??1)});
  return <section className="space-y-6 text-white"><header><p className="text-xs uppercase tracking-[.2em] text-amber-400">Governed orchestration</p><h1 className="mt-2 text-3xl font-semibold">MUV AI Workspace</h1><p className="text-sm text-zinc-400">Authorized conversations, evidence-backed answers, governed tools and approval-safe workflows.</p></header>
  <div className="grid gap-5 lg:grid-cols-[320px_1fr]"><aside className="space-y-4 rounded-2xl border border-white/10 p-4"><form action={createAiConversationAction} className="space-y-2"><label htmlFor="title" className="text-sm">New conversation</label><input id="title" name="title" required maxLength={160} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"/><button className="w-full rounded-xl bg-amber-400 px-3 py-2 text-black">Create</button></form><form><input name="q" defaultValue={q.q} aria-label="Search conversations" placeholder="Search conversations" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"/></form></aside>
  <div className="rounded-2xl border border-white/10"><div className="divide-y divide-white/10">{data.rows.map(row=><Link key={row.id} href={`/sales/ai/${row.id}`} className="block p-4 hover:bg-white/5"><div className="flex justify-between"><span>{row.pinned?"📌 ":""}{row.title}</span><span className="text-xs text-zinc-500">{row.status}</span></div><p className="mt-1 text-xs text-zinc-500">{row.lastActivityAt.toLocaleString()}</p></Link>)}{!data.rows.length?<p className="p-10 text-center text-zinc-500">No conversations.</p>:null}</div></div></div>
  </section>;
}
