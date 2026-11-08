import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { findNameMatches } from '../src/names';

// 200 files, each with its own customers and their own phones and postcodes. Variants are
// planted (spacing, capitals, a stray symbol, a typo, swapped letters), and decoys too: a
// near name with a different phone and postcode. Every variant must be found and no decoy
// matched. Fixed seed, so a failure can be replayed.

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

const NAMES = [
  'Grace Holt',
  'Marcus Webb',
  'Priya Shah',
  'Owen Price',
  'Hill Lettings',
  'Fiona Clarke',
  'Rashid Khan',
  'Teresa Doyle',
  'Bramley Homes',
  'Callum Reid',
];
const AREAS = [
  'WN1 2AB',
  'M4 1NP',
  'BL3 6YZ',
  'SK1 7AA',
  'WA1 2EE',
  'OL1 9CC',
  'PR1 3FF',
  'L1 8JQ',
];

type Variant = 'spaces' | 'capitals' | 'symbol' | 'typo' | 'swap';

// change one letter that is not the first of its word
function plant(name: string, variant: Variant, r: ReturnType<typeof random>): string {
  if (variant === 'spaces') return ` ${name.replace(' ', '  ')}`;
  if (variant === 'capitals') return name.toUpperCase();
  const words = name.split(' ');
  const w = r.int(0, words.length - 1);
  const word = words[w] ?? '';
  const at = r.int(1, word.length - 2);
  const letters = [...word];
  if (variant === 'symbol') letters.splice(at, 0, r.pick([';', '.', "'", '-']));
  if (variant === 'typo') letters[at] = letters[at] === 'x' ? 'z' : 'x';
  if (variant === 'swap')
    [letters[at], letters[at + 1]] = [letters[at + 1] ?? '', letters[at] ?? ''];
  words[w] = letters.join('');
  return words.join(' ');
}

function build(seed: number) {
  const r = random(seed);
  const people = [...NAMES].sort(() => r.next() - 0.5).slice(0, r.int(3, 6));
  const contact = new Map(
    people.map((name, i) => [name, { phone: `07700 900${100 + i}`, area: AREAS[i] ?? 'WN1 2AB' }]),
  );
  const rows: { name: string; phone: string; area: string }[] = [];
  // every customer at least twice, so the right spelling is the one used most
  for (const name of people) {
    for (let k = r.int(2, 4); k > 0; k -= 1)
      rows.push({ name, ...(contact.get(name) ?? { phone: '', area: '' }) });
  }

  const expected: string[] = [];
  for (let m = r.int(0, 2); m > 0; m -= 1) {
    const name = r.pick(people);
    const variant = plant(
      name,
      r.pick<Variant>(['spaces', 'capitals', 'symbol', 'typo', 'swap']),
      r,
    );
    if (variant.trim() === name || expected.includes(`${variant.trim()} -> ${name}`)) continue;
    const details = contact.get(name) ?? { phone: '', area: '' };
    // the variant row keeps the customer's phone, or sometimes has none
    rows.push({ name: variant, phone: r.next() < 0.8 ? details.phone : '', area: details.area });
    expected.push(`${variant.trim()} -> ${name}`);
  }
  // a decoy: a near name for someone else, with their own phone and postcode
  if (r.next() < 0.5) {
    const name = r.pick(people);
    const decoy = plant(name, 'typo', r);
    rows.push({ name: decoy, phone: '07700 900999', area: 'CA1 1AA' });
  }

  rows.sort(() => r.next() - 0.5);
  const lines = ['Ref,Customer,Phone,Postcode,Total'];
  rows.forEach((row, i) =>
    lines.push(`R${i + 1},${row.name},${row.phone},${row.area},${(100 + i * 13).toFixed(2)}`),
  );
  return { text: lines.join('\n'), expected };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('possible same customers in 200 generated files', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const { text, expected } = build(seed);
    const found = findNameMatches(readSheet(text), 'Customer').map(
      (m) => `${m.variant} -> ${m.canonical}`,
    );
    expect(found.sort()).toEqual([...expected].sort());
  });
});
