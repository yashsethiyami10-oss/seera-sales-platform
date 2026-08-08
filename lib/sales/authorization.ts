/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part A.
 *
 * Shared Platform Core isolation. The real implementation now lives in
 * lib/platform-core/authorization.ts — this file is a permanent re-export
 * shim so every one of the 182 files that already import from
 * "@/lib/sales/authorization" keeps working unchanged. Import from
 * "@/lib/platform-core/authorization" directly in new code.
 */
export * from "@/lib/platform-core/authorization";
