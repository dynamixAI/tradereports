import { describe, expect, it } from 'vitest';
import { EXAMPLE_DATE, exampleTool } from './example';
import { needsQuestions } from './files';

describe('the example report', () => {
  it('fills every slot from the made-up files, with nothing left to ask', async () => {
    const state = await exampleTool();
    expect(state.files.map((f) => f.slot).sort()).toEqual([
      'customers',
      'invoices',
      'jobs',
      'quotes',
      'visits',
    ]);
    expect(state.waiting).toEqual([]);
    expect(state.unsure).toEqual([]);
    expect(state.files.some(needsQuestions)).toBe(false);
  });

  it('opens on the report, marked as an example, with a made-up business', async () => {
    const state = await exampleTool();
    expect(state.step).toBe('report');
    expect(state.example).toBe(true);
    expect(state.business.name).toMatch(/example/i);
  });

  it('carries none of the visitor’s own answers or past totals', async () => {
    const state = await exampleTool();
    expect(state.memory.layouts).toEqual([]);
    expect(state.memory.snapshots).toEqual([]);
  });

  it('is worked out on a fixed day, so it reads the same whenever it is opened', () => {
    expect(EXAMPLE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
