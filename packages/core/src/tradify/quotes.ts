import type { CsvRow, CsvTable } from '../csv';
import { pounds, workOutTax } from '../invoice-checks';
import { parseMoney } from '../money';
import {
  derived,
  stated,
  unknown,
  type ConvertIssue,
  type ConvertResult,
  type Known,
  type Line,
  type Quote,
  type QuoteStatus,
} from '../model';

// "Accepted" is confirmed in a real export; the others are Tradify's quote tab names
const STATUSES: Record<string, QuoteStatus> = {
  Draft: 'draft',
  'Awaiting Acceptance': 'awaiting_response',
  Accepted: 'accepted',
  Declined: 'declined',
  Cancelled: 'cancelled',
};

const REQUIRED = ['Quote No', 'Status', 'Subtotal', 'Tax', 'Total', 'Line Amount', 'Line Quantity'];

export interface TradifyQuoteOptions {
  businessId: string;
  file: string;
}

// Tradify quotes export: one row per line item, quote totals repeated on every row.
export function convertTradifyQuotes(
  table: CsvTable,
  options: TradifyQuoteOptions,
): ConvertResult<Quote> {
  const issues: ConvertIssue[] = [];

  const missing = REQUIRED.filter((name) => !table.headers.includes(name));
  if (missing.length > 0) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: `This doesn't look like a Tradify quotes export. Missing: ${missing.join(', ')}.`,
    });
    return { records: [], issues };
  }

  // group line rows by quote number, keeping the file's order
  const groups = new Map<string, { rows: CsvRow[]; rowNumbers: number[] }>();
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const number = row['Quote No'];
    if (!number) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no quote number.`,
      });
      return;
    }
    const group = groups.get(number) ?? { rows: [], rowNumbers: [] };
    group.rows.push(row);
    group.rowNumbers.push(rowNumber);
    groups.set(number, group);
  });

  const records: Quote[] = [];
  for (const [number, group] of groups) {
    const quote = buildQuote(number, group.rows, group.rowNumbers, options, issues);
    if (quote) records.push(quote);
  }
  return { records, issues };
}

function buildQuote(
  number: string,
  rows: CsvRow[],
  rowNumbers: number[],
  options: TradifyQuoteOptions,
  issues: ConvertIssue[],
): Quote | null {
  const first = rows[0];
  if (!first) return null;

  for (const column of ['Subtotal', 'Tax', 'Total', 'Status', 'Total Cost']) {
    if (new Set(rows.map((row) => row[column] ?? '')).size > 1) {
      issues.push({
        kind: 'inconsistent-rows',
        rows: rowNumbers,
        message: `${number}: "${column}" is different on different lines, so its totals can't be trusted.`,
      });
      return null;
    }
  }

  const money = (column: string): number | null => {
    const pence = parseMoney(first[column] ?? '');
    if (pence === null) {
      issues.push({
        kind: 'bad-value',
        rows: rowNumbers,
        message: `${number}: "${column}" is not an amount (${first[column] ?? 'empty'}).`,
      });
    }
    return pence;
  };

  const subtotal = money('Subtotal');
  const tax = money('Tax');
  const total = money('Total');
  if (subtotal === null || tax === null || total === null) return null;
  const discount = first['Discount'] ? (parseMoney(first['Discount']) ?? 0) : 0;

  const { taxMode, net } = workOutTax(number, subtotal, tax, total, 'subtotal', rowNumbers, issues);
  const lines = rows.map((row) => buildLine(row, number, rowNumbers, issues));

  // only trust cost when every line's cost was confirmed
  const costs = lines.map((line) => line.unitCostPence);
  const cost: Known<number> = costs.every((c) => c.value !== null)
    ? derived(
        lines.reduce((sum, line) => sum + (line.unitCostPence.value ?? 0) * line.quantity, 0),
        'line costs times quantity, after checking which column is cost',
      )
    : unknown("some line costs couldn't be confirmed");

  const word = first['Status'];
  const mapped = word ? STATUSES[word] : undefined;
  const status: Known<QuoteStatus> = mapped
    ? stated(mapped)
    : unknown(`status "${word ?? 'empty'}" is not recognised`);
  if (!mapped) {
    issues.push({
      kind: 'bad-value',
      rows: rowNumbers,
      message: `${number}: status "${word ?? 'empty'}" is not one we recognise.`,
    });
  }

  return {
    businessId: options.businessId,
    number,
    customerName: first['Customer Name'] ?? null,
    jobNumbers: (first['Jobs'] ?? '')
      .split(',')
      .map((job) => job.trim())
      .filter((job) => job !== ''),
    quoteDate: isoDate(first['Quote Date']),
    expiryDate: isoDate(first['Expiry Date']),
    sentDate: null,
    acceptedDate: null,
    status,
    taxMode,
    netPence: net,
    discountPence: discount,
    taxPence: stated(tax),
    grossPence: total,
    costPence: cost,
    grossProfitPence:
      cost.value !== null && net.value !== null
        ? derived(net.value - cost.value, 'net minus cost')
        : unknown('cost or net is unknown'),
    lines,
    source: { tool: 'tradify', file: options.file, rows: rowNumbers },
  };
}

// Tradify labels the selling price "Line Unit Price" and the cost "Line Unit Sell Price".
// Rather than trust either label, check which one gives the line amount.
function buildLine(
  row: CsvRow,
  number: string,
  rowNumbers: number[],
  issues: ConvertIssue[],
): Line {
  const quantity = Number(row['Line Quantity'] ?? '');
  const amount = parseMoney(row['Line Amount'] ?? '') ?? 0;
  const discountPercent = Number(row['Line Discount Percentage'] ?? '0') || 0;
  const a = parseMoney(row['Line Unit Price'] ?? '');
  const b = parseMoney(row['Line Unit Sell Price'] ?? '');

  // allow a penny either way for rounding
  const gives = (unit: number | null) =>
    unit !== null &&
    Math.abs(Math.round(unit * quantity * (1 - discountPercent / 100)) - amount) <= 1;

  let price: number;
  let cost: Known<number>;
  if (gives(a)) {
    price = a ?? 0;
    cost =
      b !== null
        ? derived(b, '"Line Unit Sell Price" holds the cost; checked against the line amount')
        : unknown('no cost');
  } else if (gives(b)) {
    price = b ?? 0;
    cost =
      a !== null
        ? derived(a, '"Line Unit Price" holds the cost; checked against the line amount')
        : unknown('no cost');
  } else {
    price = quantity > 0 ? Math.round(amount / quantity) : amount;
    cost = unknown('neither price column gives the line amount');
    issues.push({
      kind: 'totals-do-not-add-up',
      rows: rowNumbers,
      message: `${number}: neither price column times quantity gives the line amount ${pounds(amount)}, so the line's cost is unknown.`,
    });
  }

  return {
    description: row['Line Description'] ?? null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPricePence: price,
    unitCostPence: cost,
    taxRateLabel: row['Line Tax Rate'] ?? null,
    taxRatePercent: row['Line Tax Rate Percentage']
      ? Number(row['Line Tax Rate Percentage'])
      : null,
    amountPence: amount,
  };
}

function isoDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
