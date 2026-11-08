import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberClients } from '../src/jobber/clients';
import { convertJobberInvoices } from '../src/jobber/invoices';
import { linkRecords } from '../src/link';
import { customerInsights } from '../src/reports/customers';

const asOf = '2026-11-07';
const base = { businessId: 'test-business', file: 'test.csv' };

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

// the Jobber test data covers May to October, so a 3 month win-back window shows the idea
function jobber(winBackMonths = 3) {
  const customers = convertJobberClients(table('jobber/clients-export.csv'), base).records;
  const invoices = convertJobberInvoices(table('jobber/invoices-report.csv'), {
    ...base,
    today: asOf,
  }).records;
  const linked = linkRecords({ customers, quotes: [], jobs: [], invoices });
  return customerInsights(linked, customers, asOf, { winBackMonths });
}

describe('customerInsights with the Jobber exports', () => {
  it('ranks the top customers by net invoiced, leaving drafts out', () => {
    expect(jobber().top.map((c) => [c.customer, c.invoicedPence])).toEqual([
      ['Noah Fiction', 960000],
      ['Tara Copy', 675000],
      ['Ben Sample', 457000],
      ['Isla Trial', 332000],
      ['Liam Proxy', 180000],
    ]);
  });

  it('finds customers overdue on more than one invoice', () => {
    expect(jobber().owingOnSeveral.map((c) => [c.customer, c.overdueInvoices])).toEqual([
      ['Maya Pretend', ['2034', '2023']],
      ['Replica Care Homes Ltd', ['2032', '2028']],
    ]);
  });

  it('lists customers with no work in the win-back window, longest gap first', () => {
    expect(jobber().winBack.map((c) => [c.customer, c.lastInvoiceDate])).toEqual([
      ['Vera Template', '2026-05-20'],
      ['Alice Test', '2026-06-05'],
      ['Isla Trial', '2026-06-14'],
      ['Dev Example', '2026-06-27'],
      ['Sketch Property Group', '2026-07-08'],
      ['Harry Dummy', '2026-07-21'],
      ['Mockup Lettings Ltd', '2026-07-26'],
      ['Grace Placeholder', '2026-07-29'],
    ]);
  });

  it('gives contact details for the win-back list', () => {
    expect(jobber().winBack[0]).toEqual(
      expect.objectContaining({ phones: ['07700900022'], emails: ['vera@example.com'] }),
    );
  });

  it('lists customers on file who have never been sent an invoice', () => {
    expect(jobber().neverInvoiced).toEqual([
      'Adam Mockery',
      'Bella Fauxname',
      'Carl Pseudo',
      'Dina Phantom',
      'Jack Specimen',
      'Rosa Imitation',
      'Sample Facilities Ltd',
      'Will Mock',
      'Xena Example',
      'Zara Testcase',
    ]);
  });

  it('counts repeat and one-off customers', () => {
    expect([jobber().repeatCustomers, jobber().oneOffCustomers]).toEqual([13, 7]);
  });

  it('writes a plain-English summary', () => {
    expect(jobber().summary).toEqual([
      'Your biggest customer is Noah Fiction: £9,600.00 invoiced before VAT.',
      '13 of 20 customers have come back for more than one job.',
      '2 customers are overdue on more than one invoice: Maya Pretend, Replica Care Homes Ltd.',
      '8 customers have had no work in over 3 months. Worth a call.',
      '10 customers on file have never been sent an invoice.',
      "Past late payment can't be shown: the exports don't have reliable payment dates.",
    ]);
  });

  it('uses 12 months by default, which finds nobody in this data', () => {
    expect(jobber(12).winBack).toEqual([]);
  });
});

describe('customerInsights with no data', () => {
  it('still explains what it cannot show', () => {
    const report = customerInsights({ jobs: [], quotes: [], invoices: [], issues: [] }, [], asOf);
    expect(report.summary).toEqual([
      "Past late payment can't be shown: the exports don't have reliable payment dates.",
    ]);
  });
});
