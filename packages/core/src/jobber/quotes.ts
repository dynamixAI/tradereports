import type { CsvRow, CsvTable } from '../csv';
import { pounds } from '../invoice-checks';
import { parseMoney } from '../money';
import {
  derived,
  stated,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Known,
  type Quote,
  type QuoteStatus,
  type TaxMode,
} from '../model';
import { readJobberDate, readLineItems } from './shared';

// Jobber's quote status words, as seen in real exports
const STATUSES: Record<string, Known<QuoteStatus>> = {
  Draft: stated('draft'),
  'Awaiting response': stated('awaiting_response'),
  // in Jobber, Approved means the customer said yes
  Approved: stated('accepted'),
  Converted: derived('accepted', 'Jobber says Converted: accepted and turned into a job'),
};

export interface JobberQuoteOptions {
  businessId: string;
  file: string;
}

// Jobber quotes report: one row per quote, line items packed into one cell.
export function convertJobberQuotes(
  table: CsvTable,
  options: JobberQuoteOptions,
): ConvertResult<Quote> {
  const issues: ConvertIssue[] = [];

  const required = ['Quote #', 'Status', 'Line items', 'Subtotal ($)', 'Total ($)', 'Discount ($)'];
  // accept "(£)" in case Jobber fixes the label on UK accounts
  const header = (name: string) =>
    [name, name.replace('($)', '(£)')].find((h) => table.headers.includes(h));
  const missing = required.filter((name) => !header(name));
  if (missing.length > 0) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: `This doesn't look like a Jobber quotes report. Missing: ${missing.join(', ')}.`,
    });
    return { records: [], issues };
  }

  const records: Quote[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const quote = buildQuote(row, rowNumber, header, options, issues);
    if (quote) records.push(quote);
  });
  return { records, issues };
}

function buildQuote(
  row: CsvRow,
  rowNumber: number,
  header: (name: string) => string | undefined,
  options: JobberQuoteOptions,
  issues: ConvertIssue[],
): Quote | null {
  const number = row['Quote #'];
  const rows = [rowNumber];
  if (!number) {
    issues.push({ kind: 'bad-value', rows, message: `Row ${rowNumber} has no quote number.` });
    return null;
  }

  const money = (name: string): number | null => {
    const column = header(name) ?? name;
    const text = row[column] ?? '';
    const pence = parseMoney(text);
    if (pence === null) {
      issues.push({
        kind: 'bad-value',
        rows,
        message: `${number}: "${column}" is not an amount (${text || 'empty'}).`,
      });
    }
    return pence;
  };

  // on quotes, Jobber's Subtotal is before the discount (on invoices it's after)
  const subtotal = money('Subtotal ($)');
  const total = money('Total ($)');
  const discount = row[header('Discount ($)') ?? ''] ? money('Discount ($)') : 0;
  if (subtotal === null || total === null || discount === null) return null;

  const lines = readLineItems(row['Line items'], number, rows, issues);
  const lineSum = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (lines.length > 0 && lineSum !== subtotal) {
    issues.push({
      kind: 'totals-do-not-add-up',
      rows,
      message: `${number}: line items come to ${pounds(lineSum)} but the subtotal is ${pounds(subtotal)}.`,
    });
  }

  // there's no VAT column, so VAT is whatever the total adds on top of the discounted subtotal
  const net = subtotal - discount;
  let taxMode: Known<TaxMode>;
  let tax: Known<number>;
  if (total > net) {
    taxMode = derived('exclusive', 'total is more than subtotal less discount');
    tax = derived(total - net, 'total minus (subtotal less discount)');
  } else if (total === net) {
    taxMode = unknown('total equals subtotal less discount: no VAT, or VAT included');
    tax = unknown('total equals subtotal less discount: no VAT, or VAT included');
  } else {
    issues.push({
      kind: 'totals-do-not-add-up',
      rows,
      message: `${number}: total ${pounds(total)} is less than subtotal less discount (${pounds(net)}).`,
    });
    taxMode = unknown('total is less than subtotal less discount');
    tax = unknown('total is less than subtotal less discount');
  }

  const word = row['Status'];
  const status =
    (word && STATUSES[word]) ||
    unknown<QuoteStatus>(`status "${word ?? 'empty'}" is not recognised`);
  if (status.origin === 'unknown') {
    issues.push({
      kind: 'bad-value',
      rows,
      message: `${number}: status "${word ?? 'empty'}" is not one we recognise.`,
    });
  }

  const date = (column: string) => readJobberDate(row[column], number, column, rows, issues);

  return {
    businessId: options.businessId,
    number,
    customerName: row['Client name'] ?? null,
    jobNumbers: (row['Job #s'] ?? '')
      .split(',')
      .map((job) => job.trim())
      .filter((job) => job !== ''),
    quoteDate: date('Drafted date'),
    expiryDate: null,
    sentDate: date('Sent date'),
    acceptedDate: date('Approved date'),
    status,
    taxMode,
    netPence:
      total > net || total === net
        ? derived(net, 'subtotal less discount')
        : unknown('totals do not add up'),
    discountPence: discount,
    taxPence: tax,
    grossPence: total,
    costPence: unknown('the Jobber quotes report has no cost column'),
    grossProfitPence: unknown('the Jobber quotes report has no cost column'),
    lines,
    source: { tool: 'jobber', file: options.file, rows },
  };
}
