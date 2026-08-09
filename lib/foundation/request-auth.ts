import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/database/client";
import { resolveSession } from "./auth-service";

export const SEERA_SESSION_COOKIE = "seera_session";
export const resolveRequestIdentity = cache(async function resolveRequestIdentity() {
  const store = await cookies();
  return resolveSession(prisma, store.get(SEERA_SESSION_COOKIE)?.value);
});
