import type { VatStagger } from '@tradereports/core';
import type { Business } from './files';
import { remembering } from './remember';

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
  // switched off in Settings: keep nothing
  if (!remembering()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(business));
  } catch {
    // storage blocked: the name still works for this visit
  }
}

// short month names so the choice fits on a phone
export const STAGGERS: { value: VatStagger; label: string }[] = [
  { value: 1, label: 'Mar, Jun, Sep, Dec' },
  { value: 2, label: 'Jan, Apr, Jul, Oct' },
  { value: 3, label: 'Feb, May, Aug, Nov' },
];
