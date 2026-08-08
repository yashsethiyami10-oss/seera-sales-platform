import { prisma } from "@/lib/prisma";
import type { FeedbackInput, FeedbackResult } from "./types";
import { getSession } from "./session-manager";

/**
 * MUV AI — Experience Platform (Module 8) Feedback Capture.
 *
 * "Feedback capture" — the module prompt's own wording ("capture," not
 * "preparation") is why this one persists (`ExperienceFeedback`, one row
 * per submission) while Analytics/Review stay computation-only. Confirms
 * the session exists before writing — a feedback row with no valid
 * session would be orphaned and unreviewable.
 */

export async function captureFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  await getSession(input.sessionId);

  const row = await prisma.experienceFeedback.create({
    data: {
      sessionId: input.sessionId,
      rating: input.rating ?? null,
      comment: input.comment ?? null,
    },
  });

  return {
    id: row.id,
    sessionId: row.sessionId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}
