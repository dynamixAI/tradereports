import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { convertJobberClients } from '../src/jobber/clients';
import { convertTradifyCustomers } from '../src/tradify/customers';

const options = { businessId: 'test-business', file: 'customers.csv' };

function table(path: string) {
  return readCsv(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

describe('convertJobberClients with the real export', () => {
  const { records, issues } = convertJobberClients(table('jobber/clients-export.csv'), options);
  const find = (name: string) => records.find((customer) => customer.name === name);

  it('reads all 30 clients with their J-ID and display name', () => {
    expect(records).toHaveLength(30);
    expect(find('Alice Test')?.sourceId).toBe('158087529_163990362');
    expect(find('Frank Mock Ltd')?.contactName).toBe('Frank Mock');
  });

  it('reads the day-first created date', () => {
    expect(find('Alice Test')?.createdDate).toBe('2026-11-02');
  });

  it('tidies the messy postcode and the UK country name', () => {
    expect(find('Emma Fake')?.address?.postcode.value).toBe('WN7 1EF');
    expect(find('Emma Fake')?.address?.postcodeAsTyped).toBe('wn71ef');
    expect(find('Zara Testcase')?.address?.country).toEqual({
      origin: 'derived',
      value: 'United Kingdom',
      rule: '"UK" read as United Kingdom',
    });
  });

  it('finds the phone number among the wrongly imported text', () => {
    expect(find('Zara Testcase')?.phones).toEqual([{ number: '07700900026', kind: 'mobile' }]);
  });

  it('reports the five clients with text in phone columns', () => {
    const phoneIssues = issues.filter((issue) => issue.message.includes('not phone numbers'));
    expect(phoneIssues).toHaveLength(5);
    expect(phoneIssues[0]?.message).toContain('"Mornings" in Mobile Phone #s');
  });

  it('spots a company name on a client not marked as a company', () => {
    const companyIssues = issues.filter((issue) => issue.message.includes('company name'));
    expect(companyIssues.map((issue) => issue.message)).toEqual([
      "Bella Fauxname has a company name (Fauxname Builders Ltd) but isn't marked as a company.",
    ]);
  });

  it('keeps company flags, tags and archived as stated', () => {
    expect(find('Frank Mock Ltd')?.isCompany).toEqual({ origin: 'stated', value: true });
    expect(find('Alice Test')?.tags).toEqual(['Test data']);
    expect(find('Alice Test')?.archived.value).toBe(false);
  });

  it('raises nothing else', () => {
    expect(issues).toHaveLength(6);
  });
});

describe('convertTradifyCustomers with the real export', () => {
  const { records, issues } = convertTradifyCustomers(
    table('tradify/customers-export.csv'),
    options,
  );
  const find = (name: string) => records.find((customer) => customer.name === name);

  it('reads all 27 customers with their Tradify Id', () => {
    expect(records).toHaveLength(27);
    expect(find('Test')?.sourceId).toBe('7696efe7-f6f8-4f95-81bc-a15e3ac973e1');
    expect(find('Test')?.contactName).toBe('Alice');
  });

  it('knows a mobile when it sits in the Phone Number column', () => {
    expect(find('Copy')?.phones).toEqual([{ number: '07700900020', kind: 'mobile' }]);
  });

  it('tidies postcodes and countries', () => {
    expect(find('Fake')?.address?.postcode.origin).toBe('derived');
    expect(find('Fauxname')?.address?.country.value).toBe('United Kingdom');
  });

  it('does not guess whether a customer is a company', () => {
    expect(find('Test')?.isCompany.origin).toBe('unknown');
  });

  it('reads the date part of Created On and the Archived word', () => {
    expect(find('Test')?.createdDate).toBe('2026-11-03');
    expect(find('Test')?.archived).toEqual({ origin: 'stated', value: false });
  });

  it('finds nothing wrong with this file', () => {
    expect(issues).toEqual([]);
  });
});

describe('customer checks with problem files', () => {
  it('flags two customers with the same name', () => {
    const text = 'Customer Name,Tradify Id\nSmith,a1\nSMITH,a2\nJones,a3\n';
    const { issues } = convertTradifyCustomers(readCsv(text), options);
    expect(issues.map((issue) => [issue.kind, issue.rows])).toEqual([['duplicate-name', [2, 3]]]);
  });

  it('reports a postcode it cannot read', () => {
    const text = 'Customer Name,Tradify Id,Physical Address Postal Code\nSmith,a1,Wigan\n';
    const { records, issues } = convertTradifyCustomers(readCsv(text), options);
    expect(records[0]?.address?.postcode.origin).toBe('unknown');
    expect(issues[0]?.message).toContain('"Wigan" is not a UK postcode');
  });

  it('refuses files that are not customer exports', () => {
    const tradify = convertTradifyCustomers(readCsv('Name\nA\n'), options);
    const jobber = convertJobberClients(readCsv('Name\nA\n'), options);
    expect(tradify.issues[0]?.kind).toBe('missing-column');
    expect(jobber.issues[0]?.kind).toBe('missing-column');
  });
});
