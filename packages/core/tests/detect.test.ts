import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { detectFile } from '../src/detect';
import { convertInvoiceFile } from '../src/invoices';

// headers of a real export in the fixtures folder
function headersOf(path: string): string[] {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8')).headers;
}

describe('detectFile with real exports', () => {
  it.each([
    { path: 'tradify/invoices-export.csv', tool: 'tradify', kind: 'invoices' },
    { path: 'tradify/quotes-export.csv', tool: 'tradify', kind: 'quotes' },
    { path: 'tradify/jobs-export.csv', tool: 'tradify', kind: 'jobs' },
    { path: 'tradify/customers-export.csv', tool: 'tradify', kind: 'customers' },
    { path: 'jobber/invoices-report.csv', tool: 'jobber', kind: 'invoices' },
    { path: 'jobber/quotes-report.csv', tool: 'jobber', kind: 'quotes' },
    { path: 'jobber/one-off-jobs-report.csv', tool: 'jobber', kind: 'jobs' },
    { path: 'jobber/visits-report.csv', tool: 'jobber', kind: 'visits' },
    { path: 'jobber/clients-export.csv', tool: 'jobber', kind: 'customers' },
  ])('recognises $path', ({ path, tool, kind }) => {
    const { match } = detectFile(headersOf(path));
    expect(match?.tool).toBe(tool);
    expect(match?.kind).toBe(kind);
  });
});

describe('detectFile with other files', () => {
  it('does not care about column order', () => {
    const { match } = detectFile([
      'Delivery Status',
      'Line Amount',
      'Entered By',
      'Line Number',
      'Invoice Number',
    ]);
    expect(match?.tool).toBe('tradify');
  });

  it('accepts pound signs in money headers', () => {
    const { match } = detectFile([
      'Invoice #',
      'Client name',
      'Line items',
      'Pre-tax total (£)',
      'Balance (£)',
      'Marked paid date',
    ]);
    expect(match).toEqual(expect.objectContaining({ tool: 'jobber', kind: 'invoices' }));
  });

  it('names the closest match and what is missing when it is only partly there', () => {
    const result = detectFile(['Invoice Number', 'Line Number', 'Line Amount', 'Customer']);
    expect(result.match).toBeNull();
    expect(result.closest?.profile).toEqual(
      expect.objectContaining({ tool: 'tradify', kind: 'invoices' }),
    );
    expect(result.closest?.missing).toEqual(['Delivery Status', 'Entered By']);
    expect(result.message).toContain('Match the columns by hand');
  });

  it('says plainly when it knows nothing about a file', () => {
    const result = detectFile(['Name', 'City', 'Favourite colour']);
    expect(result).toEqual({
      match: null,
      closest: null,
      message: "This file doesn't match any export we know. Match the columns by hand.",
    });
  });
});

describe('convertInvoiceFile', () => {
  const options = { businessId: 'test-business', file: 'upload.csv', today: '2026-11-07' };
  const table = (path: string) =>
    readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));

  it('sends a Tradify invoice file to the Tradify converter', () => {
    const { records } = convertInvoiceFile(table('tradify/invoices-export.csv'), options);
    expect(records).toHaveLength(4);
    expect(records[0]?.source.tool).toBe('tradify');
  });

  it('sends a Jobber invoice file to the Jobber converter', () => {
    const { records } = convertInvoiceFile(table('jobber/invoices-report.csv'), options);
    expect(records).toHaveLength(42);
    expect(records[0]?.source.tool).toBe('jobber');
  });

  it('turns away a known file that is not invoices', () => {
    const { records, issues } = convertInvoiceFile(table('tradify/quotes-export.csv'), options);
    expect(records).toEqual([]);
    expect(issues[0]?.message).toContain("isn't an invoice file");
  });
});
