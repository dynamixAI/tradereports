import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberQuotes } from '../src/jobber/quotes';
import { convertTradifyQuotes } from '../src/tradify/quotes';

const options = { businessId: 'test-business', file: 'quotes.csv' };

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

describe('convertJobberQuotes with the real export', () => {
  const { records, issues } = convertJobberQuotes(table('jobber/quotes-report.csv'), options);
  const find = (number: string) => records.find((quote) => quote.number === number);

  it('reads all 30 quotes without problems', () => {
    expect(records).toHaveLength(30);
    expect(issues).toEqual([]);
  });

  it("maps Jobber's statuses, treating Approved and Converted as accepted", () => {
    const counts: Record<string, number> = {};
    for (const quote of records) {
      const key = quote.status.value ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual({ accepted: 14, draft: 4, awaiting_response: 12 });
    expect(find('130')?.status.origin).toBe('derived');
    expect(find('127')?.status.origin).toBe('stated');
  });

  it('works out VAT from a subtotal that is before the discount', () => {
    const quote = find('101');
    expect(quote?.discountPence).toBe(5000);
    expect(quote?.netPence.value).toBe(14000);
    expect(quote?.taxPence).toEqual({
      origin: 'derived',
      value: 2800,
      rule: 'total minus (subtotal less discount)',
    });
    expect(quote?.taxMode.value).toBe('exclusive');
  });

  it('links converted quotes to their jobs', () => {
    expect(find('130')?.jobNumbers).toEqual(['1']);
    expect(find('122')?.jobNumbers).toEqual(['3']);
    expect(find('127')?.jobNumbers).toEqual([]);
  });

  it('unpacks line items and reads the dates', () => {
    const quote = find('129');
    expect(quote?.lines.map((line) => [line.description, line.quantity, line.amountPence])).toEqual(
      [
        ['Radiator installation', 2, 70000],
        ['Boiler service', 3, 25500],
      ],
    );
    expect(quote?.quoteDate).toBe('2026-11-03');
    expect(find('127')?.acceptedDate).toBe('2026-11-03');
    expect(find('129')?.sentDate).toBeNull();
  });

  it('does not invent a cost', () => {
    expect(find('101')?.costPence.origin).toBe('unknown');
    expect(find('101')?.grossProfitPence.value).toBeNull();
  });
});

describe('convertTradifyQuotes with the real export', () => {
  const { records, issues } = convertTradifyQuotes(table('tradify/quotes-export.csv'), options);
  const find = (number: string) => records.find((quote) => quote.number === number);

  it('groups 3 line rows into 2 quotes', () => {
    expect(records.map((quote) => quote.number)).toEqual(['QT00001', 'QT00002']);
    expect(find('QT00001')?.lines).toHaveLength(2);
    expect(issues).toEqual([]);
  });

  it('finds the real price and cost despite the swapped labels', () => {
    const valve = find('QT00001')?.lines[1];
    expect(valve?.unitPricePence).toBe(2500);
    expect(valve?.unitCostPence).toEqual({
      origin: 'derived',
      value: 1000,
      rule: '"Line Unit Sell Price" holds the cost; checked against the line amount',
    });
  });

  it('allows for a line discount when checking the price', () => {
    const refit = find('QT00002')?.lines[0];
    expect(refit?.unitPricePence).toBe(320000);
    expect(refit?.unitCostPence.value).toBe(150000);
  });

  it('works out cost and profit from the confirmed lines', () => {
    expect(find('QT00001')?.costPence.value).toBe(2000);
    expect(find('QT00001')?.grossProfitPence.value).toBe(9250);
    expect(find('QT00002')?.grossProfitPence.value).toBe(138000);
  });

  it('spots the VAT-inclusive quote', () => {
    expect(find('QT00001')?.taxMode.value).toBe('inclusive');
    expect(find('QT00002')?.taxMode.value).toBe('exclusive');
  });

  it('keeps status, dates and job links', () => {
    expect(find('QT00001')?.status).toEqual({ origin: 'stated', value: 'accepted' });
    expect(find('QT00001')?.jobNumbers).toEqual(['JB00001']);
    expect(find('QT00002')?.jobNumbers).toEqual([]);
    expect(find('QT00001')?.expiryDate).toBe('2026-12-06');
  });
});

describe('quote converters with problem files', () => {
  it('reports a Jobber status it does not know', () => {
    const text =
      'Quote #,Status,Line items,Subtotal ($),Total ($),Discount ($)\n1,Changes requested,"Job (1, £100.00)",100.0,120.0,0.0\n';
    const { records, issues } = convertJobberQuotes(readCsv(text), options);
    expect(records[0]?.status.origin).toBe('unknown');
    expect(issues.map((issue) => issue.kind)).toEqual(['bad-value']);
  });

  it('flags Jobber line items that do not match the subtotal', () => {
    const text =
      'Quote #,Status,Line items,Subtotal ($),Total ($),Discount ($)\n1,Draft,"Job (1, £90.00)",100.0,120.0,0.0\n';
    const { issues } = convertJobberQuotes(readCsv(text), options);
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('leaves Tradify cost unknown when neither price column fits', () => {
    const text =
      'Quote No,Status,Subtotal,Tax,Total,Line Quantity,Line Unit Price,Line Unit Sell Price,Line Amount\n' +
      'Q1,Accepted,100.00,20.00,120.00,1,40.00,30.00,100.00\n';
    const { records, issues } = convertTradifyQuotes(readCsv(text), options);
    expect(records[0]?.costPence.origin).toBe('unknown');
    expect(issues.map((issue) => issue.kind)).toEqual(['totals-do-not-add-up']);
  });

  it('refuses files that are not quote exports', () => {
    expect(convertJobberQuotes(readCsv('Name\nA\n'), options).issues[0]?.kind).toBe(
      'missing-column',
    );
    expect(convertTradifyQuotes(readCsv('Name\nA\n'), options).issues[0]?.kind).toBe(
      'missing-column',
    );
  });
});
