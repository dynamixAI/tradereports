import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { findRepairs } from '../src/repairs';

// 200 clean files with 0 to 2 mistakes planted at known places. findRepairs must find
// exactly the planted ones and nothing on the clean rows. Fixed seed, so failures replay.

function random(seed: number) {
  let state = seed;
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

const AREAS = ['WN1 2AB', 'M4 1NP', 'BL3 6YZ', 'SK1 7AA', 'WA1 2EE', 'OL1 9CC', 'PR1 3FF'];
const PEOPLE = ['Ann Example', 'Bob Example', 'Cat Example', 'Dan Example', 'Eve Example'];
const JOBS = ['Boiler service', 'Fit tap', 'Leak repair', 'Rewire', 'New radiator'];

type Mistake =
  | 'move-money'
  | 'move-email'
  | 'swap-phone-postcode'
  | 'copy-email'
  | 'swap-email-name'
  | 'swap-net-total';

function build(seed: number) {
  const r = random(seed);
  const header = [
    'Ref',
    'Date',
    'Customer',
    'Job',
    'Phone',
    'Email',
    'Postcode',
    'Net',
    'VAT',
    'Total',
  ];
  const rows: string[][] = [];
  for (let i = 1, n = r.int(8, 25); i <= n; i += 1) {
    const net = r.int(40, 900) * 100 + (r.next() < 0.5 ? 0 : r.int(0, 99));
    const vat = Math.round(net * 0.2);
    const name = r.pick(PEOPLE);
    rows.push([
      `R${i}`,
      `${r.int(13, 28)}/0${r.int(1, 9)}/2026`,
      name,
      r.pick(JOBS),
      `07700 900${String(r.int(100, 999))}`,
      r.next() < 0.15 ? '' : `${name.split(' ')[0]?.toLowerCase() ?? 'x'}${i}@example.com`,
      r.pick(AREAS),
      (net / 100).toFixed(2),
      (vat / 100).toFixed(2),
      ((net + vat) / 100).toFixed(2),
    ]);
  }

  // plant mistakes on different rows; each gives the repair it should produce
  const expected: string[] = [];
  const used = new Set<number>();
  for (let m = r.int(0, 2); m > 0; m -= 1) {
    const index = r.int(0, rows.length - 1);
    const row = rows[index];
    if (!row || used.has(index)) continue;
    used.add(index);
    const at = (name: string) => header.indexOf(name);
    const sheetRow = index + 2;
    const mistake = r.pick<Mistake>([
      'move-money',
      'move-email',
      'swap-phone-postcode',
      'copy-email',
      'swap-email-name',
      'swap-net-total',
    ]);
    if (mistake === 'move-money') {
      // the net typed into the phone column, with £ so it says what it is
      row[at('Phone')] = `£${row[at('Net')] ?? ''}`;
      row[at('Net')] = '';
      expected.push(`move:${sheetRow}:Phone:Net`);
    } else if (mistake === 'move-email' && row[at('Email')]) {
      row[at('Job')] = row[at('Email')] ?? '';
      row[at('Email')] = '';
      expected.push(`move:${sheetRow}:Job:Email`);
    } else if (mistake === 'swap-phone-postcode') {
      [row[at('Phone')], row[at('Postcode')]] = [row[at('Postcode')] ?? '', row[at('Phone')] ?? ''];
      expected.push(`swap:${sheetRow}:Phone:Postcode`);
    } else if (mistake === 'swap-email-name' && row[at('Email')]) {
      [row[at('Customer')], row[at('Email')]] = [row[at('Email')] ?? '', row[at('Customer')] ?? ''];
      expected.push(`swap:${sheetRow}:Customer:Email`);
    } else if (mistake === 'swap-net-total') {
      [row[at('Net')], row[at('Total')]] = [row[at('Total')] ?? '', row[at('Net')] ?? ''];
      expected.push(`swap:${sheetRow}:Net:Total`);
    } else if (mistake === 'copy-email' && row[at('Email')]) {
      row[at('Phone')] = row[at('Email')] ?? '';
      expected.push(`remove-copy:${sheetRow}:Phone`);
    }
  }
  return { text: [header, ...rows].map((cells) => cells.join(',')).join('\n'), expected };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('repairs on 200 generated files with planted mistakes', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const { text, expected } = build(seed);
    const found = findRepairs(readSheet(text)).map((repair) => repair.id);
    expect(found.sort()).toEqual([...expected].sort());
  });
});
