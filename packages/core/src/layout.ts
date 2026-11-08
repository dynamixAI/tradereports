import Papa from 'papaparse';
import { readCsv, type CsvIssue, type CsvRow, type CsvTable } from './csv';
import { readDate } from './dates';
import { pounds } from './invoice-checks';
import { parseMoney } from './money';
import { countsUp } from './scan';

// how far down to look for the header row
const SEARCH_ROWS = 20;

// in a sparse row, a total word anywhere in a cell marks it: "TOTALS FOR MARCH"
const TOTAL_WORDS = /\b(grand |sub ?)?totals?\b/i;
// in a full row, only a cell that is nothing but a total word does, so a job
// described as "Total rewire" is still a record
const TOTAL_CELL = /^(grand |sub ?)?totals?:?$/i;

// a real record fills at least this share of the columns; summaries and notes fill fewer
const DENSE_SHARE = 0.5;

// Read a spreadsheet saved as CSV whose headers may not be on the first row,
// then tidy what isn't data: title rows, blank spacer columns and total rows.
export function readSheet(text: string): CsvTable {
  const headerRow = findHeaderRow(text);
  const table = readCsv(text, { headerRow });
  const notes: CsvIssue[] = [];

  const skipped = countRowsAbove(text, headerRow);
  if (skipped > 0) {
    notes.push({
      kind: 'title-rows',
      row: headerRow,
      message: `The headers are on row ${headerRow}. ${skipped} ${skipped === 1 ? 'row' : 'rows'} above ${skipped === 1 ? 'was' : 'were'} skipped as titles.`,
    });
  }

  const withoutSpacers = dropSpacerColumns(table, notes);
  const withoutTotals = dropTotalRows(withoutSpacers, notes);

  // a total or note row is expected to have missing cells, so don't report that as well
  const leftOut = new Set(
    notes.filter((note) => note.kind === 'total-row').map((note) => note.row),
  );
  const issues = withoutTotals.issues.filter(
    (issue) =>
      !((issue.kind === 'missing-cells' || issue.kind === 'extra-cells') && leftOut.has(issue.row)),
  );
  return { ...withoutTotals, issues: [...issues, ...notes] };
}

// The header row is the first row that is mostly labels, fills most of the width,
// and has data under it. Falls back to the first row with anything in it.
export function findHeaderRow(text: string): number {
  const rows = rawRows(text).slice(0, SEARCH_ROWS);
  const widest = Math.max(0, ...rows.map(({ cells }) => filledCells(cells).length));

  const wide = (cells: string[]) => filledCells(cells).length >= widest * 0.5;
  const allLabels = (cells: string[]) => filledCells(cells).every(isLabel);

  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i];
    if (!current) break;
    const filled = filledCells(current.cells);
    if (filled.length < 2 || !wide(current.cells)) continue;
    const labels = filled.filter(isLabel).length;
    if (labels / filled.length < 0.8) continue;
    if (hasValuesBelow(rows.slice(i + 1), wide, allLabels)) return current.row;
  }
  // no clear header: the widest row near the top beats a one-cell title
  const fallback = rows.find(({ cells }) => filledCells(cells).length === widest);
  return fallback?.row ?? 1;
}

// Values should follow the headers. A short line of words straight under them (a month
// heading, a note) is skipped over; a second wide row of labels means the headers are
// further down, so the current row is a title or the top half of a two-row header.
function hasValuesBelow(
  below: { cells: string[] }[],
  wide: (cells: string[]) => boolean,
  allLabels: (cells: string[]) => boolean,
): boolean {
  for (const { cells } of below.slice(0, 3)) {
    if (!allLabels(cells)) return true;
    if (wide(cells)) return false;
  }
  return false;
}

// A blank header with nothing under it is a gap someone left for neatness.
function dropSpacerColumns(table: CsvTable, notes: CsvIssue[]): CsvTable {
  const spacers = table.headers.filter(
    (header, index) =>
      /^Column \d+$/.test(header) &&
      // only columns the reader had to name because their header was blank
      table.issues.some(
        (issue) =>
          issue.kind === 'blank-header' && issue.message.startsWith(`Column ${index + 1} `),
      ) &&
      table.rows.every((row) => row[header] === null),
  );
  if (spacers.length === 0) return table;

  for (const header of spacers) {
    notes.push({
      kind: 'spacer-column',
      row: 1,
      message: `${header} is empty, so it was ignored.`,
    });
  }
  const keep = table.headers.filter((header) => !spacers.includes(header));
  return {
    ...table,
    headers: keep,
    rows: table.rows.map((row) =>
      Object.fromEntries(keep.map((header) => [header, row[header] ?? null])),
    ),
    // the blank-header notes are replaced by the clearer spacer notes
    issues: table.issues.filter(
      (issue) =>
        !(issue.kind === 'blank-header' && spacers.some((s) => issue.message.includes(`"${s}"`))),
    ),
  };
}

// Rows that aren't records: totals (labelled, or adding up the rows above) anywhere in
// the sheet, and a footer of summaries and notes after the last full row.
function dropTotalRows(table: CsvTable, notes: CsvIssue[]): CsvTable {
  const moneyColumns = table.headers.filter((header) => {
    const values = table.rows.map((row) => row[header]).filter((v): v is string => v !== null);
    // a column that counts up (1, 2, 3) adds up by chance, so it proves nothing
    return (
      values.length > 0 &&
      !countsUp(values) &&
      values.filter((v) => parseMoney(v) !== null && readDate(v) === null).length / values.length >=
        0.9
    );
  });
  const filled = (row: CsvRow) => table.headers.filter((header) => row[header] !== null);
  const dense = (row: CsvRow) => filled(row).length >= table.headers.length * DENSE_SHARE;
  const lastDense = table.rows.reduce((last, row, index) => (dense(row) ? index : last), -1);

  const keepRows: number[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const cells = filled(row).map((header) => row[header] ?? '');
    const hasMoney = cells.some((cell) => parseMoney(cell) !== null);
    const labelled = dense(row)
      ? cells.some((cell) => TOTAL_CELL.test(cell.trim()))
      : cells.some((cell) => TOTAL_WORDS.test(cell));

    const sums = moneyColumns.filter((header) => {
      const value = parseMoney(row[header] ?? '');
      // zero adds up a column of zeros, which proves nothing
      if (value === null || value === 0) return false;
      const above = table.rows
        .slice(0, index)
        .map((earlier) => parseMoney(earlier[header] ?? '') ?? 0);
      if (above.filter((amount) => amount !== 0).length < 2) return false;
      return Math.abs(above.reduce((sum, amount) => sum + amount, 0) - value) <= 1;
    });
    // one matching column could be chance, unless it's the last row; two is a pattern
    const isLast = index === table.rows.length - 1;
    const addsUp = sums.length >= 2 || (sums.length === 1 && isLast);

    // a short row with no amount or date in any cell can't be a usable record: it's a
    // note or a heading, even when it's split over cells like "NOTE:" and the text
    const wordsOnly = cells.every((cell) => parseMoney(cell) === null && !isDate(cell));

    // below the last full row, a short row with nothing in the first column, or with
    // only words, is a footer: a summary someone typed or a note to themselves
    const firstEmpty = row[table.headers[0] ?? ''] === null;
    const footer = index > lastDense && !dense(row) && (firstEmpty || wordsOnly);

    // between records the same words-only rule applies; a short row with an amount or a
    // date is kept, as it may be a half-filled record
    const betweenNote = index <= lastDense && !dense(row) && wordsOnly;

    if (labelled || addsUp) {
      const what = sums[0]
        ? ` (${sums[0]} ${pounds(parseMoney(row[sums[0]] ?? '') ?? 0)} adds up the rows above)`
        : '';
      notes.push({
        kind: 'total-row',
        row: rowNumber,
        message: `Row ${rowNumber} looks like a total${what}, so it was left out.`,
      });
    } else if (footer) {
      notes.push({
        kind: 'total-row',
        row: rowNumber,
        message: hasMoney
          ? `Row ${rowNumber} is below the data and looks like a summary, so it was left out.`
          : `Row ${rowNumber} is below the data and looks like a note, so it was left out.`,
      });
    } else if (betweenNote) {
      notes.push({
        kind: 'total-row',
        row: rowNumber,
        message: `Row ${rowNumber} is between records and looks like a note, so it was left out.`,
      });
    } else {
      keepRows.push(index);
    }
  });

  return {
    ...table,
    rows: keepRows.map((index) => table.rows[index]).filter((row) => row !== undefined),
    rowNumbers: keepRows.map((index) => table.rowNumbers[index] ?? index + 2),
  };
}

function rawRows(text: string): { cells: string[]; row: number }[] {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  return Papa.parse<string[]>(body, { skipEmptyLines: false })
    .data.map((cells, index) => ({ cells, row: index + 1 }))
    .filter(({ cells }) => filledCells(cells).length > 0);
}

function countRowsAbove(text: string, headerRow: number): number {
  return rawRows(text).filter(({ row }) => row < headerRow).length;
}

// a date in any format, numeric ones in either order
function isDate(cell: string): boolean {
  return readDate(cell, 'day-first') !== null || readDate(cell, 'month-first') !== null;
}

function filledCells(cells: string[]): string[] {
  return cells.map((cell) => cell.trim()).filter((cell) => cell !== '');
}

// a label is text that isn't a number, an amount or a date
function isLabel(cell: string): boolean {
  return parseMoney(cell) === null && readDate(cell, 'day-first') === null && /[A-Za-z]/.test(cell);
}
