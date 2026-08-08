import { describe, expect, it } from "vitest";
import {
  DatabaseIdentityError,
  inspectDatabaseUrl,
  requireDatabaseUrlForRole,
  validateDatabaseIsolation,
} from "@/lib/database/identity-guard";

const production = "postgresql://seera_user:private@ep-seera-main-pooler.example.test/seera";
const test = "postgresql://seera_test:private@ep-seera-test-pooler.example.test/seera_test";

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("Expected guard to reject input");
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseIdentityError);
    expect((error as DatabaseIdentityError).code).toBe(code);
  }
}

describe("Seera database identity guard", () => {
  it("accepts distinct Seera production and test identities and returns no credentials", () => {
    const result = validateDatabaseIsolation({ productionUrl: production, testUrl: test });
    expect(result.production.host).toBe("ep-seera-main-pooler.example.test");
    expect(result.test.host).toBe("ep-seera-test-pooler.example.test");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.production.fingerprint).toHaveLength(16);
  });

  it("rejects every known MUV host", () => {
    for (const host of [
      "ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech",
      "ep-falling-heart-azsxzcob-pooler.c-3.ap-southeast-1.aws.neon.tech",
    ]) {
      expectCode(() => inspectDatabaseUrl(`postgresql://user:secret@${host}/neondb`, "test"), "KNOWN_MUV_DATABASE");
    }
  });

  it("rejects literal production/test equality", () => {
    expectCode(() => validateDatabaseIsolation({ productionUrl: production, testUrl: production }), "DATABASE_URLS_EQUAL");
  });

  it("rejects distinct URLs that resolve to the same host/database identity", () => {
    const sameIdentity = "postgresql://other:other@ep-seera-main-pooler.example.test/seera?sslmode=require";
    expectCode(
      () => validateDatabaseIsolation({ productionUrl: production, testUrl: sameIdentity }),
      "TEST_POINTS_TO_PRODUCTION",
    );
  });

  it("rejects missing test URL instead of falling back to production", () => {
    expectCode(() => validateDatabaseIsolation({ productionUrl: production }), "TEST_DATABASE_FALLBACK");
    expectCode(() => requireDatabaseUrlForRole("test", { DATABASE_URL: production }), "TEST_DATABASE_FALLBACK");
  });

  it("rejects missing and malformed identities", () => {
    expectCode(() => inspectDatabaseUrl(undefined, "production"), "MISSING_DATABASE_URL");
    expectCode(() => inspectDatabaseUrl("not-a-url", "production"), "INVALID_DATABASE_URL");
  });
});

