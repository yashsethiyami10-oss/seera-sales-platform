/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part A.
 *
 * Shared Platform Core isolation. The real implementation now lives in
 * lib/platform-core/context.ts — this file is a permanent re-export shim
 * so every existing "@/lib/enterprise/context" import (Manufacturing OS,
 * Finance OS, Network OS, Customer Support OS) keeps working unchanged.
 * Import from "@/lib/platform-core/context" directly in new code.
 */
export * from "@/lib/platform-core/context";
