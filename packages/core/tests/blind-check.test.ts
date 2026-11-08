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
  type StatusMeaning,
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
  // meanings given by hand for codes nobody can guess: BLIND_STATUS="open=unpaid,clr=paid"
  const given = Object.fromEntries(
    (process.env['BLIND_STATUS'] ?? '')
      .split(',')
      .map((pair) => pair.split('=').map((part) => part.trim().toLowerCase()))
      .filter((pair): pair is [string, StatusMeaning] =>
        ['paid', 'unpaid', 'part paid', 'ignore'].includes(pair[1] ?? ''),
      ),
  );
  let answers = acceptSuggested(sheet, { ...emptyAnswers(), status: given });
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
    // repairs are left unanswered here; the second figures below accept them all
    if (
      q.kind === 'repair' ||
      q.kind === 'same-customer' ||
      q.kind === 'split-customer' ||
      q.kind === 'note-amount'
    )
      return current;
    return { ...current, years: { ...current.years, [q.value]: 2026 } };
  };
  for (let round = 0; round < 3; round += 1) {
    for (const q of askQuestions(sheet, answers)) answers = placeholder(answers, q);
  }
  const { records, issues } = convertSpreadsheet(sheet, answers, {
    businessId: 'blind',
    file: 'blind',
  });
  const repairs = asked.flatMap((q) => (q.kind === 'repair' ? [q.repair] : []));
  const sameCustomers = asked.flatMap((q) => (q.kind === 'same-customer' ? [q.match] : []));
  const splits = asked.flatMap((q) => (q.kind === 'split-customer' ? [q.split] : []));
  const notes = asked.flatMap((q) => (q.kind === 'note-amount' ? [q.id] : []));
  const withRepairs = convertSpreadsheet(
    sheet,
    {
      ...answers,
      repairs: Object.fromEntries(
        [...repairs.map((r) => r.id), ...notes].map((id) => [id, 'accept' as const]),
      ),
      names: Object.fromEntries([
        ...sameCustomers.map((m) => [m.id, 'same' as const]),
        ...splits.map((sp) => [sp.id, 'separate' as const]),
      ]),
    },
    { businessId: 'blind', file: 'blind' },
  ).records;
  type Rec = (typeof records)[number];
  const totals = (list: Rec[]) => {
    const sum = (amount: (r: Rec) => number) => list.reduce((total, r) => total + amount(r), 0);
    const unknownDue = list.filter((r) => r.duePence.value === null).length;
    return [
      `  Invoices: ${list.length}  Customers: ${new Set(list.map((r) => r.customerName)).size}`,
      `  Net: ${pounds(sum((r) => r.netPence.value ?? 0))}  VAT: ${pounds(sum((r) => r.taxPence))}  Gross: ${pounds(sum((r) => r.grossPence))}`,
      `  Owed: ${pounds(sum((r) => r.duePence.value ?? 0))}${unknownDue > 0 ? ` (${unknownDue} invoices with unknown amount owed)` : ''}`,
    ];
  };
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
          : q.kind === 'repair'
            ? `repair: ${q.repair.action} on row ${q.repair.row}. ${q.repair.evidence.join(' ')}`
            : q.kind === 'note-amount'
              ? `amount in a note, row ${q.row}: "${q.amount.note}". ${q.amount.evidence.join(' ')}`
              : q.kind === 'split-customer'
                ? `two customers? ${q.split.groups.map((g) => `"${q.split.name} (${g.label})" rows ${g.rows.join(', ')}`).join(' / ')}`
                : q.kind === 'same-customer'
                  ? `same customer${q.match.tidyOnly ? ' (tidy)' : ''}: "${q.match.variant}" is "${q.match.canonical}"? Rows ${q.match.rows.join(', ')}. ${q.match.evidence.join(' ')}`
                  : `the year for "${q.value}"`;
  return [
    'Questions the user would be asked:',
    ...(asked.length === 0 ? ['  (none)'] : asked.map((q) => `  - ${describe(q)}`)),
    '',
    `Converted (placeholders used for ${asked.length} unanswered questions):`,
    ...totals(records),
    ...(repairs.length + sameCustomers.length + splits.length + notes.length > 0
      ? [
          `With all ${repairs.length} repairs, ${sameCustomers.length} same-customer matches, ${splits.length} splits and ${notes.length} note amounts accepted:`,
          ...totals(withRepairs),
        ]
      : []),
    'Checks:',
    ...(issues.length === 0 ? ['  (none)'] : issues.map((i) => `  [${i.kind}] ${i.message}`)),
  ];
}
