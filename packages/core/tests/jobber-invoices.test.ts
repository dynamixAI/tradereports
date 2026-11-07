import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberInvoices } from '../src/jobber/invoices';

const options = { businessId: 'test-business', file: 'invoices-report.csv', today: '2026-11-07' };

// the real Jobber export of fake data
function fixture() {
  const text = readFileSync(
    new URL('./fixtures/jobber/invoices-report.csv', import.meta.url),
    'utf8',
  );
  return convertJobberInvoices(readCsv(text), options);
}

// a small hand-made report with just the columns the converter reads
function convert(...rows: string[]) {
  const header =
    'Invoice #,Client name,Issued date,Due date,Marked paid date,Job #s,Status,Line items,Pre-tax total ($),Total ($),Balance ($),Discount ($),Tax amount ($)';
  return convertJobberInvoices(readCsv([header, ...rows].join('\n')), options);
}

describe('convertJobberInvoices with the real export', () => {
  it('reads all 42 invoices', () => {
    const { records } = fixture();
    expect(records).toHaveLength(42);
    expect(records[0]?.number).toBe('2042');
  });

  it("keeps Jobber's own statuses", () => {
    const counts: Record<string, number> = {};
    for (const invoice of fixture().records) {
      const key = invoice.status.value ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual({ draft: 5, unpaid: 1, overdue: 9, paid: 27 });
  });

  it('treats paid invoices as paid, whatever the balance column says', () => {
    const invoice = fixture().records.find((record) => record.number === '2037');
    expect(invoice?.status).toEqual({ origin: 'stated', value: 'paid' });
    expect(invoice?.duePence.value).toBe(0);
    expect(invoice?.paidPence).toEqual({ origin: 'derived', value: 18000, rule: 'status is Paid' });
  });

  it('reports the wrong balances once for the whole file', () => {
    const quirks = fixture().issues.filter((issue) => issue.message.includes('full amount'));
    expect(quirks).toHaveLength(1);
    expect(quirks[0]?.rows).toHaveLength(27);
  });

  it('warns that every paid date is the same day', () => {
    const quirks = fixture().issues.filter((issue) => issue.message.includes('same day'));
    expect(quirks).toHaveLength(1);
    expect(quirks[0]?.message).toContain('Nov 03, 2026');
  });

  it('adds up what is really owed: unpaid and overdue, not drafts or paid', () => {
    const owed = fixture()
      .records.filter((r) => r.status.value === 'unpaid' || r.status.value === 'overdue')
      .reduce((sum, r) => sum + (r.duePence.value ?? 0), 0);
    expect(owed).toBe(1950600);
  });

  it('reads Jobber dates and dashes', () => {
    const { records } = fixture();
    const draft = records.find((r) => r.number === '2042');
    const sent = records.find((r) => r.number === '2040');
    expect(draft?.issueDate).toBeNull();
    expect(sent?.issueDate).toBe('2026-10-29');
    expect(sent?.dueDate).toBe('2026-11-12');
  });

  it('unpacks the line items cell', () => {
    const invoice = fixture().records.find((r) => r.number === '2040');
    expect(
      invoice?.lines.map((line) => [line.description, line.quantity, line.amountPence]),
    ).toEqual([
      ['Boiler service', 1, 8500],
      ['Radiator installation', 2, 70000],
      ['Mixer tap', 1, 6500],
    ]);
    expect(invoice?.lines[1]?.unitPricePence).toBe(35000);
  });

  it('spots the VAT-inclusive invoice', () => {
    const { records } = fixture();
    const inclusive = records.filter((r) => r.taxMode.value === 'inclusive').map((r) => r.number);
    expect(inclusive).toEqual(['2012']);
    expect(records.find((r) => r.number === '2012')?.netPence.value).toBe(80417);
  });

  it('checks discounts against the line items', () => {
    const { records, issues } = fixture();
    expect(records.find((r) => r.number === '2008')?.netPence.value).toBe(31500);
    expect(issues.filter((issue) => issue.kind === 'totals-do-not-add-up')).toEqual([]);
  });

  it('links to jobs and records the source row', () => {
    const invoice = fixture().records.find((r) => r.number === '2042');
    expect(invoice?.jobNumbers).toEqual(['3']);
    expect(invoice?.source).toEqual({ tool: 'jobber', file: 'invoices-report.csv', rows: [2] });
  });

  it('only marks drafts as unsent', () => {
    const { records } = fixture();
    expect(records.find((r) => r.number === '2042')?.sent.value).toBe(false);
    expect(records.find((r) => r.number === '2036')?.sent.origin).toBe('unknown');
  });
});

describe('convertJobberInvoices with problem files', () => {
  it('refuses a file that is not a Jobber invoices report', () => {
    const result = convertJobberInvoices(readCsv('Name,City\nAlice,Wigan\n'), options);
    expect(result.records).toEqual([]);
    expect(result.issues.map((issue) => issue.kind)).toEqual(['missing-column']);
  });

  it('accepts pound signs in the money headers', () => {
    const text =
      'Invoice #,Status,Line items,Pre-tax total (£),Total (£),Balance (£),Discount (£),Tax amount (£)\n' +
      '1,Paid,"Job (1, £100.00)",100.0,120.0,0.0,0.0,20.0\n';
    const { records, issues } = convertJobberInvoices(readCsv(text), options);
    expect(records).toHaveLength(1);
    expect(issues).toEqual([]);
  });

  it('turns awaiting payment into overdue once the due date has passed', () => {
    const { records } = convert(
      '1,Ann,"Oct 01, 2026","Oct 15, 2026",-,,Awaiting Payment,"Job (1, £100.00)",100.0,120.0,120.0,0.0,20.0',
    );
    expect(records[0]?.status.origin).toBe('derived');
    expect(records[0]?.status.value).toBe('overdue');
  });

  it('works out a part payment from the balance', () => {
    const { records } = convert(
      '1,Ann,"Nov 01, 2026","Nov 30, 2026",-,,Awaiting Payment,"Job (1, £100.00)",100.0,120.0,70.0,0.0,20.0',
    );
    expect(records[0]?.duePence).toEqual({ origin: 'stated', value: 7000 });
    expect(records[0]?.paidPence.value).toBe(5000);
  });

  it('leaves an unknown status unknown and says so', () => {
    const { records, issues } = convert(
      '1,Ann,"Nov 01, 2026","Nov 30, 2026",-,,Bad Debt,"Job (1, £100.00)",100.0,120.0,120.0,0.0,20.0',
    );
    expect(records[0]?.status.origin).toBe('unknown');
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });

  it('flags line items that do not match the pre-tax total', () => {
    const { issues } = convert(
      '1,Ann,"Nov 01, 2026","Nov 30, 2026",-,,Paid,"Job (1, £90.00)",100.0,120.0,0.0,0.0,20.0',
    );
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('reports a line items cell it cannot read', () => {
    const { records, issues } = convert(
      '1,Ann,"Nov 01, 2026","Nov 30, 2026",-,,Paid,Some work,100.0,120.0,0.0,0.0,20.0',
    );
    expect(records[0]?.lines).toEqual([]);
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });

  it('reports a date it cannot read', () => {
    const { records, issues } = convert(
      '1,Ann,03/11/2026,"Nov 30, 2026",-,,Paid,"Job (1, £100.00)",100.0,120.0,0.0,0.0,20.0',
    );
    expect(records[0]?.issueDate).toBeNull();
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });
});
