import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanCell, readCsv } from '../src/csv';

// read a sample export from the fixtures folder
function fixture(path: string): string {
  return readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
}

describe('cleanCell', () => {
  it('trims spaces', () => {
    expect(cleanCell('  Wigan ')).toBe('Wigan');
  });

  it('treats blank and a lone dash as empty', () => {
    expect(cleanCell('')).toBeNull();
    expect(cleanCell('   ')).toBeNull();
    expect(cleanCell('-')).toBeNull();
    expect(cleanCell(' - ')).toBeNull();
  });

  it('keeps real values that contain a dash', () => {
    expect(cleanCell('-5')).toBe('-5');
    expect(cleanCell('Smith-Jones')).toBe('Smith-Jones');
  });
});

describe('readCsv', () => {
  it('gives the spreadsheet row number of each row', () => {
    expect(readCsv('Name,City\nAlice,Wigan\n\nBen,Bolton\n').rowNumbers).toEqual([2, 4]);
  });

  it('reads headers and rows', () => {
    const table = readCsv('Name,City\nAlice,Wigan\nBen,Bolton\n');
    expect(table.headers).toEqual(['Name', 'City']);
    expect(table.rows).toEqual([
      { Name: 'Alice', City: 'Wigan' },
      { Name: 'Ben', City: 'Bolton' },
    ]);
    expect(table.issues).toEqual([]);
  });

  it('removes a BOM from the start', () => {
    const table = readCsv('﻿Name,City\nAlice,Wigan\n');
    expect(table.headers[0]).toBe('Name');
  });

  it('handles windows line endings', () => {
    const table = readCsv('Name,City\r\nAlice,Wigan\r\n');
    expect(table.rows).toEqual([{ Name: 'Alice', City: 'Wigan' }]);
  });

  it('keeps line breaks and commas inside quoted cells', () => {
    const table = readCsv('Name,Notes\n"Smith, J","Line one\nLine two"\n');
    expect(table.rows).toEqual([{ Name: 'Smith, J', Notes: 'Line one\nLine two' }]);
  });

  it('treats blank, dash and "" as empty', () => {
    const table = readCsv('A,B,C,D\n,-,"",x\n');
    expect(table.rows).toEqual([{ A: null, B: null, C: null, D: 'x' }]);
  });

  it('keeps leading zeros in phone numbers', () => {
    const table = readCsv('Phone\n07700 900001\n');
    expect(table.rows[0]?.['Phone']).toBe('07700 900001');
  });

  it('trims spaces around headers', () => {
    const table = readCsv(' Name , City \nAlice,Wigan\n');
    expect(table.headers).toEqual(['Name', 'City']);
  });

  it('skips blank lines but keeps true row numbers', () => {
    const table = readCsv('Name,City\nAlice,Wigan\n\nBen\n');
    expect(table.rows).toHaveLength(2);
    // Ben is on line 4 of the file, so that is the row we report
    expect(table.issues).toEqual([{ kind: 'missing-cells', row: 4, message: expect.any(String) }]);
  });

  it('reports a short row and fills the gaps with empty', () => {
    const table = readCsv('Name,City\nAlice\n');
    expect(table.rows).toEqual([{ Name: 'Alice', City: null }]);
    expect(table.issues).toEqual([{ kind: 'missing-cells', row: 2, message: expect.any(String) }]);
  });

  it('reports extra cells that hold a value', () => {
    const table = readCsv('Name\nAlice,Wigan\n');
    expect(table.rows).toEqual([{ Name: 'Alice' }]);
    expect(table.issues).toEqual([{ kind: 'extra-cells', row: 2, message: expect.any(String) }]);
  });

  it('ignores extra cells that are empty (trailing commas)', () => {
    const table = readCsv('Name,City\nAlice,Wigan,,\n');
    expect(table.issues).toEqual([]);
  });

  it('renames blank and repeated headers and reports them', () => {
    const table = readCsv('Email,,Email\na,b,c\n');
    expect(table.headers).toEqual(['Email', 'Column 2', 'Email (2)']);
    expect(table.issues.map((issue) => issue.kind)).toEqual(['blank-header', 'duplicate-header']);
  });

  it('reports an empty file', () => {
    const table = readCsv('');
    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
    expect(table.issues.map((issue) => issue.kind)).toEqual(['empty-file']);
  });

  it('reports broken quotes', () => {
    const table = readCsv('Name,City\n"Alice,Wigan\n');
    expect(table.issues.map((issue) => issue.kind)).toContain('bad-quotes');
  });

  it('is not tricked by a __proto__ header', () => {
    const table = readCsv('Name,__proto__\nAlice,polluted\n');
    const row = table.rows[0];
    // the value must be stored as a normal column, not change how objects behave
    expect(row && Object.hasOwn(row, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  });
});

describe('readCsv with real exports', () => {
  it.each([
    { path: 'jobber/invoices-report.csv', rows: 42, first: 'Invoice #' },
    { path: 'jobber/quotes-report.csv', rows: 30, first: 'Quote #' },
    { path: 'jobber/one-off-jobs-report.csv', rows: 3, first: 'Job #' },
    { path: 'jobber/visits-report.csv', rows: 3, first: 'Job #' },
    { path: 'tradify/customers-export.csv', rows: 27, first: 'Customer Name' },
    { path: 'tradify/invoices-export.csv', rows: 5, first: 'Invoice Number' },
    { path: 'tradify/quotes-export.csv', rows: 3, first: 'Quote No' },
    { path: 'tradify/jobs-export.csv', rows: 2, first: 'Job Number' },
  ])('reads $path cleanly', ({ path, rows, first }) => {
    const table = readCsv(fixture(path));
    expect(table.issues).toEqual([]);
    expect(table.rows).toHaveLength(rows);
    expect(table.headers[0]).toBe(first);
  });

  it('reads the jobber clients export cleanly', () => {
    const table = readCsv(fixture('jobber/clients-export.csv'));
    expect(table.issues).toEqual([]);
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it('turns jobber dashes into empty values', () => {
    const table = readCsv(fixture('jobber/invoices-report.csv'));
    const invoice = table.rows.find((row) => row['Invoice #'] === '2042');
    expect(invoice?.['Sent to']).toBeNull();
    expect(invoice?.['Visits assigned to']).toBe('Test Plumber');
  });

  it('keeps tradify mobile and phone apart', () => {
    const table = readCsv(fixture('tradify/customers-export.csv'));
    expect(table.headers).toHaveLength(33);
    expect(table.headers).toContain('Tradify Id');
    const bella = table.rows.find((row) => row['Customer Name'] === 'Fauxname');
    expect(bella?.['Mobile Number']).toBe('07700 900028');
    expect(bella?.['Phone Number']).toBeNull();
  });
});

describe('fixtures privacy', () => {
  it.each([
    'jobber/invoices-report.csv',
    'jobber/quotes-report.csv',
    'jobber/one-off-jobs-report.csv',
    'jobber/visits-report.csv',
    'jobber/clients-export.csv',
    'tradify/customers-export.csv',
    'tradify/invoices-export.csv',
    'tradify/quotes-export.csv',
    'tradify/jobs-export.csv',
  ])('%s contains no real names', (path) => {
    expect(fixture(path).toLowerCase()).not.toMatch(/pius|ajamma/);
  });
});
