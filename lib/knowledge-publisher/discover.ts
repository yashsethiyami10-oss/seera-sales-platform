import path from "node:path";
import { getKnowledgeFactoryIndex } from "@/lib/runtime/knowledge-factory-loader";
import type { KnowledgeFactoryRecord } from "@/lib/runtime/types";

/**
 * MUV Knowledge Publisher™ — Stage 1: Discover.
 *
 * Reuses the existing, real Knowledge Factory loader unchanged (never a
 * second parser) — this stage's only job is to add one thing the loader
 * itself doesn't track: a repo-relative source path, since an absolute
 * dev-machine path (`record.sourceFile`) is not portable data to persist.
 */
export type DiscoveredKnowledgeObject = KnowledgeFactoryRecord & {
  relativeSourcePath: string;
};

export function discoverKnowledgeObjects(): DiscoveredKnowledgeObject[] {
  const records = getKnowledgeFactoryIndex();
  const root = process.cwd();
  return records.map((r) => ({
    ...r,
    relativeSourcePath: path.relative(root, r.sourceFile).split(path.sep).join("/"),
  }));
}
