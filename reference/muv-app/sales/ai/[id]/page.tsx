import { notFound } from "next/navigation";
import { submitAiMessageAction } from "@/actions/muv-ai";
import { prisma } from "@/lib/prisma";
import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { requireAiPermission } from "@/lib/muv-ai/security";

export default async function ConversationPage({params}:{params:Promise<{id:string}>}) {
 const principal=await getAiPrincipal();requireAiPermission(principal,"ai.conversations.use");const {id}=await params;
 const conversation=await prisma.aiConversation.findFirst({where:{id,organizationKey:principal.organizationKey,deletedAt:null}});if(!conversation||(!principal.isFounder&&!principal.permissions.has("ai.conversations.manage")&&conversation.ownerId!==principal.id&&!conversation.participants.includes(principal.id)))notFound();
 const messages=await prisma.aiMessage.findMany({where:{conversationId:id},orderBy:{createdAt:"asc"},take:200});
 return <section className="space-y-5 text-white"><header><h1 className="text-3xl font-semibold">{conversation.title}</h1><p className="text-sm text-zinc-500">Context v{conversation.contextVersion} · {conversation.language} · immutable history</p></header>
 <div aria-live="polite" className="space-y-3 rounded-2xl border border-white/10 p-4">{messages.map(m=><article key={m.id} className={`max-w-3xl rounded-2xl p-4 ${m.role==="USER"?"ml-auto bg-amber-400 text-black":"bg-white/5"}`}><p className="whitespace-pre-wrap">{m.content}</p>{m.role==="ASSISTANT"?<p className="mt-2 text-xs opacity-60">{m.validationStatus} · evidence references preserved</p>:null}</article>)}{!messages.length?<p className="py-12 text-center text-zinc-500">Ask a question. MUV AI releases platform facts only after evidence and scope validation.</p>:null}</div>
 <form action={submitAiMessageAction} className="flex gap-3"><input type="hidden" name="conversationId" value={id}/><textarea name="message" required maxLength={8000} aria-label="Message" className="min-h-24 flex-1 rounded-2xl border border-white/10 bg-white/5 p-4"/><button className="self-end rounded-xl bg-amber-400 px-5 py-3 text-black">Send</button></form></section>;
}
