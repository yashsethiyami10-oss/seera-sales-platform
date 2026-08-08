import { createHash } from "node:crypto";

export type DatabaseRole = "production" | "test";

export type SanitizedDatabaseIdentity = {
  role: DatabaseRole;
  host: string;
  database: string;
  projectIdentifier: string;
  fingerprint: string;
};

export type DatabaseGuardCode =
  | "MISSING_DATABASE_URL"
  | "INVALID_DATABASE_URL"
  | "DATABASE_URLS_EQUAL"
  | "KNOWN_MUV_DATABASE"
  | "TEST_DATABASE_FALLBACK"
  | "TEST_POINTS_TO_PRODUCTION";

export class DatabaseIdentityError extends Error {
  readonly code: DatabaseGuardCode;

  constructor(code: DatabaseGuardCode, message: string) {
    super(message);
    this.name = "DatabaseIdentityError";
    this.code = code;
  }
}

const KNOWN_MUV_HOSTS = new Set([
  "ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech",
  "ep-falling-heart-azsxzcob-pooler.c-3.ap-southeast-1.aws.neon.tech",
]);

const KNOWN_MUV_PROJECT_IDENTIFIERS = new Set([
  "ep-red-surf-azlgu03d",
  "ep-falling-heart-azsxzcob",
]);

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeDatabase(pathname: string): string {
  return decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "").toLowerCase();
}

function projectIdentifier(host: string): string {
  return host.split(".")[0]?.replace(/-pooler$/, "") ?? "";
}

function fingerprint(host: string, database: string): string {
  return createHash("sha256").update(`${host}/${database}`).digest("hex").slice(0, 16);
}

export function inspectDatabaseUrl(value: string | undefined, role: DatabaseRole): SanitizedDatabaseIdentity {
  if (!value?.trim()) {
    throw new DatabaseIdentityError("MISSING_DATABASE_URL", `${role} database URL is required`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DatabaseIdentityError("INVALID_DATABASE_URL", `${role} database URL is invalid`);
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) || !parsed.hostname || !parsed.pathname) {
    throw new DatabaseIdentityError("INVALID_DATABASE_URL", `${role} database URL is not a PostgreSQL identity`);
  }

  const host = normalizeHost(parsed.hostname);
  const database = normalizeDatabase(parsed.pathname);
  if (!database) {
    throw new DatabaseIdentityError("INVALID_DATABASE_URL", `${role} database name is missing`);
  }

  const project = projectIdentifier(host);
  if (KNOWN_MUV_HOSTS.has(host) || KNOWN_MUV_PROJECT_IDENTIFIERS.has(project)) {
    throw new DatabaseIdentityError("KNOWN_MUV_DATABASE", `${role} database matches a prohibited MUV identity`);
  }

  return { role, host, database, projectIdentifier: project, fingerprint: fingerprint(host, database) };
}

export function validateDatabaseIsolation(input: {
  productionUrl?: string;
  testUrl?: string;
}): { production: SanitizedDatabaseIdentity; test: SanitizedDatabaseIdentity } {
  const production = inspectDatabaseUrl(input.productionUrl, "production");

  if (!input.testUrl?.trim()) {
    throw new DatabaseIdentityError(
      "TEST_DATABASE_FALLBACK",
      "TEST_DATABASE_URL is required explicitly; fallback to DATABASE_URL is prohibited",
    );
  }

  if (input.testUrl === input.productionUrl) {
    throw new DatabaseIdentityError("DATABASE_URLS_EQUAL", "production and test database URLs must differ");
  }

  const test = inspectDatabaseUrl(input.testUrl, "test");
  if (test.fingerprint === production.fingerprint) {
    throw new DatabaseIdentityError("TEST_POINTS_TO_PRODUCTION", "test database resolves to production identity");
  }

  return { production, test };
}

export function requireDatabaseUrlForRole(
  role: DatabaseRole,
  env: Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "TEST_DATABASE_URL">,
): string {
  if (role === "test") {
    if (!env.TEST_DATABASE_URL?.trim()) {
      throw new DatabaseIdentityError(
        "TEST_DATABASE_FALLBACK",
        "TEST_DATABASE_URL is required explicitly; fallback to DATABASE_URL is prohibited",
      );
    }
    validateDatabaseIsolation({ productionUrl: env.DATABASE_URL, testUrl: env.TEST_DATABASE_URL });
    return env.TEST_DATABASE_URL;
  }

  inspectDatabaseUrl(env.DATABASE_URL, "production");
  return env.DATABASE_URL as string;
}
