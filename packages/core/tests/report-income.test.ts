import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertInvoiceFile } from '../src/invoices';
import { derived, stated, unknown, type Invoice } from '../src/model';
import { incomeByPeriod } from '../src/reports/income';

const today = '2026-11-07';

function invoicesFrom(path: string) {
  const text = readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
  return convertInvoiceFile(readCsv(text), { businessId: 'test-business', file: path, today })
    .records;
}

// a hand-made sent invoice: £100 + £20 VAT
function invoice(changes: Partial<Invoice>): Invoice {
  return {
    businessId: 'test-business',
    number: '1',
    customerName: 'Ann',
    jobNumbers: [],
    issueDate: '2026-11-01',
    dueDate: '2026-11-30',
    status: stated('unpaid'),
    taxMode: derived('exclusive', 'test'),
    netPence: stated(10000),
    taxPence: 2000,
    grossPence: 12000,
    paidPence: stated(0),
    duePence: stated(12000),
    sent: stated(true),
    lines: [],
    source: { tool: 'tradify', file: 'test.csv', rows: [2] },
    ...changes,
  };
}

describe('incomeByPeriod with the Jobber export', () => {
  const report = incomeByPeriod(invoicesFrom('jobber/invoices-report.csv'));

  it('totals each month by issue date', () => {
    expect(
      report.byMonth.map((m) => [
        m.period,
        m.netPence,
        m.vatPence,
        m.grossPence,
        m.invoices.length,
      ]),
    ).toEqual([
      ['2026-05', 226500, 45300, 271800, 6],
      ['2026-06', 556417, 111283, 667700, 7],
      ['2026-07', 245000, 48500, 293500, 7],
      ['2026-08', 604000, 120800, 724800, 6],
      ['2026-09', 1149000, 229800, 1378800, 8],
      ['2026-10', 750000, 150000, 900000, 3],
    ]);
  });

  it('counts the VAT-inclusive invoice at its net, not its total', () => {
    // June includes invoice 2012: £965.00 including £160.83 VAT
    expect(report.byMonth[1]?.netPence).toBe(556417);
  });

  it('totals the standard VAT quarters', () => {
    expect(report.byVatQuarter.map((q) => [q.label, q.netPence, q.vatPence])).toEqual([
      ['Quarter ending June 2026', 782917, 156583],
      ['Quarter ending September 2026', 1998000, 399100],
      ['Quarter ending December 2026', 750000, 150000],
    ]);
  });

  it('leaves drafts out and says so', () => {
    expect(report.leftOut).toEqual([
      {
        reason: 'drafts or cancelled, so not yet income',
        invoices: ['2042', '2041', '2040', '2039', '2038'],
      },
    ]);
  });

  it('writes a plain-English summary with the VAT basis made clear', () => {
    expect(report.summary).toEqual([
      'October 2026: £7,500.00 invoiced before VAT, down 35% on September 2026 (£11,490.00).',
      'Quarter ending December 2026: £1,500.00 VAT on £7,500.00 of sales (VAT quarters ending Mar, Jun, Sep, Dec).',
      "These figures use the date each invoice was issued. If you use VAT cash accounting, VAT is due when you're paid instead, which these exports don't show reliably.",
      'Left out: 5 invoices with drafts or cancelled, so not yet income.',
    ]);
  });
});

describe('incomeByPeriod VAT staggers', () => {
  it('uses quarters ending Jan, Apr, Jul, Oct for stagger 2', () => {
    const report = incomeByPeriod(
      [invoice({ issueDate: '2026-11-15' }), invoice({ number: '2', issueDate: '2027-01-10' })],
      2,
    );
    expect(report.byVatQuarter.map((q) => q.label)).toEqual(['Quarter ending January 2027']);
  });

  it('uses quarters ending Feb, May, Aug, Nov for stagger 3', () => {
    const report = incomeByPeriod([invoice({ issueDate: '2026-12-01' })], 3);
    expect(report.byVatQuarter[0]?.label).toBe('Quarter ending February 2027');
  });
});

describe('incomeByPeriod with unclear invoices', () => {
  it('leaves out an invoice with no issue date', () => {
    const report = incomeByPeriod([invoice({ issueDate: null })]);
    expect(report.leftOut[0]?.reason).toBe('no issue date, so no month to put them in');
    expect(report.summary[0]).toBe('No sent invoices to report on.');
  });

  it('keeps an unknown net out of the net total but still counts VAT and gross', () => {
    const report = incomeByPeriod([
      invoice({ number: 'A' }),
      invoice({ number: 'B', netPence: unknown('totals do not add up') }),
    ]);
    expect(report.byMonth[0]).toEqual(
      expect.objectContaining({
        netPence: 10000,
        vatPence: 4000,
        grossPence: 24000,
        netUnknown: ['B'],
      }),
    );
  });

  it('counts paid and overdue invoices as income too', () => {
    const report = incomeByPeriod([
      invoice({ number: 'A', status: stated('paid') }),
      invoice({ number: 'B', status: stated('overdue') }),
    ]);
    expect(report.byMonth[0]?.invoices).toEqual(['A', 'B']);
  });
});
