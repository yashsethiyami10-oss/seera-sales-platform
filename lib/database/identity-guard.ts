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
  | "TEST_POINTS_TO_PRODUCTION"
  | "UNKNOWN_DATABASE_TARGET"
  | "DATABASE_ROLE_MISMATCH"
  | "TEST_DATABASE_IDENTITY_MISMATCH"
  | "PRODUCTION_WRITE_PROHIBITED";

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
  const value = `${host}/${database}`;
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second ^ value.charCodeAt(index), 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function sameIdentity(left: SanitizedDatabaseIdentity, right: SanitizedDatabaseIdentity): boolean {
  return left.host === right.host && left.database === right.database;
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
  if (sameIdentity(test, production)) {
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

export function classifyDatabaseTarget(input: {
  targetUrl?: string;
  productionUrl?: string;
  testUrl?: string;
}): SanitizedDatabaseIdentity {
  const identities = validateDatabaseIsolation({
    productionUrl: input.productionUrl,
    testUrl: input.testUrl,
  });
  const target = inspectDatabaseUrl(input.targetUrl, "test");

  if (sameIdentity(target, identities.production)) return identities.production;
  if (sameIdentity(target, identities.test)) return identities.test;

  throw new DatabaseIdentityError(
    "UNKNOWN_DATABASE_TARGET",
    "database target is neither the configured Seera production nor test identity",
  );
}

export function authorizeDatabaseCommand(input: {
  intendedRole: DatabaseRole;
  write: boolean;
  targetUrl?: string;
  productionUrl?: string;
  testUrl?: string;
}): SanitizedDatabaseIdentity {
  const target = classifyDatabaseTarget(input);
  if (target.role !== input.intendedRole) {
    throw new DatabaseIdentityError("DATABASE_ROLE_MISMATCH", "database target does not match the intended role");
  }
  if (input.write && target.role === "production") {
    throw new DatabaseIdentityError("PRODUCTION_WRITE_PROHIBITED", "production database writes are prohibited");
  }
  return target;
}
