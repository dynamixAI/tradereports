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
  // Known, because some exports have no paid column or an unreliable balance
  paidPence: Known<number>;
  duePence: Known<number>;
  sent: Known<boolean>;
  lines: Line[];
  source: SourceRef;
}

// an address as the file gave it, plus cleaned versions for grouping by area
export interface Address {
  street: string | null;
  city: string | null;
  region: string | null;
  postcodeAsTyped: string | null;
  // "WN7 1EF"; derived when we had to fix the case or spacing
  postcode: Known<string>;
  countryAsTyped: string | null;
  // "United Kingdom"; derived when we mapped "UK" and similar
  country: Known<string>;
}

export type PhoneKind = 'mobile' | 'landline';

export interface Phone {
  // digits only, as dialled in the UK: "07700900001"
  number: string;
  kind: PhoneKind;
}

export interface Customer {
  businessId: string;
  // the tool's own ID (Tradify Id, Jobber J-ID); the safest way to link records
  sourceId: string | null;
  // the name other files use to refer to this customer
  name: string;
  contactName: string | null;
  isCompany: Known<boolean>;
  emails: string[];
  phones: Phone[];
  address: Address | null;
  // YYYY-MM-DD
  createdDate: string | null;
  archived: Known<boolean>;
  tags: string[];
  source: SourceRef;
}

// a problem found while converting, in plain English, with the rows it concerns
export interface ConvertIssue {
  kind:
    | 'missing-column'
    | 'bad-value'
    | 'inconsistent-rows'
    | 'totals-do-not-add-up'
    | 'possible-draft'
    | 'source-quirk'
    | 'duplicate-name';
  rows: number[];
  message: string;
}

export interface ConvertResult<T> {
  records: T[];
  issues: ConvertIssue[];
}
