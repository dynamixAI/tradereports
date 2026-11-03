import { describe, expect, it } from 'vitest';
import { parseMoney } from '../src/money';

// parseMoney turns money text from an export into whole pence,
// or null if the text isn't a valid amount
describe('parseMoney', () => {
  it('reads pounds with a symbol and thousands commas', () => {
    expect(parseMoney('£1,234.50')).toBe(123450);
  });

  it('reads plain numbers', () => {
    expect(parseMoney('1234.5')).toBe(123450);
    expect(parseMoney('99')).toBe(9900);
  });

  it('accepts a dollar sign, since some exports use $ even for UK accounts', () => {
    expect(parseMoney('$99.00')).toBe(9900);
  });

  it('treats brackets and minus signs as negative', () => {
    expect(parseMoney('(£20.00)')).toBe(-2000);
    expect(parseMoney('-£20')).toBe(-2000);
    expect(parseMoney('£-20')).toBe(-2000);
  });

  it('handles zero and extra spaces', () => {
    expect(parseMoney('  £0.00 ')).toBe(0);
  });

  it('avoids floating point errors', () => {
    expect(parseMoney('0.10')).toBe(10);
    expect(parseMoney('1.005')).toBe(101);
  });

  it('returns null for empty or invalid text', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('£12.34.56')).toBeNull();
    expect(parseMoney('--20')).toBeNull();
  });
});
