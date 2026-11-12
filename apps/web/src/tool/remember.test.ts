import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBusiness, saveBusiness } from './business';
import { emptyMemory, loadMemory, saveMemory } from './memory';
import { remembering, setRemembering } from './remember';

// tests run in plain Node, so stand in for the browser's storage
const fake = new Map<string, string>();
const storage = {
  getItem: (k: string) => fake.get(k) ?? null,
  setItem: (k: string, v: string) => void fake.set(k, v),
  removeItem: (k: string) => void fake.delete(k),
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});
beforeEach(() => {
  fake.clear();
});

const someMemory = () => ({
  ...emptyMemory(),
  layouts: [{ signature: 'abc', savedAt: '2026-11-11T10:00:00Z', answers: { columns: {} } }],
});

describe('the "Remember my answers" switch', () => {
  it('is on to start with', () => {
    expect(remembering()).toBe(true);
  });

  it('keeps the business and answers while on', () => {
    saveBusiness({ name: 'Smith Plumbing', stagger: 2 });
    saveMemory(someMemory() as never);
    expect(loadBusiness().name).toBe('Smith Plumbing');
    expect(loadMemory().layouts).toHaveLength(1);
  });

  it('removes what was kept when switched off', () => {
    saveBusiness({ name: 'Smith Plumbing', stagger: 2 });
    saveMemory(someMemory() as never);
    setRemembering(false);
    expect(remembering()).toBe(false);
    expect(loadBusiness().name).toBe('');
    expect(loadMemory().layouts).toHaveLength(0);
  });

  it('keeps nothing new while off', () => {
    setRemembering(false);
    saveBusiness({ name: 'Smith Plumbing', stagger: 2 });
    saveMemory(someMemory() as never);
    expect(loadBusiness().name).toBe('');
    expect(loadMemory().layouts).toHaveLength(0);
  });

  it('starts keeping again when switched back on', () => {
    setRemembering(false);
    setRemembering(true);
    saveBusiness({ name: 'Smith Plumbing', stagger: 2 });
    expect(loadBusiness().name).toBe('Smith Plumbing');
  });
});
