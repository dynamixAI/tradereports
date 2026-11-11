import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBusiness, saveBusiness } from './business';

// tests run in plain Node, so stand in for the browser's storage
const fake = new Map<string, string>();
const storage = {
  getItem: (k: string) => fake.get(k) ?? null,
  setItem: (k: string, v: string) => void fake.set(k, v),
  removeItem: (k: string) => void fake.delete(k),
  clear: () => fake.clear(),
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

describe('remembering the business on this device', () => {
  it('starts empty', () => {
    expect(loadBusiness()).toEqual({ name: '', stagger: 1 });
  });

  it('gives back what was saved', () => {
    saveBusiness({ name: 'Smith Plumbing', stagger: 3 });
    expect(loadBusiness()).toEqual({ name: 'Smith Plumbing', stagger: 3 });
    expect(fake.has('tr-business')).toBe(true);
  });

  it('shrugs off anything odd in storage', () => {
    fake.set('tr-business', 'not json');
    expect(loadBusiness()).toEqual({ name: '', stagger: 1 });
    fake.set('tr-business', JSON.stringify({ name: 42, stagger: 9 }));
    expect(loadBusiness()).toEqual({ name: '', stagger: 1 });
  });
});
