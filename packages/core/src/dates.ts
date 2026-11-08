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

// 2026-11-03, optionally followed by a time
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/;
// 03/11/2026, 3-11-26, 03.11.2026
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
// Nov 03, 2026 (Jobber) or 3 Nov 2026
const MONTH_NAME_FIRST = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/;
const DAY_FIRST_NAME = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/;

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
  const value = text.trim();

  const iso = ISO.exec(value);
  if (iso) return checked(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = MONTH_NAME_FIRST.exec(value);
  if (named)
    return checked(Number(named[3]), MONTHS[named[1]?.toLowerCase() ?? ''] ?? 0, Number(named[2]));

  const dayNamed = DAY_FIRST_NAME.exec(value);
  if (dayNamed) {
    return checked(
      Number(dayNamed[3]),
      MONTHS[dayNamed[2]?.toLowerCase() ?? ''] ?? 0,
      Number(dayNamed[1]),
    );
  }

  const numeric = NUMERIC.exec(value);
  if (numeric) {
    if (order === null) return null;
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    // two-digit years are this century: "26" -> 2026
    const year = numeric[3]?.length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return order === 'day-first' ? checked(year, second, first) : checked(year, first, second);
  }

  if (isExcelSerial(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return null;
}

// reject impossible dates such as 31/02/2026 instead of letting them roll over
function checked(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
