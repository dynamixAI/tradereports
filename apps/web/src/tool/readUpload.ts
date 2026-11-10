import {
  askQuestions,
  detectFile,
  emptyAnswers,
  readSheet,
  type CsvTable,
  type Field,
  type FileKind,
} from '@tradereports/core';
import { fitCheck } from './answers';

// big enough for years of invoices, small enough not to freeze the page
export const MAX_BYTES = 20 * 1024 * 1024;

const TEXT_FILE = /\.(csv|txt)$/i;
const SHEET_FILE = /\.(xlsx|xls|ods)$/i;

export interface SheetChoice {
  name: string;
  rows: number;
}

// export: from job software; invoices: a home-made invoices sheet; unsure: we can't tell
export type Fit = 'export' | 'invoices' | 'unsure';

export type Upload =
  | {
      kind: 'table';
      fileName: string;
      sheet: string | null;
      table: CsvTable;
      what: string;
      known: FileKind | null;
      fit: Fit;
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

// a home-made sheet counts as invoices when it has a total that reads as money, plus a likely
// invoice number or customer
export function looksLikeInvoices(table: CsvTable): boolean {
  const suggested = (field: Field) => {
    const q = askQuestions(table, emptyAnswers()).find(
      (x) => x.kind === 'column' && x.field === field,
    );
    return q?.kind === 'column' ? q.suggested : null;
  };
  const total = suggested('gross');
  if (!total || fitCheck('gross', total, table)) return false;
  return suggested('invoiceNumber') !== null || suggested('customer') !== null;
}

const QUOTES = /quote|estimate/i;
const CONTACT = /e-?mail|phone|mobile|post ?code|zip|street|address/i;
const NAME = /name|client|customer/i;

// for a file we can't use yet: say what it seems to be, and what would help instead
export function guessWhat(headers: string[]): string {
  if (headers.some((h) => QUOTES.test(h))) {
    return "This looks like a list of quotes. Quotes on their own aren't part of the report yet. Add your invoices to get your report.";
  }
  if (headers.some((h) => CONTACT.test(h)) && headers.some((h) => NAME.test(h))) {
    return "This looks like a customer list. It has no amounts, so it can't show money owed. Add your invoices to get your report.";
  }
  return "We're not sure what this file is.";
}

// say what the file is, without naming any software company
export function describeFile(table: CsvTable): {
  what: string;
  known: FileKind | null;
  fit: Fit;
} {
  const match = detectFile(table.headers).match;
  if (match && match.tool !== 'spreadsheet') {
    return {
      what: `This is ${KIND_LABEL[match.kind]} from job software.`,
      known: match.kind,
      fit: 'export',
    };
  }
  if (looksLikeInvoices(table)) {
    return {
      what: "This looks like an invoices sheet you keep yourself. We'll work out the columns together.",
      known: null,
      fit: 'invoices',
    };
  }
  return { what: guessWhat(table.headers), known: null, fit: 'unsure' };
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
  const { what, known, fit } = describeFile(table);
  const notes = [...extra, ...table.issues.map((issue) => issue.message)];
  return { kind: 'table', fileName, sheet, table, what, known, fit, notes };
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
