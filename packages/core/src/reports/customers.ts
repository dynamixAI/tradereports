import { pounds } from '../invoice-checks';
import type { Linked, LinkedInvoice } from '../link';
import type { Customer } from '../model';

export interface CustomerSummary {
  customer: string;
  // before VAT, on sent invoices
  invoicedPence: number;
  invoices: string[];
  // YYYY-MM-DD of the most recent sent invoice
  lastInvoiceDate: string | null;
  overdueInvoices: string[];
  phones: string[];
  emails: string[];
}

export interface CustomerInsights {
  top: CustomerSummary[];
  owingOnSeveral: CustomerSummary[];
  winBack: CustomerSummary[];
  neverInvoiced: string[];
  repeatCustomers: number;
  oneOffCustomers: number;
  winBackMonths: number;
  summary: string[];
}

export interface CustomerInsightOptions {
  // how long without an invoice before someone is worth contacting again
  winBackMonths?: number;
  // how many top customers to list
  topCount?: number;
}

// Who the business's best, slowest and lapsed customers are, from linked invoices.
export function customerInsights(
  linked: Linked,
  customers: Customer[],
  asOf: string,
  options: CustomerInsightOptions = {},
): CustomerInsights {
  const winBackMonths = options.winBackMonths ?? 12;
  const topCount = options.topCount ?? 5;

  // drafts and cancelled invoices aren't sales, and an unknown status can't be judged
  const sent = linked.invoices.filter(({ invoice }) =>
    ['paid', 'unpaid', 'overdue'].includes(invoice.status.value ?? ''),
  );

  const groups = new Map<string, CustomerSummary>();
  for (const item of sent) {
    const summary = groups.get(keyOf(item)) ?? newSummary(item);
    const { invoice } = item;
    summary.invoicedPence += invoice.netPence.value ?? 0;
    summary.invoices.push(invoice.number);
    if (
      invoice.issueDate &&
      (!summary.lastInvoiceDate || invoice.issueDate > summary.lastInvoiceDate)
    ) {
      summary.lastInvoiceDate = invoice.issueDate;
    }
    if (invoice.status.value === 'overdue') summary.overdueInvoices.push(invoice.number);
    groups.set(keyOf(item), summary);
  }
  const all = [...groups.values()];

  const top = [...all]
    .sort((a, b) => b.invoicedPence - a.invoicedPence || a.customer.localeCompare(b.customer))
    .slice(0, topCount);

  // without payment dates we can't say who paid late in the past, only who owes on several now
  const owingOnSeveral = all
    .filter((customer) => customer.overdueInvoices.length >= 2)
    .sort(
      (a, b) =>
        b.overdueInvoices.length - a.overdueInvoices.length || a.customer.localeCompare(b.customer),
    );

  const cutoff = monthsBefore(asOf, winBackMonths);
  const winBack = all
    .filter((customer) => customer.lastInvoiceDate !== null && customer.lastInvoiceDate < cutoff)
    .sort((a, b) => (a.lastInvoiceDate ?? '').localeCompare(b.lastInvoiceDate ?? ''));

  const invoicedIds = new Set(sent.map((item) => item.customer.value).filter((c) => c !== null));
  const neverInvoiced = customers
    .filter((customer) => !invoicedIds.has(customer))
    .map((customer) => customer.name)
    .sort((a, b) => a.localeCompare(b));

  const repeatCustomers = all.filter((customer) => customer.invoices.length > 1).length;
  const oneOffCustomers = all.length - repeatCustomers;

  const summary: string[] = [];
  const best = top[0];
  if (best) {
    summary.push(
      `Your biggest customer is ${best.customer}: ${pounds(best.invoicedPence)} invoiced before VAT.`,
    );
  }
  if (all.length > 0) {
    summary.push(
      `${repeatCustomers} of ${all.length} customers have come back for more than one job.`,
    );
  }
  if (owingOnSeveral.length > 0) {
    summary.push(
      `${owingOnSeveral.length} ${owingOnSeveral.length === 1 ? 'customer is' : 'customers are'} overdue on more than one invoice: ${owingOnSeveral.map((c) => c.customer).join(', ')}.`,
    );
  }
  if (winBack.length > 0) {
    summary.push(
      `${winBack.length} ${winBack.length === 1 ? 'customer has' : 'customers have'} had no work in over ${winBackMonths} ${winBackMonths === 1 ? 'month' : 'months'}. Worth a call.`,
    );
  }
  if (neverInvoiced.length > 0) {
    summary.push(
      `${neverInvoiced.length} ${neverInvoiced.length === 1 ? 'customer on file has' : 'customers on file have'} never been sent an invoice.`,
    );
  }
  summary.push("Past late payment can't be shown: the exports don't have reliable payment dates.");

  return {
    top,
    owingOnSeveral,
    winBack,
    neverInvoiced,
    repeatCustomers,
    oneOffCustomers,
    winBackMonths,
    summary,
  };
}

// a matched customer groups by its own ID; otherwise by the name on the invoice
function keyOf({ customer, invoice }: LinkedInvoice): string {
  const record = customer.value;
  return record ? `id:${record.sourceId ?? record.name}` : `name:${invoice.customerName ?? ''}`;
}

function newSummary({ customer, invoice }: LinkedInvoice): CustomerSummary {
  const record = customer.value;
  return {
    customer: record?.name ?? invoice.customerName ?? 'No customer name',
    invoicedPence: 0,
    invoices: [],
    lastInvoiceDate: null,
    overdueInvoices: [],
    phones: record?.phones.map((phone) => phone.number) ?? [],
    emails: record?.emails ?? [],
  };
}

// "2026-11-07" minus 3 months -> "2026-08-07"; the 31st becomes the last day of a shorter month
function monthsBefore(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 - months;
  const day = Number(date.slice(8, 10));
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
