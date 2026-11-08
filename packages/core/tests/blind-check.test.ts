import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { findHeaderRow, readSheet } from '../src/layout';
import { scanTable } from '../src/scan';
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
    process.stdout.write(`${lines.join('\n')}\n`);
  });
});
