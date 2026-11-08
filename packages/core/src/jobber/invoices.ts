import type { CsvRow, CsvTable } from '../csv';
import { pounds, workOutTax } from '../invoice-checks';
import { parseMoney } from '../money';
import { readJobberDate as readDate, readLineItems } from './shared';
import {
  derived,
  stated,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Invoice,
  type InvoiceStatus,
  type Known,
} from '../model';

// Jobber's own status words, as seen in real exports
const STATUSES: Record<string, InvoiceStatus> = {
  Draft: 'draft',
  'Awaiting Payment': 'unpaid',
  'Past Due': 'overdue',
  Paid: 'paid',
};

// a UK account still shows "($)" in money headers; accept "(£)" in case Jobber fixes it
const MONEY_SUFFIXES = [' ($)', ' (£)'];

export interface JobberInvoiceOptions {
  businessId: string;
  file: string;
  // YYYY-MM-DD; passed in so "overdue" is the same every time the tests run
  today: string;
}

// Turn a Jobber invoices report (one row per invoice) into checked invoices.
export function convertJobberInvoices(
  table: CsvTable,
  options: JobberInvoiceOptions,
): ConvertResult<Invoice> {
  const issues: ConvertIssue[] = [];

  // find each money column under whichever currency label it has
  const moneyColumn = (name: string): string | null =>
    MONEY_SUFFIXES.map((suffix) => name + suffix).find((h) => table.headers.includes(h)) ?? null;

  const columns = {
    preTax: moneyColumn('Pre-tax total'),
    total: moneyColumn('Total'),
    balance: moneyColumn('Balance'),
    tax: moneyColumn('Tax amount'),
    discount: moneyColumn('Discount'),
  };

  const missing = [
    ...['Invoice #', 'Status', 'Line items'].filter((name) => !table.headers.includes(name)),
    ...Object.entries(columns)
      .filter(([, header]) => header === null)
      .map(([key]) => key),
  ];
  if (missing.length > 0) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: `This doesn't look like a Jobber invoices report. Missing: ${missing.join(', ')}.`,
    });
    return { records: [], issues };
  }

  const records: Invoice[] = [];
  // paid invoices whose balance still shows money owed, reported once for the whole file
  const paidWithBalance: number[] = [];

  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const invoice = buildInvoice(row, rowNumber, columns, options, issues, paidWithBalance);
    if (invoice) records.push(invoice);
  });

  if (paidWithBalance.length > 0) {
    issues.push({
      kind: 'source-quirk',
      rows: paidWithBalance,
      message: `${paidWithBalance.length} invoices are marked Paid but Jobber still shows their full amount as the balance. TradeReports treats them as paid and ignores that balance.`,
    });
  }

  checkPaidDates(table, records, issues);

  return { records, issues };
}

interface MoneyColumns {
  preTax: string | null;
  total: string | null;
  balance: string | null;
  tax: string | null;
  discount: string | null;
}

function buildInvoice(
  row: CsvRow,
  rowNumber: number,
  columns: MoneyColumns,
  options: JobberInvoiceOptions,
  issues: ConvertIssue[],
  paidWithBalance: number[],
): Invoice | null {
  const number = row['Invoice #'];
  if (!number) {
    issues.push({
      kind: 'bad-value',
      rows: [rowNumber],
      message: `Row ${rowNumber} has no invoice number.`,
    });
    return null;
  }

  const money = (column: string | null): number | null => {
    const text = column ? (row[column] ?? '') : '';
    const pence = parseMoney(text);
    if (pence === null) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${number}: "${column ?? 'amount'}" is not an amount (${text || 'empty'}).`,
      });
    }
    return pence;
  };

  const preTax = money(columns.preTax);
  const total = money(columns.total);
  const balance = money(columns.balance);
  const tax = money(columns.tax);
  // a blank discount just means none
  const discount = row[columns.discount ?? ''] ? money(columns.discount) : 0;
  if (preTax === null || total === null || balance === null || tax === null || discount === null) {
    return null;
  }

  const rows = [rowNumber];
  const { taxMode, net } = workOutTax(number, preTax, tax, total, 'pre-tax total', rows, issues);
  const lines = readLineItems(row['Line items'], number, rows, issues);

  // line items are before discount and before VAT on exclusive invoices
  const lineSum = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (lines.length > 0 && lineSum - discount !== preTax) {
    issues.push({
      kind: 'totals-do-not-add-up',
      rows,
      message: `${number}: line items come to ${pounds(lineSum)} less ${pounds(discount)} discount, but the pre-tax total is ${pounds(preTax)}.`,
    });
  }

  const dueDate = readDate(row['Due date'], number, 'Due date', rows, issues);
  const status = workOutStatus(row['Status'], dueDate, options.today, number, rows, issues);

  // Jobber has no "amount paid" column, and its balance is wrong on paid invoices
  let paid: Known<number>;
  let due: Known<number>;
  if (status.value === 'paid') {
    paid = derived(total, 'status is Paid');
    due = derived(0, "status is Paid, so Jobber's balance is ignored");
    if (balance !== 0) paidWithBalance.push(rowNumber);
  } else {
    due = stated(balance);
    paid = derived(total - balance, 'total minus balance');
  }

  return {
    businessId: options.businessId,
    number,
    customerName: row['Client name'] ?? null,
    jobNumbers: (row['Job #s'] ?? '')
      .split(',')
      .map((job) => job.trim())
      .filter((job) => job !== ''),
    issueDate: readDate(row['Issued date'], number, 'Issued date', rows, issues),
    dueDate,
    status,
    taxMode,
    netPence: net,
    taxPence: tax,
    grossPence: total,
    paidPence: paid,
    duePence: due,
    // the export has no reliable sent flag; only a draft is certainly unsent
    sent:
      status.value === 'draft'
        ? derived(false, 'Jobber drafts are not sent')
        : unknown('the Jobber export does not say whether it was sent'),
    lines,
    source: { tool: 'jobber', file: options.file, rows },
  };
}

// map Jobber's words; an unpaid invoice that has since passed its due date becomes overdue
function workOutStatus(
  word: string | null | undefined,
  dueDate: string | null,
  today: string,
  number: string,
  rows: number[],
  issues: ConvertIssue[],
): Known<InvoiceStatus> {
  const status = word ? STATUSES[word] : undefined;
  if (!status) {
    issues.push({
      kind: 'bad-value',
      rows,
      message: `${number}: status "${word ?? 'empty'}" is not one we recognise, so it is left unknown.`,
    });
    return unknown(word ? `status "${word}" is not recognised` : 'no status');
  }
  if (status === 'unpaid' && dueDate !== null && dueDate < today) {
    return derived('overdue', 'Jobber said Awaiting Payment, and the due date has passed since');
  }
  return stated(status);
}

// When every paid invoice was marked paid on one day, that's usually the day the data was
// imported, so payment times worked out from it would be wrong.
function checkPaidDates(table: CsvTable, records: Invoice[], issues: ConvertIssue[]): void {
  if (!table.headers.includes('Marked paid date')) return;
  const paidRows = records
    .filter((invoice) => invoice.status.value === 'paid')
    .map((invoice) => invoice.source.rows[0] ?? 0);
  if (paidRows.length < 5) return;
  const dates = new Set(
    table.rows
      .filter((_, index) => paidRows.includes(table.rowNumbers[index] ?? -1))
      .map((row) => row['Marked paid date']),
  );
  if (dates.size === 1) {
    const [only] = dates;
    issues.push({
      kind: 'source-quirk',
      rows: paidRows,
      message: `All ${paidRows.length} paid invoices were marked paid on the same day (${only ?? 'unknown'}). That is usually the day the data was imported, so how long customers took to pay can't be worked out from it.`,
    });
  }
}
