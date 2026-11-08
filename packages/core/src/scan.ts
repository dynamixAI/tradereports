import { cleanPostcode, readEmails, readPhones, readYesNo } from './clean';
import type { CsvTable } from './csv';
import { isExcelSerial, isImpossibleDate, numericDateParts, readDate, readDayMonth } from './dates';
import { parseMoney } from './money';

export type ValueKind =
  'money' | 'date' | 'postcode' | 'phone' | 'email' | 'yes/no' | 'whole number';

// what the dates in a column tell us about their order
export type DateOrderFinding =
  | 'day-first'
  | 'month-first'
  // numeric dates that fit both orders: the user has to say
  | 'ambiguous'
  // some rows are only possible one way, others only the other way
  | 'mixed'
  // dates that need no order: 2026-11-03, Nov 03, 2026, or Excel date numbers
  | 'not needed';

export interface ColumnScan {
  filled: number;
  empty: number;
  // the share of filled cells (0 to 1) that read as each kind
  share: Record<ValueKind, number>;
  // null when the column doesn't hold dates
  dateOrder: DateOrderFinding | null;
  excelDates: boolean;
  // dates with no year ("29th July") and dates that can't be real ("31/09/2025")
  noYear: string[];
  impossible: string[];
  // every filled value different: a sign of an ID column
  unique: boolean;
  // the most common values, for mapping status words
  topValues: { value: string; count: number }[];
  // plain-English lines shown to the user
  evidence: string[];
}

const KINDS: ValueKind[] = [
  'money',
  'date',
  'postcode',
  'phone',
  'email',
  'yes/no',
  'whole number',
];

const DESCRIPTIONS: Record<ValueKind, string> = {
  money: 'money amounts',
  date: 'dates',
  postcode: 'UK postcodes',
  phone: 'UK phone numbers',
  email: 'email addresses',
  'yes/no': 'yes or no',
  'whole number': 'whole numbers',
};

// Describe a column by what is in it, not what it is called.
export function scanColumn(values: (string | null)[]): ColumnScan {
  const filled = values.filter((value): value is string => value !== null && value.trim() !== '');
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<ValueKind, number>;

  let dayFirstOnly = 0;
  let monthFirstOnly = 0;
  let numericDates = 0;
  let otherDates = 0;
  let serials = 0;
  const noYear: string[] = [];
  const impossible: string[] = [];

  for (const value of filled) {
    const phones = readPhones(value);
    const isPhone = phones.phones.length > 0 && phones.rejected.length === 0;
    if (isPhone) counts.phone += 1;
    // "07700 900001" also reads as a number, but a phone number is never money
    if (!isPhone && parseMoney(value) !== null) counts.money += 1;
    if (/^\d+$/.test(value.trim())) counts['whole number'] += 1;
    if (cleanPostcode(value).value !== null) counts.postcode += 1;
    const emails = readEmails(value);
    if (emails.emails.length > 0 && emails.rejected.length === 0) counts.email += 1;
    if (readYesNo(value).origin !== 'unknown') counts['yes/no'] += 1;

    // dates: numeric ones only count as dates if some order makes them valid
    const parts = numericDateParts(value);
    if (parts) {
      const asDayFirst = readDate(value, 'day-first');
      const asMonthFirst = readDate(value, 'month-first');
      if (asDayFirst || asMonthFirst) {
        counts.date += 1;
        numericDates += 1;
        if (asDayFirst && !asMonthFirst) dayFirstOnly += 1;
        if (asMonthFirst && !asDayFirst) monthFirstOnly += 1;
      }
    } else if (isExcelSerial(value.trim())) {
      serials += 1;
    } else if (readDate(value) !== null) {
      counts.date += 1;
      otherDates += 1;
    } else if (readDayMonth(value)) {
      noYear.push(value);
    }
    if (isImpossibleDate(value)) impossible.push(value);
  }

  const total = filled.length;
  const share = Object.fromEntries(
    KINDS.map((kind) => [kind, total === 0 ? 0 : counts[kind] / total]),
  ) as Record<ValueKind, number>;

  // a column of five-digit numbers in the right range is most likely Excel dates
  const excelDates = total > 0 && serials / total >= 0.9;
  if (excelDates) share.date = serials / total;

  let dateOrder: DateOrderFinding | null = null;
  if (share.date >= 0.5) {
    if (dayFirstOnly > 0 && monthFirstOnly > 0) dateOrder = 'mixed';
    else if (dayFirstOnly > 0) dateOrder = 'day-first';
    else if (monthFirstOnly > 0) dateOrder = 'month-first';
    else if (numericDates > 0) dateOrder = 'ambiguous';
    else if (otherDates > 0 || excelDates) dateOrder = 'not needed';
  }

  const tally = new Map<string, number>();
  for (const value of filled) tally.set(value, (tally.get(value) ?? 0) + 1);
  const topValues = [...tally]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);

  return {
    filled: total,
    empty: values.length - total,
    share,
    dateOrder,
    excelDates,
    noYear,
    impossible,
    unique: total > 1 && tally.size === total,
    topValues,
    evidence: describe(share, dateOrder, excelDates, total, tally.size, noYear, impossible),
  };
}

// Scan every column of a table, keyed by header.
export function scanTable(table: CsvTable): Record<string, ColumnScan> {
  return Object.fromEntries(
    table.headers.map((header) => [
      header,
      scanColumn(table.rows.map((row) => row[header] ?? null)),
    ]),
  );
}

function describe(
  share: Record<ValueKind, number>,
  dateOrder: DateOrderFinding | null,
  excelDates: boolean,
  filled: number,
  distinct: number,
  noYear: string[] = [],
  impossible: string[] = [],
): string[] {
  if (filled === 0) return ['Every cell is empty.'];
  const lines: string[] = [];
  // only mention kinds that describe at least half the column, strongest first
  const strong = KINDS.filter((kind) => share[kind] >= 0.5).sort((a, b) => share[b] - share[a]);
  for (const kind of strong) {
    // whole numbers are also money and phones are also whole numbers; say the more specific thing
    if (kind === 'money' && (strong.includes('whole number') || strong.includes('date'))) continue;
    if (kind === 'whole number' && strong.includes('date')) continue;
    // a column of whole numbers could be pounds without pence or reference numbers;
    // the arithmetic across columns decides later, so say both
    if (kind === 'whole number') {
      lines.push(
        `${Math.round(share[kind] * 100)}% are whole numbers, which could be amounts in whole pounds or reference numbers.`,
      );
      continue;
    }
    lines.push(`${Math.round(share[kind] * 100)}% are ${DESCRIPTIONS[kind]}.`);
  }
  if (excelDates) lines.push('These look like Excel date numbers.');
  if (dateOrder === 'day-first') lines.push('Dates are day first (some days are above 12).');
  if (dateOrder === 'month-first') lines.push('Dates are month first (some months are above 12).');
  if (dateOrder === 'ambiguous')
    lines.push('Dates could be day first or month first. Please say which.');
  if (dateOrder === 'mixed') lines.push('Dates are in both orders, so some must be wrong.');
  if (noYear.length > 0)
    lines.push(
      `${count(noYear.length, 'date has', 'dates have')} no year, such as "${noYear[0] ?? ''}". The year will need confirming.`,
    );
  if (impossible.length > 0)
    lines.push(
      `${count(impossible.length, 'date is', 'dates are')} not a real date, such as "${impossible[0] ?? ''}".`,
    );
  if (distinct === filled && filled > 1) lines.push('Every value is different.');
  else if (distinct <= 10 && filled >= 10) lines.push(`Only ${distinct} different values.`);
  if (lines.length === 0) lines.push('Mostly text.');
  return lines;
}

// "1 date has", "2 dates have"
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// whole numbers that mostly go up by one, like 1041, 1042, 1043
export function countsUp(cells: string[]): boolean {
  if (cells.length < 3 || !cells.every((c) => /^\d+$/.test(c.trim()))) return false;
  const sorted = [...new Set(cells.map(Number))].sort((x, y) => x - y);
  let steps = 0;
  for (let i = 1; i < sorted.length; i += 1)
    if ((sorted[i] ?? 0) - (sorted[i - 1] ?? 0) === 1) steps += 1;
  return steps / (sorted.length - 1) >= 0.6;
}
