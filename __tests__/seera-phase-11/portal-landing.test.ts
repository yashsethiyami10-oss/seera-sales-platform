import {describe,expect,it} from "vitest";
import {portalLandingPathForRole} from "@/lib/foundation/portal-landing";

// Was permission-Set-based (portalLandingPath), which picked a landing portal by scanning the
// unioned permission set in a fixed precedence order — a real P0 bug: any user holding two roles
// whose permission arrays granted different portal:* values always landed on whichever portal was
// checked first, regardless of which role was actually "primary" (see portal-landing.ts's own
// comment). Landing is now derived from the same single "primary role" (oldest active
// UserRoleAssignment) the header badge already uses, so these tests exercise role codes directly.
describe("Phase 11 role-aware portal landing",()=>{
  it.each([
    ["FOUNDER_SUPER_ADMIN","/portal/founder-admin"],["COMPANY_ADMIN","/portal/company-admin"],
    ["ACCOUNTS_MANAGER","/portal/accounts"],["ACCOUNTS_EXECUTIVE","/portal/accounts"],
    ["SALES_MANAGER","/portal/sales-manager"],["SALES_HEAD","/portal/sales-manager"],
    ["SALES_EXECUTIVE","/portal/sales-executive"],
    ["DISTRIBUTOR_OWNER","/portal/distributor"],["SUPER_STOCKIST_OWNER","/portal/super-stockist"],
    ["RETAILER_USER","/portal/retailer"],["READ_ONLY_AUDITOR","/portal/auditor"],
  ])("maps %s to %s",(roleCode,path)=>expect(portalLandingPathForRole(roleCode)).toBe(path));
  it("fails safely to the neutral home for an unknown/missing role",()=>{
    expect(portalLandingPathForRole(null)).toBe("/");
    expect(portalLandingPathForRole(undefined)).toBe("/");
    expect(portalLandingPathForRole("NOT_A_REAL_ROLE")).toBe("/");
  });
});
