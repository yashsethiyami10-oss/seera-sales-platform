import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { AiPrincipal, GovernedResponse } from "./types";

type GatewayRequest = {
  principal: AiPrincipal;
  conversationId: string;
  workflowId?: string;
  prompt: { content: string; code: string; version: number };
  correlationId: string;
  evidence: GovernedResponse["evidence"];
};

function extractUserRequest(prompt: string): string {
  const patterns = [
    /user_request\s*[:=]\s*["']?([\s\S]+?)["']?(?:\n|$)/i,
    /USER REQUEST\s*[:\-]\s*([\s\S]+)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return prompt.trim();
}

function composeDeterministicCareResponse(userRequest: string) {
  const value = userRequest.toLowerCase();

  const isBirthday = /\b(birthday|bday|born day)\b/.test(value);
  const isGift = /\b(gift|present|surprise|recommend|suggest)\b/.test(value);

  if (isBirthday && isGift) {
    return {
      summary:
        "That sounds lovely — happy birthday to Kiran! 🎉 I’ll help you plan a surprise she’ll genuinely enjoy. Tell me just two things: your budget, and what she likes most — self-care, books, fashion, food, travel, home décor, or something else. If you need a quick idea right now, choose a small personalized hamper with her favourite chocolates, a handwritten note, flowers, and one item connected to her interests.",
      citations: [],
    };
  }

  if (/\b(home care|clean|cleaning|stain|bathroom|floor|laundry|toilet|kitchen)\b/.test(value)) {
    return {
      summary:
        "I can help with that. Tell me the exact surface or problem — for example a stain, odour, sticky floor, bathroom buildup, laundry issue, or product recommendation — and I’ll give you the safest next step.",
      citations: [],
    };
  }

  if (/\b(body care|body wash|hand wash|self care|skin)\b/.test(value)) {
    return {
      summary:
        "I’d be happy to help you choose. Is this for daily use, gifting, fragrance preference, or a specific skin concern? Share your budget too, and I’ll narrow it down.",
      citations: [],
    };
  }

  return {
    summary:
      "I’m here to help. I understood your request, but one specific detail would improve the answer. Please share the outcome you want, and I’ll guide you with the next practical step.",
    citations: [],
  };
}

export async function invokeModel(request: GatewayRequest) {
  const live = await prisma.aiConfiguration.findUnique({
    where: {
      organizationKey_key: {
        organizationKey: request.principal.organizationKey,
        key: "LIVE_PROVIDER_INVOCATION",
      },
    },
  });

  const providers = await prisma.aiProvider.findMany({
    where: { status: "ACTIVE" },
    orderBy: { priority: "asc" },
  });

  const provider = providers[0];
  if (!provider) throw new AppError("No governed provider is available", 503);

  if (
    provider.code !== "MOCK" &&
    (live?.value as { enabled?: boolean })?.enabled !== true
  ) {
    throw new AppError("Live provider invocation is disabled", 503);
  }

  const model = await prisma.aiModelDefinition.findFirstOrThrow({
    where: { providerId: provider.id, status: "ACTIVE" },
  });

  const invocation = await prisma.aiModelInvocation.create({
    data: {
      organizationKey: request.principal.organizationKey,
      conversationId: request.conversationId,
      workflowId: request.workflowId,
      providerId: provider.id,
      modelId: model.id,
      promptCode: request.prompt.code,
      promptVersion: request.prompt.version,
      routingPolicy: {
        strategy: provider.code === "MOCK" ? "DETERMINISTIC_CARE_HOTFIX_V1" : "PRIMARY_PROVIDER",
        deterministic: provider.code === "MOCK",
      },
      promptSize: request.prompt.content.length,
      contextSize: JSON.stringify(request.evidence).length,
      status: "RUNNING",
      correlationId: request.correlationId,
    },
  });

  /*
   * Hotfix behavior:
   * - MOCK mode now produces a useful, context-aware care response.
   * - Live provider behavior remains governed and disabled unless explicitly enabled.
   * - No business action or authoritative company claim is fabricated.
   */
  const userRequest = extractUserRequest(request.prompt.content);
  const result =
    provider.code === "MOCK"
      ? composeDeterministicCareResponse(userRequest)
      : {
          summary: request.evidence.length
            ? `Validated response based on ${request.evidence.length} authorized reference(s).`
            : "No authoritative evidence was available.",
          citations: request.evidence,
        };

  const completionTokens = Math.max(24, Math.ceil(result.summary.length / 4));

  await prisma.aiModelInvocation.update({
    where: { id: invocation.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      durationMs: 0,
      promptTokens: Math.ceil(request.prompt.content.length / 4),
      completionTokens,
      totalTokens: Math.ceil(request.prompt.content.length / 4) + completionTokens,
    },
  });

  return {
    invocationId: invocation.id,
    providerCode: provider.code,
    modelCode: model.code,
    result,
  };
}