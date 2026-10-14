import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { exportMarketSurveysCsv } from "@/lib/sales-distribution/market-survey-service";

/** Protected CSV export (market_survey:view_all, audited). Applies the same filters as the dashboard. */
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`market-survey:export:${user.id}`, 10, 60_000);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const csv = await exportMarketSurveysCsv(prisma, user.id, params);
    const day = new Date().toISOString().slice(0, 10);
    return new Response("﻿" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="seera-market-surveys-${day}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
