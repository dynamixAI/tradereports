// public entry point for the core package
export { parseMoney } from './money';
export { cleanCell, readCsv } from './csv';
export type { CsvIssue, CsvIssueKind, CsvRow, CsvTable } from './csv';
export { convertTradifyInvoices } from './tradify/invoices';
export * from './model';
export { convertJobberInvoices } from './jobber/invoices';
export { detectFile, PROFILES } from './detect';
export { convertInvoiceFile } from './invoices';
export { moneyOwed } from './reports/owed';
export type { OwedReport } from './reports/owed';
export * from './clean';
export { convertTradifyCustomers } from './tradify/customers';
export { convertJobberClients } from './jobber/clients';
export { convertJobberQuotes } from './jobber/quotes';
export { convertTradifyQuotes } from './tradify/quotes';
export { convertJobberJobs } from './jobber/jobs';
export { convertTradifyJobs } from './tradify/jobs';
export { linkRecords } from './link';
export type { Linked } from './link';
export { workNotBilled } from './reports/unbilled';
export type { UnbilledReport } from './reports/unbilled';
export { incomeByPeriod } from './reports/income';
export type { IncomeReport, PeriodTotal, VatStagger } from './reports/income';
export { customerInsights } from './reports/customers';
export type { CustomerInsights, CustomerSummary } from './reports/customers';
export { dataHealth } from './reports/health';
export type { FileIssues, HealthReport } from './reports/health';
export * from './dates';
export { scanColumn, scanTable } from './scan';
export type { ColumnScan, DateOrderFinding, ValueKind } from './scan';
export { findHeaderRow, readSheet } from './layout';
export type { FileKind } from './detect';
export { FIELDS } from './suggest';
export type { Field } from './suggest';
export {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  REQUIRED_FIELDS,
  statusKey,
} from './general/questions';
export type { Answers, Question, StatusMeaning } from './general/questions';
export type { Repair } from './repairs';
export { convertSpreadsheet } from './general/invoices';
export { periodLabel, periodStart, trends } from './reports/trends';
export type {
  Comparison,
  Grain,
  SoFar,
  Trend,
  TrendMetric,
  TrendPoint,
  TrendsReport,
} from './reports/trends';
