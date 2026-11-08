// Reading dates whatever format a spreadsheet uses, once we know which order it is in.

export type DateOrder = 'day-first' | 'month-first';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// a real month name or its usual short form, so "Marbles" is not March
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

// 2026-11-03, optionally followed by a time
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/;
// 03/11/2026, 3-11-26, 03.11.2026
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
// Nov 03, 2026 (Jobber), Sept 3rd 2026
const MONTH_NAME_FIRST = new RegExp(
  `^${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{2}|\\d{4})$`,
  'i',
);
// 3 Nov 2026, 03-Nov-26, 3/Nov/26, 3rd November 2026
const DAY_FIRST_NAME = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?[ /.-]${MONTH}\\.?[ /.-](\\d{2}|\\d{4})$`,
  'i',
);
// a weekday in front adds nothing: "Tue 3 Nov 2026", "Tuesday, 3rd November 2026"
const WEEKDAY = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,? /i;

// Excel stores dates as days since 30 Dec 1899. 20000 to 80000 covers 1954 to 2119.
const EXCEL_MIN = 20000;
const EXCEL_MAX = 80000;

export function isExcelSerial(text: string): boolean {
  if (!/^\d{5}(\.\d+)?$/.test(text)) return false;
  const value = Number(text);
  return value >= EXCEL_MIN && value <= EXCEL_MAX;
}

// The parts of a numeric date, for working out the order: "25/03/2026" -> [25, 3]
export function numericDateParts(text: string): [number, number] | null {
  const match = NUMERIC.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

// Any date format we know -> "YYYY-MM-DD". Numeric dates need the order; others don't.
export function readDate(text: string | null, order: DateOrder | null = null): string | null {
  if (!text) return null;
  const value = text.trim().replace(WEEKDAY, '');

  const iso = ISO.exec(value);
  if (iso) return checked(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = MONTH_NAME_FIRST.exec(value);
  if (named) return checked(fullYear(named[3]), monthNumber(named[1]), Number(named[2]));

  const dayNamed = DAY_FIRST_NAME.exec(value);
  if (dayNamed) {
    return checked(fullYear(dayNamed[3]), monthNumber(dayNamed[2]), Number(dayNamed[1]));
  }

  const numeric = NUMERIC.exec(value);
  if (numeric) {
    if (order === null) return null;
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = fullYear(numeric[3]);
    return order === 'day-first' ? checked(year, second, first) : checked(year, first, second);
  }

  if (isExcelSerial(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return null;
}

// "29th July", "29 Jul", "July 29th", "Tue 29 July": a real day and month, but no year
const DAY_MONTH = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH}\\.?$`, 'i');
const MONTH_DAY = new RegExp(`^${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?$`, 'i');

// A date with no year can't be read safely, so it gets its own answer. A leap year is
// used for the check so 29 February still counts.
export function readDayMonth(text: string | null): { day: number; month: number } | null {
  if (!text) return null;
  const value = text.trim().replace(WEEKDAY, '');
  const dayFirst = DAY_MONTH.exec(value);
  const monthFirst = MONTH_DAY.exec(value);
  const day = Number(dayFirst?.[1] ?? monthFirst?.[2]);
  const month = monthNumber(dayFirst?.[2] ?? monthFirst?.[1]);
  if (!checked(2024, month, day)) return null;
  return { day, month };
}

// Shaped like a full date but not a real one in any order: 31/09/2025, 31-Feb-26
export function isImpossibleDate(text: string | null): boolean {
  if (!text) return false;
  const value = text.trim().replace(WEEKDAY, '');
  if (readDate(value, 'day-first') || readDate(value, 'month-first')) return false;
  const named = MONTH_NAME_FIRST.exec(value) ?? DAY_FIRST_NAME.exec(value);
  const monthWord = named ? (/^\d/.test(value) ? named[2] : named[1]) : undefined;
  if (named && monthNumber(monthWord) > 0) return true;
  return ISO.test(value) || NUMERIC.test(value);
}

// two-digit years are this century: "26" -> 2026
function fullYear(text: string | undefined): number {
  return text?.length === 2 ? 2000 + Number(text) : Number(text);
}

// reject impossible dates such as 31/02/2026 instead of letting them roll over
function checked(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// "September", "Sept" and "Sep" all -> 9; 0 when it isn't a month
function monthNumber(word: string | undefined): number {
  return MONTHS[(word ?? '').slice(0, 3).toLowerCase()] ?? 0;
}
