import { describe, expect, it } from 'vitest';
import { EXAMPLE_FEATURES, formatValue } from './features';

describe('formatValue', () => {
  it('shows money as whole pounds with commas', () => {
    expect(formatValue(6420, true)).toBe('£6,420');
    expect(formatValue(12480, true)).toBe('£12,480');
  });

  it('rounds to the nearest pound', () => {
    expect(formatValue(1849.6, true)).toBe('£1,850');
  });

  it('shows counts without a pound sign', () => {
    expect(formatValue(7, false)).toBe('7');
  });
});

describe('EXAMPLE_FEATURES', () => {
  it('covers every result the tool gives', () => {
    expect(EXAMPLE_FEATURES).toHaveLength(8);
  });

  it('uses no negative figures', () => {
    for (const f of EXAMPLE_FEATURES) expect(f.value).toBeGreaterThanOrEqual(0);
  });
});
