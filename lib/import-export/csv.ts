/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Global
 * Features "Import Foundation / Export Foundation".
 *
 * One generic, dependency-free CSV codec, not one per master domain — every
 * master this milestone (and any future one) needs the same two
 * operations: turn rows into a downloadable CSV, and turn an uploaded CSV
 * back into rows to validate before committing. Built once here; wired to
 * Customer as the reference implementation (see actions/customers.ts's
 * `exportCustomersCsv`/`previewCustomerImport`/`commitCustomerImport`) —
 * every other master reuses this same module, not a copy of it.
 */

/** RFC 4180-ish: handles quoted fields, embedded commas, embedded quotes ("" escape), and CRLF/LF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** First row is treated as the header; every subsequent row becomes `{ [header]: cell }`. */
export function csvToRecords(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  const header = rows[0];
  if (!header) return [];
  const body = rows.slice(1);
  return body.map((cells) =>
    Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""]))
  );
}

function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** `columns` controls both column order and header labels — independent of key order in `rows`. */
export function toCSV<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly { key: keyof T; header: string }[]
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = row[c.key];
        return escapeCell(value === null || value === undefined ? "" : String(value));
      })
      .join(",")
  );
  return [header, ...lines].join("\r\n");
}
