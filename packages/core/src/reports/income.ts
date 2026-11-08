import { pounds } from '../invoice-checks';
import type { Invoice } from '../model';

// HMRC puts VAT-registered businesses on one of three quarter patterns ("staggers").
// Each lists the months that end a quarter.
const STAGGER_ENDS: Record<VatStagger, number[]> = {
  1: [3, 6, 9, 12],
  2: [1, 4, 7, 10],
  3: [2, 5, 8, 11],
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type VatStagger = 1 | 2 | 3;

export interface PeriodTotal {
  // "2026-09" for a month; for a quarter, the month it ends
  period: string;
  label: string;
  // before VAT; invoices whose net is unknown are left out of this figure only
  netPence: number;
  vatPence: number;
  grossPence: number;
  invoices: string[];
  netUnknown: string[];
}

export interface IncomeReport {
  stagger: VatStagger;
  byMonth: PeriodTotal[];
  byVatQuarter: PeriodTotal[];
  leftOut: { reason: string; invoices: string[] }[];
  summary: string[];
}

// Money invoiced per month and per VAT quarter, by the date each invoice was issued.
export function incomeByPeriod(invoices: Invoice[], stagger: VatStagger = 1): IncomeReport {
  const counted: Invoice[] = [];
  const drafts: string[] = [];
  const unclear: string[] = [];
  const undated: string[] = [];

  for (const invoice of invoices) {
    const status = invoice.status.value;
    if (status === 'draft' || status === 'cancelled') drafts.push(invoice.number);
    else if (status === null) unclear.push(invoice.number);
    else if (!invoice.issueDate) undated.push(invoice.number);
    else counted.push(invoice);
  }

  const byMonth = group(counted, (date) => date.slice(0, 7), monthLabel);
  const byVatQuarter = group(
    counted,
    (date) => quarterEnd(date, stagger),
    (period) => `Quarter ending ${monthLabel(period)}`,
  );

  const leftOut = [
    { reason: 'drafts or cancelled, so not yet income', invoices: drafts },
    { reason: "a status we couldn't work out", invoices: unclear },
    { reason: 'no issue date, so no month to put them in', invoices: undated },
  ].filter((item) => item.invoices.length > 0);

  return {
    stagger,
    byMonth,
    byVatQuarter,
    leftOut,
    summary: summarise(byMonth, byVatQuarter, leftOut, stagger),
  };
}

function group(
  invoices: Invoice[],
  periodOf: (date: string) => string,
  labelOf: (period: string) => string,
): PeriodTotal[] {
  const totals = new Map<string, PeriodTotal>();
  for (const invoice of invoices) {
    const period = periodOf(invoice.issueDate ?? '');
    const total = totals.get(period) ?? {
      period,
      label: labelOf(period),
      netPence: 0,
      vatPence: 0,
      grossPence: 0,
      invoices: [],
      netUnknown: [],
    };
    if (invoice.netPence.value === null) total.netUnknown.push(invoice.number);
    else total.netPence += invoice.netPence.value;
    total.vatPence += invoice.taxPence;
    total.grossPence += invoice.grossPence;
    total.invoices.push(invoice.number);
    totals.set(period, total);
  }
  // oldest first, so the list reads as a timeline
  return [...totals.values()].sort((a, b) => a.period.localeCompare(b.period));
}

// "2026-08-15" with stagger 1 -> "2026-09"; a quarter that ends in January belongs to the next year
function quarterEnd(date: string, stagger: VatStagger): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const end = STAGGER_ENDS[stagger].find((m) => m >= month) ?? STAGGER_ENDS[stagger][0] ?? 12;
  const endYear = end < month ? year + 1 : year;
  return `${endYear}-${String(end).padStart(2, '0')}`;
}

function monthLabel(period: string): string {
  const month = Number(period.slice(5, 7));
  return `${MONTH_NAMES[month - 1] ?? period} ${period.slice(0, 4)}`;
}

function summarise(
  byMonth: PeriodTotal[],
  byVatQuarter: PeriodTotal[],
  leftOut: { reason: string; invoices: string[] }[],
  stagger: VatStagger,
): string[] {
  const summary: string[] = [];
  const latest = byMonth[byMonth.length - 1];
  const before = byMonth[byMonth.length - 2];

  if (!latest) {
    summary.push('No sent invoices to report on.');
  } else if (before && before.netPence > 0) {
    const change = Math.round(((latest.netPence - before.netPence) / before.netPence) * 100);
    const direction =
      change === 0 ? 'the same as' : change > 0 ? `up ${change}% on` : `down ${-change}% on`;
    summary.push(
      `${latest.label}: ${pounds(latest.netPence)} invoiced before VAT, ${direction} ${before.label} (${pounds(before.netPence)}).`,
    );
  } else {
    summary.push(`${latest.label}: ${pounds(latest.netPence)} invoiced before VAT.`);
  }

  const quarter = byVatQuarter[byVatQuarter.length - 1];
  if (quarter) {
    summary.push(
      `${quarter.label}: ${pounds(quarter.vatPence)} VAT on ${pounds(quarter.netPence)} of sales (VAT quarters ending ${STAGGER_ENDS[stagger].map((m) => MONTH_NAMES[m - 1]?.slice(0, 3)).join(', ')}).`,
    );
  }

  // the exports have no reliable payment dates, so cash accounting can't be worked out
  summary.push(
    "These figures use the date each invoice was issued. If you use VAT cash accounting, VAT is due when you're paid instead, which these exports don't show reliably.",
  );

  for (const item of leftOut) {
    summary.push(
      `Left out: ${item.invoices.length} ${item.invoices.length === 1 ? 'invoice' : 'invoices'} with ${item.reason}.`,
    );
  }
  return summary;
}
