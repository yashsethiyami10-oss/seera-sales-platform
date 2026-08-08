import {describe,it,expect} from "vitest";
import {authorizeTestRuntime} from "@/lib/database/test-runtime-guard";
const prod="postgresql://u:p@prod-seera.example/prod";const test="postgresql://u:p@test-seera.example/seera_test";
describe("fail-closed DB test runtime",()=>{
 it("rejects missing test role",()=>expect(()=>authorizeTestRuntime({runtimeDatabaseUrl:test,configuredProductionUrl:prod,configuredTestUrl:test})).toThrow(/SEERA_DATABASE_ROLE/));
 it("rejects missing explicit TEST_DATABASE_URL",()=>expect(()=>authorizeTestRuntime({runtimeRole:"test",runtimeDatabaseUrl:test,configuredProductionUrl:prod})).toThrow(/TEST_DATABASE_URL/));
 it("rejects DATABASE_URL fallback",()=>expect(()=>authorizeTestRuntime({runtimeRole:"test",runtimeDatabaseUrl:prod,configuredProductionUrl:prod,configuredTestUrl:test})).toThrow());
 it("rejects unknown runtime target",()=>expect(()=>authorizeTestRuntime({runtimeRole:"test",runtimeDatabaseUrl:"postgresql://u:p@other.example/x",configuredProductionUrl:prod,configuredTestUrl:test})).toThrow(/neither/));
 it("authorizes only the configured test identity",()=>expect(authorizeTestRuntime({runtimeRole:"test",runtimeDatabaseUrl:test,configuredProductionUrl:prod,configuredTestUrl:test}).role).toBe("test"));
});
