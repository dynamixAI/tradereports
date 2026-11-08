import type { ConvertIssue, Customer } from './model';

// Checks every customer converter runs, whichever tool the file came from.
export function checkCustomers(customers: Customer[], issues: ConvertIssue[]): void {
  for (const customer of customers) {
    const postcode = customer.address?.postcode;
    // an empty postcode is fine; one we can't read is worth a look
    if (postcode?.origin === 'unknown' && customer.address?.postcodeAsTyped) {
      issues.push({
        kind: 'bad-value',
        rows: customer.source.rows,
        message: `${customer.name}: ${postcode.reason}, so they can't be placed in an area.`,
      });
    }
  }

  // other files refer to customers by name, so two with one name can't be told apart
  const byName = new Map<string, Customer[]>();
  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), customer]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    issues.push({
      kind: 'duplicate-name',
      rows: group.flatMap((customer) => customer.source.rows),
      message: `${group.length} customers are called "${group[0]?.name ?? ''}". Invoices and quotes only give a name, so their figures may be mixed together.`,
    });
  }
}
