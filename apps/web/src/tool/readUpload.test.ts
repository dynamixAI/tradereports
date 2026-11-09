import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { PROFILES } from '@tradereports/core';
import { decodeText, describeFile, MAX_BYTES, readUpload } from './readUpload';

const bytes = (text: string) => new TextEncoder().encode(text);

// a workbook with the given sheets, each a list of rows
function workbook(sheets: Record<string, (string | number)[][]>): Uint8Array {
  const book = utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('readUpload: CSV', () => {
  it('reads a home-made sheet and says so', async () => {
    const result = await readUpload('march.csv', bytes('Ref,Customer,Total\nA1,Smith,120\n'));
    expect(result.kind).toBe('table');
    if (result.kind !== 'table') return;
    expect(result.table.headers).toEqual(['Ref', 'Customer', 'Total']);
    expect(result.table.rows).toHaveLength(1);
    expect(result.known).toBeNull();
    expect(result.what).toMatch(/spreadsheet you keep yourself/);
  });

  it('skips title rows and reports them', async () => {
    const text = 'My invoices 2026\n\nRef,Customer,Total\nA1,Smith,120\nA2,Jones,80\n';
    const result = await readUpload('book.csv', bytes(text));
    if (result.kind !== 'table') throw new Error(result.kind);
    expect(result.table.rows).toHaveLength(2);
    expect(result.notes.join(' ')).toMatch(/headers are on row 3/);
  });

  it('reads a pound sign saved by older Excel', async () => {
    // 0xa3 is £ in Windows-1252 and not valid UTF-8 on its own
    const raw = new Uint8Array([...bytes('Ref,Total\nA1,'), 0xa3, ...bytes('120\n')]);
    expect(decodeText(raw)).toContain('£120');
  });

  it('turns down an empty file, a huge file and an unknown type', async () => {
    expect((await readUpload('a.csv', new Uint8Array())).kind).toBe('error');
    const big = { byteLength: MAX_BYTES + 1 } as Uint8Array;
    expect((await readUpload('a.csv', big)).kind).toBe('error');
    const pdf = await readUpload('a.pdf', bytes('%PDF'));
    expect(pdf.kind === 'error' && pdf.message).toMatch(/CSV, Excel/);
  });
});

describe('describeFile', () => {
  it('recognises every known export without naming the software', () => {
    for (const profile of PROFILES) {
      const table = {
        headers: profile.signature,
        rows: [],
        rowNumbers: [],
        issues: [],
      };
      const { what, known } = describeFile(table);
      expect(known).toBe(profile.kind);
      expect(what).toMatch(/from job software/);
      expect(what).not.toMatch(/jobber|tradify/i);
    }
  });
});

describe('readUpload: Excel', () => {
  it('reads a workbook with one sheet', async () => {
    const data = workbook({
      Invoices: [
        ['Ref', 'Total'],
        ['A1', 120],
      ],
    });
    const result = await readUpload('book.xlsx', data);
    if (result.kind !== 'table') throw new Error(result.kind);
    expect(result.sheet).toBe('Invoices');
    expect(result.table.rows[0]?.['Total']).toBe('120');
  });

  it('asks which sheet when more than one has data, then reads the chosen one', async () => {
    const data = workbook({
      Jan: [
        ['Ref', 'Total'],
        ['A1', 120],
      ],
      Feb: [
        ['Ref', 'Total'],
        ['B1', 80],
        ['B2', 40],
      ],
    });
    const first = await readUpload('book.xlsx', data);
    if (first.kind !== 'choose-sheet') throw new Error(first.kind);
    expect(first.sheets.map((s) => s.name)).toEqual(['Jan', 'Feb']);

    const chosen = await readUpload('book.xlsx', first.bytes, 'Feb');
    if (chosen.kind !== 'table') throw new Error(chosen.kind);
    expect(chosen.table.rows).toHaveLength(2);
  });
});
