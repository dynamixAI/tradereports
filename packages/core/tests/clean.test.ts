import { describe, expect, it } from 'vitest';
import {
  cleanCountry,
  cleanPostcode,
  readEmails,
  readPhones,
  readUkDate,
  readYesNo,
} from '../src/clean';

describe('cleanPostcode', () => {
  it('keeps a tidy postcode as stated', () => {
    expect(cleanPostcode('WN1 1AA')).toEqual({ origin: 'stated', value: 'WN1 1AA' });
  });

  it('fixes case and spacing, and says it did', () => {
    expect(cleanPostcode('wn71ef')).toEqual({
      origin: 'derived',
      value: 'WN7 1EF',
      rule: 'tidied from "wn71ef"',
    });
    expect(cleanPostcode('wn5 8yz').value).toBe('WN5 8YZ');
    expect(cleanPostcode('m1 1ae').value).toBe('M1 1AE');
    expect(cleanPostcode('EC1A1BB').value).toBe('EC1A 1BB');
  });

  it('leaves something that is not a postcode unknown', () => {
    expect(cleanPostcode('Wigan').origin).toBe('unknown');
    expect(cleanPostcode(null)).toEqual({ origin: 'unknown', value: null, reason: 'no postcode' });
  });
});

describe('cleanCountry', () => {
  it('reads common names for the UK as United Kingdom', () => {
    expect(cleanCountry('UK')).toEqual({
      origin: 'derived',
      value: 'United Kingdom',
      rule: '"UK" read as United Kingdom',
    });
    expect(cleanCountry('United Kingdom').origin).toBe('stated');
  });

  it('leaves other countries as typed', () => {
    expect(cleanCountry('Ireland')).toEqual({ origin: 'stated', value: 'Ireland' });
  });
});

describe('readPhones', () => {
  it('reads UK numbers and tells mobiles from landlines', () => {
    expect(readPhones('07700 900001, 01942 123456').phones).toEqual([
      { number: '07700900001', kind: 'mobile' },
      { number: '01942123456', kind: 'landline' },
    ]);
  });

  it('turns +44 into a leading 0', () => {
    expect(readPhones('+44 7700 900001').phones[0]?.number).toBe('07700900001');
  });

  it('rejects text that is not a number', () => {
    expect(readPhones('Mornings')).toEqual({ phones: [], rejected: ['Mornings'] });
  });
});

describe('readEmails', () => {
  it('splits several addresses and lowercases them', () => {
    expect(readEmails('Ann@Example.com; bob@example.com').emails).toEqual([
      'ann@example.com',
      'bob@example.com',
    ]);
  });

  it('rejects what is not an email', () => {
    expect(readEmails('not-an-email').rejected).toEqual(['not-an-email']);
  });
});

describe('readYesNo', () => {
  it.each([
    ['true', true],
    ['FALSE', false],
    ['Yes', true],
    ['No', false],
  ])('reads %s', (text, value) => {
    expect(readYesNo(text).value).toBe(value);
  });

  it('leaves other words unknown', () => {
    expect(readYesNo('maybe').origin).toBe('unknown');
  });
});

describe('readUkDate', () => {
  it('reads day first', () => {
    expect(readUkDate('02/11/2026')).toBe('2026-11-02');
  });

  it('returns null for anything else', () => {
    expect(readUkDate('Nov 02, 2026')).toBeNull();
  });
});
