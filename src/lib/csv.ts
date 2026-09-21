/**
 * CSV export, done safely.
 *
 * Two things a naive `rows.join(',')` gets wrong:
 *
 *   · Quoting. A handle or niche containing a comma, quote or newline splits
 *     the row. Every cell is quoted and inner quotes are doubled.
 *
 *   · Formula injection. A cell beginning with = + - @ (or a tab or carriage
 *     return) is executed as a formula when the file is opened in Excel or
 *     Sheets. Creator-controlled text — a bio, a handle — ends up in these
 *     cells, so a creator could plant a formula in a brand's spreadsheet.
 *     Such cells are prefixed with an apostrophe, which spreadsheets treat as
 *     "display as text" and do not show.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Hand the browser a file. The BOM makes Excel read the file as UTF-8. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Released on the next tick so the download has definitely begun.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
