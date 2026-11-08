import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { editDistance, findNameMatches, findNameSplits, tidyName } from '../src/names';

const header = 'Ref,Customer,Phone,Postcode,Total';
const sheet = (...rows: string[]) => readSheet([header, ...rows].join('\n'));
const pairs = (text: ReturnType<typeof sheet>) =>
  findNameMatches(text, 'Customer').map((m) => [m.variant, m.canonical, m.tidyOnly]);

describe('tidyName and editDistance', () => {
  it.each([
    ['  David   Smith ', 'david smith'],
    ['O’Brien', "o'brien"],
    ['Mr. Patel', 'mr patel'],
  ])('tidies "%s"', (text, tidy) => {
    expect(tidyName(text)).toBe(tidy);
  });

  it.each([
    ['david', 'davod', 1],
    ['david', 'dvaid', 1],
    ['smith', 'smyth', 1],
    ['patel', 'patel', 0],
    ['ann', 'dan', 2],
  ])('counts %s to %s as %i', (a, b, n) => {
    expect(editDistance(a, b)).toBe(n);
  });
});

describe('names that differ only in spacing or capitals', () => {
  it('are offered as one group, keeping the most used spelling', () => {
    const result = sheet(
      'A1,David Smith,07700 900101,WN1 2AB,10.00',
      'A2,David Smith,07700 900101,WN1 2AB,20.00',
      'A3, david  smith,07700 900101,WN1 2AB,30.00',
      'A4,DAVID SMITH,,,40.00',
    );
    expect(pairs(result)).toEqual([
      ['david  smith', 'David Smith', true],
      ['DAVID SMITH', 'David Smith', true],
    ]);
  });
});

describe('typos and stray symbols', () => {
  const base = [
    'A1,David Smith,07700 900101,WN1 2AB,10.00',
    'A2,David Smith,07700 900101,WN1 2AB,20.00',
    'A3,Grace Holt,07700 900102,M4 1NP,30.00',
  ];

  it('suggests a one-letter typo with the same phone as evidence', () => {
    const [match] = findNameMatches(
      sheet(...base, 'A4,Davod Smith,07700 900101,,40.00'),
      'Customer',
    );
    expect(match).toMatchObject({
      variant: 'Davod Smith',
      canonical: 'David Smith',
      tidyOnly: false,
      rows: [5],
    });
    expect(match?.evidence).toEqual([
      '"Davod Smith" and "David Smith" are 1 letter different.',
      'Same Phone.',
    ]);
  });

  it('suggests a name with a stray symbol', () => {
    expect(pairs(sheet(...base, 'A4,Dav;id Smith,,WN1 2AB,40.00'))).toEqual([
      ['Dav;id Smith', 'David Smith', false],
    ]);
  });

  it('says so when there is nothing to compare', () => {
    const [match] = findNameMatches(sheet(...base, 'A4,Davod Smith,,,40.00'), 'Customer');
    expect(match?.evidence).toContain('No phone, email or postcode to compare, so check this one.');
  });

  it('keeps apart a near name whose phone and postcode both differ', () => {
    expect(pairs(sheet(...base, 'A4,David Smyth,07700 900999,BL1 1AA,40.00'))).toEqual([]);
  });

  it('keeps apart names with a different first letter, as that is rarely a typo', () => {
    expect(
      pairs(sheet('A1,Bob Example,,,10.00', 'A2,Bob Example,,,20.00', 'A3,Rob Example,,,30.00')),
    ).toEqual([]);
  });

  it('but suggests them when the contacts say they are the same', () => {
    expect(
      pairs(
        sheet(
          'A1,Bob Example,07700 900101,,10.00',
          'A2,Bob Example,07700 900101,,20.00',
          'A3,Rob Example,07700 900101,,45.00',
        ),
      ),
    ).toEqual([['Rob Example', 'Bob Example', false]]);
  });

  it('never matches short names on a letter', () => {
    expect(
      pairs(sheet('A1,Ann,,,10.00', 'A2,Ann,,,20.00', 'A3,Dan,,,30.00', 'A4,Anna,,,40.00')),
    ).toEqual([]);
  });
});

describe('two misspellings of one name', () => {
  it('both point at the real name, never at each other', () => {
    const table = sheet(
      'A1,Fiona Clarke,07700 900101,WN1 2AB,10.00',
      'A2,Fiona Clarke,07700 900101,WN1 2AB,20.00',
      'A3,Fi-ona Clarke,07700 900101,,45.00',
      'A4,Fiona Clakre,07700 900101,,50.00',
    );
    expect(pairs(table)).toEqual([
      ['Fi-ona Clarke', 'Fiona Clarke', false],
      ['Fiona Clakre', 'Fiona Clarke', false],
    ]);
  });
});

describe('clean files', () => {
  it('suggests nothing when every customer is written one way', () => {
    expect(
      pairs(
        sheet(
          'A1,David Smith,,,10.00',
          'A2,Grace Holt,,,20.00',
          'A3,David Smith,,,30.00',
          'A4,Hill Lettings,,,40.00',
        ),
      ),
    ).toEqual([]);
  });

  it('gives the same ids every time, so answers can be saved', () => {
    const table = sheet(
      'A1,David Smith,,,10.00',
      'A2,David Smith,,,20.00',
      'A3,Davod Smith,,,45.00',
    );
    expect(findNameMatches(table, 'Customer').map((m) => m.id)).toEqual(['name:Davod Smith']);
  });
});

describe('one name, possibly two customers', () => {
  const splits = (text: ReturnType<typeof sheet>) =>
    findNameSplits(text, 'Customer').map((sp) => [
      sp.name,
      sp.groups.map((g) => [g.label, g.rows]),
    ]);

  it('suggests a split when the rows have no contact detail in common, labelled by postcode', () => {
    const table = sheet(
      'A1,David Braithwaite,07700 900101,CA8 2DD,10.00',
      'A2,Grace Holt,07700 900102,M4 1NP,20.00',
      'A3,David Braithwaite,07700 900101,CA8 2DD,45.00',
      'A4,David Braithwaite,07700 900999,CA11 7EE,50.00',
    );
    expect(splits(table)).toEqual([
      [
        'David Braithwaite',
        [
          ['CA8 2DD', [2, 4]],
          ['CA11 7EE', [5]],
        ],
      ],
    ]);
    expect(findNameSplits(table, 'Customer')[0]?.evidence).toContain(
      'Two different customers, or one customer whose details changed?',
    );
  });

  it('keeps one customer who moved house but kept the same phone', () => {
    const table = sheet(
      'A1,David Braithwaite,07700 900101,CA8 2DD,10.00',
      'A2,David Braithwaite,07700 900101,CA11 7EE,20.00',
      'A3,Grace Holt,07700 900102,M4 1NP,45.00',
    );
    expect(splits(table)).toEqual([]);
  });

  it('joins rows through a shared detail, even when two rows share nothing directly', () => {
    const table = sheet(
      'A1,David Braithwaite,07700 900101,CA8 2DD,10.00',
      'A2,David Braithwaite,07700 900101,CA11 7EE,20.00',
      'A3,David Braithwaite,07700 900555,CA11 7EE,45.00',
    );
    expect(splits(table)).toEqual([]);
  });

  it('does not split when only one set of rows has contact details', () => {
    const table = sheet(
      'A1,David Braithwaite,07700 900101,CA8 2DD,10.00',
      'A2,David Braithwaite,,,20.00',
      'A3,Grace Holt,07700 900102,M4 1NP,45.00',
    );
    expect(splits(table)).toEqual([]);
  });
});
