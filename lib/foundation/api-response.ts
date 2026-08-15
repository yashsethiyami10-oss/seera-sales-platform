import { NextResponse } from "next/server"; import { safeError } from "./errors"; import { operationalLog } from "./logger"; import { requestId } from "./request-context";
// Best-effort actor attribution for unexpected-error logs only — never blocks or delays the
// response, and is skipped entirely for already-known infrastructure/DB-unavailable failures
// (where a second DB round trip to resolve identity would just fail identically and add latency
// during a real outage). resolveRequestIdentity() is React-cache()'d per request, so when a route
// already resolved identity earlier (the common case), this is free — no extra DB call.
async function bestEffortActorId(errorCode: string): Promise<string | null> {
  // Skip entirely for the two codes that specifically mean "the database itself is unreachable" —
  // a second DB round trip there would fail identically and just add latency during a real outage.
  // Every other 500 (including plain unexpected bugs) still gets attribution, since the DB is fine.
  if (errorCode === "DATABASE_UNAVAILABLE" || errorCode === "OPERATION_TIMED_OUT") return null;
  try {
    const { resolveRequestIdentity } = await import("./request-auth");
    const { user } = await resolveRequestIdentity();
    return user.id;
  } catch {
    return null;
  }
}
export async function apiFailure(error:unknown,request?:Request){
  const id=requestId(request),safe=safeError(error,id);
  if(safe.status>=500){
    const actorId = await bestEffortActorId(safe.body.error.code);
    operationalLog("error","api.internal_error",{
      requestId:id,
      errorName:error instanceof Error?error.name:"unknown",
      route:request?new URL(request.url).pathname:undefined,
      method:request?.method,
      actorId,
    });
  }
  return NextResponse.json(safe.body,{status:safe.status,headers:{"Cache-Control":"no-store","X-Request-Id":id}});
}
