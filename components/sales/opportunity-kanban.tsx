"use client";

import { useState, useTransition } from "react";
import { transitionOpportunityAction } from "@/actions/opportunities";

type Stage = { code: string; name: string };
type Card = { id: string; number: string; customer: string; stage: string; value: string; probability: number };

export function OpportunityKanban({ stages, cards }: { stages: Stage[]; cards: Card[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function move(opportunityId: string, targetStageCode: string) {
    startTransition(async () => {
      const result = await transitionOpportunityAction({ opportunityId, targetStageCode, reason: "Pipeline drag" });
      setMessage(result.success ? "Stage updated" : result.error.message);
    });
  }
  return <div>
    {message&&<p className="mb-3 text-sm text-amber-400" role="status">{message}</p>}
    <div className="grid min-w-[1100px] grid-cols-6 gap-3 overflow-x-auto">
      {stages.filter(stage=>!["WON","LOST","ON_HOLD"].includes(stage.code)).map(stage=><section key={stage.code}
        onDragOver={event=>event.preventDefault()} onDrop={event=>move(event.dataTransfer.getData("text/opportunity"), stage.code)}
        className="min-h-64 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <h2 className="mb-3 text-sm font-medium">{stage.name}</h2>
        <div className="space-y-3">{cards.filter(card=>card.stage===stage.code).map(card=><article key={card.id} draggable={!pending}
          onDragStart={event=>event.dataTransfer.setData("text/opportunity",card.id)}
          className="cursor-grab rounded-xl border border-white/10 bg-zinc-950 p-3">
          <p className="text-xs text-amber-400">{card.number}</p><p className="mt-1">{card.customer}</p>
          <p className="mt-2 text-xs text-zinc-500">{card.value} · {card.probability}%</p>
        </article>)}</div>
      </section>)}
    </div>
  </div>;
}
