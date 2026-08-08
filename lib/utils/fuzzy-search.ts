/**
 * Real, self-contained typo tolerance — no external search service, per the
 * phase brief's own "no external AI service, use existing Prisma data"
 * constraint. A plain substring check (partial match) is tried first as the
 * fast path; Levenshtein edit distance against each word only runs when
 * that fails, and the allowed distance scales with query length so a 3-
 * letter query doesn't fuzzy-match half the catalog.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      currRow[j] = a[i - 1] === b[j - 1] ? prevRow[j - 1]! : 1 + Math.min(prevRow[j]!, currRow[j - 1]!, prevRow[j - 1]!);
    }
    prevRow = currRow;
  }
  return prevRow[n]!;
}

function maxDistanceFor(queryLength: number): number {
  if (queryLength <= 4) return 1;
  if (queryLength <= 8) return 2;
  return 3;
}

export function fuzzyMatch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;

  const threshold = maxDistanceFor(q.length);
  return t.split(/\s+/).some((word) => levenshteinDistance(word, q) <= threshold);
}
