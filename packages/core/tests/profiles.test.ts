import { describe, expect, it } from 'vitest';
import { convertSpreadsheet } from '../src/general/invoices';
import { findProfile, makeProfile, reuseAnswers, type Profile } from '../src/general/profiles';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  type Answers,
} from '../src/general/questions';
import { readSheet } from '../src/layout';

const header = 'Ref,When,Customer,Phone,Net,VAT,Total,Paid?';
const october = [
  'A1,13/10/2026,Ann Example,07700 900101,100.00,20.00,120.00,Paid',
  'A2,14/10/2026,Bob Example,07700 900102,80.00,16.00,96.00,Unpaid',
  'A3,15/10/2026,Cat Example,07700 900103,50.00,10.00,60.00,Paid',
  'A4,16/10/2026,Dan Example,07700 900104,40.00,8.00,48.00,Unpaid',
  // the net typed into the phone column, which the user agreed to move
  'A5,17/10/2026,Eve Example,£300.00,,60.00,360.00,Paid',
];
const sheet = (head: string, ...rows: string[]) => readSheet([head, ...rows].join('\n'));

// the user's answers for October: suggestions accepted, and the repair accepted
function answerOctober(): Answers {
  const table = sheet(header, ...october);
  const answers = acceptSuggested(table, emptyAnswers());
  const repair = askQuestions(table, answers).find((q) => q.kind === 'repair');
  if (repair?.kind !== 'repair') throw new Error('expected a repair question');
  return { ...answers, repairs: { [repair.repair.key]: 'accept' } };
}
const saved = makeProfile('My invoices', sheet(header, ...october), answerOctober(), '2026-10-31');

describe('the same sheet next month', () => {
  // November's rows added at the top, one with a status word not seen before
  const november = sheet(
    header,
    'A7,03/11/2026,Fay Example,07700 900106,70.00,14.00,84.00,Part paid',
    'A6,02/11/2026,Ann Example,07700 900101,90.00,18.00,108.00,Paid',
    ...october,
  );

  it('is recognised by its headers, without asking', () => {
    expect(findProfile(november, [saved])).toEqual({ kind: 'exact', profile: saved });
  });

  it('asks only about what is new', () => {
    const { answers, dropped } = reuseAnswers(november, saved);
    expect(dropped).toEqual([]);
    const questions = askQuestions(november, answers);
    expect(questions.map((q) => (q.kind === 'status' ? q.value : q.kind))).toEqual(['Part paid']);
  });

  it('still applies the repair, although the row has moved down', () => {
    const { answers } = reuseAnswers(november, saved);
    const result = convertSpreadsheet(
      november,
      { ...answers, status: { ...answers.status, 'part paid': 'part paid' } },
      { businessId: 't', file: 'november.csv' },
    );
    const moved = result.records.find((r) => r.number === 'A5');
    // from the user's repair, now on row 8, not just worked out as total minus VAT
    expect(moved?.netPence).toEqual({
      origin: 'derived',
      value: 30000,
      rule: 'you moved £300.00 from Phone to Net on row 8',
    });
  });

  it('matches headers whatever their capitals or spacing', () => {
    const shouted = sheet(header.toUpperCase().replace(',', ' , '), ...october);
    expect(findProfile(shouted, [saved])?.kind).toBe('exact');
  });
});

describe('a similar sheet', () => {
  // the paid column renamed: 7 of 8 headers match
  const renamed = sheet(header.replace('Paid?', 'Settled'), ...october.map((r) => r));

  it('is offered, as a question', () => {
    const match = findProfile(renamed, [saved]);
    expect(match).toMatchObject({ kind: 'similar', matching: 7, total: 8 });
    expect(match?.kind === 'similar' && match.question).toBe(
      'This looks like your "My invoices" sheet (7 of 8 columns match). Use the same answers?',
    );
  });

  it('drops the answer about the missing column and asks it again', () => {
    const { answers, dropped } = reuseAnswers(renamed, saved);
    expect(dropped).toEqual([
      'The column "Paid?" is not in this file, so you\'ll be asked again which column is the status.',
    ]);
    // the status words went with the old column, so they are asked again too
    expect(answers.status).toEqual({});
    const first = askQuestions(renamed, answers)[0];
    expect(first).toMatchObject({ kind: 'column', field: 'status', suggested: 'Settled' });
  });
});

describe('choosing a profile', () => {
  const other = makeProfile(
    'Quotes',
    sheet('Quote,Client,Amount,Valid until', 'Q1,Ann,10.00,01/12/2026'),
    emptyAnswers(),
    '2026-10-01',
  );

  it('ignores a sheet that is not like any saved one', () => {
    expect(
      findProfile(sheet('Name,Area,Phone', 'Ann,Wigan,07700 900101'), [saved, other]),
    ).toBeNull();
  });

  it('picks the closest of several', () => {
    const renamed = sheet(header.replace('Paid?', 'Settled'), ...october);
    expect(findProfile(renamed, [other, saved])?.profile.name).toBe('My invoices');
  });

  it('survives being saved as text and read back', () => {
    const copy = JSON.parse(JSON.stringify(saved)) as Profile;
    expect(copy).toEqual(saved);
    expect(findProfile(sheet(header, ...october), [copy])?.kind).toBe('exact');
  });
});
