import { describe, expect, it } from 'vitest';
import { derived, stated, unknown } from '../src/model';

describe('Known values', () => {
  it('marks a value read from a column', () => {
    expect(stated(6750)).toEqual({ origin: 'stated', value: 6750 });
  });

  it('marks a worked-out value with its rule', () => {
    expect(derived('paid', 'nothing left due')).toEqual({
      origin: 'derived',
      value: 'paid',
      rule: 'nothing left due',
    });
  });

  it('keeps an unknown value as null, never zero', () => {
    const value = unknown<number>('no cost column');
    expect(value.value).toBeNull();
    expect(value).toEqual({ origin: 'unknown', value: null, reason: 'no cost column' });
  });
});
