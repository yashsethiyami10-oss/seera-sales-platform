import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Performance regression (2026-10-12): measured on a TEST preview, every Sales Executive page view fired one
// background RSC prefetch per sidebar item (~10-12 dynamic server renders), each 0.5-2.7 s, competing with the
// page's own render. Portal nav links must not prefetch.
describe("portal navigation prefetch", () => {
  it("AppShell sidebar links opt out of automatic prefetching", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/seera/foundation/AppShell.tsx"), "utf8");
    const links = source.match(/<Link\b[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const tag of links) expect(tag).toContain("prefetch={false}");
  });
});

describe("portal in-page links do not prefetch by default", () => {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  const root = path.resolve(__dirname, "../..");
  const files = execSync("git ls-files components/seera app/portal", { cwd: root, encoding: "utf8" }).split("\n").filter((f: string) => /\.tsx?$/.test(f));

  it("no portal file imports next/link directly (all go through PortalLink)", () => {
    const offenders = files.filter((f: string) => f !== "components/seera/foundation/PortalLink.tsx" && /from ?["']next\/link["']/.test(readFileSync(path.join(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("PortalLink defaults prefetch to false and still allows an explicit opt-in", () => {
    const src = readFileSync(path.join(root, "components/seera/foundation/PortalLink.tsx"), "utf8");
    expect(src).toMatch(/prefetch = false/);
    expect(src).toMatch(/<Link prefetch=\{prefetch\} \{\.\.\.props\} \/>/);
  });
});
