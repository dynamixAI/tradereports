import type { Invoice, Job, Quote } from '../model';

// Week-by-week and month-by-month counts and totals, worked out from the dates already in
// the files, so the first upload can compare this week with last.

export type Grain = 'week' | 'month';
export type TrendMetric = 'income' | 'invoices' | 'jobsFinished' | 'quotesSent' | 'quotesAccepted';

export interface TrendPoint {
  // first day of the period, YYYY-MM-DD
  start: string;
  // last day of the period, YYYY-MM-DD
  end: string;
  label: string;
  value: number;
  // false for the period the files run up to; it may still be filling up
  complete: boolean;
}

export interface Comparison {
  current: TrendPoint;
  previous: TrendPoint;
  change: number;
  // null when the previous period was nothing, so a percentage means nothing
  percent: number | null;
}

export interface SoFar {
  // the period still filling up, and how many of its days have passed
  current: TrendPoint;
  days: number;
  // the same number of days at the start of the period before
  previousSameDays: number;
}

export interface Trend {
  metric: TrendMetric;
  grain: Grain;
  // every period from the first record to the last, empty ones included, oldest first
  points: TrendPoint[];
  // the last two complete periods, when both are fully covered by the files
  comparison: Comparison | null;
  soFar: SoFar | null;
}

export interface TrendsReport {
  // the newest date in the files, capped at today; periods are counted up to here
  upTo: string | null;
  // the oldest date found; the period it falls in may be only partly covered
  from: string | null;
  trends: Trend[];
}

interface Dated {
  date: string;
  value: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build every trend the files allow, for weeks or months.
export function trends(
  records: { invoices: Invoice[]; jobs: Job[]; quotes: Quote[] },
  grain: Grain,
  today: string,
): TrendsReport {
  const sources = metricSources(records);
  const all = Object.values(sources).flatMap((items) => items ?? []);
  // what the files cover: later dates, such as visits booked for next week, aren't counted
  const dates = all.map((d) => d.date).filter((d) => d <= today);
  const upTo = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const from = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  if (!upTo || !from) return { upTo, from, trends: [] };

  const list: Trend[] = [];
  for (const metric of Object.keys(sources) as TrendMetric[]) {
    const items = sources[metric];
    if (items) list.push(trendOf(metric, items, grain, from, upTo));
  }
  return { upTo, from, trends: list };
}

// the dated items behind each measure; a measure is left out when its file isn't there
function metricSources(records: {
  invoices: Invoice[];
  jobs: Job[];
  quotes: Quote[];
}): Partial<Record<TrendMetric, Dated[]>> {
  const sources: Partial<Record<TrendMetric, Dated[]>> = {};

  if (records.invoices.length > 0) {
    // sent invoices only, by issue date, the same rule as income by month
    const sent = records.invoices.filter((i) => {
      const status = i.status.value;
      return status !== null && status !== 'draft' && status !== 'cancelled' && i.issueDate;
    });
    sources.income = sent.map((i) => ({ date: i.issueDate ?? '', value: i.netPence.value ?? 0 }));
    sources.invoices = sent.map((i) => ({ date: i.issueDate ?? '', value: 1 }));
  }
  if (records.jobs.length > 0) {
    sources.jobsFinished = records.jobs
      .filter((j) => j.completed.value === true && j.completedDate)
      .map((j) => ({ date: j.completedDate ?? '', value: 1 }));
  }
  if (records.quotes.length > 0) {
    sources.quotesSent = records.quotes
      .filter((q) => q.sentDate)
      .map((q) => ({ date: q.sentDate ?? '', value: 1 }));
    sources.quotesAccepted = records.quotes
      .filter((q) => q.acceptedDate)
      .map((q) => ({ date: q.acceptedDate ?? '', value: 1 }));
  }
  return sources;
}

function trendOf(
  metric: TrendMetric,
  items: Dated[],
  grain: Grain,
  from: string,
  upTo: string,
): Trend {
  const points: TrendPoint[] = [];
  for (let start = periodStart(from, grain); start <= upTo; start = nextPeriod(start, grain)) {
    const end = periodEnd(start, grain);
    const value = items
      .filter((item) => item.date >= start && item.date <= end)
      .reduce((sum, item) => sum + item.value, 0);
    points.push({ start, end, label: periodLabel(start, grain), value, complete: end <= upTo });
  }

  // the first period may start before the files do, so it can't be compared fairly
  const fullyCovered = points.filter((p) => p.complete && p.start >= from);
  const current = fullyCovered[fullyCovered.length - 1];
  const previous = fullyCovered[fullyCovered.length - 2];
  const comparison =
    current && previous && previous.end === dayBefore(current.start)
      ? {
          current,
          previous,
          change: current.value - previous.value,
          percent:
            previous.value === 0
              ? null
              : Math.round(((current.value - previous.value) / previous.value) * 100),
        }
      : null;

  return { metric, grain, points, comparison, soFar: soFarOf(points, items, grain, upTo, from) };
}

// the period still filling up, against the same number of days last time
function soFarOf(
  points: TrendPoint[],
  items: Dated[],
  grain: Grain,
  upTo: string,
  from: string,
): SoFar | null {
  const current = points[points.length - 1];
  if (!current || current.complete) return null;
  const days = daysBetween(current.start, upTo) + 1;
  const before = previousPeriod(current.start, grain);
  // last time's matching days: never past the end of that period
  const cutoff = minDate(addDays(before, days - 1), periodEnd(before, grain));
  if (before < from) return null;
  const previousSameDays = items
    .filter((item) => item.date >= before && item.date <= cutoff)
    .reduce((sum, item) => sum + item.value, 0);
  return { current, days, previousSameDays };
}

// weeks start on Monday
export function periodStart(date: string, grain: Grain): string {
  if (grain === 'month') return `${date.slice(0, 7)}-01`;
  const day = toDate(date).getUTCDay();
  // Sunday is 0, so it goes back six days
  return addDays(date, -((day + 6) % 7));
}

function periodEnd(start: string, grain: Grain): string {
  return dayBefore(nextPeriod(start, grain));
}

function nextPeriod(start: string, grain: Grain): string {
  if (grain === 'week') return addDays(start, 7);
  const d = toDate(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return fromDate(d);
}

function previousPeriod(start: string, grain: Grain): string {
  if (grain === 'week') return addDays(start, -7);
  const d = toDate(start);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return fromDate(d);
}

// "w/c 3 Nov" for a week, "Nov 2026" for a month
export function periodLabel(start: string, grain: Grain): string {
  const month = MONTHS[Number(start.slice(5, 7)) - 1] ?? '';
  if (grain === 'month') return `${month} ${start.slice(0, 4)}`;
  return `w/c ${Number(start.slice(8, 10))} ${month}`;
}

function dayBefore(date: string): string {
  return addDays(date, -1);
}

function addDays(date: string, days: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

// dates are plain YYYY-MM-DD, worked out in UTC so clocks changing can't shift a day
function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
