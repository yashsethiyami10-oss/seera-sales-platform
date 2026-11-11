import { NextResponse } from "next/server";
import { z } from "zod";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { reverseGeocode } from "@/lib/sales-distribution/reverse-geocode";

const query = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

// Signed-in users only: turns the phone's GPS position into landmark / village / town / city /
// district / state / PIN for address auto-fill. Coordinates are not stored here.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`reverse-geocode:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const { lat, lng } = query.parse({ lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
    const place = await reverseGeocode(lat, lng).catch(() => null);
    if (!place) return NextResponse.json({ error: { code: "PLACE_NOT_FOUND", message: "Location name not available" } }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(place, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
