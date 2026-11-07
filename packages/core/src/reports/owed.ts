import { pounds } from '../invoice-checks';
import type { Invoice } from '../model';

export type AgeBand =
  | 'not yet due'
  | '1-30 days late'
  | '31-60 days late'
  | '61-90 days late'
  | 'over 90 days late'
  | 'no due date';

const BANDS: AgeBand[] = [
  'not yet due',
  '1-30 days late',
  '31-60 days late',
  '61-90 days late',
  'over 90 days late',
  'no due date',
];

export interface CustomerOwed {
  customer: string;
  owedPence: number;
  overduePence: number;
  // invoice numbers, so the user can check each figure against their file
  invoices: string[];
  oldestDueDate: string | null;
}

export interface BandTotal {
  band: AgeBand;
  pence: number;
  invoices: string[];
}

export interface LeftOut {
  reason: string;
  pence: number;
  invoices: string[];
}

export interface OwedReport {
  asOf: string;
  owedPence: number;
  overduePence: number;
  // the lowest the real figure could be, if the unsent invoices turn out to be drafts
  owedIfUnsentAreDraftsPence: number;
  invoices: string[];
  byCustomer: CustomerOwed[];
  byAge: BandTotal[];
  leftOut: LeftOut[];
  // plain-English lines for the top of the report
  summary: string[];
}

// Who owes the business money, as of a given day, from checked invoices.
export function moneyOwed(invoices: Invoice[], asOf: string): OwedReport {
  const counted: Invoice[] = [];
  const drafts: Invoice[] = [];
  const unknownStatus: Invoice[] = [];
  const unknownDue: Invoice[] = [];

  for (const invoice of invoices) {
    const status = invoice.status.value;
    if (status === 'draft') drafts.push(invoice);
    else if (status === null) unknownStatus.push(invoice);
    else if (status === 'unpaid' || status === 'overdue') {
      // an amount we can't read is left out, never counted as zero
      if (invoice.duePence.value === null) unknownDue.push(invoice);
      else if (invoice.duePence.value > 0) counted.push(invoice);
    }
  }

  const due = (invoice: Invoice): number => invoice.duePence.value ?? 0;
  const sum = (list: Invoice[], amount: (invoice: Invoice) => number = due): number =>
    list.reduce((total, invoice) => total + amount(invoice), 0);
  const numbers = (list: Invoice[]): string[] => list.map((invoice) => invoice.number);

  const overdue = counted.filter((invoice) => invoice.status.value === 'overdue');
  const unsent = counted.filter((invoice) => invoice.sent.value === false);

  const owedPence = sum(counted);
  const overduePence = sum(overdue);
  const unsentPence = sum(unsent);

  const leftOut: LeftOut[] = [];
  if (drafts.length > 0) {
    leftOut.push({
      reason: 'drafts, not yet sent to the customer',
      pence: sum(drafts, (invoice) => invoice.grossPence),
      invoices: numbers(drafts),
    });
  }
  if (unknownStatus.length > 0) {
    leftOut.push({
      reason: "status we couldn't work out",
      pence: sum(unknownStatus, (invoice) => invoice.grossPence),
      invoices: numbers(unknownStatus),
    });
  }
  if (unknownDue.length > 0) {
    leftOut.push({
      reason: "amount due we couldn't work out",
      pence: sum(unknownDue, (invoice) => invoice.grossPence),
      invoices: numbers(unknownDue),
    });
  }

  const summary = [
    counted.length === 0
      ? 'Nobody owes you money on these invoices.'
      : `You're owed ${pounds(owedPence)} across ${counted.length} ${plural(counted.length, 'invoice')}. ${pounds(overduePence)} of it is overdue.`,
  ];
  if (unsentPence > 0) {
    summary.push(
      `${pounds(unsentPence)} of this is on ${unsent.length} ${plural(unsent.length, 'invoice')} that ${unsent.length === 1 ? 'was' : 'were'} never sent, so ${unsent.length === 1 ? 'it' : 'they'} may be drafts. If so, you're owed ${pounds(owedPence - unsentPence)}.`,
    );
  }
  for (const item of leftOut) {
    summary.push(
      `Left out: ${item.invoices.length} ${plural(item.invoices.length, 'invoice')} (${pounds(item.pence)}) with ${item.reason}.`,
    );
  }

  return {
    asOf,
    owedPence,
    overduePence,
    owedIfUnsentAreDraftsPence: owedPence - unsentPence,
    invoices: numbers(counted),
    byCustomer: byCustomer(counted),
    byAge: byAge(counted, asOf),
    leftOut,
    summary,
  };
}

// biggest debt first; ties by name so the order never changes between runs
function byCustomer(invoices: Invoice[]): CustomerOwed[] {
  const groups = new Map<string, CustomerOwed>();
  for (const invoice of invoices) {
    const name = invoice.customerName ?? 'No customer name';
    const group = groups.get(name) ?? {
      customer: name,
      owedPence: 0,
      overduePence: 0,
      invoices: [],
      oldestDueDate: null,
    };
    const amount = invoice.duePence.value ?? 0;
    group.owedPence += amount;
    if (invoice.status.value === 'overdue') group.overduePence += amount;
    group.invoices.push(invoice.number);
    if (
      invoice.dueDate &&
      (group.oldestDueDate === null || invoice.dueDate < group.oldestDueDate)
    ) {
      group.oldestDueDate = invoice.dueDate;
    }
    groups.set(name, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.owedPence - a.owedPence || a.customer.localeCompare(b.customer),
  );
}

// every band is listed, even when empty, so the report always has the same shape
function byAge(invoices: Invoice[], asOf: string): BandTotal[] {
  const totals = BANDS.map((band) => ({ band, pence: 0, invoices: [] as string[] }));
  for (const invoice of invoices) {
    const band = ageBand(invoice.dueDate, asOf);
    const total = totals.find((item) => item.band === band);
    if (total) {
      total.pence += invoice.duePence.value ?? 0;
      total.invoices.push(invoice.number);
    }
  }
  return totals;
}

function ageBand(dueDate: string | null, asOf: string): AgeBand {
  if (dueDate === null) return 'no due date';
  const late = daysBetween(dueDate, asOf);
  if (late <= 0) return 'not yet due';
  if (late <= 30) return '1-30 days late';
  if (late <= 60) return '31-60 days late';
  if (late <= 90) return '61-90 days late';
  return 'over 90 days late';
}

// whole days from one YYYY-MM-DD date to another, ignoring time zones
function daysBetween(from: string, to: string): number {
  const day = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
  };
  return day(to) - day(from);
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
