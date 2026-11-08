// visitor settings, kept in this browser only
export type Theme = 'dark' | 'light';

const THEME_KEY = 'tr-theme';
const MOTION_KEY = 'tr-motion';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // storage blocked: behave as if nothing was saved
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the setting lasts until the page closes
  }
}

// saved choice first, then the computer's setting
export function initialTheme(): Theme {
  const saved = read(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
}

// true when motion should be kept to a minimum
export function initialCalm(): boolean {
  const saved = read(MOTION_KEY);
  if (saved === 'reduce') return true;
  if (saved === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function saveCalm(calm: boolean): void {
  write(MOTION_KEY, calm ? 'reduce' : 'full');
}

// put the settings on the page so the CSS can follow them
export function applySettings(theme: Theme, calm: boolean): void {
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.dataset['motion'] = calm ? 'reduce' : 'full';
}

// forget everything this site saved in the browser
export function clearSaved(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tr-')) localStorage.removeItem(key);
    }
  } catch {
    // storage blocked: nothing was saved
  }
}
