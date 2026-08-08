import { cookies } from "next/headers";
import { prisma } from "@/lib/database/client";
import { resolveSession } from "./auth-service";

export const SEERA_SESSION_COOKIE = "seera_session";
export async function resolveRequestIdentity() {
  const store = await cookies();
  return resolveSession(prisma, store.get(SEERA_SESSION_COOKIE)?.value);
}
