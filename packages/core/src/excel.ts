import { read, utils, type CellObject, type WorkSheet } from 'xlsx';

// Reading Excel and LibreOffice files (ADR 0008): .xlsx, .xls and .ods. Each sheet becomes
// CSV text and goes through the same path as a CSV file, so every check applies. The web
// app loads this file only when someone opens a spreadsheet, as SheetJS is large.

export interface SheetInfo {
  name: string;
  // rows and columns with something in them
  rows: number;
  columns: number;
  hidden: boolean;
}

export interface ExcelIssue {
  kind: 'formula-without-value' | 'skipped-sheets';
  // cell addresses as Excel shows them, e.g. "D5"
  cells: string[];
  message: string;
}

export type ExcelResult =
  // the sheet read as CSV text, ready for readSheet
  | { kind: 'text'; sheet: string; text: string; issues: ExcelIssue[] }
  // more than one sheet has data: the user chooses, and a saved profile remembers it
  | { kind: 'choose-sheet'; sheets: SheetInfo[]; question: string }
  | { kind: 'error'; message: string };

// Read a workbook, and the chosen sheet if more than one has data.
export function readWorkbook(data: ArrayBuffer | Uint8Array, sheetName?: string): ExcelResult {
  let book;
  try {
    // dates as dates, so they come out as YYYY-MM-DD rather than in the computer's format
    // stubs keep a formula cell that has no saved result, so it can be reported
    book = read(data, {
      type: 'array',
      cellDates: true,
      cellFormula: true,
      sheetStubs: true,
      dense: false,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      kind: 'error',
      message: /password|encrypt/i.test(text)
        ? 'This file is protected with a password. Open it in Excel, remove the password, save it, and try again.'
        : 'This file could not be read as a spreadsheet. Check it opens in Excel or LibreOffice.',
    };
  }

  const hidden = new Set(
    (book.Workbook?.Sheets ?? []).filter((s) => (s.Hidden ?? 0) > 0).map((s) => s.name ?? ''),
  );
  const sheets: SheetInfo[] = book.SheetNames.map((name) => {
    const size = filledSize(book.Sheets[name]);
    return { name, ...size, hidden: hidden.has(name) };
  });
  const withData = sheets.filter((s) => s.rows > 0);

  if (withData.length === 0) {
    return { kind: 'error', message: 'Every sheet in this file is empty.' };
  }
  if (sheetName !== undefined && !sheets.some((s) => s.name === sheetName)) {
    return { kind: 'error', message: `This file has no sheet called "${sheetName}".` };
  }

  // visible sheets with data are the real choices; hidden ones only if nothing else
  const visible = withData.filter((s) => !s.hidden);
  const choices = visible.length > 0 ? visible : withData;
  const chosen = sheetName ?? (choices.length === 1 ? choices[0]?.name : undefined);
  if (chosen === undefined) {
    return {
      kind: 'choose-sheet',
      sheets: choices,
      question: `This file has ${choices.length} sheets with data: ${choices
        .map((s) => `"${s.name}" (${s.rows} ${s.rows === 1 ? 'row' : 'rows'})`)
        .join(', ')}. Which one holds the invoices?`,
    };
  }

  const sheet = book.Sheets[chosen];
  const issues: ExcelIssue[] = [];
  const empty = formulasWithoutValue(sheet);
  if (empty.length > 0) {
    issues.push({
      kind: 'formula-without-value',
      cells: empty,
      message: `${empty.length === 1 ? 'Cell' : 'Cells'} ${empty.slice(0, 5).join(', ')}${empty.length > 5 ? ' and more' : ''} ${empty.length === 1 ? 'has a formula' : 'have formulas'} with no saved result, so ${empty.length === 1 ? 'it is' : 'they are'} read as empty. Opening the file in Excel or LibreOffice and saving it fixes this.`,
    });
  }
  const others = withData.filter((s) => s.name !== chosen);
  if (others.length > 0 && sheetName === undefined) {
    issues.push({
      kind: 'skipped-sheets',
      cells: [],
      message: `Only "${chosen}" was read; ${others.map((s) => `"${s.name}"`).join(', ')} ${others.length === 1 ? 'is' : 'are'} hidden.`,
    });
  }
  return { kind: 'text', sheet: chosen, text: toCsv(sheet), issues };
}

// How many rows and columns hold something, ignoring blank cells Excel keeps for formatting.
function filledSize(sheet: WorkSheet | undefined): { rows: number; columns: number } {
  if (!sheet) return { rows: 0, columns: 0 };
  const rows = new Set<number>();
  const columns = new Set<number>();
  for (const [address, cell] of cells(sheet)) {
    if (text(cell) === '') continue;
    const { r, c } = utils.decode_cell(address);
    rows.add(r);
    columns.add(c);
  }
  return { rows: rows.size, columns: columns.size };
}

function formulasWithoutValue(sheet: WorkSheet | undefined): string[] {
  if (!sheet) return [];
  return cells(sheet)
    .filter(([, cell]) => cell.f !== undefined && (cell.t === 'z' || cell.v === undefined))
    .map(([address]) => address);
}

function cells(sheet: WorkSheet): [string, CellObject][] {
  return Object.entries(sheet)
    .filter(([key]) => !key.startsWith('!'))
    .map(([key, value]) => [key, value as CellObject]);
}

// One cell as text: dates as YYYY-MM-DD, numbers as plain numbers, text as typed.
function text(cell: CellObject | undefined): string {
  // a stub is an empty cell, even when SheetJS gives it a value of 0
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return '';
  const value = cell.v;
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number') {
    // shown as money (£120.00): keep the pence, as the user sees them
    if (cell.w && /[£$€]|\.\d{2}\b/.test(cell.w)) return value.toFixed(2);
    return String(Math.round(value * 1e9) / 1e9);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  // an error value such as #DIV/0! is kept as typed, so it shows up as unreadable
  return String(value).trim();
}

// SheetJS gives dates as local midnight; a few minutes either way rounds to the right day
function isoDate(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000 + 12 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

// The sheet as CSV text, with every row and column up to the last one used.
function toCsv(sheet: WorkSheet | undefined): string {
  if (!sheet?.['!ref']) return '';
  const range = utils.decode_range(sheet['!ref']);
  const lines: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      row.push(quote(text(sheet[utils.encode_cell({ r, c })] as CellObject | undefined)));
    }
    lines.push(row.join(','));
  }
  // trailing empty columns and rows add nothing
  return lines.join('\n').replace(/(\n,*)+$/, '');
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
