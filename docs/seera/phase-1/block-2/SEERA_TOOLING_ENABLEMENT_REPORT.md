# Seera Tooling Enablement Report

- Install: `npm ci`, local to Seera; no global packages.
- Lockfile: npm lockfile v3; package `seera-sales-distribution-os`.
- Node requirement/runtime: `>=18.18.0` / `v24.19.0`.
- npm: `11.17.0`.
- Prisma CLI and client: `5.22.0` resolved by the existing lockfile constraints.
- Vitest: `4.1.10`; TypeScript: `5.9.3` resolved from locked range `^5.6.0`.
- Lifecycle review: Seera postinstall performs no Prisma generation or database operation; copied database commands remain blocked.
