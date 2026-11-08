import { parseMoney } from '../money';
import { unknown, type ConvertIssue, type Line } from '../model';

// Readers used by more than one Jobber converter.

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

// "Nov 03, 2026", the format Jobber's reports use
const JOBBER_DATE = /^([A-Z][a-z]{2}) (\d{2}), (\d{4})$/;

// one item inside a "Line items" cell: "Leak Repair (2, £240.00)"
const LINE_ITEM = /(.+?) \((\d+(?:\.\d+)?), £([\d,]+\.\d{2})\)(?:, |$)/g;

// "Nov 03, 2026" -> "2026-11-03"; "-" has already become null
export function readJobberDate(
  value: string | null | undefined,
  number: string,
  column: string,
  rows: number[],
  issues: ConvertIssue[],
): string | null {
  if (!value) return null;
  const match = JOBBER_DATE.exec(value);
  const month = match ? MONTHS[match[1] ?? ''] : undefined;
  if (match && month) return `${match[3]}-${month}-${match[2]}`;
  issues.push({
    kind: 'bad-value',
    rows,
    message: `${number}: "${column}" is not a date we can read (${value}).`,
  });
  return null;
}

// "A (2, £240.00), B (1, £85.00)" -> lines; the amount is the line total, not the unit price
export function readLineItems(
  text: string | null | undefined,
  number: string,
  rows: number[],
  issues: ConvertIssue[],
): Line[] {
  if (!text) return [];
  const lines: Line[] = [];
  let consumed = 0;
  for (const match of text.matchAll(LINE_ITEM)) {
    const [whole, name, quantityText, amountText] = match;
    // a gap means part of the cell didn't match, so the lines can't be trusted
    if (match.index !== consumed) break;
    consumed += whole.length;
    const quantity = Number(quantityText);
    const amount = parseMoney(amountText ?? '') ?? 0;
    lines.push({
      description: name ?? null,
      quantity,
      unitPricePence: quantity > 0 ? Math.round(amount / quantity) : amount,
      unitCostPence: unknown('this Jobber report has no cost column'),
      // the cell doesn't say which lines carry VAT
      taxRateLabel: null,
      taxRatePercent: null,
      amountPence: amount,
    });
  }
  if (consumed !== text.length) {
    issues.push({
      kind: 'bad-value',
      rows,
      message: `${number}: couldn't read the line items ("${text}").`,
    });
    return [];
  }
  return lines;
}
