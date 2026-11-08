import type { CsvTable } from '../csv';
import { readDate, readDayMonth, type DateOrder } from '../dates';
import { scanColumn } from '../scan';
import { findNameMatches, findNameSplits, type NameMatch, type NameSplit } from '../names';
import { applyRepairs, findRepairs, kindOf, type Repair } from '../repairs';
import { parseMoney } from '../money';
import { readNoteAmount, type NoteAmount } from '../note-amounts';
import { readStatus } from '../status';
import { FIELDS, suggestColumns, type Field } from '../suggest';

// The questions to ask before a home-made file can be converted (ADR 0006). The engine
// decides what to ask; the screen only shows it. Answers are plain data, so they can be
// saved and reused the next time the same spreadsheet is uploaded.

export type StatusMeaning = 'paid' | 'unpaid' | 'part paid' | 'ignore';

export interface Answers {
  // the header chosen for each field, or null for "this file has none"
  columns: Partial<Record<Field, string | null>>;
  dateOrder?: DateOrder;
  // what each status value means, keyed by statusKey(value)
  status: Record<string, StatusMeaning>;
  // the year for each date written with none, keyed by the value as typed
  years: Record<string, number>;
  // repair suggestions (ADR 0007), keyed by repair id; unanswered means not applied
  repairs: Record<string, 'accept' | 'reject'>;
  // possible same customers, keyed by match id: unanswered means kept apart. Possible
  // different customers with one name, keyed by split id: unanswered means kept together
  names: Record<string, 'same' | 'separate'>;
}

export type Question =
  | {
      kind: 'column';
      field: Field;
      required: boolean;
      // null when there is no suggestion, or the top two are level
      suggested: string | null;
      // true when the evidence says the file has no such column (no VAT found, say)
      noneSuggested: boolean;
      options: { header: string; evidence: string[] }[];
    }
  | { kind: 'date-order'; column: string; examples: string[] }
  | {
      kind: 'status';
      column: string;
      value: string;
      count: number;
      suggested: StatusMeaning | null;
    }
  | { kind: 'year'; column: string; value: string; suggested: number | null }
  // never blocks converting: an unanswered repair is simply not applied
  | { kind: 'repair'; repair: Repair }
  // never blocks converting either: unanswered names are kept apart
  | { kind: 'same-customer'; match: NameMatch }
  | { kind: 'split-customer'; split: NameSplit }
  // the amount paid on a part-paid invoice, read from a note; answered in answers.repairs
  | { kind: 'note-amount'; id: string; row: number; amount: NoteAmount };

export const REQUIRED_FIELDS: Field[] = ['invoiceNumber', 'customer', 'gross'];

export function emptyAnswers(): Answers {
  return { columns: {}, status: {}, years: {}, repairs: {}, names: {} };
}

// status values are matched ignoring case and spaces at the ends; a blank is its own value
export function statusKey(value: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

// What is still unanswered. Columns come first; the date and status questions depend on
// which columns were chosen, so they appear once those are answered.
export function askQuestions(table: CsvTable, answers: Answers): Question[] {
  const questions: Question[] = [];
  const suggestions = suggestColumns(table);

  for (const field of FIELDS) {
    if (field in answers.columns) continue;
    const { best, tie, candidates } = suggestions.fields[field];
    const required = REQUIRED_FIELDS.includes(field);
    // an optional field with nothing in its favour is suggested as "none"; for net and
    // VAT that also needs the arithmetic to have found no VAT
    const nothing = !best && !tie && candidates.every((c) => c.score <= 0);
    const vatField = field === 'net' || field === 'vat';
    questions.push({
      kind: 'column',
      field,
      required,
      suggested: best,
      noneSuggested: !required && nothing && (!vatField || !suggestions.vatFound),
      options: candidates.map((c) => ({ header: c.header, evidence: c.evidence })),
    });
  }
  // a required field answered "none" can't be converted, so it is asked again
  for (const field of REQUIRED_FIELDS) {
    if (field in answers.columns && !answers.columns[field]) {
      const { best, candidates } = suggestions.fields[field];
      questions.push({
        kind: 'column',
        field,
        required: true,
        suggested: best,
        noneSuggested: false,
        options: candidates.map((c) => ({ header: c.header, evidence: c.evidence })),
      });
    }
  }

  const values = (header: string) =>
    table.rows.map((row) => row[header] ?? null).filter((v): v is string => v !== null);

  const dateColumn = answers.columns.date;
  if (dateColumn) {
    const scan = scanColumn(values(dateColumn));
    if ((scan.dateOrder === 'ambiguous' || scan.dateOrder === 'mixed') && !answers.dateOrder) {
      questions.push({
        kind: 'date-order',
        column: dateColumn,
        examples: values(dateColumn).slice(0, 3),
      });
    }
    questions.push(...yearQuestions(table, dateColumn, answers));
  }

  const statusColumn = answers.columns.status;
  if (statusColumn) {
    const counts = new Map<string, { value: string; count: number }>();
    for (const row of table.rows) {
      const value = row[statusColumn] ?? '';
      const key = statusKey(value);
      const entry = counts.get(key) ?? { value: value.trim(), count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    for (const [key, { value, count }] of counts) {
      if (key in answers.status) continue;
      questions.push({
        kind: 'status',
        column: statusColumn,
        value,
        count,
        suggested: suggestMeaning(value),
      });
    }
  }

  for (const repair of findRepairs(table)) {
    if (!(repair.id in answers.repairs)) questions.push({ kind: 'repair', repair });
  }

  // names are compared after the accepted repairs, as a repair can change a customer cell
  const customerColumn = answers.columns.customer;
  if (customerColumn) {
    const repaired = repairedTable(table, answers).table;
    for (const match of findNameMatches(repaired, customerColumn)) {
      if (!(match.id in answers.names)) questions.push({ kind: 'same-customer', match });
    }
    // amounts written in notes, for invoices the user said are part paid
    for (const found of noteAmounts(table, answers)) {
      if (!(found.id in answers.repairs)) questions.push({ kind: 'note-amount', ...found });
    }

    // two customers under one name, worked out after the merges the user accepted
    for (const split of findNameSplits(
      mergedTable(repaired, customerColumn, answers),
      customerColumn,
    )) {
      if (!(split.id in answers.names)) questions.push({ kind: 'split-customer', split });
    }
  }

  return questions;
}

// A suggestion only. A payment method written in the status column ("Cash handed over")
// suggests paid; a blank or a code we can't read is left to the user.
function suggestMeaning(value: string): StatusMeaning | null {
  const reading = readStatus(value);
  if (reading === 'paid' || reading === 'unpaid' || reading === 'part paid') return reading;
  if (reading === 'method') return 'paid';
  return null;
}

// Dates typed with no year ("29th July"). The suggested year comes from the nearest row
// above with a full date, or below if there is none above; the user confirms it.
function yearQuestions(table: CsvTable, column: string, answers: Answers): Question[] {
  const cells = table.rows.map((row) => row[column] ?? null);
  const years = cells.map((cell) => {
    const full = readDate(cell, answers.dateOrder ?? 'day-first');
    return full ? Number(full.slice(0, 4)) : null;
  });
  const asked = new Set<string>();
  const questions: Question[] = [];
  cells.forEach((cell, index) => {
    if (!cell || years[index] !== null || !readDayMonth(cell)) return;
    if (cell in answers.years || asked.has(cell)) return;
    asked.add(cell);
    const above = years
      .slice(0, index)
      .reverse()
      .find((year) => year !== null);
    const below = years.slice(index + 1).find((year) => year !== null);
    questions.push({ kind: 'year', column, value: cell, suggested: above ?? below ?? null });
  });
  return questions;
}

// "Accept the suggestions": answers every open question that has a clear suggestion, and
// leaves ties, unknown codes and blanks for the user. Goes round until nothing changes,
// as answering the columns brings up the date and status questions.
export function acceptSuggested(table: CsvTable, answers: Answers): Answers {
  let current: Answers = {
    columns: { ...answers.columns },
    status: { ...answers.status },
    years: { ...answers.years },
    repairs: { ...answers.repairs },
    names: { ...answers.names },
    ...(answers.dateOrder ? { dateOrder: answers.dateOrder } : {}),
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const question of askQuestions(table, current)) {
      if (question.kind === 'column' && (question.suggested !== null || question.noneSuggested)) {
        current = {
          ...current,
          columns: { ...current.columns, [question.field]: question.suggested },
        };
        changed = true;
      } else if (question.kind === 'status' && question.suggested !== null) {
        current = {
          ...current,
          status: { ...current.status, [statusKey(question.value)]: question.suggested },
        };
        changed = true;
      } else if (question.kind === 'year' && question.suggested !== null) {
        current = { ...current, years: { ...current.years, [question.value]: question.suggested } };
        changed = true;
      }
    }
  }
  return current;
}

// The table with the user's accepted repairs applied; the original is not changed.
export function repairedTable(table: CsvTable, answers: Answers) {
  return applyRepairs(table, findRepairs(table), (r) => answers.repairs[r.id] === 'accept');
}

// The customer column with the spellings the user said are the same put together.
export function mergedTable(table: CsvTable, customerColumn: string, answers: Answers): CsvTable {
  const sameAs = new Map(
    findNameMatches(table, customerColumn)
      .filter((m) => answers.names[m.id] === 'same')
      .map((m) => [m.variant, m.canonical]),
  );
  return {
    ...table,
    rows: table.rows.map((row) => {
      const name = row[customerColumn];
      return name && sameAs.has(name)
        ? { ...row, [customerColumn]: sameAs.get(name) ?? name }
        : row;
    }),
  };
}

// For each part-paid invoice, the amount its notes give, if they give exactly one. Notes
// are the status cell and any cell of plain text in a column not used for another field.
export function noteAmounts(
  table: CsvTable,
  answers: Answers,
): { id: string; row: number; amount: NoteAmount }[] {
  const { status: statusColumn, gross: grossColumn } = answers.columns;
  if (!statusColumn || !grossColumn) return [];
  const used = new Set(Object.values(answers.columns).filter((h): h is string => !!h));
  const repaired = repairedTable(table, answers).table;
  const found: { id: string; row: number; amount: NoteAmount }[] = [];
  repaired.rows.forEach((row, index) => {
    if (answers.status[statusKey(row[statusColumn] ?? null)] !== 'part paid') return;
    const gross = parseMoney(row[grossColumn] ?? '');
    if (gross === null || gross <= 0) return;
    const notes = [
      row[statusColumn],
      ...repaired.headers
        .filter((h) => !used.has(h))
        .map((h) => row[h])
        .filter((v) => v && kindOf(v) === null && /[a-z]/i.test(v)),
    ].filter((v): v is string => !!v);
    const readings = notes
      .map((note) => readNoteAmount(note, gross))
      .filter((r): r is NoteAmount => r !== null);
    const [first] = readings;
    // notes that disagree can't be used
    if (!first || readings.some((r) => r.paidPence !== first.paidPence)) return;
    const rowNumber = repaired.rowNumbers[index] ?? index + 2;
    found.push({ id: `paid:${rowNumber}`, row: rowNumber, amount: first });
  });
  return found;
}
