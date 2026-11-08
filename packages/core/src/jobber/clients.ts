import { buildAddress, readEmails, readPhones, readUkDate, readYesNo } from '../clean';
import type { CsvRow, CsvTable } from '../csv';
import { checkCustomers } from '../customers';
import type { ConvertIssue, ConvertResult, Customer, Phone } from '../model';

export interface JobberClientOptions {
  businessId: string;
  file: string;
}

// every column Jobber can put a phone number in
const PHONE_COLUMNS = [
  'Main Phone #s',
  'Mobile Phone #s',
  'Work Phone #s',
  'Home Phone #s',
  'Other Phone #s',
  'Text Message Enabled Phone #',
];

// Jobber clients export: one row per client, with a J-ID.
export function convertJobberClients(
  table: CsvTable,
  options: JobberClientOptions,
): ConvertResult<Customer> {
  const issues: ConvertIssue[] = [];

  if (!table.headers.includes('J-ID') || !table.headers.includes('Display Name')) {
    issues.push({
      kind: 'missing-column',
      rows: [1],
      message: "This doesn't look like a Jobber clients export. Missing: J-ID or Display Name.",
    });
    return { records: [], issues };
  }

  const records: Customer[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    // Display Name is what Jobber's reports use as "Client name"
    const name = row['Display Name'];
    if (!name) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `Row ${rowNumber} has no display name.`,
      });
      return;
    }

    const phones = readAllPhones(row, name, rowNumber, issues);
    const { emails, rejected } = readEmails(row['E-mails'] ?? null);
    for (const piece of rejected) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${name}: "${piece}" is not an email address.`,
      });
    }

    const isCompany = readYesNo(row['Is Company?'] ?? null);
    const companyName = row['Company Name'] ?? null;
    if (companyName && isCompany.value === false) {
      issues.push({
        kind: 'bad-value',
        rows: [rowNumber],
        message: `${name} has a company name (${companyName}) but isn't marked as a company.`,
      });
    }

    const first = row['First Name'] ?? '';
    const last = row['Last Name'] ?? '';
    const contactName = `${first} ${last}`.trim() || null;

    records.push({
      businessId: options.businessId,
      sourceId: row['J-ID'] ?? null,
      name,
      contactName,
      isCompany,
      emails,
      phones,
      address: buildAddress(preferredAddress(row)),
      createdDate: readUkDate(row['Created Date'] ?? null),
      archived: readYesNo(row['Archived'] ?? null),
      tags: (row['Tags'] ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
      source: { tool: 'jobber', file: options.file, rows: [rowNumber] },
    });
  });

  checkCustomers(records, issues);
  return { records, issues };
}

// Text in a phone column usually means the column was matched wrongly when the data
// was imported (we saw "Mornings" land in Mobile), so say so once per client.
function readAllPhones(
  row: CsvRow,
  name: string,
  rowNumber: number,
  issues: ConvertIssue[],
): Phone[] {
  const phones: Phone[] = [];
  const problems: string[] = [];
  for (const column of PHONE_COLUMNS) {
    const { phones: found, rejected } = readPhones(row[column] ?? null);
    for (const phone of found) {
      if (!phones.some((p) => p.number === phone.number)) phones.push(phone);
    }
    for (const piece of rejected) problems.push(`"${piece}" in ${column}`);
  }
  if (problems.length > 0) {
    issues.push({
      kind: 'bad-value',
      rows: [rowNumber],
      message: `${name}: ${problems.join(' and ')} ${problems.length === 1 ? 'is not a phone number' : 'are not phone numbers'}. It may have been put in the wrong column when the data was imported.`,
    });
  }
  return phones;
}

// the service address is where the work happens; fall back to billing if it's empty
function preferredAddress(row: CsvRow) {
  const service = {
    street: row['Service Street 1'] ?? null,
    city: row['Service City'] ?? null,
    region: row['Service State'] ?? null,
    postcode: row['Service Zip code'] ?? null,
    country: row['Service Country'] ?? null,
  };
  if (Object.values(service).some((part) => part !== null)) return service;
  return {
    street: row['Billing Street 1'] ?? null,
    city: row['Billing City'] ?? null,
    region: row['Billing State'] ?? null,
    postcode: row['Billing Zip code'] ?? null,
    country: row['Billing Country'] ?? null,
  };
}
