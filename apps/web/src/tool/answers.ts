import {
  parseMoney,
  readDate,
  readDayMonth,
  statusKey,
  type Answers,
  type CsvTable,
  type Field,
  type Question,
  type StatusMeaning,
} from '@tradereports/core';

// plain names for the things we look for in a home-made sheet
export const FIELD_NAMES: Record<Field, string> = {
  invoiceNumber: 'Invoice number',
  date: 'Date',
  customer: 'Customer',
  net: 'Amount before VAT',
  vat: 'VAT',
  gross: 'Total with VAT',
  status: 'Paid or not',
};

export const MEANING_NAMES: Record<StatusMeaning, string> = {
  paid: 'Paid',
  unpaid: 'Not paid',
  'part paid': 'Part paid',
  ignore: 'Not an invoice, leave it out',
};

// questions that must be answered before the report; the rest are optional checks
export function blocks(q: Question): boolean {
  return q.kind === 'column' || q.kind === 'date-order' || q.kind === 'status' || q.kind === 'year';
}

// what the visitor can pick
export type Reply =
  | { kind: 'column'; field: Field; header: string | null }
  | { kind: 'date-order'; order: 'day-first' | 'month-first' }
  | { kind: 'status'; value: string; meaning: StatusMeaning }
  | { kind: 'year'; value: string; year: number }
  // repairs and amounts in notes are both answered in answers.repairs
  | { kind: 'repair'; key: string; accept: boolean }
  | { kind: 'name'; id: string; choice: 'same' | 'separate' };

export function reply(answers: Answers, r: Reply): Answers {
  switch (r.kind) {
    case 'column':
      return { ...answers, columns: { ...answers.columns, [r.field]: r.header } };
    case 'date-order':
      return { ...answers, dateOrder: r.order };
    case 'status':
      return { ...answers, status: { ...answers.status, [statusKey(r.value)]: r.meaning } };
    case 'year':
      return { ...answers, years: { ...answers.years, [r.value]: r.year } };
    case 'repair':
      return {
        ...answers,
        repairs: { ...answers.repairs, [r.key]: r.accept ? 'accept' : 'reject' },
      };
    case 'name':
      return { ...answers, names: { ...answers.names, [r.id]: r.choice } };
  }
}

// one line in the "your answers" list, and how to undo it
export interface Given {
  text: string;
  undo: (answers: Answers) => Answers;
}

// drop one key from a record without touching the rest
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

export function givenAnswers(answers: Answers): Given[] {
  const list: Given[] = [];
  for (const [field, header] of Object.entries(answers.columns)) {
    const name = FIELD_NAMES[field as Field];
    list.push({
      text: header ? `${name}: column "${header}"` : `${name}: not in this file`,
      undo: (a) => ({ ...a, columns: without(a.columns, field) }),
    });
  }
  if (answers.dateOrder) {
    list.push({
      text: answers.dateOrder === 'day-first' ? 'Dates: day first (UK)' : 'Dates: month first (US)',
      undo: (a) => {
        const copy = { ...a };
        delete copy.dateOrder;
        return copy;
      },
    });
  }
  for (const [key, meaning] of Object.entries(answers.status)) {
    list.push({
      text: `${key ? `"${key}"` : 'A blank'} means ${MEANING_NAMES[meaning].toLowerCase()}`,
      undo: (a) => ({ ...a, status: without(a.status, key) }),
    });
  }
  for (const [value, year] of Object.entries(answers.years)) {
    list.push({
      text: `"${value}" is in ${year}`,
      undo: (a) => ({ ...a, years: without(a.years, value) }),
    });
  }
  const fixes = Object.values(answers.repairs).filter((v) => v === 'accept').length;
  const left = Object.values(answers.repairs).length - fixes;
  if (fixes + left > 0) {
    list.push({
      text: `${fixes} ${fixes === 1 ? 'fix' : 'fixes'} accepted, ${left} left as typed`,
      undo: (a) => ({ ...a, repairs: {} }),
    });
  }
  const names = Object.values(answers.names);
  if (names.length > 0) {
    list.push({
      text: `${names.length} customer ${names.length === 1 ? 'name' : 'names'} checked`,
      undo: (a) => ({ ...a, names: {} }),
    });
  }
  return list;
}

// most of a column must fit before we use it without asking
const FIT_SHARE = 0.6;
// a paid-or-not column has a handful of words, not a different value on every row
const MAX_STATUS_VALUES = 12;
// headers that name a reference, such as "id", "hdnum" or "Ref"
const ID_HEADER = /(^|[^a-z])(id|ref|code)([^a-z]|$)|num/i;

// a plain warning when a chosen column doesn't look like the thing asked for; null when it fits
export function fitCheck(field: Field, header: string, table: CsvTable): string | null {
  const values = table.rows.map((row) => (row[header] ?? '').trim()).filter((v) => v !== '');
  if (values.length === 0) return `"${header}" is empty in every row.`;
  const share = (test: (v: string) => boolean) => values.filter(test).length / values.length;
  const isMoney = (v: string) => parseMoney(v) !== null;
  const example = (test: (v: string) => boolean) => values.find((v) => !test(v)) ?? values[0];

  if (field === 'gross' || field === 'net' || field === 'vat') {
    if (share(isMoney) < FIT_SHARE) {
      return `Most values in "${header}" aren't amounts of money, for example "${example(isMoney)}".`;
    }
    // whole numbers under a name like "id" or "num", or counting 1, 2, 3, are labels
    const whole = values.every((v) => /^\d+$/.test(v));
    if (whole && ID_HEADER.test(header)) {
      return `"${header}" looks like a reference number, not an amount of money.`;
    }
    if (
      whole &&
      values.length >= 5 &&
      values.every((v, i) => i === 0 || +v === +(values[i - 1] ?? '') + 1)
    ) {
      return `"${header}" counts up by one on each row, so it looks like row numbers, not money.`;
    }
    return null;
  }
  if (field === 'date') {
    // either way round counts here; which way is asked later
    const isDate = (v: string) =>
      readDate(v, 'day-first') !== null ||
      readDate(v, 'month-first') !== null ||
      readDayMonth(v) !== null;
    return share(isDate) < FIT_SHARE
      ? `Most values in "${header}" aren't dates, for example "${example(isDate)}".`
      : null;
  }
  if (field === 'status') {
    const distinct = new Set(values.map((v) => v.toLowerCase())).size;
    return distinct > MAX_STATUS_VALUES
      ? `"${header}" has ${distinct} different values. A paid-or-not column usually has just a few, like Paid and Unpaid.`
      : null;
  }
  if (field === 'customer') {
    return share(isMoney) >= FIT_SHARE
      ? `Most values in "${header}" are numbers, not names.`
      : null;
  }
  return null;
}
