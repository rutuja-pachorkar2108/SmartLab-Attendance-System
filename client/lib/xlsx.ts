// Excel (.xlsx) helpers built on exceljs. exceljs is imported dynamically so it
// stays out of the server bundle and the initial client payload — it only loads
// when an admin actually downloads a template, exports, or uploads an .xlsx.

async function loadExcel() {
  const mod = await import("exceljs");
  // Support both the default export and namespace shapes across bundlers.
  return (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
}

export async function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: string[][]
) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));

  // Lock every column to Text ("@") so long numbers like PRNs are never turned
  // into scientific notation — including new rows the user types in Excel.
  ws.columns.forEach((col) => {
    col.numFmt = "@";
    col.width = 20;
  });
  ws.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(filename, blob);
}

export async function parseXlsxFile(file: File): Promise<string[][]> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value));
    });
    grid.push(cells);
  });
  return grid.filter((r) => r.some((c) => c.trim() !== ""));
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text; // hyperlink / rich text
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("result" in v && v.result !== undefined && v.result !== null) {
      return String(v.result); // formula result, e.g. ="012345"
    }
  }
  return String(value);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
