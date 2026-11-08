import type { CsvRow, CsvTable } from '../csv';
import { pounds, workOutTax } from '../invoice-checks';
import { parseMoney } from '../money';
import {
  derived,
  stated,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Invoice,
  type InvoiceStatus,
  type Known,
  type Line,
} from '../model';

// columns we can't work without
const REQUIRED = ['Invoice Number', 'Subtotal', 'Tax', 'Total', 'Paid', 'Due', 'Line Amount'];

// columns that belong to the invoice, so they must be the same on every line row
const INVOICE_LEVEL = [
  'Customer',
  'Invoice Date',
  'Due Date',
  'Subtotal',
  'Tax',
  'Total',
  'Paid',
  'Due',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface TradifyInvoiceOptions {
  businessId: string;
  file: string;
  // YYYY-MM-DD; passed in so "overdue" is the same every time the tests run
  today: string;
}

// Turn a Tradify invoice export (one row per line item) into one record per invoice.
export function convertTradifyInvoices(
  table: CsvTable,
  options: TradifyInvoiceOptions,
): ConvertResult<Invoice> {
  const issues: ConvertIssue[] = [];

  const missing = REQUIRED.filter((name) => !table.headers.includes(name));
  if (missing.length > 0) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: `This doesn't look like a Tradify invoice export. Missing: ${missing.join(', ')}.`,
    });
    return { records: [], issues };
  }

  // group line rows by invoice number, keeping the file's order
  const groups = new Map<string, { rows: CsvRow[]; rowNumbers: number[] }>();
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const number = row['Invoice Number'];
    if (!number) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no invoice number.`,
      });
      return;
    }
    const group = groups.get(number) ?? { rows: [], rowNumbers: [] };
    group.rows.push(row);
    group.rowNumbers.push(rowNumber);
    groups.set(number, group);
  });

  const records: Invoice[] = [];
  for (const [number, group] of groups) {
    const invoice = buildInvoice(number, group.rows, group.rowNumbers, options, issues);
    if (invoice) records.push(invoice);
  }

  return { records, issues };
}

function buildInvoice(
  number: string,
  rows: CsvRow[],
  rowNumbers: number[],
  options: TradifyInvoiceOptions,
  issues: ConvertIssue[],
): Invoice | null {
  const first = rows[0];
  if (!first) return null;

  // totals repeat on every line row; if they differ we can't trust any of them
  for (const column of INVOICE_LEVEL) {
    const values = new Set(rows.map((row) => row[column] ?? ''));
    if (values.size > 1) {
      issues.push({
        kind: 'inconsistent-rows',
        rows: rowNumbers,
        message: `${number}: "${column}" is different on different lines, so its totals can't be trusted.`,
      });
      return null;
    }
  }

  const money = (column: string): number | null => {
    const pence = parseMoney(first[column] ?? '');
    if (pence === null) {
      issues.push({
        kind: 'bad-value',
        rows: rowNumbers,
        message: `${number}: "${column}" is not an amount (${first[column] ?? 'empty'}).`,
      });
    }
    return pence;
  };

  const subtotal = money('Subtotal');
  const tax = money('Tax');
  const total = money('Total');
  const paid = money('Paid');
  const due = money('Due');
  if (subtotal === null || tax === null || total === null || paid === null || due === null) {
    return null;
  }

  if (total - paid !== due) {
    issues.push({
      kind: 'totals-do-not-add-up',
      rows: rowNumbers,
      message: `${number}: total ${pounds(total)} minus paid ${pounds(paid)} should be ${pounds(total - paid)} due, but the file says ${pounds(due)}.`,
    });
  }

  const { taxMode, net } = workOutTax(number, subtotal, tax, total, 'subtotal', rowNumbers, issues);
  const dueDate = date(first['Due Date'], number, 'Due Date', rowNumbers, issues);
  const sent = workOutSent(first['Delivery Status']);
  const status = workOutStatus(total, due, dueDate, options.today);

  // Tradify gives drafts a number and no status, so an unsent unpaid invoice may not be real debt
  if (due > 0 && sent.value === false) {
    issues.push({
      kind: 'possible-draft',
      rows: rowNumbers,
      message: `${number} shows ${pounds(due)} owed but was never sent. It may be a draft. Check before counting it as money owed.`,
    });
  }

  return {
    businessId: options.businessId,
    number,
    customerName: first['Customer'] ?? null,
    jobNumbers: (first['Jobs'] ?? '')
      .split(',')
      .map((job) => job.trim())
      .filter((job) => job !== ''),
    issueDate: date(first['Invoice Date'], number, 'Invoice Date', rowNumbers, issues),
    dueDate,
    status,
    taxMode,
    netPence: net,
    taxPence: tax,
    grossPence: total,
    paidPence: stated(paid),
    duePence: stated(due),
    sent,
    lines: rows.map((row) => buildLine(row)),
    source: { tool: 'tradify', file: options.file, rows: rowNumbers },
  };
}

// only map words we've seen in real exports; anything else stays unknown
function workOutSent(value: string | null | undefined): Known<boolean> {
  if (value === 'Unsent') return stated(false);
  if (value === 'Sent') return stated(true);
  return unknown(value ? `delivery status "${value}" is not recognised` : 'no delivery status');
}

// Tradify's invoice export has no status column, so work it out from the money and dates
function workOutStatus(
  total: number,
  due: number,
  dueDate: string | null,
  today: string,
): Known<InvoiceStatus> {
  if (total <= 0) return unknown('invoice total is zero or less');
  if (due === 0) return derived('paid', 'nothing left due');
  // ISO dates sort as text, so a plain comparison works
  if (dueDate !== null && dueDate < today) {
    return derived('overdue', 'money still due and the due date has passed');
  }
  return derived('unpaid', 'money still due and not yet past the due date');
}

function buildLine(row: CsvRow): Line {
  const quantity = Number(row['Line Quantity'] ?? '');
  return {
    description: row['Line Description'] ?? null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPricePence: parseMoney(row['Line Unit Price'] ?? '') ?? 0,
    unitCostPence: unknown('the invoice export has no cost column'),
    taxRateLabel: row['Line Tax Rate'] ?? null,
    taxRatePercent: row['Line Tax Rate Percentage']
      ? Number(row['Line Tax Rate Percentage'])
      : null,
    amountPence: parseMoney(row['Line Amount'] ?? '') ?? 0,
  };
}

function date(
  value: string | null | undefined,
  number: string,
  column: string,
  rowNumbers: number[],
  issues: ConvertIssue[],
): string | null {
  if (!value) return null;
  if (ISO_DATE.test(value)) return value;
  issues.push({
    kind: 'bad-value',
    rows: rowNumbers,
    message: `${number}: "${column}" is not a date we can read (${value}).`,
  });
  return null;
}
