import {describe,expect,it} from "vitest";
import {portalLandingPath} from "@/lib/foundation/portal-landing";

describe("Phase 11 role-aware portal landing",()=>{
  it.each([
    ["system:super_admin","/portal/founder-admin"],["portal:admin","/portal/company-admin"],["portal:accounts","/portal/accounts"],
    ["portal:sales_manager","/portal/sales-manager"],["portal:sales_executive","/portal/sales-executive"],
    ["portal:distributor","/portal/distributor"],["portal:super_stockist","/portal/super-stockist"],
  ])("maps %s to %s",(permission,path)=>expect(portalLandingPath(new Set([permission]))).toBe(path));
  it("prioritizes founder authority",()=>expect(portalLandingPath(new Set(["system:super_admin","portal:accounts","portal:admin"]))).toBe("/portal/founder-admin"));
  it("fails safely to the neutral home",()=>expect(portalLandingPath(new Set())).toBe("/"));
});
