import { cleanCountry, cleanPostcode } from '../clean';
import type { CsvTable } from '../csv';
import {
  derived,
  unknown,
  type Address,
  type ConvertIssue,
  type ConvertResult,
  type Job,
} from '../model';

export interface TradifyJobOptions {
  businessId: string;
  file: string;
}

const NO_MONEY = 'the Tradify jobs export has no money columns';

// Tradify jobs export: one row per job, no money and no links to quotes or invoices.
export function convertTradifyJobs(
  table: CsvTable,
  options: TradifyJobOptions,
): ConvertResult<Job> {
  const issues: ConvertIssue[] = [];

  if (!table.headers.includes('Job Number')) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: "This doesn't look like a Tradify jobs export. Missing: Job Number.",
    });
    return { records: [], issues };
  }

  const records: Job[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const number = row['Job Number'];
    if (!number) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no job number.`,
      });
      return;
    }
    const signedOff = isoDate(row['Signed Off On']);

    records.push({
      businessId: options.businessId,
      number,
      customerName: row['Customer'] ?? null,
      title: row['Description'] ?? null,
      // links live in the quote and invoice files, not here
      quoteNumbers: [],
      invoiceNumbers: [],
      createdDate: isoDate(row['Entered On']),
      scheduledDate: null,
      completedDate: signedOff,
      // Tradify only records a finished job when it is signed off
      completed: signedOff
        ? derived(true, 'signed off')
        : unknown('not signed off; Tradify does not otherwise say when a job is finished'),
      stageAsTyped: row['Status'] ?? null,
      categories: [row['Category #1'], row['Category #2']].filter(
        (value): value is string => !!value,
      ),
      itemNames: [],
      address: splitAddress(row['Job Address'] ?? null),
      revenuePence: unknown(NO_MONEY),
      costPence: unknown(NO_MONEY),
      profitPence: unknown(NO_MONEY),
      source: { tool: 'tradify', file: options.file, rows: [rowNumber] },
    });
  });
  return { records, issues };
}

// "5 Fake Close, Leigh, wn71ef, United Kingdom": find the postcode among the parts,
// treat the last part as the country, and keep the rest as the street.
function splitAddress(text: string | null): Address | null {
  if (!text) return null;
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const postcodeIndex = parts.findIndex((part) => cleanPostcode(part).value !== null);
  const postcodeText = postcodeIndex >= 0 ? (parts[postcodeIndex] ?? null) : null;
  const last = parts[parts.length - 1] ?? null;
  const countryText =
    last !== null && parts.length - 1 !== postcodeIndex && parts.length > 1 ? last : null;
  const before = parts.slice(
    0,
    postcodeIndex >= 0 ? postcodeIndex : countryText ? -1 : parts.length,
  );

  return {
    street: before.length > 1 ? before.slice(0, -1).join(', ') : (before[0] ?? null),
    city: before.length > 1 ? (before[before.length - 1] ?? null) : null,
    region: null,
    postcodeAsTyped: postcodeText,
    postcode: cleanPostcode(postcodeText),
    countryAsTyped: countryText,
    country: cleanCountry(countryText),
  };
}

// "2026-11-05 14:27" -> "2026-11-05"
function isoDate(value: string | null | undefined): string | null {
  const date = value?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
