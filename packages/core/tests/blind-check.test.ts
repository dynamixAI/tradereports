import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { findHeaderRow, readSheet } from '../src/layout';
import { scanTable } from '../src/scan';
import { convertSpreadsheet } from '../src/general/invoices';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  statusKey,
  type Answers,
  type Question,
} from '../src/general/questions';
import { pounds } from '../src/invoice-checks';
import { FIELDS, suggestColumns } from '../src/suggest';

// Prints what TradeReports finds in each file in fixtures/blind, so it can be checked
// by hand against an answer key. It asserts nothing, so it never fails the build.
const folder = new URL('./fixtures/blind/', import.meta.url);
const files = existsSync(folder)
  ? readdirSync(folder)
      .filter((name) => name.endsWith('.csv'))
      .sort()
  : [];

describe.skipIf(files.length === 0)('blind check', () => {
  it.each(files)('%s', (name) => {
    const text = readFileSync(new URL(name, folder), 'utf8');
    const sheet = readSheet(text);
    const columns = scanTable(sheet);
    const suggested = suggestColumns(sheet);

    const lines = [
      '',
      `==================== ${name} ====================`,
      `Header row: ${findHeaderRow(text)}`,
      `Data rows kept: ${sheet.rows.length} (spreadsheet rows ${sheet.rowNumbers[0] ?? '-'} to ${sheet.rowNumbers[sheet.rowNumbers.length - 1] ?? '-'})`,
      '',
      'Notes from reading the file:',
      ...(sheet.issues.length === 0
        ? ['  (none)']
        : sheet.issues.map((issue) => `  [${issue.kind}] ${issue.message}`)),
      '',
      'Columns, and what their values look like:',
      ...sheet.headers.map((header) => {
        const scan = columns[header];
        const evidence = scan ? scan.evidence.join(' ') : '';
        return `  ${header}: ${evidence}`;
      }),
      '',
      'Suggested matches (for the user to confirm):',
      ...FIELDS.map((field) => {
        const { best, tie, candidates } = suggested.fields[field];
        if (tie) {
          const level = candidates.slice(0, 2).map((c) => `"${c.header}"`);
          return `  ${field}: tie between ${level.join(' and ')}, please choose`;
        }
        if (!best) return `  ${field}: nothing found`;
        const why = candidates.find((c) => c.header === best)?.evidence.join(' ') ?? '';
        return `  ${field}: "${best}". ${why}`;
      }),
      `  VAT found: ${suggested.vatFound ? 'yes' : 'no'}`,
      ...(suggested.missing.length > 0
        ? [`  Missing required: ${suggested.missing.join(', ')}`]
        : []),
    ];
    lines.push('', ...convertReport(sheet));
    process.stdout.write(`${lines.join('\n')}\n`);
  });
});

// Accept the suggestions, list what a user would still be asked, then answer those with
// placeholders (first option, ignore, day first) so the totals can be checked by hand.
function convertReport(sheet: ReturnType<typeof readSheet>): string[] {
  let answers = acceptSuggested(sheet, emptyAnswers());
  const asked = askQuestions(sheet, answers);
  const placeholder = (current: Answers, q: Question): Answers => {
    if (q.kind === 'column')
      return {
        ...current,
        columns: { ...current.columns, [q.field]: q.options[0]?.header ?? null },
      };
    if (q.kind === 'status')
      return { ...current, status: { ...current.status, [statusKey(q.value)]: 'ignore' } };
    if (q.kind === 'date-order') return { ...current, dateOrder: 'day-first' };
    return { ...current, years: { ...current.years, [q.value]: 2026 } };
  };
  for (let round = 0; round < 3; round += 1) {
    for (const q of askQuestions(sheet, answers)) answers = placeholder(answers, q);
  }
  const { records, issues } = convertSpreadsheet(sheet, answers, {
    businessId: 'blind',
    file: 'blind',
  });
  const sum = (amount: (r: (typeof records)[number]) => number) =>
    records.reduce((total, r) => total + amount(r), 0);
  const unknownDue = records.filter((r) => r.duePence.value === null).length;
  const describe = (q: Question) =>
    q.kind === 'column'
      ? `which column is ${q.field}${
          q.options.length > 1
            ? ` (${q.options
                .slice(0, 3)
                .map((o) => `"${o.header}"`)
                .join(' or ')})`
            : ''
        }`
      : q.kind === 'status'
        ? `what "${q.value || '(blank)'}" means (${q.count} rows)`
        : q.kind === 'date-order'
          ? `whether dates in "${q.column}" are day first`
          : `the year for "${q.value}"`;
  return [
    'Questions the user would be asked:',
    ...(asked.length === 0 ? ['  (none)'] : asked.map((q) => `  - ${describe(q)}`)),
    '',
    `Converted (placeholders used for ${asked.length} unanswered questions):`,
    `  Invoices: ${records.length}`,
    `  Net: ${pounds(sum((r) => r.netPence.value ?? 0))}  VAT: ${pounds(sum((r) => r.taxPence))}  Gross: ${pounds(sum((r) => r.grossPence))}`,
    `  Owed: ${pounds(sum((r) => r.duePence.value ?? 0))}${unknownDue > 0 ? ` (${unknownDue} invoices with unknown amount owed)` : ''}`,
    'Checks:',
    ...(issues.length === 0 ? ['  (none)'] : issues.map((i) => `  [${i.kind}] ${i.message}`)),
  ];
}
