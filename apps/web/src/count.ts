// Anonymous counting with GoatCounter: no cookies, no IP addresses kept, no IDs.
// What is sent: which page was opened, and a few totals (report made, PowerPoint
// downloaded and so on). Nothing about the files, the business or the person.
// Switched off with "Count my visits anonymously" in Settings.
import { SITE } from './site';

const OFF = 'tr-count';
const NOTICE = 'tr-notice';
const REPORTS = 'tr-reports';
const ACTIVE = 'tr-active';

// "this is their 7th report" is sent only as a band, never the number
export function band(n: number): string {
  if (n <= 1) return 'report-1st';
  if (n <= 5) return 'report-2nd-to-5th';
  if (n <= 20) return 'report-6th-to-20th';
  return 'report-21st-plus';
}

export interface Hit {
  path: string;
  title?: string;
  event?: boolean;
  bot?: boolean;
}

// GoatCounter's /count address with the hit in the query
export function countUrl(code: string, hit: Hit): string {
  const q = new URLSearchParams({ p: hit.path });
  if (hit.title) q.set('t', hit.title);
  if (hit.event) q.set('e', 'true');
  // 151 is GoatCounter's number for "automated browser"
  if (hit.bot) q.set('b', '151');
  q.set('rnd', Math.random().toString(36).slice(2, 8));
  return `https://${code}.goatcounter.com/count?${q.toString()}`;
}

export function shouldSend(env: {
  code: string;
  host: string;
  optedOut: boolean;
  gpc: boolean;
}): boolean {
  if (!env.code || env.optedOut || env.gpc) return false;
  // testing on this computer shouldn't add to the numbers
  return !['localhost', '127.0.0.1', '[::1]', ''].includes(env.host);
}

// the tally on this computer: how many visits made a report, and the last month active
export function visitTally(
  kept: { reports: number; month: string | null },
  month: string,
): { reports: number; month: string; newMonth: boolean } {
  return { reports: kept.reports + 1, month, newMonth: kept.month !== month };
}

// the bar that tells people about counting, once, as the UK's statistics exception asks
export function showNotice(env: { seen: boolean; counting: boolean; gpc: boolean }): boolean {
  return !env.seen && env.counting && !env.gpc;
}

// ---- in the browser ----

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function counting(): boolean {
  return read(OFF) !== 'off';
}

export function setCounting(on: boolean): void {
  try {
    if (on) {
      localStorage.removeItem(OFF);
      return;
    }
    // off: stop, and drop the tally too
    localStorage.setItem(OFF, 'off');
    localStorage.removeItem(REPORTS);
    localStorage.removeItem(ACTIVE);
  } catch {
    // storage blocked
  }
}

function gpcOn(): boolean {
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  );
}

function canSend(): boolean {
  if (typeof window === 'undefined') return false;
  return shouldSend({
    code: SITE.counter,
    host: location.hostname,
    optedOut: !counting(),
    gpc: gpcOn(),
  });
}

export function noticeDue(): boolean {
  if (typeof window === 'undefined') return false;
  return showNotice({ seen: read(NOTICE) === 'seen', counting: counting(), gpc: gpcOn() });
}

export function noticeSeen(): void {
  try {
    localStorage.setItem(NOTICE, 'seen');
  } catch {
    // storage blocked: it may show again next time
  }
}

function send(hit: Hit): void {
  if (!canSend()) return;
  const url = countUrl(SITE.counter, { ...hit, bot: navigator.webdriver });
  // sendBeacon keeps going if the page closes; an image is the fallback
  if (!navigator.sendBeacon?.(url)) new Image().src = url;
}

// a page was opened; the hash route is the page ("#/help" counts as "/help")
export function countPage(route: string, title: string): void {
  send({ path: route.replace(/^#/, '') || '/', title });
}

// each step of the funnel counts once per visit, so going back and forth doesn't inflate it
const sent = new Set<string>();
export type Step =
  | 'tool-opened'
  | 'files-added'
  | 'check-columns-opened'
  | 'powerpoint-downloaded'
  | 'copy-opened'
  | 'team-answers-used'
  | 'example-opened';

export function countStep(step: Step): void {
  if (sent.has(step)) return;
  sent.add(step);
  send({ path: step, event: true });
}

// a report was made: the band, and "active this month" the first time each month
export function countReport(now = new Date()): void {
  if (sent.has('report') || !canSend()) return;
  sent.add('report');
  const month = now.toISOString().slice(0, 7);
  const kept = { reports: Number(read(REPORTS)) || 0, month: read(ACTIVE) };
  const next = visitTally(kept, month);
  try {
    localStorage.setItem(REPORTS, String(next.reports));
    localStorage.setItem(ACTIVE, next.month);
  } catch {
    // storage blocked: still count this one
  }
  send({ path: band(next.reports), event: true });
  if (next.newMonth) send({ path: `active-${month}`, event: true });
}
