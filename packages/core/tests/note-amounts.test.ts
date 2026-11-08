import { describe, expect, it } from 'vitest';
import { readNoteAmount } from '../src/note-amounts';

// all on an invoice of £2,160.00 unless the test says otherwise
const read = (note: string, gross = 216000) => {
  const found = readNoteAmount(note, gross);
  return found ? [found.paidPence, found.duePence] : null;
};

describe('an amount paid', () => {
  it.each([
    ['£1,000 paid towards £2,160', [100000, 116000]],
    ['paid £1000 on the day', [100000, 116000]],
    ['Deposit £500 received', [50000, 166000]],
    ['deposit received 50 - balance shown on invoice', [5000, 211000]],
    ['Part-payment of £1500 recvd 14/10, rem due', [150000, 66000]],
    ['part paid (50% deposit)', [108000, 108000]],
    ['£ 750 paid by BACS', [75000, 141000]],
  ])('reads "%s"', (note, expected) => {
    expect(read(note)).toEqual(expected);
  });
});

describe('an amount owed', () => {
  it.each([
    ['balance £1,160 due', [100000, 116000]],
    ['£400 still outstanding', [176000, 40000]],
    ['owes 300', [186000, 30000]],
  ])('reads "%s"', (note, expected) => {
    expect(read(note)).toEqual(expected);
  });
});

describe('both', () => {
  it('uses both when they add up to the total', () => {
    const found = readNoteAmount('deposit £1,000 paid, balance £1,160 due', 216000);
    expect(found?.evidence).toEqual([
      'The note says £1,000.00 paid and £1,160.00 still owed, which add up to the total £2,160.00.',
    ]);
  });

  it('suggests nothing when they do not add up', () => {
    expect(read('deposit £1,000 paid, balance £900 due')).toBeNull();
  });
});

describe('nothing to read', () => {
  it.each([
    ['part paid', 'no amount'],
    ['paid 30/1', 'a date, not an amount'],
    ['call 07700 900123 about the rest', 'a phone number'],
    ['£2,160 invoiced, some paid', 'the total itself'],
    ['paid £3,000 for the van last year', 'more than the total'],
    ['paid £200 then paid £300', 'two different paid amounts'],
    ['rang about the boiler', 'no amount and no keyword'],
    ['job 1450 done', 'a number with no paid or owed word'],
  ])('"%s" (%s)', (note) => {
    expect(read(note)).toBeNull();
  });
});
