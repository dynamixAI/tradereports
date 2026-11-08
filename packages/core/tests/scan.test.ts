import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { readDate } from '../src/dates';
import { scanColumn, scanTable } from '../src/scan';

function scan(path: string) {
  return scanTable(readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8')));
}

describe('readDate', () => {
  it('reads dates that need no order', () => {
    expect(readDate('2026-11-03')).toBe('2026-11-03');
    expect(readDate('2026-11-03 21:35')).toBe('2026-11-03');
    expect(readDate('Nov 03, 2026')).toBe('2026-11-03');
    expect(readDate('3 November 2026')).toBe('2026-11-03');
  });

  it('reads numeric dates in the order it is told', () => {
    expect(readDate('02/11/2026', 'day-first')).toBe('2026-11-02');
    expect(readDate('02/11/2026', 'month-first')).toBe('2026-02-11');
    expect(readDate('3.11.26', 'day-first')).toBe('2026-11-03');
  });

  it('will not guess the order of a numeric date', () => {
    expect(readDate('02/11/2026')).toBeNull();
  });

  it('reads Excel date numbers', () => {
    expect(readDate('46023')).toBe('2026-01-01');
    expect(readDate('46329')).toBe('2026-11-03');
  });

  it('rejects dates that cannot exist', () => {
    expect(readDate('31/02/2026', 'day-first')).toBeNull();
    expect(readDate('2026-13-01')).toBeNull();
  });
});

describe('scanColumn', () => {
  it('spots day-first dates from a day above 12', () => {
    const result = scanColumn(['03/11/2026', '25/11/2026', null]);
    expect(result.dateOrder).toBe('day-first');
    expect(result.filled).toBe(2);
    expect(result.empty).toBe(1);
  });

  it('spots month-first dates from a month position above 12', () => {
    expect(scanColumn(['11/25/2026', '11/03/2026']).dateOrder).toBe('month-first');
  });

  it('says when dates are in both orders', () => {
    expect(scanColumn(['25/11/2026', '11/25/2026']).dateOrder).toBe('mixed');
  });

  it('recognises a column of Excel date numbers', () => {
    const result = scanColumn(['46329', '46330', '46331']);
    expect(result.excelDates).toBe(true);
    expect(result.dateOrder).toBe('not needed');
    expect(result.evidence).toContain('These look like Excel date numbers.');
  });

  it('lists the most common values for status words', () => {
    const result = scanColumn(['Paid', 'Paid', 'Sent', 'Paid', 'Draft']);
    expect(result.topValues).toEqual([
      { value: 'Paid', count: 3 },
      { value: 'Draft', count: 1 },
      { value: 'Sent', count: 1 },
    ]);
  });

  it('describes an empty column', () => {
    expect(scanColumn([null, '', null]).evidence).toEqual(['Every cell is empty.']);
  });
});

describe('scanTable with real exports', () => {
  it('reads Jobber invoice columns by their values', () => {
    const columns = scan('jobber/invoices-report.csv');
    expect(columns['Total ($)']?.share.money).toBe(1);
    expect(columns['Client phone']?.evidence).toContain('100% are UK phone numbers.');
    expect(columns['Issued date']?.dateOrder).toBe('not needed');
    expect(columns['Invoice #']?.unique).toBe(true);
    expect(columns['Status']?.topValues.map((v) => v.value)).toEqual([
      'Paid',
      'Past Due',
      'Draft',
      'Awaiting Payment',
    ]);
  });

  it('finds the text in Jobber mobile phone fields', () => {
    const mobile = scan('jobber/clients-export.csv')['Mobile Phone #s'];
    expect(mobile?.share.phone).toBeCloseTo(25 / 30);
    // a phone number must not also count as money
    expect(mobile?.share.money).toBe(0);
    expect(mobile?.evidence[0]).toBe('83% are UK phone numbers.');
  });

  it('cannot tell the order of Jobber client dates, so it asks', () => {
    const created = scan('jobber/clients-export.csv')['Created Date'];
    expect(created?.dateOrder).toBe('ambiguous');
    expect(created?.evidence).toContain(
      'Dates could be day first or month first. Please say which.',
    );
  });

  it('reads Tradify postcodes and emails, messy ones included', () => {
    const columns = scan('tradify/customers-export.csv');
    expect(columns['Physical Address Postal Code']?.share.postcode).toBe(1);
    expect(columns['Email Address']?.evidence).toContain('100% are email addresses.');
  });
});
