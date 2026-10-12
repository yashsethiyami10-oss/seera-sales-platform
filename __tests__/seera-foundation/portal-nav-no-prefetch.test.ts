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
