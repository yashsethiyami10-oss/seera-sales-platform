/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part A.
 *
 * Shared Platform Core isolation. The real implementation now lives in
 * lib/platform-core/constants.ts — this file is a permanent re-export
 * shim so every existing "@/lib/sales/constants" import keeps working
 * unchanged. Import from "@/lib/platform-core/constants" directly in new
 * code.
 */
export * from "@/lib/platform-core/constants";
