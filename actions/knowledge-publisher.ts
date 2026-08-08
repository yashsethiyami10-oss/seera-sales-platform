"use server";

import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { runPublisher } from "@/lib/knowledge-publisher";

/**
 * MUV Knowledge Publisher™ — admin-gated trigger. This is a bulk-write
 * batch operation over the runtime knowledge database (up to ~1,200
 * records today), not a per-request retrieval action — `requireAdmin()`
 * (not `requireStaff()`) reflects that it's a materially more
 * consequential operation than any existing Module 5/8 action.
 *
 * `runPublisher()` itself has no auth check (see its own doc comment) —
 * this file is the only place that may call it from anything reachable
 * over the network.
 */
export async function publishKnowledgeFactory(input: { dryRun?: boolean }) {
  try {
    await requireAdmin();
    const report = await runPublisher({ dryRun: input?.dryRun ?? true });
    return { success: true as const, data: { report } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
