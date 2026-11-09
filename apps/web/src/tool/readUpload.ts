import { detectFile, readSheet, type CsvTable, type FileKind } from '@tradereports/core';

// big enough for years of invoices, small enough not to freeze the page
export const MAX_BYTES = 20 * 1024 * 1024;

const TEXT_FILE = /\.(csv|txt)$/i;
const SHEET_FILE = /\.(xlsx|xls|ods)$/i;

export interface SheetChoice {
  name: string;
  rows: number;
}

export type Upload =
  | {
      kind: 'table';
      fileName: string;
      sheet: string | null;
      table: CsvTable;
      what: string;
      known: FileKind | null;
      notes: string[];
    }
  // a workbook with more than one sheet of data: the bytes are kept so we can read the chosen one
  | { kind: 'choose-sheet'; fileName: string; sheets: SheetChoice[]; bytes: Uint8Array }
  | { kind: 'error'; fileName: string; message: string };

const KIND_LABEL: Record<FileKind, string> = {
  invoices: 'an invoices export',
  quotes: 'a quotes export',
  jobs: 'a jobs export',
  visits: 'a visits export',
  customers: 'a customer list export',
};

// say what the file is, without naming any software company
export function describeFile(table: CsvTable): { what: string; known: FileKind | null } {
  const match = detectFile(table.headers).match;
  if (match && match.tool !== 'spreadsheet') {
    return { what: `This is ${KIND_LABEL[match.kind]} from job software.`, known: match.kind };
  }
  return {
    what: "This looks like a spreadsheet you keep yourself. We'll work out the columns together.",
    known: null,
  };
}

// most exports are UTF-8; CSVs saved from older Excel are often Windows-1252
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function fromText(fileName: string, text: string, sheet: string | null, extra: string[]): Upload {
  const table = readSheet(text);
  if (table.headers.length === 0) {
    return { kind: 'error', fileName, message: 'This file has no rows in it.' };
  }
  const { what, known } = describeFile(table);
  const notes = [...extra, ...table.issues.map((issue) => issue.message)];
  return { kind: 'table', fileName, sheet, table, what, known, notes };
}

// read a file the visitor chose; everything happens here in the browser
export async function readUpload(
  fileName: string,
  bytes: Uint8Array,
  sheet?: string,
): Promise<Upload> {
  if (bytes.byteLength === 0) {
    return { kind: 'error', fileName, message: 'This file is empty.' };
  }
  if (bytes.byteLength > MAX_BYTES) {
    return {
      kind: 'error',
      fileName,
      message: 'This file is over 20 MB. Try exporting a shorter date range.',
    };
  }

  if (TEXT_FILE.test(fileName)) return fromText(fileName, decodeText(bytes), null, []);

  if (SHEET_FILE.test(fileName)) {
    // the Excel reader is large, so it only loads when someone opens a workbook
    const { readWorkbook } = await import('@tradereports/core/excel');
    const result = readWorkbook(bytes, sheet);
    if (result.kind === 'error') return { kind: 'error', fileName, message: result.message };
    if (result.kind === 'choose-sheet') {
      const sheets = result.sheets.map((s) => ({ name: s.name, rows: s.rows }));
      return { kind: 'choose-sheet', fileName, sheets, bytes };
    }
    const extra = result.issues.map((issue) => issue.message);
    return fromText(fileName, result.text, result.sheet, extra);
  }

  return {
    kind: 'error',
    fileName,
    message: 'TradeReports reads CSV, Excel (.xlsx or .xls) and LibreOffice (.ods) files.',
  };
}
