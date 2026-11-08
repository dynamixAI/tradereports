import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { applyRepairs, findRepairs, kindOf } from '../src/repairs';

// five clean rows, then whatever row a test adds
const header = 'Ref,Customer,Phone,Email,Postcode,Net,VAT,Total';
const clean = [
  'A1,Ann Example,07700 900101,ann@example.com,WN1 2AB,100.00,20.00,120.00',
  'A2,Bob Example,07700 900102,bob@example.com,M4 1NP,80.00,16.00,96.00',
  'A3,Cat Example,07700 900103,cat@example.com,BL3 6YZ,50.00,10.00,60.00',
  'A4,Dan Example,07700 900104,dan@example.com,SK1 7AA,40.00,8.00,48.00',
  'A5,Eve Example,07700 900105,eve@example.com,WA1 2EE,30.00,6.00,36.00',
];
const sheet = (...extra: string[]) => readSheet([header, ...clean, ...extra].join('\n'));
const summary = (text: ReturnType<typeof sheet>) =>
  findRepairs(text).map((r) => `${r.action} ${r.from} -> ${r.to}`);

describe('kindOf', () => {
  it.each([
    ['ann@example.com', 'email'],
    ['07700 900101', 'phone'],
    ['+44 7700 900101', 'phone'],
    ['wn1 2ab', 'postcode'],
    ['03/04/2026', 'date'],
    ['£380', 'money'],
    ['380.00', 'money'],
  ])('reads %s as %s', (text, kind) => {
    expect(kindOf(text)).toBe(kind);
  });

  it.each(['1041', 'Ann Example', 'Boiler service', 'paid 3/4', ''])(
    'says nothing about "%s"',
    (text) => {
      expect(kindOf(text)).toBeNull();
    },
  );
});

describe('a value in the wrong column', () => {
  it('moves an amount from the phone column to the one empty money column, with the sum as evidence', () => {
    const repairs = findRepairs(
      sheet('A6,Fay Example,£380.00,fay@example.com,OL1 9CC,,76.00,456.00'),
    );
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      action: 'move',
      row: 7,
      from: 'Phone',
      to: 'Net',
      value: '£380.00',
    });
    expect(repairs[0]?.evidence).toContain(
      'Then Net + VAT = Total on this row (£380.00 + £76.00 = £456.00).',
    );
  });

  it('moves an email typed into the customer column when the email column is empty', () => {
    expect(summary(sheet('A6,fay@example.com,07700 900106,,OL1 9CC,10.00,2.00,12.00'))).toEqual([
      'move Customer -> Email',
    ]);
  });

  it('does not guess when more than one column could take it', () => {
    expect(summary(sheet('A6,Fay Example,£380.00,fay@example.com,OL1 9CC,,,456.00'))).toEqual([]);
  });

  it('never moves a plain whole number, which could be anything', () => {
    expect(summary(sheet('A6,Fay Example,380,fay@example.com,OL1 9CC,,76.00,456.00'))).toEqual([]);
  });

  it('never moves names or descriptions', () => {
    expect(summary(sheet('A6,,Fay Example,fay@example.com,OL1 9CC,10.00,2.00,12.00'))).toEqual([]);
  });
});

describe('swapped values', () => {
  it("swaps a phone and a postcode typed into each other's columns", () => {
    const repairs = findRepairs(
      sheet('A6,Fay Example,OL1 9CC,fay@example.com,07700 900106,10.00,2.00,12.00'),
    );
    expect(repairs.map((r) => [r.action, r.from, r.to, r.value, r.other])).toEqual([
      ['swap', 'Phone', 'Postcode', 'OL1 9CC', '07700 900106'],
    ]);
  });
});

describe('copies', () => {
  it('removes a copy of the email from the phone column', () => {
    expect(
      summary(sheet('A6,Fay Example,fay@example.com,fay@example.com,OL1 9CC,10.00,2.00,12.00')),
    ).toEqual(['remove-copy Phone -> Email']);
  });

  it('then finds the phone elsewhere on the row and moves it into the emptied cell', () => {
    expect(
      summary(sheet('A6,07700 900106,fay@example.com,fay@example.com,OL1 9CC,10.00,2.00,12.00')),
    ).toEqual(['remove-copy Phone -> Email', 'move Customer -> Phone']);
  });
});

describe('clean files', () => {
  it('suggests nothing when every value is where it belongs', () => {
    expect(findRepairs(sheet())).toEqual([]);
  });

  it('leaves a column that holds two kinds on purpose alone', () => {
    const mixed = readSheet(
      [
        'Ref,Phone / Postcode,Total',
        'A1,07700 900101,10.00',
        'A2,WN1 2AB,20.00',
        'A3,07700 900103,30.00',
        'A4,M4 1NP,40.00',
      ].join('\n'),
    );
    expect(findRepairs(mixed)).toEqual([]);
  });
});

describe('applyRepairs', () => {
  const table = sheet('A6,07700 900106,fay@example.com,fay@example.com,OL1 9CC,10.00,2.00,12.00');
  const repairs = findRepairs(table);

  it('applies only what was accepted and leaves the original alone', () => {
    const { table: fixed, notes } = applyRepairs(table, repairs, () => true);
    expect(fixed.rows[5]).toMatchObject({
      Customer: null,
      Phone: '07700 900106',
      Email: 'fay@example.com',
    });
    expect(table.rows[5]?.Phone).toBe('fay@example.com');
    expect(notes.map((n) => n.rule)).toEqual([
      'you removed a copy of fay@example.com from Phone on row 7',
      'you moved 07700 900106 from Customer to Phone on row 7',
    ]);
  });

  it('never overwrites: a move waiting on a rejected copy removal is skipped', () => {
    const { table: fixed } = applyRepairs(table, repairs, (r) => r.action === 'move');
    expect(fixed.rows[5]).toMatchObject({ Customer: '07700 900106', Phone: 'fay@example.com' });
  });

  it('gives the same ids every time, so answers can be saved', () => {
    expect(findRepairs(table).map((r) => r.id)).toEqual(repairs.map((r) => r.id));
  });
});
