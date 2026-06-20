// Minimal dependency-free CSV helpers (parse / build / download).
// Handles quoted fields, embedded commas/newlines, and escaped quotes ("").

export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM if present (Excel adds it).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush the final field/row if the file does not end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((r) => r.map((c) => escapeCell(c ?? "")).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Undoes the spreadsheet "force as text" tricks so protected values come
// through clean: Excel's formula form ="012345" and a leading apostrophe '012345.
function cleanCell(value: string): string {
  let s = (value ?? "").trim();
  const formula = s.match(/^="([\s\S]*)"$/);
  if (formula) s = formula[1];
  if (s.startsWith("'")) s = s.slice(1);
  return s.trim();
}

// Maps the parsed grid to objects keyed by a normalized header name.
// Normalization: lowercased, non-alphanumerics removed ("Employee ID" -> "employeeid").
export function rowsToRecords(grid: string[][]): {
  records: Record<string, string>[];
  headers: string[];
} {
  if (grid.length === 0) return { records: [], headers: [] };
  const rawHeaders = grid[0];
  const norm = rawHeaders.map((h) => cleanCell(h).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const records = grid.slice(1).map((row) => {
    const rec: Record<string, string> = {};
    norm.forEach((key, idx) => {
      if (key) rec[key] = cleanCell(row[idx] ?? "");
    });
    return rec;
  });
  return { records, headers: norm };
}
