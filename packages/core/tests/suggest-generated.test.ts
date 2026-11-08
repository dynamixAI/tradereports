import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { suggestColumns, type Field } from '../src/suggest';

// Builds spreadsheets with random column order, random header names and random extra
// columns, then checks the suggestions. Header names are sometimes nonsense, so the
// values and the arithmetic have to do the work. Fixed seed, so failures replay.

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

// names people use, and nonsense names that tell the reader nothing
const NAMES: Record<string, string[]> = {
  ref: ['Inv No', 'Invoice #', 'Ref', 'inv_ref', 'Bill no', 'Number'],
  customer: ['Customer', 'Client', 'Who for', 'cust name', 'Client name'],
  date: ['Date', 'Invoice date', 'inv_dt', 'Date done', 'When'],
  status: ['Paid?', 'Status', 'Settled', 'Received?', 'paid_yn'],
};
const NONSENSE = ['Col A', 'Col B', 'Col C', 'Field 1', 'Field 2', 'X', 'Y', 'Z', 'Box 7', 'Thing'];
const PEOPLE = ['Ann Example', 'Bob Example', 'Cat Example', 'Dan Example', 'Eve Example'];
const STATUS_WORDS = [
  'Paid',
  'paid',
  'Unpaid',
  'Yes',
  'No',
  'Outstanding',
  'Settled',
  'Overdue',
  'Y',
  'N',
];
const DETAILS = [' 3/4', ' (cash)', ' - rang', ' 12 Jan', ' in full', ' - texted'];
const METHODS = ['Bank', 'Cash', 'Card', 'BACS', ''];

// the ways people write a status, one style per file
type StatusStyle = 'words' | 'codes' | 'ticks' | 'notes';
const CODE_SETS = [
  ['PD', 'OS', 'PP'],
  ['SET', 'DUE', 'REM'],
  ['P', 'U'],
  ['OK', 'O/S', 'CHS'],
];
const NOTE_PARTS = [
  'Paid by cheque',
  'chased on the phone',
  'Settled in cash',
  'still owes',
  'Received by transfer',
  'awaiting the landlord',
];

function statusValue(r: ReturnType<typeof random>, style: StatusStyle, codes: string[]): string {
  if (style === 'codes') return r.pick(codes);
  if (style === 'ticks') return r.pick(['✓', '✗', '✓']);
  if (style === 'notes')
    return `${r.pick(NOTE_PARTS)} ${r.pick(['on the 3rd', 'last week', '12/03', 'after the job'])}`;
  return statusPhrase(r);
}

// a status as people write it: a word, sometimes with a date or a detail after it
function statusPhrase(r: ReturnType<typeof random>): string {
  const word = r.pick(STATUS_WORDS);
  return word.length > 1 && r.next() < 0.4 ? `${word}${r.pick(DETAILS)}` : word;
}

interface Built {
  text: string;
  expected: Partial<Record<Field, string | null>>;
}

function build(seed: number): Built {
  const r = random(seed);
  const vat = r.next() < 0.7;
  const split = r.next() < 0.5;
  const nonsense = [...NONSENSE];
  const takeNonsense = () => nonsense.splice(r.int(0, nonsense.length - 1), 1)[0] ?? 'Q';

  // money columns get nonsense names half the time, so the arithmetic has to find them
  const moneyName = (real: string) => (r.next() < 0.5 ? takeNonsense() : real);
  const net = vat ? moneyName(r.pick(['Net', 'before vat', 'net_val', 'Ex VAT'])) : null;
  const tax = vat ? moneyName(r.pick(['VAT', 'VAT £', 'Tax', 'vat_20'])) : null;
  const gross = moneyName(r.pick(['Total', 'Gross', 'inc VAT', 'Total due', 'Charged']));
  const labour = split ? r.pick(['Labour', 'Time']) : null;
  const parts = split ? r.pick(['Materials', 'Parts']) : null;

  // the status column is sometimes given a name that says nothing
  const status = r.next() < 0.3 ? takeNonsense() : r.pick(NAMES.status ?? []);
  const style = r.pick<StatusStyle>(['words', 'words', 'codes', 'ticks', 'notes']);
  const codeSet = r.pick(CODE_SETS);
  const columns: { name: string; value: (i: number, money: Money) => string }[] = [
    { name: r.pick(NAMES.ref ?? []), value: (i) => `R${seed}-${i}` },
    { name: r.pick(NAMES.customer ?? []), value: () => r.pick(PEOPLE) },
    { name: r.pick(NAMES.date ?? []), value: () => `${r.int(10, 28)}/0${r.int(1, 9)}/2026` },
    { name: status, value: () => statusValue(r, style, codeSet) },
    { name: gross, value: (_i, m) => pounds(m.gross) },
  ];
  if (net && tax) {
    columns.push({ name: net, value: (_i, m) => pounds(m.net) });
    columns.push({ name: tax, value: (_i, m) => pounds(m.vat) });
  }
  if (labour && parts) {
    columns.push({ name: labour, value: (_i, m) => pounds(m.labour) });
    columns.push({ name: parts, value: (_i, m) => pounds(m.net - m.labour) });
  }
  // extra columns that could confuse a weaker method
  if (r.next() < 0.5) columns.push({ name: 'Phone', value: () => `07700 900${r.int(100, 999)}` });
  if (r.next() < 0.5)
    columns.push({ name: 'Postcode', value: () => r.pick(['WN1 2AB', 'M4 1NP', 'BL3 6YZ']) });
  if (r.next() < 0.5)
    columns.push({
      name: 'Notes',
      value: () => r.pick(['rang twice', 'left a key', 'dog in garden', '']),
    });
  if (r.next() < 0.3) columns.push({ name: 'Job count', value: (i) => String(i) });
  // payment terms, also easy to mistake for the status
  if (r.next() < 0.3)
    columns.push({
      name: r.pick(['Terms', 'terms', 'Pay terms']),
      value: () => r.pick(['Net 30', 'COD', 'Net 14', 'Due on receipt']),
    });
  // a column that says how it was paid, to be mistaken for the status
  if (r.next() < 0.4)
    columns.push({
      name: r.pick(['how paid', 'Payment method', 'Paid by', 'Type']),
      value: () => r.pick(METHODS),
    });

  // shuffle the column order
  for (let i = columns.length - 1; i > 0; i -= 1) {
    const j = r.int(0, i);
    [columns[i], columns[j]] = [
      columns[j] as (typeof columns)[number],
      columns[i] as (typeof columns)[number],
    ];
  }

  const lines = [columns.map((c) => c.name).join(',')];
  for (let i = 1, n = r.int(6, 25); i <= n; i += 1) {
    const netPence = r.int(40, 2000) * 100 + (r.next() < 0.5 ? 0 : r.int(0, 99));
    const vatPence = vat ? Math.round(netPence * 0.2) : 0;
    const money: Money = {
      net: netPence,
      vat: vatPence,
      gross: netPence + vatPence,
      labour: Math.round(netPence * (0.3 + r.next() * 0.4)),
    };
    lines.push(columns.map((c) => c.value(i, money)).join(','));
  }

  return {
    text: lines.join('\n'),
    expected: {
      invoiceNumber: columns.find((c) => NAMES.ref?.includes(c.name))?.name ?? null,
      net,
      vat: tax,
      gross,
      status,
    },
  };
}

interface Money {
  net: number;
  vat: number;
  gross: number;
  labour: number;
}

function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('suggestions on 200 generated spreadsheets', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const { text, expected } = build(seed);
    const { fields, vatFound } = suggestColumns(readSheet(text));
    expect(fields.invoiceNumber.best).toBe(expected.invoiceNumber);
    expect(fields.net.best).toBe(expected.net);
    expect(fields.vat.best).toBe(expected.vat);
    expect(fields.gross.best).toBe(expected.gross);
    expect(vatFound).toBe(expected.vat !== null);
    expect(fields.status.best).toBe(expected.status);
  });
});
