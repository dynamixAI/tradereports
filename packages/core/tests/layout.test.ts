import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findHeaderRow, readSheet } from '../src/layout';

const dave = readFileSync(
  new URL('./fixtures/homemade/dave-invoices.csv', import.meta.url),
  'utf8',
);

describe('readSheet with a home-made spreadsheet', () => {
  const sheet = readSheet(dave);

  it('finds the headers on row 4, under the title rows', () => {
    expect(findHeaderRow(dave)).toBe(4);
    expect(sheet.headers[0]).toBe('Inv No');
  });

  it('says how many title rows it skipped', () => {
    expect(sheet.issues).toContainEqual({
      kind: 'title-rows',
      row: 4,
      message: 'The headers are on row 4. 2 rows above were skipped as titles.',
    });
  });

  it('drops the blank spacer column', () => {
    expect(sheet.headers).toEqual([
      'Inv No',
      'Date',
      'Customer',
      'Job',
      'Net',
      'VAT',
      'Total',
      'Paid?',
      'Due Date',
    ]);
    expect(sheet.issues.map((issue) => issue.kind)).toContain('spacer-column');
    expect(sheet.issues.map((issue) => issue.kind)).not.toContain('blank-header');
  });

  it('leaves the total row out and says why', () => {
    expect(sheet.rows).toHaveLength(8);
    expect(sheet.rows.map((row) => row['Inv No'])).not.toContain(null);
    expect(sheet.issues).toContainEqual({
      kind: 'total-row',
      row: 13,
      message:
        'Row 13 looks like a total (Net £4,630.00 adds up the rows above), so it was left out.',
    });
  });

  it('keeps true row numbers for the data', () => {
    expect(sheet.rowNumbers).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('readSheet with ordinary files', () => {
  it('leaves a normal export alone', () => {
    const jobber = readFileSync(
      new URL('./fixtures/jobber/invoices-report.csv', import.meta.url),
      'utf8',
    );
    const sheet = readSheet(jobber);
    expect(findHeaderRow(jobber)).toBe(1);
    expect(sheet.rows).toHaveLength(42);
    expect(sheet.issues).toEqual([]);
  });

  it('spots a total row by its label even when it does not add up', () => {
    const sheet = readSheet('Name,Amount\nA,10.00\nB,20.00\nC,5.00\nTotal,99.00\n');
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.issues[0]?.message).toBe('Row 5 looks like a total, so it was left out.');
  });

  it('does not treat a big ordinary row as a total', () => {
    const sheet = readSheet('Name,Amount\nA,10.00\nB,20.00\nC,50.00\n');
    expect(sheet.rows).toHaveLength(3);
  });

  it('does not treat a row that happens to add up in one column as a total, unless it is last', () => {
    const sheet = readSheet(
      'Name,Amount,Fee\nA,10.00,1.00\nB,20.00,2.00\nC,30.00,9.00\nD,40.00,4.00\n',
    );
    expect(sheet.rows).toHaveLength(4);
  });

  it('ignores columns that are zero all the way down', () => {
    const sheet = readSheet('Name,Amount,Tip\nA,10.00,0.00\nB,20.00,0.00\nC,35.00,0.00\n');
    expect(sheet.rows).toHaveLength(3);
  });
});
