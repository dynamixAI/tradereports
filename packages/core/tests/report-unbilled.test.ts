import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberClients } from '../src/jobber/clients';
import { convertJobberInvoices } from '../src/jobber/invoices';
import { convertJobberJobs } from '../src/jobber/jobs';
import { convertJobberQuotes } from '../src/jobber/quotes';
import { linkRecords } from '../src/link';
import { workNotBilled } from '../src/reports/unbilled';
import { convertTradifyCustomers } from '../src/tradify/customers';
import { convertTradifyInvoices } from '../src/tradify/invoices';
import { convertTradifyJobs } from '../src/tradify/jobs';
import { convertTradifyQuotes } from '../src/tradify/quotes';

const base = { businessId: 'test-business', file: 'test.csv' };
const dated = { ...base, today: '2026-11-07' };

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

function jobber() {
  return workNotBilled(
    linkRecords({
      customers: convertJobberClients(table('jobber/clients-export.csv'), base).records,
      quotes: convertJobberQuotes(table('jobber/quotes-report.csv'), base).records,
      jobs: convertJobberJobs(table('jobber/one-off-jobs-report.csv'), base).records,
      invoices: convertJobberInvoices(table('jobber/invoices-report.csv'), dated).records,
    }),
  );
}

function tradify() {
  return workNotBilled(
    linkRecords({
      customers: convertTradifyCustomers(table('tradify/customers-export.csv'), base).records,
      quotes: convertTradifyQuotes(table('tradify/quotes-export.csv'), base).records,
      jobs: convertTradifyJobs(table('tradify/jobs-export.csv'), base).records,
      invoices: convertTradifyInvoices(table('tradify/invoices-export.csv'), dated).records,
    }),
  );
}

describe('workNotBilled with the Jobber exports', () => {
  it('finds the finished job that was never invoiced', () => {
    expect(jobber().finishedNotInvoiced).toEqual([
      {
        number: '2',
        customer: 'Frank Mock Ltd',
        valuePence: { origin: 'stated', value: 180000 },
        since: '2026-11-03',
        invoices: [],
      },
    ]);
  });

  it('finds the finished job billed only as a draft', () => {
    const [item] = jobber().finishedDraftOnly;
    expect(item?.number).toBe('3');
    expect(item?.invoices).toEqual(['2042']);
    expect(item?.valuePence.value).toBe(180000);
  });

  it('lists accepted quotes with no job, but not one whose job is missing from the file', () => {
    const numbers = jobber().acceptedNoJob.map((item) => item.number);
    expect(numbers).toEqual(['127', '124', '121', '119', '116', '115', '113', '112', '105', '101']);
    // quote 130 is linked to job 1, so it is not "no job" even though job 1 isn't in the file
    expect(numbers).not.toContain('130');
  });

  it('adds up the totals before VAT', () => {
    expect(jobber().doneNotBilledPence).toBe(360000);
    expect(jobber().agreedNotStartedPence).toBe(648000);
  });

  it('writes a plain-English summary', () => {
    expect(jobber().summary).toEqual([
      "£3,600.00 of finished work hasn't been billed (before VAT): 2 jobs, 1 never invoiced and 1 with only a draft invoice.",
      '£6,480.00 of accepted quotes (before VAT) have no job yet: 10 quotes agreed but not booked in.',
    ]);
  });
});

describe('workNotBilled with the Tradify exports', () => {
  it("finds Will's accepted quote with no job", () => {
    expect(tradify().acceptedNoJob).toEqual([
      {
        number: 'QT00002',
        customer: 'Mock',
        valuePence: { origin: 'stated', value: 288000 },
        since: '2026-11-05',
        invoices: [],
      },
    ]);
  });

  it('says which jobs it could not check, instead of claiming they are billed', () => {
    const report = tradify();
    expect(report.jobsWithUnknownCompletion).toEqual(['JB00002', 'JB00001']);
    expect(report.finishedNotInvoiced).toEqual([]);
    expect(report.summary).toEqual([
      '£2,880.00 of accepted quotes (before VAT) has no job yet: 1 quote agreed but not booked in.',
      "2 jobs couldn't be checked because the export doesn't say whether they are finished.",
    ]);
  });
});

describe('workNotBilled with nothing to find', () => {
  it('says so plainly', () => {
    const report = workNotBilled({ jobs: [], quotes: [], invoices: [], issues: [] });
    expect(report.summary).toEqual([]);
    expect(report.doneNotBilledPence).toBe(0);
  });
});
