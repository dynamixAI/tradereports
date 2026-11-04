import Papa from 'papaparse';

// values that export tools use to mean "nothing here"
const EMPTY_MARKERS = new Set(['', '-']);

export type CsvIssueKind =
  | 'empty-file'
  | 'blank-header'
  | 'duplicate-header'
  | 'missing-cells'
  | 'extra-cells'
  | 'bad-quotes';

export interface CsvIssue {
  kind: CsvIssueKind;
  // row number as a spreadsheet shows it; the header is row 1
  row: number;
  message: string;
}

export type CsvRow = Record<string, string | null>;

export interface CsvTable {
  headers: string[];
  rows: CsvRow[];
  issues: CsvIssue[];
}

// trim a cell and turn "nothing here" markers into null
export function cleanCell(value: string): string | null {
  const trimmed = value.trim();
  return EMPTY_MARKERS.has(trimmed) ? null : trimmed;
}

// read CSV text into headers, rows and a list of problems; never guesses types
export function readCsv(text: string): CsvTable {
  const issues: CsvIssue[] = [];

  // some exports start with an invisible byte order mark
  const body = text.startsWith('﻿') ? text.slice(1) : text;

  // keep blank lines for now so row numbers match the file
  const parsed = Papa.parse<string[]>(body, { skipEmptyLines: false });

  for (const error of parsed.errors) {
    if (error.type === 'Quotes') {
      // papa counts from 0; spreadsheets count from 1
      const row = (error.row ?? 0) + 1;
      issues.push({
        kind: 'bad-quotes',
        row,
        message: `Row ${row}: a quote mark is not closed, so cells may have run together.`,
      });
    }
  }

  // pair each record with its row number, then drop lines with nothing in them
  const records = parsed.data
    .map((cells, index) => ({ cells, row: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ''));

  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) {
    issues.push({ kind: 'empty-file', row: 1, message: 'The file has no rows.' });
    return { headers: [], rows: [], issues };
  }

  const headers = uniqueHeaders(headerRecord.cells, issues);

  const rows = dataRecords.map(({ cells, row }) => {
    if (cells.length < headers.length) {
      issues.push({
        kind: 'missing-cells',
        row,
        message: `Row ${row} has ${cells.length} cells but there are ${headers.length} columns.`,
      });
    }

    // trailing empty cells are common and harmless, so only flag ones with a value
    const extra = cells.slice(headers.length).filter((cell) => cell.trim() !== '');
    if (extra.length > 0) {
      issues.push({
        kind: 'extra-cells',
        row,
        message: `Row ${row} has ${extra.length} value(s) beyond the last column.`,
      });
    }

    // fromEntries makes plain own properties, so a "__proto__" header is just a column
    return Object.fromEntries(
      headers.map((header, column) => [header, cleanCell(cells[column] ?? '')]),
    ) as CsvRow;
  });

  return { headers, rows, issues };
}

// trim headers, name blank ones and number repeats so every column has its own key
function uniqueHeaders(cells: string[], issues: CsvIssue[]): string[] {
  const used = new Set<string>();

  return cells.map((cell, index) => {
    let name = cell.trim();

    if (name === '') {
      name = `Column ${index + 1}`;
      issues.push({
        kind: 'blank-header',
        row: 1,
        message: `Column ${index + 1} has no header, so it was named "${name}".`,
      });
    }

    let candidate = name;
    let count = 1;
    while (used.has(candidate)) {
      count += 1;
      candidate = `${name} (${count})`;
    }

    if (candidate !== name) {
      issues.push({
        kind: 'duplicate-header',
        row: 1,
        message: `"${name}" appears more than once, so this copy was named "${candidate}".`,
      });
    }

    used.add(candidate);
    return candidate;
  });
}
