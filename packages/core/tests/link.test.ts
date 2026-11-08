import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberClients } from '../src/jobber/clients';
import { convertJobberInvoices } from '../src/jobber/invoices';
import { convertJobberJobs } from '../src/jobber/jobs';
import { convertJobberQuotes } from '../src/jobber/quotes';
import { linkRecords } from '../src/link';
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
  return linkRecords({
    customers: convertJobberClients(table('jobber/clients-export.csv'), base).records,
    quotes: convertJobberQuotes(table('jobber/quotes-report.csv'), base).records,
    jobs: convertJobberJobs(table('jobber/one-off-jobs-report.csv'), base).records,
    invoices: convertJobberInvoices(table('jobber/invoices-report.csv'), dated).records,
  });
}

function tradify() {
  return linkRecords({
    customers: convertTradifyCustomers(table('tradify/customers-export.csv'), base).records,
    quotes: convertTradifyQuotes(table('tradify/quotes-export.csv'), base).records,
    jobs: convertTradifyJobs(table('tradify/jobs-export.csv'), base).records,
    invoices: convertTradifyInvoices(table('tradify/invoices-export.csv'), dated).records,
  });
}

describe('linkRecords with the Jobber exports', () => {
  it('joins jobs to their quotes and invoices from both sides', () => {
    const jobs = Object.fromEntries(
      jobber().jobs.map((j) => [j.job.number, [j.quotes, j.invoices]]),
    );
    expect(jobs).toEqual({
      '4': [['104'], []],
      '3': [['122'], ['2042']],
      '2': [['114'], []],
    });
  });

  it('flags links to job 1, which the jobs report left out', () => {
    const missing = jobber().issues.filter((issue) => issue.kind === 'missing-link');
    expect(missing.map((issue) => issue.message)).toEqual([
      "Quote 130 links to job 1, which isn't in the jobs file. The report may have filtered it out.",
      "Invoice 2041 links to job 1, which isn't in the jobs file. The report may have filtered it out.",
    ]);
  });

  it('finds no disagreement between the two sides', () => {
    expect(jobber().issues.filter((issue) => issue.kind === 'links-disagree')).toEqual([]);
  });

  it('traces an invoice to its quote through the job', () => {
    const invoice = jobber().invoices.find((i) => i.invoice.number === '2042');
    expect(invoice?.jobs).toEqual(['3']);
    expect(invoice?.quotes).toEqual({
      origin: 'derived',
      value: ['122'],
      rule: 'through the linked jobs',
    });
  });

  it('matches every record to a client by name', () => {
    const linked = jobber();
    const all = [...linked.jobs, ...linked.quotes, ...linked.invoices];
    expect(all.every((record) => record.customer.origin === 'derived')).toBe(true);
    expect(linked.issues.filter((issue) => issue.kind === 'customer-not-found')).toEqual([]);
  });
});

describe('linkRecords with the Tradify exports', () => {
  it('joins jobs to quotes and invoices stated in the other files', () => {
    const jobs = Object.fromEntries(
      tradify().jobs.map((j) => [j.job.number, [j.quotes, j.invoices]]),
    );
    expect(jobs).toEqual({
      JB00002: [[], ['IV00003']],
      JB00001: [['QT00001'], ['IV00001', 'IV00002']],
    });
  });

  it('traces both of Alice’s invoices back to her quote', () => {
    const invoice = tradify().invoices.find((i) => i.invoice.number === 'IV00002');
    expect(invoice?.quotes.value).toEqual(['QT00001']);
  });

  it('says an invoice without a job cannot be traced to a quote', () => {
    const invoice = tradify().invoices.find((i) => i.invoice.number === 'IV00004');
    expect(invoice?.quotes.origin).toBe('unknown');
  });

  it('matches "Test (Alice)" to customer Test with contact Alice', () => {
    const invoice = tradify().invoices.find((i) => i.invoice.number === 'IV00001');
    expect(invoice?.customer.origin).toBe('derived');
    expect(invoice?.customer.value?.name).toBe('Test');
    expect(invoice?.customer.origin === 'derived' && invoice.customer.rule).toBe(
      'matched "Test (Alice)" to customer "Test" with contact Alice',
    );
  });

  it('raises nothing for this data', () => {
    expect(tradify().issues).toEqual([]);
  });
});

describe('linkRecords with problem data', () => {
  it('leaves a shared name unknown instead of picking one customer', () => {
    const customers = convertTradifyCustomers(
      readCsv('Customer Name,Tradify Id\nSmith,a1\nSmith,a2\n'),
      base,
    ).records;
    const invoices = convertTradifyInvoices(
      readCsv(
        'Invoice Number,Customer,Subtotal,Tax,Total,Paid,Due,Line Amount\nIV1,Smith,100.00,0.00,100.00,0.00,100.00,100.00\n',
      ),
      dated,
    ).records;
    const linked = linkRecords({ customers, quotes: [], jobs: [], invoices });
    expect(linked.invoices[0]?.customer).toEqual({
      origin: 'unknown',
      value: null,
      reason: '2 customers are called "Smith"',
    });
  });

  it('reports a name with no customer once', () => {
    const customers = convertTradifyCustomers(
      readCsv('Customer Name,Tradify Id\nJones,a1\n'),
      base,
    ).records;
    const invoices = convertTradifyInvoices(
      readCsv(
        'Invoice Number,Customer,Subtotal,Tax,Total,Paid,Due,Line Amount\nIV1,Nobody,100.00,0.00,100.00,0.00,100.00,100.00\nIV2,Nobody,100.00,0.00,100.00,0.00,100.00,100.00\n',
      ),
      dated,
    ).records;
    const linked = linkRecords({ customers, quotes: [], jobs: [], invoices });
    expect(linked.issues.map((issue) => issue.kind)).toEqual(['customer-not-found']);
  });

  it('flags a Jobber invoice the job does not list', () => {
    const jobs = convertJobberJobs(readCsv('Job #,Closed date,Invoice #s\n5,-,\n'), base).records;
    const invoices = convertJobberInvoices(
      readCsv(
        'Invoice #,Status,Line items,Pre-tax total ($),Total ($),Balance ($),Discount ($),Tax amount ($),Job #s\n9,Paid,"Job (1, £100.00)",100.0,120.0,0.0,0.0,20.0,5\n',
      ),
      dated,
    ).records;
    const linked = linkRecords({ customers: [], quotes: [], jobs, invoices });
    expect(linked.issues.map((issue) => issue.kind)).toEqual(['links-disagree']);
  });
});
