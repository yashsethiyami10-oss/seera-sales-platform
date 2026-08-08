import { describe, expect, it } from "vitest";
import { ROLE_PERMISSION_MATRIX } from "@/lib/foundation/rbac-catalog";
import { localizedPortal } from "@/lib/sales-distribution/localization";

describe("Phase 7 separate manager portal", () => {
  it("has a distinct bilingual manager experience", () => { expect(localizedPortal("EN", "sales-manager").title).toContain("Manager"); expect(localizedPortal("HI", "sales-manager").title).toContain("प्रबंधक"); });
  it("permits governed team field supervision", () => expect(ROLE_PERMISSION_MATRIX.SALES_MANAGER).toEqual(expect.arrayContaining(["manager_team:view", "joint_work:participate", "assisted_distributor:operate"])));
  it("does not inherit founder controls", () => expect(ROLE_PERMISSION_MATRIX.SALES_MANAGER).not.toContain("org:manage"));
  it("keeps executive and manager roles separate", () => expect(ROLE_PERMISSION_MATRIX.SALES_EXECUTIVE).not.toContain("manager_team:view"));
});
