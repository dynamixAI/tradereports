import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from '../src/excel';
import { convertSpreadsheet } from '../src/general/invoices';
import { makeProfile, rememberedSheet } from '../src/general/profiles';
import { acceptSuggested, askQuestions, emptyAnswers } from '../src/general/questions';
import { readSheet } from '../src/layout';

// Files saved by LibreOffice from the same workbook (see fixtures/excel/make-fixtures.py),
// so the tests read what a real user's program writes.
const file = (name: string) => readFileSync(new URL(`./fixtures/excel/${name}`, import.meta.url));
const textOf = (name: string, sheet?: string) => {
  const result = readWorkbook(file(name), sheet);
  if (result.kind !== 'text') throw new Error(`expected text, got ${result.kind}`);
  return result;
};

// the whole flow with the suggestions accepted
function convert(text: string) {
  const table = readSheet(text);
  const answers = acceptSuggested(table, emptyAnswers());
  return {
    questions: askQuestions(table, answers),
    ...convertSpreadsheet(table, answers, { businessId: 't', file: 'f' }),
  };
}

describe('the same workbook in each format', () => {
  it.each(['invoices.xls', 'invoices.ods'])('%s reads exactly as the .xlsx does', (name) => {
    expect(textOf(name).text).toBe(textOf('invoices.xlsx').text);
  });

  it('writes dates as YYYY-MM-DD, so 3 April is never mistaken for 4 March', () => {
    const lines = textOf('invoices.xlsx').text.split('\n');
    expect(lines[4]).toBe('102,2026-04-03,Bob Example,80.00,16.00,96.00,No');
  });

  it('keeps the pence on cells shown as money, and uses the saved formula results', () => {
    expect(textOf('invoices.xlsx').text.split('\n')[3]).toBe(
      '101,2026-03-13,Ann Example,100.00,20.00,120.00,Yes',
    );
  });
});

describe('an Excel file gives the same invoices as its CSV', () => {
  const fromExcel = convert(textOf('invoices.xlsx').text);
  const fromCsv = convert(file('invoices.csv').toString('utf8'));
  const summary = (r: typeof fromExcel) =>
    r.records.map((i) => [
      i.number,
      i.issueDate,
      i.customerName,
      i.netPence.value,
      i.taxPence,
      i.grossPence,
      i.status.value,
    ]);

  it('in every field', () => {
    expect(summary(fromExcel)).toEqual(summary(fromCsv));
    expect(fromExcel.records).toHaveLength(6);
  });

  it('and asks nothing about the date order, which the CSV of April dates could need', () => {
    expect(fromExcel.questions.filter((q) => q.kind === 'date-order')).toEqual([]);
  });
});

describe('formulas with no saved result', () => {
  it('are reported with their cells, not read as zero', () => {
    const result = textOf('no-saved-results.xlsx');
    expect(result.issues[0]).toMatchObject({ kind: 'formula-without-value' });
    expect(result.issues[0]?.cells).toEqual(
      expect.arrayContaining(['F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'D10', 'E10', 'F10']),
    );
    expect(result.issues[0]?.message).toContain(
      'Opening the file in Excel or LibreOffice and saving it fixes this.',
    );
    expect(result.text.split('\n')[3]).toBe('101,2026-03-13,Ann Example,100.00,20.00,,Yes');
  });
});

describe('several sheets', () => {
  it('asks which sheet, leaving out empty and hidden ones', () => {
    const result = readWorkbook(file('several-sheets.xlsx'));
    expect(result).toMatchObject({
      kind: 'choose-sheet',
      question:
        'This file has 2 sheets with data: "2026" (9 rows), "Notes" (2 rows). Which one holds the invoices?',
    });
  });

  it('reads the sheet the user chose', () => {
    expect(textOf('several-sheets.xlsx', '2026').text).toBe(textOf('invoices.xlsx').text);
  });

  it('says so when the chosen sheet is not there', () => {
    expect(readWorkbook(file('several-sheets.xlsx'), 'Invoices')).toEqual({
      kind: 'error',
      message: 'This file has no sheet called "Invoices".',
    });
  });

  it('offers a hidden .ods sheet as a choice, as SheetJS cannot tell it is hidden (known limit)', () => {
    const result = readWorkbook(file('several-sheets.ods'));
    expect(result.kind === 'choose-sheet' && result.sheets.map((s) => s.name)).toEqual([
      '2026',
      'Notes',
      'Workings',
    ]);
  });

  it('remembers the sheet chosen before, through the saved profile', () => {
    const table = readSheet(textOf('several-sheets.xlsx', '2026').text);
    const saved = makeProfile('Dave', table, emptyAnswers(), '2026-10-31', '2026');
    expect(rememberedSheet(['2026', 'Notes'], [saved])).toBe('2026');
    expect(rememberedSheet(['2025', 'Notes'], [saved])).toBeUndefined();
  });
});

describe('files that are not spreadsheets', () => {
  it('get a plain message', () => {
    // SheetJS reads a lot of things as a sheet, so this is a zip that holds no workbook
    const zip = Uint8Array.from([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)]);
    expect(readWorkbook(zip)).toMatchObject({ kind: 'error' });
  });
});
