import { describe, expect, it } from "vitest";
import { PORTAL_EXPERIENCES } from "@/lib/sales-distribution/portal-experiences";
import { ROLE_PERMISSION_MATRIX } from "@/lib/foundation/rbac-catalog";

describe("Phase 2-5 portal separation and least privilege", () => {
  it("provides distinct navigation and dashboards", () => {
    const navigation = Object.values(PORTAL_EXPERIENCES).map((item) => item.navigation.join("|"));
    expect(new Set(navigation).size).toBe(navigation.length);
    expect(new Set(Object.values(PORTAL_EXPERIENCES).map((item) => item.dashboard)).size).toBe(5);
  });
  it("prevents sales executive distributor fulfilment", () => expect(ROLE_PERMISSION_MATRIX.SALES_EXECUTIVE).not.toContain("distributor_orders:fulfil"));
  it("prevents distributor super-stockist fulfilment", () => expect(ROLE_PERMISSION_MATRIX.DISTRIBUTOR_OWNER).not.toContain("super_stockist_orders:fulfil"));
  it("limits delivery user to delivery operations", () => expect(ROLE_PERMISSION_MATRIX.DISTRIBUTOR_DELIVERY_USER).toEqual(["portal:distributor", "distributor_delivery:execute", "notifications:view", "session:revoke_self"]));
  it("prevents super stockist admin access", () => expect(ROLE_PERMISSION_MATRIX.SUPER_STOCKIST_OWNER).not.toContain("portal:admin"));
});
