import { pounds } from '../invoice-checks';
import type { Linked } from '../link';
import type { Customer, Known } from '../model';

export interface UnbilledItem {
  // the job or quote number
  number: string;
  customer: string;
  // before VAT, so jobs, drafts and quotes compare like for like
  valuePence: Known<number>;
  // when it was finished or accepted, if known
  since: string | null;
  // draft invoice numbers, for the "billed only as a draft" list
  invoices: string[];
}

export interface UnbilledReport {
  finishedNotInvoiced: UnbilledItem[];
  finishedDraftOnly: UnbilledItem[];
  acceptedNoJob: UnbilledItem[];
  // totals count known values only; unknown values are listed, never treated as zero
  doneNotBilledPence: number;
  agreedNotStartedPence: number;
  // jobs we couldn't check because the export doesn't say whether they are finished
  jobsWithUnknownCompletion: string[];
  summary: string[];
}

// Work that should turn into money but hasn't been billed yet.
export function workNotBilled(linked: Linked): UnbilledReport {
  const invoicesByNumber = new Map(
    linked.invoices.map((item) => [item.invoice.number, item.invoice]),
  );
  const name = (customer: Known<Customer>, fallback: string | null) =>
    customer.value?.name ?? fallback ?? 'No customer name';

  const finishedNotInvoiced: UnbilledItem[] = [];
  const finishedDraftOnly: UnbilledItem[] = [];
  const jobsWithUnknownCompletion: string[] = [];

  for (const { job, invoices, customer } of linked.jobs) {
    if (job.completed.value === null) {
      jobsWithUnknownCompletion.push(job.number);
      continue;
    }
    if (!job.completed.value) continue;

    const known = invoices
      .map((number) => invoicesByNumber.get(number))
      .filter((i) => i !== undefined);
    const base = {
      number: job.number,
      customer: name(customer, job.customerName),
      since: job.completedDate,
    };

    if (invoices.length === 0) {
      finishedNotInvoiced.push({ ...base, valuePence: job.revenuePence, invoices: [] });
    } else if (known.length === invoices.length && known.every((i) => i.status.value === 'draft')) {
      // every invoice for the job is still a draft, so nothing has actually been sent
      const net = known.reduce<number | null>(
        (sum, invoice) =>
          sum === null || invoice.netPence.value === null ? null : sum + invoice.netPence.value,
        0,
      );
      finishedDraftOnly.push({
        ...base,
        valuePence:
          net === null
            ? {
                origin: 'unknown',
                value: null,
                reason: 'a draft invoice has no readable net amount',
              }
            : { origin: 'derived', value: net, rule: 'net of the draft invoices' },
        invoices: known.map((invoice) => invoice.number),
      });
    }
  }

  const acceptedNoJob: UnbilledItem[] = linked.quotes
    .filter(({ quote, jobs }) => quote.status.value === 'accepted' && jobs.length === 0)
    .map(({ quote, customer }) => ({
      number: quote.number,
      customer: name(customer, quote.customerName),
      valuePence: quote.netPence,
      since: quote.acceptedDate ?? quote.quoteDate,
      invoices: [],
    }));

  const total = (items: UnbilledItem[]) =>
    items.reduce((sum, item) => sum + (item.valuePence.value ?? 0), 0);
  const doneNotBilledPence = total(finishedNotInvoiced) + total(finishedDraftOnly);
  const agreedNotStartedPence = total(acceptedNoJob);

  const summary: string[] = [];
  const done = finishedNotInvoiced.length + finishedDraftOnly.length;
  if (done > 0) {
    const parts = [
      finishedNotInvoiced.length > 0 ? `${finishedNotInvoiced.length} never invoiced` : null,
      finishedDraftOnly.length > 0 ? `${finishedDraftOnly.length} with only a draft invoice` : null,
    ].filter((part) => part !== null);
    summary.push(
      `${pounds(doneNotBilledPence)} of finished work hasn't been billed (before VAT): ${done} ${done === 1 ? 'job' : 'jobs'}, ${parts.join(' and ')}.`,
    );
  } else if (linked.jobs.length > jobsWithUnknownCompletion.length) {
    summary.push('Every finished job has been billed.');
  }
  if (acceptedNoJob.length > 0) {
    summary.push(
      `${pounds(agreedNotStartedPence)} of accepted quotes (before VAT) ${acceptedNoJob.length === 1 ? 'has' : 'have'} no job yet: ${acceptedNoJob.length} ${acceptedNoJob.length === 1 ? 'quote' : 'quotes'} agreed but not booked in.`,
    );
  }
  const unknownValues = [...finishedNotInvoiced, ...finishedDraftOnly, ...acceptedNoJob].filter(
    (item) => item.valuePence.value === null,
  );
  if (unknownValues.length > 0) {
    summary.push(
      `${unknownValues.length} of these ${unknownValues.length === 1 ? 'has' : 'have'} no known value, so ${unknownValues.length === 1 ? 'it is' : 'they are'} listed but not added to the totals.`,
    );
  }
  if (jobsWithUnknownCompletion.length > 0) {
    summary.push(
      `${jobsWithUnknownCompletion.length} ${jobsWithUnknownCompletion.length === 1 ? "job couldn't" : "jobs couldn't"} be checked because the export doesn't say whether ${jobsWithUnknownCompletion.length === 1 ? 'it is' : 'they are'} finished.`,
    );
  }

  return {
    finishedNotInvoiced,
    finishedDraftOnly,
    acceptedNoJob,
    doneNotBilledPence,
    agreedNotStartedPence,
    jobsWithUnknownCompletion,
    summary,
  };
}
