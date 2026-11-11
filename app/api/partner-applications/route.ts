import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { submitPartnerApplication, type ApplicationFile } from "@/lib/sales-distribution/partner-application-service";

// Online S.S. / Distributor / Depot application (multipart: "data" JSON + up to 6 "files").
// prospect:create is enforced inside createDistributorProspect; cross-origin POSTs are refused by middleware.
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`partner-application:${user.id}`, 10, 60_000);
    if (Number(request.headers.get("content-length") ?? 0) > 50_000_000)
      return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
    const form = await request.formData();
    const data = JSON.parse(String(form.get("data") ?? "{}"));
    const files: ApplicationFile[] = [];
    for (const entry of form.getAll("files")) {
      if (entry instanceof File && entry.size > 0)
        files.push({ originalName: entry.name, mimeType: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) });
    }
    const prospect = await submitPartnerApplication(prisma, user.id, data, files);
    return NextResponse.json({ id: prospect.id, stage: prospect.stage }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
