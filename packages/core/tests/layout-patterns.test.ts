import { describe, expect, it } from 'vitest';
import { readYesNo } from '../src/clean';
import { readDate } from '../src/dates';
import { findHeaderRow, readSheet } from '../src/layout';
import { scanColumn } from '../src/scan';

// Each pattern gets several variants, written from scratch, so the rules are tested in
// general rather than against any one spreadsheet.

const header = 'Ref,Day,Client,Work,Net,Vat,Gross,Settled';
const rows = [
  'A1,2026-03-01,Ann Example,Fit tap,100.00,20.00,120.00,Yes',
  'A2,2026-03-04,Bob Example,Unblock drain,80.00,16.00,96.00,No',
  'A3,2026-03-09,Cat Example,Service,60.00,12.00,72.00,Yes',
];
const sheet = (...extra: string[]) => readSheet([header, ...rows, ...extra].join('\n'));
const refs = (text: ReturnType<typeof readSheet>) => text.rows.map((row) => row['Ref']);

describe('notes under the data', () => {
  it.each([
    ['a sentence in the first column', 'Remember to chase the drain job'],
    ['a sentence in a middle column', ',,,Ring Bob before Friday about the drain,,,,'],
    ['two notes after a blank line', '', 'Van MOT due in April', 'Order more fittings'],
  ])('leaves out %s', (_name, ...extra) => {
    const result = sheet(...extra);
    expect(refs(result)).toEqual(['A1', 'A2', 'A3']);
    expect(result.issues.some((issue) => issue.message.includes('looks like a note'))).toBe(true);
  });
});

describe('a heading straight under the headers', () => {
  const titled = (...under: string[]) =>
    ['Sales book 2026', 'Kept by me', '', header, ...under, ...rows].join('\n');

  it.each([
    ['a month name', 'JANUARY'],
    ['a month and year', 'January 2026'],
    ['a note in a middle column', ',,,first jobs after Christmas,,,,'],
    ['two short lines', 'JANUARY', 'quiet month'],
  ])('still finds the headers with %s under them', (_name, ...under) => {
    const text = titled(...under);
    expect(findHeaderRow(text)).toBe(4);
    expect(refs(readSheet(text))).toEqual(['A1', 'A2', 'A3']);
  });

  it('takes the lower row of a two-row header', () => {
    const text = [',,,,Money,,,', header, ...rows].join('\n');
    expect(findHeaderRow(text)).toBe(2);
  });

  it('takes the lower row when two full rows of labels sit on top of each other', () => {
    const text = ['Number,When,Who,What,Before,Tax,After,Done', header, ...rows].join('\n');
    expect(findHeaderRow(text)).toBe(2);
  });

  it('falls back to the widest row, not a one-cell title, when nothing looks like headers', () => {
    const text = ['My jobs', '1,2,3,4', '5,6,7,8'].join('\n');
    expect(findHeaderRow(text)).toBe(2);
  });
});

describe('notes between records', () => {
  const between = (...extra: string[]) =>
    readSheet([header, rows[0], ...extra, rows[1], rows[2]].join('\n'));

  it.each([
    ['a sentence in the last column', ',,,,,,,part paid 40 - rest on the invoice'],
    ['a sentence in a middle column', ',,,Waiting on parts from the merchant,,,,'],
    ['a heading in the first column', 'MARCH JOBS'],
    ['a one word heading', 'March'],
  ])('leaves out %s', (_name, extra) => {
    const result = between(extra);
    expect(refs(result)).toEqual(['A1', 'A2', 'A3']);
    expect(
      result.issues.some((issue) => issue.row === 3 && issue.message.includes('between records')),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'missing-cells')).toBe(false);
  });

  it.each([
    ['a reference and an amount', 'A9,,,,,,50.00,'],
    ['a name and an amount', ',,Eve Example,,,,30.00,'],
    ['a date only', ',2026-03-02,,,,,,'],
  ])('keeps a sparse row with %s', (_name, extra) => {
    const result = between(extra);
    expect(result.rows).toHaveLength(4);
  });
});

describe('summaries under the data', () => {
  it.each([
    ['a label in a middle column', ',,,,Money in,,216.00,'],
    ['two summary lines', ',,,,,Still owed,96.00,', ',,,,,Paid so far,192.00,'],
    ['an amount with no label', ',,,,,,288.00,'],
  ])('leaves out %s', (_name, ...extra) => {
    const result = sheet(...extra);
    expect(refs(result)).toEqual(['A1', 'A2', 'A3']);
  });
});

describe('total rows', () => {
  it('finds a total label in any column', () => {
    const result = sheet(',,,,,GRAND TOTAL,,');
    expect(refs(result)).toEqual(['A1', 'A2', 'A3']);
  });

  it('finds a subtotal in the middle of the sheet and keeps the rows after it', () => {
    const result = readSheet(
      [
        header,
        ...rows,
        ',,Subtotal March,,240.00,48.00,288.00,',
        'A4,2026-04-02,Dan Example,Boiler,300.00,60.00,360.00,No',
      ].join('\n'),
    );
    expect(refs(result)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('keeps a job whose description starts with Total', () => {
    const result = sheet('A4,2026-03-12,Dan Example,Total rewire,900.00,180.00,1080.00,No');
    expect(refs(result)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});

describe('missing cells', () => {
  it('are not reported for rows left out as totals or notes', () => {
    const result = readSheet([header, ...rows, 'Short note here please'].join('\n'));
    expect(result.issues.map((issue) => issue.kind)).toEqual(['total-row']);
  });

  it('are still reported for real records', () => {
    const result = readSheet(
      [header, 'A1,2026-03-01,Ann Example,Fit tap,100.00,20.00', ...rows.slice(1)].join('\n'),
    );
    expect(result.issues.map((issue) => issue.kind)).toEqual(['missing-cells']);
  });
});

describe('a sparse last invoice', () => {
  it('is kept when it has a reference and more than one value', () => {
    const result = sheet('A4,,Dan Example,,,,50.00,');
    expect(refs(result)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});

describe('more date formats', () => {
  it.each([
    ['4-Dec-25', '2025-12-04'],
    ['04 Dec 2025', '2025-12-04'],
    ['4/Dec/25', '2025-12-04'],
    ['3rd September 2026', '2026-09-03'],
    ['21st Jan 26', '2026-01-21'],
    ['Tue 3 Nov 2026', '2026-11-03'],
    ['Tuesday, 3rd November 2026', '2026-11-03'],
    ['Sept 3, 2026', '2026-09-03'],
    ['Nov 3rd 26', '2026-11-03'],
  ])('reads %s', (text, expected) => {
    expect(readDate(text)).toBe(expected);
  });

  it('still rejects a day that does not exist', () => {
    expect(readDate('31-Feb-26')).toBeNull();
  });
});

describe('yes and no', () => {
  it('reads Y and N', () => {
    expect([readYesNo('Y').value, readYesNo('n').value]).toEqual([true, false]);
  });
});

describe('whole numbers', () => {
  it('says they could be pounds or reference numbers', () => {
    expect(scanColumn(['450', '120', '85']).evidence[0]).toBe(
      '100% are whole numbers, which could be amounts in whole pounds or reference numbers.',
    );
  });
});
