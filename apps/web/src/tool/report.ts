import {
  convertJobberClients,
  convertJobberInvoices,
  convertJobberJobs,
  convertJobberQuotes,
  convertSpreadsheet,
  convertTradifyCustomers,
  convertTradifyInvoices,
  convertTradifyJobs,
  convertTradifyQuotes,
  customerInsights,
  dataHealth,
  detectFile,
  incomeByPeriod,
  linkRecords,
  moneyOwed,
  trends,
  workNotBilled,
  type ConvertIssue,
  type Customer,
  type Field,
  type CustomerInsights,
  type FileIssues,
  type Grain,
  type HealthReport,
  type IncomeReport,
  type Invoice,
  type Job,
  type OwedReport,
  type Quote,
  type TrendsReport,
  type UnbilledReport,
  type VatStagger,
} from '@tradereports/core';
import { FIELD_NAMES, fitCheck } from './answers';
import { needsQuestions, type ToolFile } from './files';

// the tool only ever works for one business at a time
const BUSINESS = 'local';

export interface ToolReport {
  // YYYY-MM-DD the report was worked out for
  asOf: string;
  // null when the files behind that part aren't there
  owed: OwedReport | null;
  income: IncomeReport | null;
  customers: CustomerInsights | null;
  unbilled: UnbilledReport | null;
  // without a jobs file, finished work that wasn't billed can't be found
  hasJobs: boolean;
  health: HealthReport;
  // this week against last, or this month against last
  trends: TrendsReport;
  // choices the visitor made against our advice, said plainly at the top
  doubts: string[];
}

interface Records {
  invoices: Invoice[];
  quotes: Quote[];
  jobs: Job[];
  customers: Customer[];
  // invoices, quotes or jobs files that gave us something
  hasWork: boolean;
}

// Turn every checked file into one report.
export function buildReport(
  files: ToolFile[],
  asOf: string,
  stagger: VatStagger,
  grain: Grain = 'week',
): ToolReport {
  const records: Records = { invoices: [], quotes: [], jobs: [], customers: [], hasWork: false };
  const issues: FileIssues[] = [];

  for (const file of files) {
    const found = convert(file, asOf, records);
    // problems the file reader found count too, such as rows with missing cells
    issues.push({ file: file.upload.fileName, issues: [...file.upload.table.issues, ...found] });
  }

  const linked = linkRecords(records);
  if (linked.issues.length > 0) issues.push({ file: 'Linking your files', issues: linked.issues });

  const haveInvoices = files.some((f) => f.slot === 'invoices');
  return {
    asOf,
    owed: haveInvoices ? moneyOwed(records.invoices, asOf, linked) : null,
    income: haveInvoices ? incomeByPeriod(records.invoices, stagger) : null,
    customers: haveInvoices ? customerInsights(linked, records.customers, asOf) : null,
    unbilled: haveInvoices && records.hasWork ? workNotBilled(linked) : null,
    hasJobs: files.some((f) => f.slot === 'jobs'),
    health: dataHealth(issues),
    trends: trends(records, grain, asOf),
    doubts: doubts(files),
  };
}

// read one file into the shared records; returns the problems found
function convert(file: ToolFile, asOf: string, into: Records): ConvertIssue[] {
  const { table, fileName } = file.upload;
  const options = { businessId: BUSINESS, file: fileName };

  // a home-made sheet uses the visitor's answers
  if (needsQuestions(file)) {
    const result = convertSpreadsheet(table, file.answers, options);
    into.invoices.push(...result.records);
    return result.issues;
  }

  const match = detectFile(table.headers).match;
  if (!match) return [];
  const jobber = match.tool === 'jobber';
  switch (match.kind) {
    case 'invoices': {
      const withDate = { ...options, today: asOf };
      const result = jobber
        ? convertJobberInvoices(table, withDate)
        : convertTradifyInvoices(table, withDate);
      into.invoices.push(...result.records);
      return result.issues;
    }
    case 'quotes': {
      const result = jobber
        ? convertJobberQuotes(table, options)
        : convertTradifyQuotes(table, options);
      into.quotes.push(...result.records);
      into.hasWork = true;
      return result.issues;
    }
    case 'jobs': {
      const result = jobber
        ? convertJobberJobs(table, options)
        : convertTradifyJobs(table, options);
      into.jobs.push(...result.records);
      into.hasWork = true;
      return result.issues;
    }
    case 'customers': {
      const result = jobber
        ? convertJobberClients(table, options)
        : convertTradifyCustomers(table, options);
      into.customers.push(...result.records);
      return result.issues;
    }
    // visits aren't used in the report yet
    case 'visits':
      return [];
  }
}

// a file the visitor said was invoices against our advice, or a column that didn't fit
function doubts(files: ToolFile[]): string[] {
  const list: string[] = [];
  for (const file of files) {
    const name = file.upload.fileName;
    if (file.forced) {
      list.push(
        `${name}: you said this is your invoices, though it didn't look like it. Check these figures before relying on them.`,
      );
    }
    if (!needsQuestions(file)) continue;
    for (const [field, header] of Object.entries(file.answers.columns)) {
      if (!header) continue;
      const warning = fitCheck(field as Field, header, file.upload.table);
      if (warning) {
        const label = FIELD_NAMES[field as Field].toLowerCase().replace('vat', 'VAT');
        list.push(`${name}: "${header}" was used as the ${label}. ${warning}`);
      }
    }
  }
  return list;
}

// "2026-11-10" in the visitor's own time zone
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// trade names stay off the site; messages from the engine may mention them
export function plain(text: string): string {
  return (
    text
      // "a Jobber invoices export" -> "your invoices export"
      .replace(/\b(an?|the) (?:Jobber|Tradify)\b/gi, (_, word: string) =>
        word[0] === word[0]?.toUpperCase() ? 'Your' : 'your',
      )
      .replace(/\b(?:Jobber|Tradify)\b/g, 'your job software')
  );
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function money(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}
