import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberJobs } from '../src/jobber/jobs';
import { convertTradifyJobs } from '../src/tradify/jobs';

const options = { businessId: 'test-business', file: 'jobs.csv' };

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

describe('convertJobberJobs with the real export', () => {
  const { records, issues } = convertJobberJobs(table('jobber/one-off-jobs-report.csv'), options);
  const find = (number: string) => records.find((job) => job.number === number);

  it('reads all 3 jobs without problems', () => {
    expect(records.map((job) => job.number)).toEqual(['4', '3', '2']);
    expect(issues).toEqual([]);
  });

  it('knows which jobs are finished from the closed date', () => {
    expect(find('2')?.completed).toEqual({ origin: 'stated', value: true });
    expect(find('2')?.completedDate).toBe('2026-11-03');
    expect(find('4')?.completed).toEqual({
      origin: 'derived',
      value: false,
      rule: 'no closed date',
    });
  });

  it('keeps the links to quotes and invoices', () => {
    expect(find('3')?.quoteNumbers).toEqual(['122']);
    expect(find('3')?.invoiceNumbers).toEqual(['2042']);
    // job 2 is closed with no invoice: work that was never billed
    expect(find('2')?.invoiceNumbers).toEqual([]);
  });

  it('reads revenue, costs and profit', () => {
    expect(find('4')?.revenuePence).toEqual({ origin: 'stated', value: 108500 });
    expect(find('4')?.costPence.value).toBe(43400);
    expect(find('4')?.profitPence.value).toBe(65100);
  });

  it('reads the service address and item names', () => {
    expect(find('4')?.address?.postcode.value).toBe('WN3 4AB');
    expect(find('4')?.itemNames).toEqual([
      'Leak Repair',
      'Hot water cylinder replacement',
      'Mixer tap',
    ]);
  });
});

describe('convertTradifyJobs with the real export', () => {
  const { records, issues } = convertTradifyJobs(table('tradify/jobs-export.csv'), options);
  const find = (number: string) => records.find((job) => job.number === number);

  it('reads both jobs without problems', () => {
    expect(records.map((job) => job.number)).toEqual(['JB00002', 'JB00001']);
    expect(issues).toEqual([]);
  });

  it('picks the postcode out of the joined address and tidies it', () => {
    const address = find('JB00002')?.address;
    expect(address?.street).toBe('5 Fake Close');
    expect(address?.city).toBe('Leigh');
    expect(address?.postcode.value).toBe('WN7 1EF');
    expect(address?.country.value).toBe('United Kingdom');
  });

  it('keeps a missing job address missing', () => {
    expect(find('JB00001')?.address).toBeNull();
  });

  it('does not claim a job is finished or unfinished without a sign-off', () => {
    expect(find('JB00001')?.completed.origin).toBe('unknown');
  });

  it('keeps categories, stage and created date', () => {
    expect(find('JB00002')?.categories).toEqual(['Normal', 'Call-out']);
    expect(find('JB00002')?.stageAsTyped).toBe('Unassigned');
    expect(find('JB00002')?.createdDate).toBe('2026-11-05');
  });

  it('marks money as unknown, not zero', () => {
    expect(find('JB00002')?.revenuePence.value).toBeNull();
    expect(find('JB00002')?.profitPence.origin).toBe('unknown');
  });
});

describe('job converters with problem files', () => {
  it('flags Jobber profit that does not match revenue minus costs', () => {
    const text =
      'Job #,Closed date,Job revenue ($),Total costs ($),Profit ($)\n7,-,100.0,40.0,70.0\n';
    const { records, issues } = convertJobberJobs(readCsv(text), options);
    expect(records[0]?.profitPence.origin).toBe('unknown');
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('refuses files that are not job exports', () => {
    expect(convertJobberJobs(readCsv('Name\nA\n'), options).issues[0]?.kind).toBe('missing-column');
    expect(convertTradifyJobs(readCsv('Name\nA\n'), options).issues[0]?.kind).toBe(
      'missing-column',
    );
  });
});
