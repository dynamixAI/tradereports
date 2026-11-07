// The shared shape every export is converted into (ADR 0005).
// Reports only read these records, never a tool's own columns.

// a value plus how we know it; an unknown value is always null
export type Known<T> =
  | { origin: 'stated'; value: T }
  | { origin: 'derived'; value: T; rule: string }
  | { origin: 'unknown'; value: null; reason: string };

// read straight from a column
export function stated<T>(value: T): Known<T> {
  return { origin: 'stated', value };
}

// worked out from other values; rule says how, in plain English
export function derived<T>(value: T, rule: string): Known<T> {
  return { origin: 'derived', value, rule };
}

// not in the file and not safe to work out; reason says why
export function unknown<T>(reason: string): Known<T> {
  return { origin: 'unknown', value: null, reason };
}

export type SourceTool = 'jobber' | 'tradify';

// where a record came from, so any number can be traced back to the user's file
export interface SourceRef {
  tool: SourceTool;
  file: string;
  // spreadsheet row numbers; the header is row 1
  rows: number[];
}

export type TaxMode = 'inclusive' | 'exclusive';

export type InvoiceStatus = 'draft' | 'unpaid' | 'overdue' | 'paid' | 'cancelled';

// one line on a quote or invoice; money is in pence
export interface Line {
  description: string | null;
  quantity: number;
  unitPricePence: number;
  unitCostPence: Known<number>;
  taxRateLabel: string | null;
  taxRatePercent: number | null;
  // the line amount as the source shows it
  amountPence: number;
}

export interface Invoice {
  businessId: string;
  // text, never a number: "IV00001", "0042"
  number: string;
  customerName: string | null;
  jobNumbers: string[];
  // YYYY-MM-DD
  issueDate: string | null;
  dueDate: string | null;
  status: Known<InvoiceStatus>;
  taxMode: Known<TaxMode>;
  netPence: Known<number>;
  taxPence: number;
  grossPence: number;
  paidPence: number;
  duePence: number;
  sent: Known<boolean>;
  lines: Line[];
  source: SourceRef;
}

// a problem found while converting, in plain English, with the rows it concerns
export interface ConvertIssue {
  kind:
    | 'missing-column'
    | 'bad-value'
    | 'inconsistent-rows'
    | 'totals-do-not-add-up'
    | 'possible-draft';
  rows: number[];
  message: string;
}

export interface ConvertResult<T> {
  records: T[];
  issues: ConvertIssue[];
}
