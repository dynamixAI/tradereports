import { describe, expect, it } from 'vitest';
import { askQuestions, emptyAnswers, type Answers } from '../src/general/questions';
import { readSheet } from '../src/layout';

// 200 files with part-paid invoices whose notes give the amount in different ways, and
// decoy notes that must give none. Each planted amount must be found exactly, and nothing
// else. Fixed seed, so a failure can be replayed.

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

const pounds = (pence: number) => (pence / 100).toFixed(0);

// ways to write "this much was paid" or "this much is still owed"
const PAID_NOTES = [
  (p: string) => `£${p} paid`,
  (p: string) => `paid £${p} on the day`,
  (p: string) => `deposit £${p} received`,
  (p: string) => `Deposit received ${p}`,
  (p: string) => `${p} paid in cash`,
];
const DUE_NOTES = [
  (d: string) => `balance £${d} due`,
  (d: string) => `£${d} still outstanding`,
  (d: string) => `still owes ${d}`,
];
// notes that mention numbers but give no amount paid
const DECOYS = [
  'paid 30/1',
  'call 07700 900123 about the rest',
  'rang twice, no answer',
  'job 1450 finished',
  'part paid, see bank app',
];

function build(seed: number) {
  const r = random(seed);
  const lines = ['Ref,When,Customer,Total,Paid?,Notes'];
  const expected: string[] = [];
  for (let i = 1, n = r.int(6, 20); i <= n; i += 1) {
    const gross = r.int(200, 3000) * 100;
    const row = i + 1;
    const kind = r.pick(['paid', 'unpaid', 'part', 'part', 'decoy']);
    let status = kind === 'paid' ? 'Yes' : kind === 'unpaid' ? 'No' : 'part';
    let note = '';
    if (kind === 'part') {
      const paid = r.int(1, Math.floor(gross / 100) - 1) * 100;
      const text =
        r.next() < 0.6 ? r.pick(PAID_NOTES)(pounds(paid)) : r.pick(DUE_NOTES)(pounds(gross - paid));
      // the note goes in the notes column or in the status cell itself
      if (r.next() < 0.5) note = text;
      else status = `part paid - ${text}`;
      expected.push(`paid:${row}=${paid}`);
    } else if (kind === 'decoy') {
      note = r.pick(DECOYS);
    } else if (r.next() < 0.3) {
      // a paid or unpaid invoice whose note mentions money is not part paid, so not read
      note = `£${pounds(Math.round(gross / 2))} paid`;
    }
    lines.push(
      `R${i},${r.int(13, 28)}/0${r.int(1, 9)}/2026,Customer ${i},${(gross / 100).toFixed(2)},${status},${note}`,
    );
  }
  return { text: lines.join('\n'), expected };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('amounts in notes on 200 generated files', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const { text, expected } = build(seed);
    const table = readSheet(text);
    // every status that starts with "part" is part paid; yes and no as usual
    const status: Answers['status'] = { yes: 'paid', no: 'unpaid' };
    for (const row of table.rows) {
      const value = (row['Paid?'] ?? '').trim().toLowerCase();
      if (value.startsWith('part')) status[value] = 'part paid';
    }
    const answers: Answers = {
      ...emptyAnswers(),
      dateOrder: 'day-first',
      columns: {
        invoiceNumber: 'Ref',
        date: 'When',
        customer: 'Customer',
        net: null,
        vat: null,
        gross: 'Total',
        status: 'Paid?',
      },
      status,
    };
    const found = askQuestions(table, answers).flatMap((q) =>
      q.kind === 'note-amount' ? [`${q.id}=${q.amount.paidPence}`] : [],
    );
    expect(found).toEqual(expected);
  });
});
