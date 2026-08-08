import { testIpState } from "./test-setup";

/** Gives each test a distinct "IP" so lib/rate-limit.ts's in-memory
 * counters (shared across the whole process) never leak between
 * unrelated test cases. */
export function setTestIp(ip: string) {
  testIpState.current = ip;
}

export function uniqueIp(seed: string): string {
  const n = Array.from(seed).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 250;
  return `198.51.100.${n}`;
}
