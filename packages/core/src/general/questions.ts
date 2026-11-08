import type { CsvTable } from '../csv';
import { readDate, readDayMonth, type DateOrder } from '../dates';
import { scanColumn } from '../scan';
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
}

export type Question =
  | {
      kind: 'column';
      field: Field;
      required: boolean;
      // null when there is no suggestion, or the top two are level
      suggested: string | null;
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
  | { kind: 'year'; column: string; value: string; suggested: number | null };

export const REQUIRED_FIELDS: Field[] = ['invoiceNumber', 'customer', 'gross'];

export function emptyAnswers(): Answers {
  return { columns: {}, status: {}, years: {} };
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
    const { best, candidates } = suggestions.fields[field];
    questions.push({
      kind: 'column',
      field,
      required: REQUIRED_FIELDS.includes(field),
      suggested: best,
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

  return questions;
}

// A suggestion only; a blank, a payment method or a code we can't read is left to the user.
function suggestMeaning(value: string): StatusMeaning | null {
  const reading = readStatus(value);
  if (reading === 'paid' || reading === 'unpaid' || reading === 'part paid') return reading;
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
    ...(answers.dateOrder ? { dateOrder: answers.dateOrder } : {}),
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const question of askQuestions(table, current)) {
      if (question.kind === 'column' && question.suggested !== null) {
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
