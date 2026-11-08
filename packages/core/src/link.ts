import {
  derived,
  unknown,
  type ConvertIssue,
  type Customer,
  type Invoice,
  type Job,
  type Known,
  type Quote,
} from './model';

export interface LinkInput {
  customers: Customer[];
  quotes: Quote[];
  jobs: Job[];
  invoices: Invoice[];
}

// Each record with the numbers of the records it is linked to, from either side.
export interface LinkedJob {
  job: Job;
  quotes: string[];
  invoices: string[];
  customer: Known<Customer>;
}

export interface LinkedQuote {
  quote: Quote;
  jobs: string[];
  customer: Known<Customer>;
}

export interface LinkedInvoice {
  invoice: Invoice;
  jobs: string[];
  // neither tool links invoices to quotes directly; these come through the jobs
  quotes: Known<string[]>;
  customer: Known<Customer>;
}

export interface Linked {
  jobs: LinkedJob[];
  quotes: LinkedQuote[];
  invoices: LinkedInvoice[];
  issues: ConvertIssue[];
}

// Join customers, quotes, jobs and invoices from one business into one picture.
export function linkRecords(input: LinkInput): Linked {
  const issues: ConvertIssue[] = [];
  const findCustomer = customerFinder(input.customers, issues);

  // collect every job link from both directions
  const quotesOfJob = new Map<string, Set<string>>();
  const invoicesOfJob = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, job: string, other: string) =>
    map.set(job, (map.get(job) ?? new Set()).add(other));

  for (const job of input.jobs) {
    for (const quote of job.quoteNumbers) add(quotesOfJob, job.number, quote);
    for (const invoice of job.invoiceNumbers) add(invoicesOfJob, job.number, invoice);
  }
  for (const quote of input.quotes) {
    for (const job of quote.jobNumbers) add(quotesOfJob, job, quote.number);
  }
  for (const invoice of input.invoices) {
    for (const job of invoice.jobNumbers) add(invoicesOfJob, job, invoice.number);
  }

  checkBothSides(input, issues);
  checkTargetsExist(input, issues);

  const jobs = input.jobs.map((job) => ({
    job,
    quotes: [...(quotesOfJob.get(job.number) ?? [])],
    invoices: [...(invoicesOfJob.get(job.number) ?? [])],
    customer: findCustomer(job.customerName, `Job ${job.number}`, job.source.rows),
  }));

  const quotes = input.quotes.map((quote) => ({
    quote,
    jobs: [...quotesOfJob].filter(([, set]) => set.has(quote.number)).map(([job]) => job),
    customer: findCustomer(quote.customerName, `Quote ${quote.number}`, quote.source.rows),
  }));

  const invoices = input.invoices.map((invoice) => {
    const linkedJobs = [...invoicesOfJob]
      .filter(([, set]) => set.has(invoice.number))
      .map(([job]) => job);
    const viaJobs = [...new Set(linkedJobs.flatMap((job) => [...(quotesOfJob.get(job) ?? [])]))];
    return {
      invoice,
      jobs: linkedJobs,
      quotes:
        linkedJobs.length === 0
          ? unknown<string[]>('not linked to a job, so its quote cannot be traced')
          : derived(viaJobs, 'through the linked jobs'),
      customer: findCustomer(
        invoice.customerName,
        `Invoice ${invoice.number}`,
        invoice.source.rows,
      ),
    };
  });

  return { jobs, quotes, invoices, issues };
}

// Jobber states links on both the job and the quote/invoice; if they disagree, say so.
function checkBothSides(input: LinkInput, issues: ConvertIssue[]): void {
  const jobsByNumber = new Map(input.jobs.map((job) => [job.number, job]));
  const check = (
    kind: 'quote' | 'invoice',
    number: string,
    jobNumbers: string[],
    rows: number[],
  ) => {
    for (const jobNumber of jobNumbers) {
      const job = jobsByNumber.get(jobNumber);
      // only a job that states its own links can disagree
      if (!job || job.source.tool !== 'jobber') continue;
      const stated = kind === 'quote' ? job.quoteNumbers : job.invoiceNumbers;
      if (!stated.includes(number)) {
        issues.push({
          kind: 'links-disagree',
          rows,
          message: `${kind === 'quote' ? 'Quote' : 'Invoice'} ${number} says it belongs to job ${jobNumber}, but the jobs report doesn't list it on that job.`,
        });
      }
    }
  };
  for (const quote of input.quotes)
    check('quote', quote.number, quote.jobNumbers, quote.source.rows);
  for (const invoice of input.invoices) {
    check('invoice', invoice.number, invoice.jobNumbers, invoice.source.rows);
  }
}

// A link to a record that isn't in the files usually means a report left it out.
function checkTargetsExist(input: LinkInput, issues: ConvertIssue[]): void {
  // with no jobs file there is nothing to check against
  if (input.jobs.length === 0) return;
  const jobNumbers = new Set(input.jobs.map((job) => job.number));
  const quoteNumbers = new Set(input.quotes.map((quote) => quote.number));
  const invoiceNumbers = new Set(input.invoices.map((invoice) => invoice.number));

  for (const quote of input.quotes) {
    for (const job of quote.jobNumbers.filter((n) => !jobNumbers.has(n))) {
      issues.push({
        kind: 'missing-link',
        rows: quote.source.rows,
        message: `Quote ${quote.number} links to job ${job}, which isn't in the jobs file. The report may have filtered it out.`,
      });
    }
  }
  for (const invoice of input.invoices) {
    for (const job of invoice.jobNumbers.filter((n) => !jobNumbers.has(n))) {
      issues.push({
        kind: 'missing-link',
        rows: invoice.source.rows,
        message: `Invoice ${invoice.number} links to job ${job}, which isn't in the jobs file. The report may have filtered it out.`,
      });
    }
  }
  for (const job of input.jobs) {
    if (input.quotes.length > 0) {
      for (const quote of job.quoteNumbers.filter((n) => !quoteNumbers.has(n))) {
        issues.push({
          kind: 'missing-link',
          rows: job.source.rows,
          message: `Job ${job.number} links to quote ${quote}, which isn't in the quotes file.`,
        });
      }
    }
    if (input.invoices.length > 0) {
      for (const invoice of job.invoiceNumbers.filter((n) => !invoiceNumbers.has(n))) {
        issues.push({
          kind: 'missing-link',
          rows: job.source.rows,
          message: `Job ${job.number} links to invoice ${invoice}, which isn't in the invoices file.`,
        });
      }
    }
  }
}

// Match a name to a customer. Names are all most files give, so a name shared by two
// customers stays unknown rather than being given to one of them.
function customerFinder(customers: Customer[], issues: ConvertIssue[]) {
  const byName = new Map<string, Customer[]>();
  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), customer]);
  }
  // report each unmatched name once, not once per record
  const reported = new Set<string>();

  return (name: string | null, label: string, rows: number[]): Known<Customer> => {
    if (customers.length === 0) return unknown('no customers file');
    if (!name) return unknown('no customer name');

    const exact = byName.get(name.trim().toLowerCase()) ?? [];
    if (exact.length === 1 && exact[0]) return derived(exact[0], 'matched by name');
    if (exact.length > 1) return unknown(`${exact.length} customers are called "${name}"`);

    // Tradify writes some names as "Customer (Contact)": "Test (Alice)"
    const match = /^(.*) \((.+)\)$/.exec(name.trim());
    if (match) {
      const [, base, contact] = match;
      const candidates = (byName.get((base ?? '').toLowerCase()) ?? []).filter(
        (customer) => customer.contactName?.toLowerCase() === contact?.toLowerCase(),
      );
      if (candidates.length === 1 && candidates[0]) {
        return derived(
          candidates[0],
          `matched "${name}" to customer "${base}" with contact ${contact}`,
        );
      }
    }

    if (!reported.has(name)) {
      reported.add(name);
      issues.push({
        kind: 'customer-not-found',
        rows,
        message: `${label}: no customer called "${name}" in the customers file.`,
      });
    }
    return unknown(`no customer called "${name}"`);
  };
}
