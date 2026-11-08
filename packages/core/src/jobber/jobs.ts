import { buildAddress } from '../clean';
import type { CsvRow, CsvTable } from '../csv';
import { pounds } from '../invoice-checks';
import { parseMoney } from '../money';
import {
  derived,
  stated,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Job,
  type Known,
} from '../model';
import { readJobberDate } from './shared';

export interface JobberJobOptions {
  businessId: string;
  file: string;
}

// Jobber one-off jobs report: one row per job, with revenue, costs and profit.
export function convertJobberJobs(table: CsvTable, options: JobberJobOptions): ConvertResult<Job> {
  const issues: ConvertIssue[] = [];

  // accept "(£)" in case Jobber fixes the label on UK accounts
  const header = (name: string) =>
    [`${name} ($)`, `${name} (£)`].find((h) => table.headers.includes(h)) ?? null;

  if (!table.headers.includes('Job #') || !table.headers.includes('Closed date')) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: "This doesn't look like a Jobber jobs report. Missing: Job # or Closed date.",
    });
    return { records: [], issues };
  }

  const records: Job[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const job = buildJob(row, rowNumber, header, options, issues);
    if (job) records.push(job);
  });
  return { records, issues };
}

function buildJob(
  row: CsvRow,
  rowNumber: number,
  header: (name: string) => string | null,
  options: JobberJobOptions,
  issues: ConvertIssue[],
): Job | null {
  const number = row['Job #'];
  const rows = [rowNumber];
  if (!number) {
    issues.push({ kind: 'bad-value', rows, message: `Row ${rowNumber} has no job number.` });
    return null;
  }

  // a missing money column is unknown, never zero
  const money = (name: string): Known<number> => {
    const column = header(name);
    if (!column) return unknown(`no "${name}" column`);
    const pence = parseMoney(row[column] ?? '');
    if (pence === null) {
      issues.push({
        kind: 'bad-value',
        rows,
        message: `Job ${number}: "${column}" is not an amount.`,
      });
      return unknown(`"${column}" could not be read`);
    }
    return stated(pence);
  };

  const revenue = money('Job revenue');
  const cost = money('Total costs');
  let profit = money('Profit');
  if (revenue.value !== null && cost.value !== null && profit.value !== null) {
    if (revenue.value - cost.value !== profit.value) {
      issues.push({
        kind: 'totals-do-not-add-up',
        rows,
        message: `Job ${number}: revenue ${pounds(revenue.value)} minus costs ${pounds(cost.value)} should be ${pounds(revenue.value - cost.value)} profit, but the file says ${pounds(profit.value)}.`,
      });
      profit = unknown("revenue minus costs doesn't match the profit column");
    }
  }

  const date = (column: string) =>
    readJobberDate(row[column], `Job ${number}`, column, rows, issues);
  const completedDate = date('Closed date');
  const list = (text: string | null | undefined) =>
    (text ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');

  return {
    businessId: options.businessId,
    number,
    customerName: row['Client name'] ?? null,
    title: row['Title'] ?? null,
    quoteNumbers: list(row['Quote #']),
    invoiceNumbers: list(row['Invoice #s']),
    createdDate: date('Created date'),
    scheduledDate: date('Scheduled start date'),
    completedDate,
    completed: completedDate ? stated(true) : derived(false, 'no closed date'),
    stageAsTyped: null,
    categories: [],
    itemNames: list(row['Line items']),
    address: buildAddress({
      street: row['Service street'] ?? null,
      city: row['Service city'] ?? null,
      region: row['Service province'] ?? null,
      postcode: row['Service ZIP'] ?? null,
      country: null,
    }),
    revenuePence: revenue,
    costPence: cost,
    profitPence: profit,
    source: { tool: 'jobber', file: options.file, rows },
  };
}
