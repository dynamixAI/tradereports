import type { CsvRow, CsvTable } from '../csv';
import { isImpossibleDate, readDate, readDayMonth } from '../dates';
import { pounds, workOutTax } from '../invoice-checks';
import { parseMoney } from '../money';
import {
  derived,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Invoice,
  type InvoiceStatus,
  type Known,
  type TaxMode,
} from '../model';
import { findNameMatches } from '../names';
import { askQuestions, repairedTable, statusKey, type Answers } from './questions';

export interface SpreadsheetOptions {
  businessId: string;
  file: string;
}

// Turn a home-made spreadsheet into invoices, using only what the user confirmed.
// One row is one invoice. Nothing is guessed: a value we can't read stays unknown.
export function convertSpreadsheet(
  original: CsvTable,
  answers: Answers,
  options: SpreadsheetOptions,
): ConvertResult<Invoice> {
  // repairs are suggestions; an unanswered one doesn't hold up the rest
  const open = askQuestions(original, answers).filter(
    (q) => q.kind !== 'repair' && q.kind !== 'same-customer',
  );
  if (open.length > 0) {
    return {
      records: [],
      issues: [
        {
          kind: 'missing-column',
          rows: [],
          message: `${open.length} ${open.length === 1 ? 'question is' : 'questions are'} still to answer before this file can be read.`,
        },
      ],
    };
  }

  const issues: ConvertIssue[] = [];
  // the accepted repairs, applied to a copy; each one is noted against its row
  const { table, notes } = repairedTable(original, answers);
  for (const note of notes) {
    issues.push({ kind: 'source-quirk', rows: [note.row], message: `Repaired: ${note.rule}.` });
  }
  const repaired = (rowNumber: number, header: string | null | undefined) =>
    notes.find((n) => n.row === rowNumber && n.header === header)?.rule ?? null;
  const cols = answers.columns;
  // the spelling to use for each customer the user said is the same as another
  const sameAs = new Map<string, string>();
  if (cols.customer) {
    for (const match of findNameMatches(table, cols.customer)) {
      if (answers.names[match.id] !== 'same') continue;
      sameAs.set(match.variant, match.canonical);
      issues.push({
        kind: 'source-quirk',
        rows: match.rows,
        message: `Same customer: you said "${match.variant}" is "${match.canonical}".`,
      });
    }
  }
  const records: Invoice[] = [];
  const seen = new Map<string, number>();

  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const cell = (header: string | null | undefined) => (header ? (row[header] ?? null) : null);

    const number = cell(cols.invoiceNumber);
    if (!number) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no invoice number, so it was left out.`,
      });
      return;
    }
    const label = `${number} (row ${rowNumber})`;

    const gross = parseMoney(cell(cols.gross) ?? '');
    if (gross === null) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${label}: the total "${cell(cols.gross) ?? 'empty'}" is not an amount, so the invoice was left out.`,
      });
      return;
    }

    // the same number twice is kept as two invoices and flagged; merging could hide money
    const earlier = seen.get(number);
    if (earlier !== undefined) {
      issues.push({
        kind: 'inconsistent-rows',
        rows: [earlier, rowNumber],
        message: `Invoice number ${number} is used on rows ${earlier} and ${rowNumber}. Both are kept. Check whether one should have a different number.`,
      });
    } else {
      seen.set(number, rowNumber);
    }

    const typed = cell(cols.customer);
    const customer = typed ? (sameAs.get(typed) ?? typed) : null;
    if (!customer) {
      issues.push({ kind: 'bad-value', rows: [rowNumber], message: `${label} has no customer.` });
    }

    const tax = workOutVat(row, answers, gross, label, rowNumber, issues);
    // a net read from a repaired cell is worked out from the user's repair, not stated
    const netRule = repaired(rowNumber, cols.net);
    if (netRule && tax.net.origin === 'stated') tax.net = derived(tax.net.value, netRule);
    const paid = workOutPaid(cell(cols.status), cols.status, answers, gross);

    records.push({
      businessId: options.businessId,
      number,
      customerName: customer,
      jobNumbers: [],
      issueDate: workOutDate(cell(cols.date), answers, label, rowNumber, issues),
      // home-made sheets rarely have a due date, so overdue can't be worked out
      dueDate: null,
      status: paid.status,
      taxMode: tax.taxMode,
      netPence: tax.net,
      taxPence: tax.vat,
      grossPence: gross,
      paidPence: paid.paid,
      duePence: paid.due,
      sent: unknown('a home-made spreadsheet does not say whether it was sent'),
      lines: [],
      source: { tool: 'spreadsheet', file: options.file, rows: [rowNumber] },
    });
  });

  return { records, issues };
}

function workOutVat(
  row: CsvRow,
  answers: Answers,
  gross: number,
  label: string,
  rowNumber: number,
  issues: ConvertIssue[],
): { taxMode: Known<TaxMode>; net: Known<number>; vat: number } {
  const { net: netColumn, vat: vatColumn } = answers.columns;
  const read = (header: string | null | undefined) =>
    header ? parseMoney(row[header] ?? '') : null;
  const net = read(netColumn);
  const vat = read(vatColumn);

  // the user said there is no VAT column: not VAT registered, so net is the total
  if (!vatColumn) {
    if (netColumn && net !== null && net !== gross) {
      issues.push({
        kind: 'totals-do-not-add-up',
        rows: [rowNumber],
        message: `${label}: there is no VAT column, but net ${pounds(net)} and total ${pounds(gross)} differ.`,
      });
    }
    return {
      taxMode: unknown('no VAT column, so inclusive and exclusive look the same'),
      net: derived(gross, 'no VAT column, so net equals total'),
      vat: 0,
    };
  }
  if (vat === null) {
    issues.push({
      kind: 'bad-value',
      rows: [rowNumber],
      message: `${label}: the VAT "${row[vatColumn] ?? 'empty'}" is not an amount.`,
    });
    return { taxMode: unknown('VAT not readable'), net: unknown('VAT not readable'), vat: 0 };
  }
  if (net === null) {
    if (netColumn) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${label}: the net "${row[netColumn] ?? 'empty'}" is not an amount.`,
      });
    }
    // with a total and VAT, net is the difference; marked as worked out, not stated
    return {
      taxMode: derived('exclusive', 'net worked out as total minus VAT'),
      net: derived(gross - vat, 'total minus VAT'),
      vat,
    };
  }
  const result = workOutTax(label, net, vat, gross, 'net', [rowNumber], issues);
  return { ...result, vat };
}

function workOutPaid(
  value: string | null,
  column: string | null | undefined,
  answers: Answers,
  gross: number,
): { status: Known<InvoiceStatus>; paid: Known<number>; due: Known<number> } {
  if (!column) {
    const reason = 'no paid column';
    return { status: unknown(reason), paid: unknown(reason), due: unknown(reason) };
  }
  const meaning = answers.status[statusKey(value)];
  const said = value ? `"${value}"` : 'a blank';
  if (meaning === 'paid') {
    const rule = `you said ${said} means paid`;
    return { status: derived('paid', rule), paid: derived(gross, rule), due: derived(0, rule) };
  }
  if (meaning === 'unpaid') {
    const rule = `you said ${said} means unpaid`;
    return { status: derived('unpaid', rule), paid: derived(0, rule), due: derived(gross, rule) };
  }
  if (meaning === 'part paid') {
    const reason = 'part paid, but the file does not say how much';
    return {
      status: derived('unpaid', `you said ${said} means part paid`),
      paid: unknown(reason),
      due: unknown(reason),
    };
  }
  const reason = `you said to ignore ${said}`;
  return { status: unknown(reason), paid: unknown(reason), due: unknown(reason) };
}

function workOutDate(
  value: string | null,
  answers: Answers,
  label: string,
  rowNumber: number,
  issues: ConvertIssue[],
): string | null {
  if (!value) return null;
  const full = readDate(value, answers.dateOrder ?? 'day-first');
  if (full) return full;
  const dayMonth = readDayMonth(value);
  const year = answers.years[value];
  if (dayMonth && year !== undefined) {
    const { day, month } = dayMonth;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  issues.push({
    kind: 'bad-value',
    rows: [rowNumber],
    message: isImpossibleDate(value)
      ? `${label}: "${value}" is not a real date, so the date was left blank.`
      : `${label}: "${value}" could not be read as a date, so the date was left blank.`,
  });
  return null;
}
