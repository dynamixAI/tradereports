import { readFileSync } from 'node:fs';
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

// Blind test files from earlier rounds, kept with what their answer keys said. Each file
// goes through the whole flow with every suggestion accepted, and must still give the
// answers the key gave. Questions with no suggestion get the user's likely answer:
// first option for a column, ignore for a status, day first for dates.

function acceptEverything(text: string) {
  const sheet = readSheet(text);
  let answers = acceptSuggested(sheet, emptyAnswers());
  // the ids of the repairs accepted, which name them by row
  const accepted: string[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (const q of askQuestions(sheet, answers)) {
      if (q.kind === 'column') {
        answers = {
          ...answers,
          columns: { ...answers.columns, [q.field]: q.options[0]?.header ?? null },
        };
      } else if (q.kind === 'status') {
        answers = { ...answers, status: { ...answers.status, [statusKey(q.value)]: 'ignore' } };
      } else if (q.kind === 'date-order') {
        answers = { ...answers, dateOrder: 'day-first' };
      } else if (q.kind === 'year') {
        answers = { ...answers, years: { ...answers.years, [q.value]: q.suggested ?? 2026 } };
      } else if (q.kind === 'repair') {
        accepted.push(q.repair.id);
        answers = { ...answers, repairs: { ...answers.repairs, [q.repair.key]: 'accept' } };
      } else if (q.kind === 'note-amount') {
        accepted.push(q.id);
        answers = { ...answers, repairs: { ...answers.repairs, [q.key]: 'accept' } };
      } else if (q.kind === 'same-customer') {
        answers = { ...answers, names: { ...answers.names, [q.match.id]: 'same' } };
      } else if (q.kind === 'split-customer') {
        answers = { ...answers, names: { ...answers.names, [q.split.id]: 'separate' } };
      }
    }
  }
  return { sheet, answers, accepted };
}

function check(text: string) {
  const { sheet, answers, accepted } = acceptEverything(text);
  const asked = askQuestions(sheet, emptyAnswers()).length;
  const { records } = convertSpreadsheet(sheet, answers as Answers, { businessId: 'r', file: 'r' });
  const repairs = [...accepted].sort();
  const owed = records.reduce((sum, r) => sum + (r.duePence.value ?? 0), 0);
  const paidFromNotes = Object.fromEntries(
    records.flatMap((r) =>
      r.paidPence.origin === 'derived' && r.paidPence.rule.startsWith('you confirmed the note')
        ? [[`row ${r.source.rows[0] ?? 0}`, r.paidPence.value]]
        : [],
    ),
  );
  return { asked, invoices: records.length, repairs, owed, paidFromNotes };
}

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/regression/${name}`, import.meta.url), 'utf8');

// round 8: part payments in notes and shifted rows (answer key 2026-11-08)
describe('regression: part payments and shifted rows', () => {
  it('blind-1, fencing: 2 shifts, 3 part payments, £12,300 owed', () => {
    const result = check(fixture('notes-and-shifts/blind-1.csv'));
    expect(result.repairs).toEqual(
      expect.arrayContaining(['shift:11:Email:right', 'shift:16:Description:left']),
    );
    expect(result.paidFromNotes).toEqual({ 'row 6': 100000, 'row 9': 200000, 'row 13': 126000 });
    expect(result.invoices).toBe(16);
    expect(result.owed).toBe(1230000);
  });

  it('blind-2, joinery: 2 shifts, 3 part payments, £16,400 owed', () => {
    const result = check(fixture('notes-and-shifts/blind-2.csv'));
    expect(result.repairs).toEqual(
      expect.arrayContaining(['shift:7:Contact Tel:left', 'shift:11:Site Postcode:right']),
    );
    expect(result.paidFromNotes).toEqual({ 'row 4': 180000, 'row 8': 100000, 'row 12': 150000 });
    expect(result.invoices).toBe(16);
    expect(result.owed).toBe(1640000);
  });

  it('blind-3, catering: 2 shifts, 3 part payments, £11,240 owed', () => {
    const result = check(fixture('notes-and-shifts/blind-3.csv'));
    expect(result.repairs).toEqual(
      expect.arrayContaining(['shift:11:Accounts Email:left', 'shift:16:Premises Postcode:right']),
    );
    expect(result.paidFromNotes).toEqual({ 'row 8': 60000, 'row 12': 100000, 'row 18': 210000 });
    expect(result.invoices).toBe(16);
    expect(result.owed).toBe(1124000);
  });
});
