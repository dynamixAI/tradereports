import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberClients } from '../src/jobber/clients';
import { convertJobberInvoices } from '../src/jobber/invoices';
import { convertJobberJobs } from '../src/jobber/jobs';
import { convertJobberQuotes } from '../src/jobber/quotes';
import { linkRecords } from '../src/link';
import { dataHealth } from '../src/reports/health';
import { convertTradifyInvoices } from '../src/tradify/invoices';

const base = { businessId: 'test-business', file: 'test.csv' };
const today = '2026-11-07';

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

// convert all four Jobber files, link them, and put every issue in one report
function jobberHealth() {
  const clients = convertJobberClients(table('jobber/clients-export.csv'), base);
  const quotes = convertJobberQuotes(table('jobber/quotes-report.csv'), base);
  const jobs = convertJobberJobs(table('jobber/one-off-jobs-report.csv'), base);
  const invoices = convertJobberInvoices(table('jobber/invoices-report.csv'), { ...base, today });
  const linked = linkRecords({
    customers: clients.records,
    quotes: quotes.records,
    jobs: jobs.records,
    invoices: invoices.records,
  });
  return dataHealth([
    { file: 'clients-export.csv', issues: clients.issues },
    { file: 'quotes-report.csv', issues: quotes.issues },
    { file: 'one-off-jobs-report.csv', issues: jobs.issues },
    { file: 'invoices-report.csv', issues: invoices.issues },
    { file: 'all files', issues: linked.issues },
  ]);
}

describe('dataHealth with the Jobber exports', () => {
  it('counts what to fix, check and what was handled', () => {
    const report = jobberHealth();
    expect([report.toFix, report.toCheck, report.handled]).toEqual([0, 8, 2]);
  });

  it('puts the checks in order of urgency, biggest group first', () => {
    expect(
      jobberHealth().checks.map((check) => [check.title, check.level, check.items.length]),
    ).toEqual([
      ["Values we couldn't read", 'check', 6],
      ["Links to records that aren't in your files", 'check', 2],
      ['Export quirks we corrected for', 'handled', 2],
    ]);
  });

  it('keeps the file and rows for each item', () => {
    const [first] = jobberHealth().checks[0]?.items ?? [];
    expect(first?.file).toBe('clients-export.csv');
    expect(first?.rows).toEqual([27]);
    expect(first?.message).toContain('Zara Testcase');
  });

  it('writes a plain-English summary', () => {
    expect(jobberHealth().summary).toEqual([
      '0 things to fix, 8 to check, and 2 quirks already handled.',
      "Values we couldn't read: 6.",
      "Links to records that aren't in your files: 2.",
    ]);
  });
});

describe('dataHealth with other issues', () => {
  it('lists Tradify invoices that may be drafts', () => {
    const invoices = convertTradifyInvoices(table('tradify/invoices-export.csv'), {
      ...base,
      today,
    });
    const report = dataHealth([{ file: 'invoices-export.csv', issues: invoices.issues }]);
    expect(report.checks.map((check) => [check.title, check.items.length])).toEqual([
      ['Invoices that may be drafts', 3],
    ]);
  });

  it('includes problems found by the CSV reader', () => {
    const report = dataHealth([{ file: 'odd.csv', issues: readCsv('Name,City\nAlice\n').issues }]);
    expect(report.checks[0]).toEqual(
      expect.objectContaining({
        title: 'File layout problems',
        items: [
          { file: 'odd.csv', rows: [2], message: 'Row 2 has 1 cells but there are 2 columns.' },
        ],
      }),
    );
  });

  it('puts things to fix before things to check', () => {
    const report = dataHealth([
      {
        file: 'a.csv',
        issues: [
          { kind: 'bad-value', rows: [2], message: 'a' },
          { kind: 'bad-value', rows: [3], message: 'b' },
          { kind: 'duplicate-name', rows: [4, 5], message: 'c' },
        ],
      },
    ]);
    expect(report.checks.map((check) => check.level)).toEqual(['fix', 'check']);
  });

  it('says so when there is nothing wrong', () => {
    expect(dataHealth([{ file: 'a.csv', issues: [] }]).summary).toEqual([
      'No problems found in your files.',
    ]);
  });
});
