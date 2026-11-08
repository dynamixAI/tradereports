import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  type Answers,
  type Question,
} from '../src/general/questions';

const sheet = readSheet(
  [
    'Ref,When,Customer,Net,VAT,Total,Paid?',
    'A1,03/03/2026,Ann Example,100.00,20.00,120.00,paid 4/3',
    'A2,14/03/2026,Bob Example,80.00,16.00,96.00,chased twice',
    'A3,20/03/2026,Ann Example,50.00,10.00,60.00,',
    'A4,27/03/2026,Cat Example,40.00,8.00,48.00,SET',
  ].join('\n'),
);
const kinds = (questions: Question[]) => questions.map((q) => q.kind);
const allColumns: Answers['columns'] = {
  invoiceNumber: 'Ref',
  date: 'When',
  customer: 'Customer',
  net: 'Net',
  vat: 'VAT',
  gross: 'Total',
  status: 'Paid?',
};

describe('askQuestions', () => {
  it('asks about columns first, with a suggestion and the evidence for each', () => {
    const questions = askQuestions(sheet, emptyAnswers());
    expect(new Set(kinds(questions))).toEqual(new Set(['column']));
    const gross = questions.find((q) => q.kind === 'column' && q.field === 'gross');
    expect(gross).toMatchObject({ suggested: 'Total', required: true });
    expect(gross?.kind === 'column' && gross.options[0]?.evidence.length).toBeGreaterThan(0);
  });

  it('asks what each status value means once the status column is chosen', () => {
    const questions = askQuestions(sheet, { ...emptyAnswers(), columns: allColumns });
    const status = questions.filter((q) => q.kind === 'status');
    expect(status.map((q) => [q.value, q.suggested])).toEqual([
      ['paid 4/3', 'paid'],
      ['chased twice', 'unpaid'],
      // a blank and a code nobody can read are left to the user
      ['', null],
      ['SET', null],
    ]);
  });

  it('does not ask again what has been answered', () => {
    const answers: Answers = {
      ...emptyAnswers(),
      columns: allColumns,
      status: { 'paid 4/3': 'paid', 'chased twice': 'unpaid', '': 'unpaid', set: 'paid' },
    };
    expect(askQuestions(sheet, answers)).toEqual([]);
  });

  it('matches status answers ignoring case and outer spaces', () => {
    const answers: Answers = {
      ...emptyAnswers(),
      columns: allColumns,
      status: { 'paid 4/3': 'paid', 'chased twice': 'unpaid', '': 'unpaid', ' set ': 'paid' },
    };
    // " set " is not the key; keys are trimmed and lower case, so SET is still asked
    expect(askQuestions(sheet, answers).map((q) => q.kind === 'status' && q.value)).toEqual([
      'SET',
    ]);
  });

  it('asks again for a required field answered as none', () => {
    const questions = askQuestions(sheet, {
      ...emptyAnswers(),
      columns: { ...allColumns, gross: null },
      status: { 'paid 4/3': 'paid', 'chased twice': 'unpaid', '': 'unpaid', set: 'paid' },
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ kind: 'column', field: 'gross', required: true });
  });
});

describe('date questions', () => {
  const dated = (dates: string[]) =>
    readSheet(
      ['Ref,When,Customer,Total', ...dates.map((d, i) => `A${i},${d},Ann,${10 + i}.00`)].join('\n'),
    );
  const columns = { invoiceNumber: 'Ref', date: 'When', customer: 'Customer', gross: 'Total' };
  const answered = {
    ...emptyAnswers(),
    columns: { ...columns, net: null, vat: null, status: null },
  };

  it('asks for the date order when every date fits both', () => {
    const questions = askQuestions(dated(['03/04/2026', '05/06/2026', '07/08/2026']), answered);
    expect(kinds(questions)).toEqual(['date-order']);
  });

  it('does not ask when the dates show the order', () => {
    expect(askQuestions(dated(['03/04/2026', '25/06/2026']), answered)).toEqual([]);
  });

  it('suggests the year for a date with none from the nearest full date above', () => {
    const questions = askQuestions(
      dated(['20/12/2025', '29th December', '04/01/2026', '9 Jan']),
      answered,
    );
    expect(questions.map((q) => q.kind === 'year' && [q.value, q.suggested])).toEqual([
      ['29th December', 2025],
      ['9 Jan', 2026],
    ]);
  });

  it('uses the nearest date below when there is none above', () => {
    const questions = askQuestions(dated(['5th March', '20/03/2026', '25/03/2026']), answered);
    expect(questions[0]).toMatchObject({ kind: 'year', value: '5th March', suggested: 2026 });
  });
});

describe('acceptSuggested', () => {
  it('answers what it can and leaves the rest', () => {
    const answers = acceptSuggested(sheet, emptyAnswers());
    expect(answers.columns).toEqual(allColumns);
    expect(answers.status).toEqual({ 'paid 4/3': 'paid', 'chased twice': 'unpaid' });
    expect(askQuestions(sheet, answers).map((q) => q.kind === 'status' && q.value)).toEqual([
      '',
      'SET',
    ]);
  });

  it('leaves a tie for the user', () => {
    const tied = readSheet(
      [
        'Ref,Business,Contact,Amount',
        'X1,Acme Lettings,Ann Example,120.00',
        'X2,Hill Homes,Bob Example,96.50',
        'X3,Acme Lettings,Cat Example,72.25',
      ].join('\n'),
    );
    const answers = acceptSuggested(tied, emptyAnswers());
    expect('customer' in answers.columns).toBe(false);
  });
});
