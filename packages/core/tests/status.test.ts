import { describe, expect, it } from 'vitest';
import { readStatus } from '../src/status';

describe('readStatus', () => {
  it.each([
    ['Paid', 'paid'],
    ['PAID - cash', 'paid'],
    ['paid 3/4', 'paid'],
    ['Settled (bank)', 'paid'],
    ['cleared 12 Jan', 'paid'],
    ['Received in full', 'paid'],
    ['y', 'paid'],
    ['Not paid yet', 'unpaid'],
    ['unpaid - left a message', 'unpaid'],
    ['owes £40', 'unpaid'],
    ['chased twice', 'unpaid'],
    ['Overdue!!', 'unpaid'],
    ['awaiting the landlord', 'unpaid'],
    ['n', 'unpaid'],
    ['part-paid', 'part paid'],
    ['Part paid (deposit)', 'part paid'],
    ['Bank', 'method'],
    ['cheque', 'method'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(readStatus(text)).toBe(expected);
  });

  it.each(['', '30 days', 'see notes', 'Boiler service', 'Prepaid card topped up'])(
    'does not read "%s" as a status',
    (text) => {
      expect(readStatus(text)).not.toBe('paid');
      expect(readStatus(text)).not.toBe('unpaid');
    },
  );
});
