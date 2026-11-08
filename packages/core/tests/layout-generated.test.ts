import { describe, expect, it } from 'vitest';
import { findHeaderRow, readSheet } from '../src/layout';

// Builds hundreds of random spreadsheet layouts and checks the layout rules on all of
// them. The random numbers come from a fixed seed, so a failure can always be replayed.

function random(seed: number) {
  let state = seed;
  // mulberry32: small, fast and the same on every machine
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: T[]): T => items[int(0, items.length - 1)] as T;
  return { next, int, pick };
}

const TITLES = [
  'Jobs book',
  'Sales record',
  'Work done this year',
  'Accounts - keep safe',
  'Updated monthly',
  '===========',
];
const NOTES = [
  'Check the van insurance renewal',
  'Ask the accountant about mileage',
  'Send the late ones a reminder',
];
const SUMMARY_LABELS = [
  'Total',
  'Totals',
  'Grand total',
  'Money in',
  'Still to come',
  'Sum',
  'Balance',
];
const OPTIONAL = [
  'Address',
  'Phone',
  'Email',
  'Notes',
  'Paid on',
  'Method',
  'Postcode',
  'Materials',
];

interface Layout {
  text: string;
  headerRow: number;
  refs: string[];
}

function makeLayout(seed: number): Layout {
  const r = random(seed);
  const columns = [
    'Ref',
    'Date',
    'Customer',
    'Job',
    'Amount',
    'VAT',
    'Total',
    ...OPTIONAL.slice(0, r.int(0, 5)),
  ];
  // a blank spacer column, sometimes
  const spacerAt = r.next() < 0.3 ? r.int(1, columns.length - 1) : -1;
  if (spacerAt >= 0) columns.splice(spacerAt, 0, '');
  const width = columns.length;
  const blankRow = ','.repeat(width - 1);
  const cellsAt = (values: Record<number, string>) =>
    Array.from({ length: width }, (_, i) => values[i] ?? '').join(',');

  const lines: string[] = [];
  // 0 to 4 title lines, each one or two cells, sometimes followed by a blank line
  for (let i = r.int(0, 4); i > 0; i -= 1) {
    lines.push(
      cellsAt(r.next() < 0.5 ? { 0: r.pick(TITLES) } : { 0: r.pick(TITLES), 1: 'Year 2026' }),
    );
  }
  if (lines.length > 0 && r.next() < 0.6) lines.push(blankRow);
  const headerRow = lines.length + 1;
  lines.push(columns.join(','));
  // sometimes a month heading or a note straight under the headers
  if (r.next() < 0.2) lines.push(cellsAt({ 0: r.pick(['JANUARY', 'April 2026', 'Q1']) }));
  else if (r.next() < 0.1) lines.push(cellsAt({ [r.int(1, width - 1)]: r.pick(NOTES) }));

  const refs: string[] = [];
  let totalAmount = 0;
  for (let i = 1, n = r.int(5, 30); i <= n; i += 1) {
    const ref = `R${seed}-${i}`;
    refs.push(ref);
    const amount = r.int(50, 2000) + (r.next() < 0.5 ? 0 : r.int(0, 99) / 100);
    totalAmount += amount;
    const values = columns.map((name) => {
      switch (name) {
        case 'Ref':
          return ref;
        case 'Date':
          return `2026-0${r.int(1, 9)}-1${r.int(0, 9)}`;
        case 'Customer':
          return `Customer ${r.int(1, 12)}`;
        case 'Job':
          return r.pick(['Leak', 'Service', 'Rewire', 'Boiler fit', 'New tap']);
        case 'Amount':
          return amount.toFixed(2);
        case 'VAT':
          return (amount * 0.2).toFixed(2);
        case 'Total':
          return (amount * 1.2).toFixed(2);
        case '':
          return '';
        // optional columns are sometimes left empty, as people do
        default:
          return r.next() < 0.3 ? '' : `${name} ${i}`;
      }
    });
    lines.push(values.join(','));
    // now and then a note or a blank line between records
    const between = r.next();
    if (i < n && between < 0.03) lines.push(cellsAt({ [r.int(0, width - 1)]: r.pick(NOTES) }));
    // a label in one cell and the note in the next, as people often type them
    else if (i < n && between < 0.06)
      lines.push(cellsAt({ 0: r.pick(['NOTE:', 'NB', 'Reminder']), 1: r.pick(NOTES) }));
    else if (i < n && between < 0.11) lines.push(blankRow);
  }

  // a footer of totals, summaries and notes, sometimes after a blank line
  if (r.next() < 0.5) lines.push(blankRow);
  const amountAt = columns.indexOf('Amount');
  for (let i = r.int(0, 3); i > 0; i -= 1) {
    const kind = r.int(0, 2);
    if (kind === 0) lines.push(cellsAt({ [r.int(1, width - 1)]: r.pick(SUMMARY_LABELS) }));
    if (kind === 1)
      lines.push(
        cellsAt({
          [Math.max(1, amountAt - 1)]: r.pick(SUMMARY_LABELS),
          [amountAt]: totalAmount.toFixed(2),
        }),
      );
    if (kind === 2)
      lines.push(
        r.next() < 0.5
          ? cellsAt({ 0: r.pick(NOTES) })
          : cellsAt({ [r.int(1, width - 1)]: r.pick(NOTES) }),
      );
  }

  return { text: lines.join('\n'), headerRow, refs };
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('layout rules on 300 generated spreadsheets', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const layout = makeLayout(seed);
    expect(findHeaderRow(layout.text)).toBe(layout.headerRow);
    const sheet = readSheet(layout.text);
    // every invoice kept, in order, and nothing else
    expect(sheet.rows.map((row) => row['Ref'])).toEqual(layout.refs);
    expect(sheet.headers).not.toContain('');
  });
});
