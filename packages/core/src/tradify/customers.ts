import { buildAddress, readEmails, readPhones, readYesNo } from '../clean';
import type { CsvTable } from '../csv';
import { checkCustomers } from '../customers';
import { unknown, type ConvertIssue, type ConvertResult, type Customer } from '../model';

export interface TradifyCustomerOptions {
  businessId: string;
  file: string;
}

// Tradify customers export: one row per customer, with a Tradify Id.
export function convertTradifyCustomers(
  table: CsvTable,
  options: TradifyCustomerOptions,
): ConvertResult<Customer> {
  const issues: ConvertIssue[] = [];

  if (!table.headers.includes('Customer Name') || !table.headers.includes('Tradify Id')) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message:
        "This doesn't look like a Tradify customers export. Missing: Customer Name or Tradify Id.",
    });
    return { records: [], issues };
  }

  const records: Customer[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const name = row['Customer Name'];
    if (!name) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no customer name.`,
      });
      return;
    }

    // Tradify's "Phone Number" often holds a mobile; the number itself says which it is
    const phoneColumns = ['Phone Number', 'Mobile Number'];
    const phones = phoneColumns.flatMap((column) => {
      const { phones: found, rejected } = readPhones(row[column] ?? null);
      for (const piece of rejected) {
        issues.push({
          kind: 'bad-value',
          rows: [rowNumber],
          message: `${name}: "${piece}" in ${column} is not a phone number.`,
        });
      }
      return found;
    });

    const { emails, rejected } = readEmails(row['Email Address'] ?? null);
    for (const piece of rejected) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${name}: "${piece}" is not an email address.`,
      });
    }

    records.push({
      businessId: options.businessId,
      sourceId: row['Tradify Id'] ?? null,
      name,
      contactName: row['Contact Name'] ?? null,
      // Tradify has no company flag
      isCompany: unknown('Tradify does not record whether a customer is a company'),
      emails,
      phones: uniquePhones(phones),
      address: buildAddress({
        street: row['Physical Address Street'] ?? null,
        city: row['Physical Address City'] ?? null,
        region: row['Physical Address Region'] ?? null,
        postcode: row['Physical Address Postal Code'] ?? null,
        country: row['Physical Address Country'] ?? null,
      }),
      // "2026-11-03 21:35" -> the date part
      createdDate: row['Created On']?.slice(0, 10) ?? null,
      archived: readYesNo(row['Archived'] ?? null),
      tags: [],
      source: { tool: 'tradify', file: options.file, rows: [rowNumber] },
    });
  });

  checkCustomers(records, issues);
  return { records, issues };
}

function uniquePhones<T extends { number: string }>(phones: T[]): T[] {
  return phones.filter(
    (phone, index) => phones.findIndex((p) => p.number === phone.number) === index,
  );
}
