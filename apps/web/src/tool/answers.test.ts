import { describe, expect, it } from 'vitest';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  readSheet,
  type Answers,
} from '@tradereports/core';
import { blocks, fitCheck, givenAnswers, reply } from './answers';

const sheet = readSheet(
  [
    'Ref,Date,Customer,Net,VAT,Total,Status',
    'A1,03/11/2026,Dave Smith,100,20,120,Paid',
    'A2,14/11/2026,Jones Ltd,50,10,60,Unpaid',
    'A3,20/11/2026,Brown & Co,200,40,240,Paid',
  ].join('\n'),
);

const open = (answers: Answers) => askQuestions(sheet, answers).filter(blocks);

describe('answering the questions', () => {
  it('starts with a question for each column', () => {
    const kinds = open(emptyAnswers()).map((q) => q.kind);
    expect(kinds.filter((k) => k === 'column')).toHaveLength(7);
  });

  it('records a column answer and stops asking it', () => {
    const answers = reply(emptyAnswers(), { kind: 'column', field: 'gross', header: 'Total' });
    expect(answers.columns.gross).toBe('Total');
    const stillAsked = open(answers).some((q) => q.kind === 'column' && q.field === 'gross');
    expect(stillAsked).toBe(false);
  });

  it('can answer everything from the suggestions on a tidy sheet', () => {
    expect(open(acceptSuggested(sheet, emptyAnswers()))).toHaveLength(0);
  });

  it('lists each answer and can undo it so it is asked again', () => {
    const answers = acceptSuggested(sheet, emptyAnswers());
    const given = givenAnswers(answers);
    const gross = given.find((g) => g.text.startsWith('Total with VAT'));
    expect(gross?.text).toBe('Total with VAT: column "Total"');
    const undone = gross?.undo(answers) ?? answers;
    expect(open(undone).some((q) => q.kind === 'column' && q.field === 'gross')).toBe(true);
  });

  it('describes a column the file does not have', () => {
    const answers = reply(emptyAnswers(), { kind: 'column', field: 'vat', header: null });
    expect(givenAnswers(answers)[0]?.text).toBe('VAT: not in this file');
  });
});

describe('checking a chosen column fits', () => {
  const odd = readSheet(
    [
      'area,month,crimes,population',
      ...Array.from({ length: 20 }, (_, i) => `Town ${i},2026-01,${100 + i},${5000 + i}`),
    ].join('\n'),
  );

  it('lets sensible choices through', () => {
    expect(fitCheck('gross', 'Total', sheet)).toBeNull();
    expect(fitCheck('date', 'Date', sheet)).toBeNull();
    expect(fitCheck('status', 'Status', sheet)).toBeNull();
    expect(fitCheck('customer', 'Customer', sheet)).toBeNull();
  });

  it('warns when a money column has words in it', () => {
    expect(fitCheck('gross', 'area', odd)).toMatch(/aren't amounts of money, for example "Town 0"/);
  });

  it('warns when the paid-or-not column has a different value on most rows', () => {
    expect(fitCheck('status', 'crimes', odd)).toMatch(/"crimes" has 20 different values/);
  });

  it('warns when the customer column is numbers', () => {
    expect(fitCheck('customer', 'population', odd)).toMatch(/are numbers, not names/);
  });

  it('warns when a money column is really a reference or row number', () => {
    const ids = readSheet(
      [
        'ref_id,hdnum,Total',
        ...Array.from({ length: 8 }, (_, i) => `${40 + i * 3},${i + 1},${120 + i}.50`),
      ].join('\n'),
    );
    expect(fitCheck('gross', 'ref_id', ids)).toMatch(/reference number/);
    expect(fitCheck('gross', 'hdnum', ids)).toMatch(/reference number/);
    expect(fitCheck('gross', 'Total', ids)).toBeNull();
  });

  it('warns when a money column counts up one row at a time', () => {
    const rows = readSheet(
      ['Row,Total', ...Array.from({ length: 8 }, (_, i) => `${i + 1},${200 + i * 7}`)].join('\n'),
    );
    expect(fitCheck('gross', 'Row', rows)).toMatch(/row numbers/);
    expect(fitCheck('gross', 'Total', rows)).toBeNull();
  });
});
