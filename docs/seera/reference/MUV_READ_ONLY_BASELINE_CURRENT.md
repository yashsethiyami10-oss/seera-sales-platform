# Current MUV Read-Only Reference Baseline

- baseline identifier: `MUV-RO-20260808T061738Z-FA7A044CB89D`
- captured UTC: `2026-08-08T06:17:38.230Z`
- MUV path: `C:\Users\KE\muv-platform-deployment-package`
- Git branch/HEAD: unavailable; checkout has no Git metadata
- scoped files: 1,119
- manifest: `MUV_READ_ONLY_BASELINE_CURRENT.sha256`
- manifest SHA-256: `FA7A044CB89DCAC007F7F1FDD3C921924F6480752A49D6270474FBC60749D95C`

## Scope

Hash-only inventory of MUV `actions`, `app`, `components`, `lib`, `prisma`, `scripts`, `styles`, `types`, `__tests__`, and selected root runtime/package configuration files. Environment files, local settings, credentials, generated directories and secrets are excluded. The manifest contains relative paths and SHA-256 hashes only.

## Future zero-harm interpretation

Seera passes zero-harm when evidence shows:

1. Seera did not write to MUV;
2. no runtime, package, symlink or Prisma dependency points to MUV;
3. Seera production/test databases do not identify as MUV;
4. no Seera migration or seed targets MUV;
5. no Seera command intentionally modifies MUV.

An independently evolving MUV checkout may legitimately differ from this baseline. Future comparisons must record the new difference and re-check Seera write paths; they must not require unrelated MUV development to stop or be reverted.
