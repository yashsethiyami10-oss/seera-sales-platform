import { authorizeDatabaseCommand, DatabaseIdentityError, inspectDatabaseUrl } from "./identity-guard";

export function authorizeTestRuntime(input:{runtimeRole?:string;runtimeDatabaseUrl?:string;configuredProductionUrl?:string;configuredTestUrl?:string}){
  if(input.runtimeRole!=="test")throw new DatabaseIdentityError("DATABASE_ROLE_MISMATCH","SEERA_DATABASE_ROLE=test is required for DB-backed tests");
  if(!input.configuredTestUrl?.trim())throw new DatabaseIdentityError("TEST_DATABASE_FALLBACK","TEST_DATABASE_URL must be sourced explicitly from .env.test");
  if(!input.runtimeDatabaseUrl?.trim())throw new DatabaseIdentityError("TEST_DATABASE_FALLBACK","DB-backed tests require an explicit runtime DATABASE_URL");
  const runtime=inspectDatabaseUrl(input.runtimeDatabaseUrl,"test"),configured=inspectDatabaseUrl(input.configuredTestUrl,"test");
  if(runtime.projectIdentifier!==configured.projectIdentifier||runtime.database!==configured.database)throw new DatabaseIdentityError("TEST_DATABASE_IDENTITY_MISMATCH","Runtime TEST target does not match the configured Seera TEST project/database");
  return authorizeDatabaseCommand({intendedRole:"test",write:true,targetUrl:input.runtimeDatabaseUrl,productionUrl:input.configuredProductionUrl,testUrl:input.runtimeDatabaseUrl});
}
