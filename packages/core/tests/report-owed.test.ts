import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { pounds } from '../src/invoice-checks';
import { convertInvoiceFile } from '../src/invoices';
import { derived, stated, unknown, type Invoice } from '../src/model';
import { moneyOwed } from '../src/reports/owed';

const asOf = '2026-11-07';

// convert a real export, then run the report on it
function report(path: string) {
  const text = readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
  const { records } = convertInvoiceFile(readCsv(text), {
    businessId: 'test-business',
    file: path,
    today: asOf,
  });
  return moneyOwed(records, asOf);
}

// a hand-made invoice; anything not given is a simple unpaid £100
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
    taxPence: 0,
    grossPence: 10000,
    paidPence: stated(0),
    duePence: stated(10000),
    sent: stated(true),
    lines: [],
    source: { tool: 'tradify', file: 'test.csv', rows: [2] },
    ...changes,
  };
}

describe('moneyOwed with the Jobber export', () => {
  it('counts only unpaid and overdue invoices', () => {
    const result = report('jobber/invoices-report.csv');
    expect(result.owedPence).toBe(1950600);
    expect(result.overduePence).toBe(1842600);
    expect(result.invoices).toHaveLength(10);
  });

  it('leaves drafts out and says how much they come to', () => {
    const result = report('jobber/invoices-report.csv');
    expect(result.leftOut).toEqual([
      {
        reason: 'drafts, not yet sent to the customer',
        pence: 366600,
        invoices: ['2042', '2041', '2040', '2039', '2038'],
      },
    ]);
  });

  it('lists who owes the most first', () => {
    const top = report('jobber/invoices-report.csv').byCustomer.slice(0, 3);
    expect(top.map((c) => [c.customer, c.owedPence, c.invoices])).toEqual([
      ['Noah Fiction', 1152000, ['2029']],
      ['Ben Sample', 410400, ['2021']],
      ['Replica Care Homes Ltd', 144000, ['2032', '2028']],
    ]);
  });

  it('splits the debt by how late it is', () => {
    const bands = report('jobber/invoices-report.csv').byAge.map((b) => [b.band, b.pence]);
    expect(bands).toEqual([
      ['not yet due', 108000],
      ['1-30 days late', 3000],
      ['31-60 days late', 1328400],
      ['61-90 days late', 418800],
      ['over 90 days late', 92400],
      ['no due date', 0],
    ]);
  });

  it('writes a plain-English summary', () => {
    expect(report('jobber/invoices-report.csv').summary).toEqual([
      "You're owed £19,506.00 across 10 invoices. £18,426.00 of it is overdue.",
      'Left out: 5 invoices (£3,666.00) with drafts, not yet sent to the customer.',
    ]);
  });
});

describe('moneyOwed with the Tradify export', () => {
  it('gives a range when the unpaid invoices were never sent', () => {
    const result = report('tradify/invoices-export.csv');
    expect(result.owedPence).toBe(35149);
    expect(result.overduePence).toBe(9400);
    expect(result.owedIfUnsentAreDraftsPence).toBe(0);
    expect(result.summary[1]).toBe(
      "£351.49 of this is on 3 invoices that were never sent, so they may be drafts. If so, you're owed £0.00.",
    );
  });
});

describe('moneyOwed with unclear invoices', () => {
  it('leaves out an unknown amount due instead of counting it as zero', () => {
    const result = moneyOwed(
      [invoice({ number: 'A' }), invoice({ number: 'B', duePence: unknown('no balance') })],
      asOf,
    );
    expect(result.owedPence).toBe(10000);
    expect(result.leftOut).toEqual([
      { reason: "amount due we couldn't work out", pence: 10000, invoices: ['B'] },
    ]);
  });

  it('leaves out an unknown status', () => {
    const result = moneyOwed([invoice({ status: unknown('odd word') })], asOf);
    expect(result.owedPence).toBe(0);
    expect(result.leftOut[0]?.reason).toBe("status we couldn't work out");
    expect(result.summary[0]).toBe('Nobody owes you money on these invoices.');
  });

  it('puts invoices without a due date in their own band', () => {
    const result = moneyOwed([invoice({ dueDate: null })], asOf);
    expect(result.byAge.find((b) => b.band === 'no due date')?.pence).toBe(10000);
  });

  it('ignores paid invoices completely', () => {
    const result = moneyOwed([invoice({ status: stated('paid'), duePence: stated(0) })], asOf);
    expect(result.owedPence).toBe(0);
    expect(result.leftOut).toEqual([]);
  });

  it('counts a band edge correctly: due 30 days ago is 1-30 days late', () => {
    const result = moneyOwed([invoice({ dueDate: '2026-10-08', status: stated('overdue') })], asOf);
    expect(result.byAge.find((b) => b.pence > 0)?.band).toBe('1-30 days late');
  });
});

describe('pounds', () => {
  it('formats money the way UK readers expect', () => {
    expect(pounds(1950600)).toBe('£19,506.00');
    expect(pounds(5)).toBe('£0.05');
    expect(pounds(-12345)).toBe('-£123.45');
  });
});
