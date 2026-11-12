// The "Remember my answers" switch in Settings.
// On (the default): the business name, column answers and report totals are kept in this
// browser. Off: nothing is kept, and what was kept is removed.
const KEY = 'tr-remember';
const KEPT = ['tr-business', 'tr-memory'];

export function remembering(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    // storage blocked: nothing can be kept anyway
    return false;
  }
}

export function setRemembering(on: boolean): void {
  try {
    if (on) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, 'off');
    for (const key of KEPT) localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing to remove
  }
}
