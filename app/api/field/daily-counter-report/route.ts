import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { executiveDailyCounterReport } from "@/lib/sales-distribution/daily-counter-report";
import { dailyCounterReportFilename, renderDailyCounterReportPdf } from "@/lib/sales-distribution/daily-counter-report-pdf";

export const runtime = "nodejs";

const query = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  distributorId: z.string().trim().max(64).optional(),
});

// Read-only GET: the signed-in Executive's OWN Daily Counter Report as a PDF, ready to send to the
// distributor on WhatsApp. `date` is an IST calendar date (default today); `distributorId` limits
// the report to one distributor the Executive is authorized for.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`daily-counter-report:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const { date, distributorId } = query.parse({
      date: url.searchParams.get("date") || undefined,
      distributorId: url.searchParams.get("distributorId") || undefined,
    });
    // Noon IST of the requested day — unambiguous whatever the server's own time zone is.
    const at = date ? new Date(`${date}T12:00:00+05:30`) : new Date();
    const report = await executiveDailyCounterReport(prisma, user.id, { date: at, distributorId });
    const bytes = await renderDailyCounterReportPdf(report);
    const filename = dailyCounterReportFilename(report);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
