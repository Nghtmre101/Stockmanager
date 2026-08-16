/**
 * Excel (.xlsx) reporting — styled sheets with banded rows, frozen header,
 * auto-fitted column widths and auto row heights.
 */
import writeXlsxFile from "write-excel-file/browser";
import type { Row, SheetData } from "write-excel-file/browser";

export type CellValue = string | number | Date | boolean | null | undefined;

export type XColumn<T> = {
  header: string;
  value: (row: T) => CellValue;
  type?: "string" | "number" | "date";
  format?: string;
  align?: "left" | "center" | "right";
  width?: number;
  total?: boolean;
};

export type XSheet<T> = {
  name: string;
  title?: string;
  subtitle?: string;
  /** Right-to-left sheet layout (used for Arabic exports). */
  rtl?: boolean;
  columns: XColumn<T>[];
  rows: T[];
};


const HEAD_BG = "#1F2937";
const HEAD_FG = "#FFFFFF";
const TITLE_FG = "#111827";
const BAND_BG = "#F3F4F6";
const BORDER = "#D1D5DB";
const TOTAL_BG = "#E5E7EB";

const MONEY = "#,##0.00";
const len = (v: CellValue) =>
  v == null ? 0 : v instanceof Date ? 10 : String(v).length;

function buildSheet<T>(s: XSheet<T>) {
  const data: SheetData = [];
  const cols = s.columns;

  if (s.title) {
    data.push([
      {
        value: s.title,
        fontSize: 16,
        fontWeight: "bold",
        textColor: TITLE_FG,
        align: s.rtl ? "right" : "left",
        alignVertical: "center",
        height: 30,
        columnSpan: cols.length,
      } as never,
    ]);
  }
  if (s.subtitle) {
    data.push([
      {
        value: s.subtitle,
        fontSize: 10,
        fontStyle: "italic",
        textColor: "#6B7280",
        alignVertical: "center",
        height: 18,
        columnSpan: cols.length,
      } as never,
    ]);
    data.push([]);
  }

  const headerRow: Row = cols.map((c) => ({
    value: c.header,
    fontWeight: "bold",
    fontSize: 11,
    textColor: HEAD_FG,
    backgroundColor: HEAD_BG,
    align: "center",
    alignVertical: "center",
    wrap: true,
    height: 26,
    borderColor: HEAD_BG,
    borderStyle: "thin",
  }));
  data.push(headerRow);

  s.rows.forEach((row, i) => {
    const banded = i % 2 === 1;
    data.push(
      cols.map((c) => {
        const raw = c.value(row);
        const type =
          c.type ?? (typeof raw === "number" ? "number" : raw instanceof Date ? "date" : "string");
        return {
          value: raw === undefined || raw === "" ? null : raw,
          type: type === "number" ? Number : type === "date" ? Date : String,
          format: c.format ?? (type === "number" ? MONEY : type === "date" ? "dd/mm/yyyy" : undefined),
          align: c.align ?? (type === "number" ? "right" : s.rtl ? "right" : "left"),
          alignVertical: "center",
          wrap: true,
          fontSize: 11,
          backgroundColor: banded ? BAND_BG : undefined,
          borderColor: BORDER,
          borderStyle: "thin",
        } as never;
      }),
    );
  });

  const hasTotals = cols.some((c) => c.total);
  if (hasTotals && s.rows.length > 0) {
    data.push(
      cols.map((c, i) => {
        if (c.total) {
          const sum = s.rows.reduce((acc, r) => {
            const v = c.value(r);
            return acc + (typeof v === "number" ? v : 0);
          }, 0);
          return {
            value: sum,
            type: Number,
            format: c.format ?? MONEY,
            fontWeight: "bold",
            align: "right",
            backgroundColor: TOTAL_BG,
            borderColor: BORDER,
            borderStyle: "thin",
            height: 22,
          } as never;
        }
        return {
          value: i === 0 ? "Σ" : null,
          fontWeight: "bold",
          backgroundColor: TOTAL_BG,
          borderColor: BORDER,
          borderStyle: "thin",
          height: 22,
        } as never;
      }),
    );
  }

  // auto width: widest cell in the column, clamped to something readable
  const columns = cols.map((c, i) => {
    if (c.width) return { width: c.width };
    const widest = s.rows.reduce((m, r) => Math.max(m, len(c.value(r))), len(c.header));
    void i;
    return { width: Math.min(46, Math.max(10, Math.round(widest * 1.15) + 4)) };
  });

  return {
    data,
    columns,
    sheet: s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 30),
    stickyRowsCount: data.length - s.rows.length - (hasTotals && s.rows.length ? 1 : 0),
    showGridLines: false,
    rightToLeft: s.rtl === true,
  };

}

export async function exportXlsx<T>(sheets: XSheet<T>[], fileName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const built = sheets.map((s) => buildSheet(s)) as any;
  await writeXlsxFile(built, { fontFamily: "Calibri", fontSize: 11 }).toFile(fileName);
}
