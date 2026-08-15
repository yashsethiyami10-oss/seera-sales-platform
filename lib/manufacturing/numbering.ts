import { createHash } from "node:crypto";

export const mfgNumberFor = (prefix: string, key: string) =>
  `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 16).toUpperCase()}`;
