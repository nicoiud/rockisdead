import "server-only";
import Papa from "papaparse";
import writeExcelFile from "write-excel-file/node";

export type Cell = string | number | boolean | null | undefined;

/** CSV con BOM para que Excel lo abra con acentos correctos. */
export function toCsv(columns: string[], rows: Record<string, Cell>[]): string {
  return "﻿" + Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) });
}

export async function toXlsx(columns: string[], rows: Record<string, Cell>[]): Promise<Buffer> {
  const data = [
    columns.map((c) => ({ value: c, fontWeight: "bold" as const })),
    ...rows.map((r) =>
      columns.map((c) => {
        const v = r[c];
        if (v === null || v === undefined || v === "") return null;
        if (typeof v === "boolean") return { value: v ? "si" : "no" };
        return { value: v };
      }),
    ),
  ];
  return writeExcelFile(data).toBuffer();
}

export async function fileResponse(format: "csv" | "xlsx", name: string, columns: string[], rows: Record<string, Cell>[]) {
  if (format === "xlsx") {
    const buf = await toXlsx(columns, rows);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(columns, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
