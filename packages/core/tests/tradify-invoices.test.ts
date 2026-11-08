import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertTradifyInvoices } from '../src/tradify/invoices';

const options = { businessId: 'test-business', file: 'invoices-export.csv', today: '2026-11-07' };

// the real export of fake data from the Tradify trial
function fixture() {
  const text = readFileSync(
    new URL('./fixtures/tradify/invoices-export.csv', import.meta.url),
    'utf8',
  );
  return convertTradifyInvoices(readCsv(text), options);
}

// a small hand-made export, header plus one row per line
function convert(...lines: string[]) {
  const header =
    'Invoice Number,Customer,Invoice Date,Due Date,Subtotal,Tax,Total,Paid,Due,Line Description,Line Quantity,Line Unit Price,Line Tax Rate,Line Tax Rate Percentage,Line Amount,Jobs,Delivery Status';
  return convertTradifyInvoices(readCsv([header, ...lines].join('\n')), options);
}

describe('convertTradifyInvoices with the real export', () => {
  it('turns 5 line rows into 4 invoices', () => {
    const { records } = fixture();
    expect(records.map((invoice) => invoice.number)).toEqual([
      'IV00001',
      'IV00002',
      'IV00003',
      'IV00004',
    ]);
  });

  it('keeps both lines of IV00004 on one invoice and counts its total once', () => {
    const { records } = fixture();
    const iv4 = records.find((invoice) => invoice.number === 'IV00004');
    expect(iv4?.lines.map((line) => line.description)).toEqual(['Pipe fitting', 'Disposal fee']);
    const total = records.reduce((sum, invoice) => sum + invoice.grossPence, 0);
    // summing the Total column row by row would give 65898
    expect(total).toBe(46899);
  });

  it('works out each status from the money and dates', () => {
    const { records } = fixture();
    expect(records.map((invoice) => invoice.status.value)).toEqual([
      'paid',
      'unpaid',
      'overdue',
      'unpaid',
    ]);
    expect(records.every((invoice) => invoice.status.origin === 'derived')).toBe(true);
  });

  it('works out inclusive and exclusive VAT', () => {
    const { records } = fixture();
    const [iv1, , iv3] = records;
    expect(iv1?.taxMode.value).toBe('inclusive');
    expect(iv1?.netPence).toEqual({ origin: 'derived', value: 5625, rule: 'total minus VAT' });
    expect(iv3?.taxMode.value).toBe('exclusive');
    expect(iv3?.netPence).toEqual({ origin: 'stated', value: 12000 });
  });

  it('keeps part payments', () => {
    const iv3 = fixture().records.find((invoice) => invoice.number === 'IV00003');
    expect(iv3?.paidPence).toEqual({ origin: 'stated', value: 5000 });
    expect(iv3?.duePence).toEqual({ origin: 'stated', value: 9400 });
  });

  it('warns that unsent unpaid invoices may be drafts', () => {
    const drafts = fixture().issues.filter((issue) => issue.kind === 'possible-draft');
    expect(drafts.map((issue) => issue.message.slice(0, 7))).toEqual([
      'IV00002',
      'IV00003',
      'IV00004',
    ]);
  });

  it('links invoices to jobs and records where each came from', () => {
    const { records } = fixture();
    expect(records[0]?.jobNumbers).toEqual(['JB00001']);
    expect(records[3]?.jobNumbers).toEqual([]);
    expect(records[3]?.source).toEqual({
      tool: 'tradify',
      file: 'invoices-export.csv',
      rows: [5, 6],
    });
  });

  it('marks line costs as unknown, not zero', () => {
    const line = fixture().records[0]?.lines[0];
    expect(line?.unitCostPence.origin).toBe('unknown');
    expect(line?.unitCostPence.value).toBeNull();
  });
});

describe('convertTradifyInvoices with problem files', () => {
  it('refuses a file that is not a Tradify invoice export', () => {
    const result = convertTradifyInvoices(readCsv('Name,City\nAlice,Wigan\n'), options);
    expect(result.records).toEqual([]);
    expect(result.issues.map((issue) => issue.kind)).toEqual(['missing-column']);
  });

  it('flags totals that do not add up', () => {
    const { issues } = convert(
      'IV1,Ann,2026-11-01,2026-11-08,100.00,20.00,120.00,50.00,60.00,Job,1,100,20% VAT,20,100.00,,Sent',
    );
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('leaves tax mode unknown when subtotal, VAT and total do not fit', () => {
    const { records, issues } = convert(
      'IV1,Ann,2026-11-01,2026-11-08,100.00,20.00,130.00,0.00,130.00,Job,1,100,20% VAT,20,100.00,,Sent',
    );
    expect(records[0]?.taxMode.origin).toBe('unknown');
    expect(records[0]?.netPence.value).toBeNull();
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('skips an invoice whose totals differ between its lines', () => {
    const { records, issues } = convert(
      'IV1,Ann,2026-11-01,2026-11-08,100.00,20.00,120.00,0.00,120.00,A,1,50,20% VAT,20,50.00,,Sent',
      'IV1,Ann,2026-11-01,2026-11-08,100.00,20.00,999.00,0.00,120.00,B,1,50,20% VAT,20,50.00,,Sent',
    );
    expect(records).toEqual([]);
    expect(issues.map((issue) => issue.kind)).toEqual(['inconsistent-rows']);
  });

  it('reports an amount it cannot read', () => {
    const { records, issues } = convert(
      'IV1,Ann,2026-11-01,2026-11-08,abc,20.00,120.00,0.00,120.00,A,1,50,20% VAT,20,50.00,,Sent',
    );
    expect(records).toEqual([]);
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });

  it('keeps an unrecognised delivery status as unknown', () => {
    const { records } = convert(
      'IV1,Ann,2026-11-01,2026-11-08,100.00,20.00,120.00,0.00,120.00,A,1,100,20% VAT,20,100.00,,Viewed',
    );
    expect(records[0]?.sent.origin).toBe('unknown');
  });

  it('reports a date it cannot read', () => {
    const { records, issues } = convert(
      'IV1,Ann,01/11/2026,2026-11-08,100.00,20.00,120.00,120.00,0.00,A,1,100,20% VAT,20,100.00,,Sent',
    );
    expect(records[0]?.issueDate).toBeNull();
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });
});
