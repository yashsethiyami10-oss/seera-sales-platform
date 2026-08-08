export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { inspectDatabaseUrl } = await import("@/lib/database/identity-guard");
  try {
    const role = process.env.SEERA_DATABASE_ROLE === "test" ? "test" : "production";
    const identity = inspectDatabaseUrl(process.env.DATABASE_URL, role);
    console.info(`[SEERA] ${role} database identity accepted`, { fingerprint: identity.fingerprint });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "DATABASE_IDENTITY_REJECTED";
    console.error("[SEERA] database identity guard failed", { code });
    throw error;
  }
}
