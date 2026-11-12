import { askQuestions, type Answers, type CsvTable } from '@tradereports/core';
import { remembering } from './remember';
import type { Business } from './files';
import type { ToolReport } from './report';

// What the tool remembers between visits: the answers given for each spreadsheet layout,
// so the next upload skips the questions, and a few totals from each report, so the next
// report can say what changed. Kept on this device, and in a file the visitor can save.
// No customer names and no invoice rows: names in "same customer?" answers are hashed.

export const MEMORY_VERSION = 1;
// keep a couple of years of weekly reports, no more
const MAX_SNAPSHOTS = 120;
// a saved file bigger than this isn't one of ours
const MAX_FILE_BYTES = 1_000_000;
const KEY = 'tr-memory';

export interface SavedAnswers {
  columns: Answers['columns'];
  dateOrder?: Answers['dateOrder'];
  status: Answers['status'];
  years: Answers['years'];
  // keyed by a fingerprint of the row, never the row itself
  repairs: Answers['repairs'];
  // "same customer?" answers, keyed by a hash so no names are stored
  names: Record<string, 'same' | 'separate'>;
}

export interface Layout {
  // the sheet's column names, sorted, so the same layout is recognised next time
  signature: string;
  savedAt: string;
  answers: SavedAnswers;
}

// a handful of totals from one report; null where that part wasn't in the files
export interface Snapshot {
  // when the report was first shown, as an ISO time; also names the snapshot
  at: string;
  asOf: string;
  owedPence: number | null;
  overduePence: number | null;
  notBilledPence: number | null;
  agreedPence: number | null;
  toFix: number;
}

export interface Memory {
  version: number;
  layouts: Layout[];
  snapshots: Snapshot[];
}

export interface SavedFile {
  kind: 'tradereports';
  version: number;
  savedAt: string;
  business: Business;
  memory: Memory;
}

export function emptyMemory(): Memory {
  return { version: MEMORY_VERSION, layouts: [], snapshots: [] };
}

// ---------- layouts and answers ----------

export function signature(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .sort()
    .join('|');
}

export function toSaved(answers: Answers): SavedAnswers {
  const names: SavedAnswers['names'] = {};
  for (const [id, choice] of Object.entries(answers.names)) names[hashKey(id)] = choice;
  return {
    columns: answers.columns,
    ...(answers.dateOrder ? { dateOrder: answers.dateOrder } : {}),
    status: answers.status,
    years: answers.years,
    repairs: answers.repairs,
    names,
  };
}

// Turn saved answers back into answers for this sheet. Name answers are matched by
// hashing the questions this sheet asks, since the names themselves weren't kept.
export function restore(table: CsvTable, saved: SavedAnswers): Answers {
  const answers: Answers = {
    columns: { ...saved.columns },
    ...(saved.dateOrder ? { dateOrder: saved.dateOrder } : {}),
    status: { ...saved.status },
    years: { ...saved.years },
    repairs: { ...saved.repairs },
    names: {},
  };
  // name questions can appear once others are answered, so look a few times
  for (let pass = 0; pass < 3; pass += 1) {
    let added = false;
    for (const q of askQuestions(table, answers)) {
      const id =
        q.kind === 'same-customer' ? q.match.id : q.kind === 'split-customer' ? q.split.id : null;
      if (id === null || id in answers.names) continue;
      const choice = saved.names[hashKey(id)];
      if (choice) {
        answers.names[id] = choice;
        added = true;
      }
    }
    if (!added) break;
  }
  return answers;
}

export function findLayout(memory: Memory, headers: string[]): Layout | undefined {
  const sig = signature(headers);
  return memory.layouts.find((l) => l.signature === sig);
}

export function rememberLayout(memory: Memory, headers: string[], answers: Answers, now: string) {
  const sig = signature(headers);
  const layout: Layout = { signature: sig, savedAt: now, answers: toSaved(answers) };
  return { ...memory, layouts: [...memory.layouts.filter((l) => l.signature !== sig), layout] };
}

// ---------- snapshots ----------

export function snapshotOf(report: ToolReport, at: string): Snapshot {
  const { owed, unbilled } = report;
  return {
    at,
    asOf: report.asOf,
    owedPence: owed ? owed.owedPence : null,
    // without due dates, overdue means nothing
    overduePence: owed && !owed.noDueDates ? owed.overduePence : null,
    // finished work not billed can only be known from a jobs file
    notBilledPence: unbilled && report.hasJobs ? unbilled.doneNotBilledPence : null,
    agreedPence: unbilled ? unbilled.agreedNotStartedPence : null,
    toFix: report.health.toFix,
  };
}

// add this visit's snapshot, replacing the one it made earlier in the same visit
export function recordSnapshot(memory: Memory, snapshot: Snapshot): Memory {
  const others = memory.snapshots.filter((s) => s.at !== snapshot.at);
  const snapshots = [...others, snapshot].sort((a, b) => a.at.localeCompare(b.at));
  return { ...memory, snapshots: snapshots.slice(-MAX_SNAPSHOTS) };
}

// the most recent report from before this visit
export function lastBefore(memory: Memory, at: string): Snapshot | null {
  const earlier = memory.snapshots.filter((s) => s.at < at);
  return earlier[earlier.length - 1] ?? null;
}

// ---------- combining two memories ----------

// a saved file opened on top of what this device remembers: newest answers win, and
// reports from both are kept
export function mergeMemory(a: Memory, b: Memory): Memory {
  const layouts = new Map<string, Layout>();
  for (const l of [...a.layouts, ...b.layouts]) {
    const have = layouts.get(l.signature);
    if (!have || l.savedAt > have.savedAt) layouts.set(l.signature, l);
  }
  const snapshots = new Map<string, Snapshot>();
  for (const s of [...a.snapshots, ...b.snapshots]) snapshots.set(s.at, s);
  return {
    version: MEMORY_VERSION,
    layouts: [...layouts.values()],
    snapshots: [...snapshots.values()]
      .sort((x, y) => x.at.localeCompare(y.at))
      .slice(-MAX_SNAPSHOTS),
  };
}

// ---------- the saved file ----------

export function savedFile(business: Business, memory: Memory, now: string): SavedFile {
  return { kind: 'tradereports', version: MEMORY_VERSION, savedAt: now, business, memory };
}

// "2026-11-11 Smith Plumbing answers.json"
export function savedFileName(asOf: string, businessName: string): string {
  const safe = businessName
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${asOf} ${safe || 'Business'} answers.json`;
}

// Read a saved file, checking every part, since anyone could hand us any file.
export function readSavedFile(text: string): SavedFile | string {
  if (text.length > MAX_FILE_BYTES) return 'This file is too big to be a TradeReports file.';
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "This isn't a TradeReports file. Choose the file the tool saved for you.";
  }
  if (!isObject(data) || data.kind !== 'tradereports') {
    return "This isn't a TradeReports file. Choose the file the tool saved for you.";
  }
  if (typeof data.version !== 'number' || data.version > MEMORY_VERSION) {
    return 'This file was saved by a newer version of TradeReports. Refresh the page and try again.';
  }
  const business = isObject(data.business) ? data.business : {};
  const memory = isObject(data.memory) ? data.memory : {};
  return {
    kind: 'tradereports',
    version: MEMORY_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    business: {
      name: typeof business.name === 'string' ? business.name.trim().slice(0, 80) : '',
      stagger: business.stagger === 2 || business.stagger === 3 ? business.stagger : 1,
    },
    memory: {
      version: MEMORY_VERSION,
      layouts: arrayOf(memory.layouts, readLayout),
      snapshots: arrayOf(memory.snapshots, readSnapshot).slice(-MAX_SNAPSHOTS),
    },
  };
}

function readLayout(x: unknown): Layout | null {
  if (!isObject(x) || typeof x.signature !== 'string' || !isObject(x.answers)) return null;
  const a = x.answers;
  const columns: SavedAnswers['columns'] = {};
  if (isObject(a.columns)) {
    for (const [field, header] of Object.entries(a.columns)) {
      if (typeof header === 'string' || header === null) {
        (columns as Record<string, string | null>)[field] = header;
      }
    }
  }
  const dateOrder =
    a.dateOrder === 'day-first' || a.dateOrder === 'month-first' ? a.dateOrder : undefined;
  return {
    signature: x.signature,
    savedAt: typeof x.savedAt === 'string' ? x.savedAt : '',
    answers: {
      columns,
      ...(dateOrder ? { dateOrder } : {}),
      status: recordOf(a.status, (v) =>
        v === 'paid' || v === 'unpaid' || v === 'part paid' || v === 'ignore' ? v : null,
      ),
      years: recordOf(a.years, (v) => (typeof v === 'number' && v > 1900 && v < 2200 ? v : null)),
      repairs: recordOf(a.repairs, (v) => (v === 'accept' || v === 'reject' ? v : null)),
      names: recordOf(a.names, (v) => (v === 'same' || v === 'separate' ? v : null)),
    },
  };
}

function readSnapshot(x: unknown): Snapshot | null {
  if (!isObject(x) || typeof x.at !== 'string' || typeof x.asOf !== 'string') return null;
  const pence = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    at: x.at,
    asOf: x.asOf,
    owedPence: pence(x.owedPence),
    overduePence: pence(x.overduePence),
    notBilledPence: pence(x.notBilledPence),
    agreedPence: pence(x.agreedPence),
    toFix: pence(x.toFix) ?? 0,
  };
}

// ---------- this device ----------

export function loadMemory(): Memory {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyMemory();
    const parsed = readSavedFile(
      JSON.stringify({ kind: 'tradereports', version: MEMORY_VERSION, memory: JSON.parse(raw) }),
    );
    return typeof parsed === 'string' ? emptyMemory() : parsed.memory;
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(memory: Memory): void {
  // switched off in Settings: keep nothing
  if (!remembering()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // storage blocked or full: the saved file still works
  }
}

// ---------- helpers ----------

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function arrayOf<T>(x: unknown, read: (item: unknown) => T | null): T[] {
  if (!Array.isArray(x)) return [];
  return x.map(read).filter((item): item is T => item !== null);
}

function recordOf<T>(x: unknown, read: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObject(x)) return out;
  for (const [key, value] of Object.entries(x)) {
    const v = read(value);
    if (v !== null) out[key] = v;
  }
  return out;
}

// FNV-1a: a short stand-in for a name, so it isn't readable in the file; the same on
// every machine. Not a secret: a known name could be checked against it.
export function hashKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `h${hash.toString(16).padStart(8, '0')}`;
}
