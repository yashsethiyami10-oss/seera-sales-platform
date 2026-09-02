"use strict";

const { spawnSync } = require("node:child_process");

const isVercelProduction =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isVercelProduction) {
  process.exit(0);
}

// Production deploys must apply the repository's immutable Prisma migration history
// before Prisma Client is generated and Next.js is built. This is intentionally
// unavailable to local/preview builds.
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "migrate", "deploy"],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
