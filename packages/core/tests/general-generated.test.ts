import { describe, expect, it } from 'vitest';
import { convertSpreadsheet } from '../src/general/invoices';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  statusKey,
  type Answers,
} from '../src/general/questions';
import { readSheet } from '../src/layout';

// The whole flow on 200 random home-made sheets with known true totals: read the layout,
// suggest columns, accept the suggestions, answer what is left as a user would, convert,
// and check the money. Fixed seed, so a failure can be replayed.

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

const PAID = ['Paid', 'paid 3/4', 'Settled', 'Yes', '✓'];
const UNPAID = ['Unpaid', 'chased twice', 'Outstanding', 'No', '✗'];

interface Truth {
  text: string;
  invoices: number;
  grossPence: number;
  owedPence: number;
  vatPence: number;
  // the user's real answer for each header, used where nothing is suggested
  columns: Answers['columns'];
}

function build(seed: number): Truth {
  const r = random(seed);
  const vat = r.next() < 0.6;
  const headers = {
    ref: r.pick(['Inv No', 'Ref', 'Bill #', 'Invoice']),
    date: r.pick(['Date', 'When', 'Invoice date']),
    customer: r.pick(['Customer', 'Client', 'Who for']),
    net: r.pick(['Net', 'Before VAT', 'Ex VAT']),
    vat: r.pick(['VAT', 'Tax']),
    gross: r.pick(['Total', 'Gross', 'inc VAT']),
    status: r.pick(['Paid?', 'Status', 'Settled?']),
  };
  const names = vat
    ? [
        headers.ref,
        headers.date,
        headers.customer,
        headers.net,
        headers.vat,
        headers.gross,
        headers.status,
      ]
    : [headers.ref, headers.date, headers.customer, headers.gross, headers.status];

  const lines: string[] = [];
  if (r.next() < 0.5) lines.push('My jobs 2026', '');
  lines.push(names.join(','));

  let grossPence = 0;
  let owedPence = 0;
  let vatPence = 0;
  const n = r.int(5, 25);
  for (let i = 1; i <= n; i += 1) {
    const net = r.int(40, 1500) * 100 + (r.next() < 0.5 ? 0 : r.int(0, 99));
    const tax = vat ? Math.round(net * 0.2) : 0;
    const gross = net + tax;
    const paid = r.next() < 0.6;
    grossPence += gross;
    vatPence += tax;
    if (!paid) owedPence += gross;
    const money = (p: number) => (p / 100).toFixed(2);
    const day = String(r.int(13, 28)).padStart(2, '0');
    const cells = [
      `R${seed}-${i}`,
      `${day}/0${r.int(1, 9)}/2026`,
      r.pick(['Ann Example', 'Bob Example', 'Cat Example', 'Dan Example']),
      ...(vat ? [money(net), money(tax)] : []),
      money(gross),
      paid ? r.pick(PAID) : r.pick(UNPAID),
    ];
    lines.push(cells.join(','));
    if (i < n && r.next() < 0.05) lines.push('NOTE:,van in for repair');
  }
  if (r.next() < 0.5)
    lines.push(`,,TOTAL,${',,'.repeat(vat ? 1 : 0)}${(grossPence / 100).toFixed(2)},`);

  return {
    text: lines.join('\n'),
    invoices: n,
    grossPence,
    owedPence,
    vatPence,
    columns: {
      invoiceNumber: headers.ref,
      date: headers.date,
      customer: headers.customer,
      net: vat ? headers.net : null,
      vat: vat ? headers.vat : null,
      gross: headers.gross,
      status: headers.status,
    },
  };
}

// a user who accepts the suggestions, then answers the rest from what they know
function answerAll(truth: Truth): Answers {
  const table = readSheet(truth.text);
  let answers = acceptSuggested(table, emptyAnswers());
  for (const question of askQuestions(table, answers)) {
    if (question.kind === 'column') {
      answers = {
        ...answers,
        columns: { ...answers.columns, [question.field]: truth.columns[question.field] ?? null },
      };
    }
  }
  for (const question of askQuestions(table, answers)) {
    if (question.kind === 'status') {
      const meaning = PAID.includes(question.value) ? 'paid' : 'unpaid';
      answers = { ...answers, status: { ...answers.status, [statusKey(question.value)]: meaning } };
    }
    if (question.kind === 'date-order') answers = { ...answers, dateOrder: 'day-first' };
  }
  return answers;
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('the whole flow on 200 generated sheets', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const truth = build(seed);
    const table = readSheet(truth.text);
    const answers = answerAll(truth);

    // the suggestions the user accepted must be the right columns
    for (const [field, header] of Object.entries(truth.columns)) {
      expect(answers.columns[field as keyof Answers['columns']] ?? null).toBe(header);
    }
    expect(askQuestions(table, answers)).toEqual([]);

    const { records, issues } = convertSpreadsheet(table, answers, {
      businessId: 't',
      file: 'f.csv',
    });
    expect(issues).toEqual([]);
    expect(records).toHaveLength(truth.invoices);
    const sum = (amount: (r: (typeof records)[number]) => number) =>
      records.reduce((total, record) => total + amount(record), 0);
    expect(sum((r) => r.grossPence)).toBe(truth.grossPence);
    expect(sum((r) => r.taxPence)).toBe(truth.vatPence);
    expect(sum((r) => r.duePence.value ?? 0)).toBe(truth.owedPence);
  });
});
