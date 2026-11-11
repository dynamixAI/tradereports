import type { VatStagger } from '@tradereports/core';
import type { Business } from './files';

// The business name and VAT quarters are kept on this device only, so they don't have to
// be typed again. "Clear my saved data" in the menu removes them.
const KEY = 'tr-business';

export function loadBusiness(): Business {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { name: '', stagger: 1 };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { name: '', stagger: 1 };
    const { name, stagger } = parsed as { name?: unknown; stagger?: unknown };
    return {
      name: typeof name === 'string' ? name.slice(0, 80) : '',
      stagger: stagger === 2 || stagger === 3 ? stagger : 1,
    };
  } catch {
    // storage blocked, or something odd saved: start fresh
    return { name: '', stagger: 1 };
  }
}

export function saveBusiness(business: Business): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(business));
  } catch {
    // storage blocked: the name still works for this visit
  }
}

export const STAGGERS: { value: VatStagger; label: string }[] = [
  { value: 1, label: 'March, June, September, December' },
  { value: 2, label: 'January, April, July, October' },
  { value: 3, label: 'February, May, August, November' },
];
