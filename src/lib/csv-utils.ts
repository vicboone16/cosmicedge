/**
 * Shared CSV utilities for Admin import/export features.
 */

/** Escape a CSV cell value (quote if it contains commas, quotes, or newlines) */
function escapeCsvCell(val: unknown): string {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert an array of objects to a CSV string */
export function arrayToCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return "";
  const keys = headers ?? Object.keys(rows[0]);
  const headerRow = keys.map(escapeCsvCell).join(",");
  const dataRows = rows.map(row => keys.map(k => escapeCsvCell(row[k])).join(","));
  return [headerRow, ...dataRows].join("\n");
}

/** Trigger a browser download of a string as a file */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download a pre-formatted template CSV with one example row */
export function downloadCsvTemplate(
  filename: string,
  headers: string[],
  exampleRow: Record<string, string>
): void {
  const content = arrayToCsv([exampleRow], headers);
  downloadCsv(content, filename);
}
