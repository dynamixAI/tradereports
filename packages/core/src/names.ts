import type { CsvTable } from './csv';
import { columnKind } from './repairs';

// Possible same customer (ADR 0007). Names that differ only in spacing, capitals or
// apostrophes are grouped into one question; typos and stray symbols are asked one at a
// time, with evidence from the phone, email and postcode columns. Nothing is merged
// unless the user says so.

export interface NameMatch {
  // the same file always gives the same id, so answers can be saved
  id: string;
  // the spelling to change, and the one to use instead
  variant: string;
  canonical: string;
  // spreadsheet rows that have the variant
  rows: number[];
  // tidy differences can be confirmed together; typos are asked one by one
  tidyOnly: boolean;
  evidence: string[];
}

// For comparing only: the value shown and saved stays as typed unless the user accepts.
export function tidyName(text: string): string {
  return text
    .trim()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\b(mr|mrs|ms|miss|dr)\./gi, '$1')
    .toLowerCase();
}

// Letters, digits and single spaces only: "dav;id  smith" -> "david smith"
function bare(text: string): string {
  return tidyName(text)
    .replace(/[^a-z0-9' ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Letters to change, add or remove, with two letters swapped counting as one change
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const row = d[i] as number[];
      const up = d[i - 1] as number[];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((up[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (up[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] ?? 0, ((d[i - 2] as number[])[j - 2] ?? 0) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] ?? 0;
}

// how many changes still count as a typo: none for short names, more for long ones
function limit(name: string): number {
  const letters = name.replace(/[^a-z]/g, '').length;
  if (letters <= 4) return 0;
  if (letters <= 8) return 1;
  return 2;
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('');

interface Spelling {
  text: string;
  rows: number[];
  // contact details seen on its rows, by kind
  contacts: Map<string, Set<string>>;
}

export function findNameMatches(table: CsvTable, customerColumn: string): NameMatch[] {
  // phone, email and postcode columns give evidence about who a row is for
  const contactColumns = table.headers.filter((header) => {
    const kind = columnKind(table.rows.map((row) => row[header] ?? null));
    return kind === 'phone' || kind === 'email' || kind === 'postcode';
  });

  // every spelling, with its rows and contact details
  const spellings = new Map<string, Spelling>();
  table.rows.forEach((row, index) => {
    const text = row[customerColumn];
    if (!text) return;
    const spelling: Spelling = spellings.get(text) ?? {
      text,
      rows: [],
      contacts: new Map<string, Set<string>>(),
    };
    spelling.rows.push(table.rowNumbers[index] ?? index + 2);
    for (const header of contactColumns) {
      const value = row[header];
      if (!value) continue;
      const seen = spelling.contacts.get(header) ?? new Set<string>();
      seen.add(value.replace(/\s+/g, '').toLowerCase());
      spelling.contacts.set(header, seen);
    }
    spellings.set(text, spelling);
  });

  // spellings that tidy to the same name are one name; the most used spelling leads
  const groups = new Map<string, Spelling[]>();
  for (const spelling of spellings.values()) {
    const key = tidyName(spelling.text);
    groups.set(key, [...(groups.get(key) ?? []), spelling]);
  }
  const first = (spelling: Spelling) => spelling.rows[0] ?? 0;
  // groups are never empty, so the lead is always there
  const lead = (group: Spelling[]): Spelling =>
    [...group].sort((a, b) => b.rows.length - a.rows.length || first(a) - first(b))[0] as Spelling;
  const total = (group: Spelling[]) => group.reduce((n, s) => n + s.rows.length, 0);

  const matches: NameMatch[] = [];

  // 1. tidy differences within a name
  for (const group of groups.values()) {
    const main = lead(group);
    for (const other of group) {
      if (other === main) continue;
      matches.push({
        id: `name:${other.text}`,
        variant: other.text,
        canonical: main.text,
        rows: other.rows,
        tidyOnly: true,
        evidence: [
          `"${other.text}" and "${main.text}" differ only in spacing, capitals or punctuation.`,
        ],
      });
    }
  }

  // 2. typos and stray symbols between names
  const names = [...groups.values()];
  for (const group of names) {
    const main = lead(group);
    const name = bare(main.text);
    let best: { target: Spelling; distance: number; evidence: string[]; rows: number } | null =
      null;
    for (const otherGroup of names) {
      if (otherGroup === group || total(otherGroup) < total(group)) continue;
      // the bigger name is the one to keep; on a tie, the earlier one
      if (total(otherGroup) === total(group) && first(lead(otherGroup)) > first(main)) continue;
      const target = lead(otherGroup);
      const targetName = bare(target.text);
      const distance = editDistance(name, targetName);
      if (distance > Math.min(limit(name), limit(targetName))) continue;

      const { support, against } = compare(group, otherGroup, contactColumns);
      // nothing in common and something different: probably someone else
      if (support.length === 0 && against.length > 0) continue;
      // a different first letter is rarely a typo, unless the contacts say so
      if (initials(name) !== initials(targetName) && support.length === 0) continue;

      const evidence = [
        distance === 0
          ? `"${main.text}" and "${target.text}" differ only by symbols.`
          : `"${main.text}" and "${target.text}" are ${distance} ${distance === 1 ? 'letter' : 'letters'} different.`,
        ...support,
        ...(support.length === 0
          ? ['No phone, email or postcode to compare, so check this one.']
          : []),
      ];
      // the closest name wins; on a tie, the one used on more rows
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && total(otherGroup) > best.rows)
      ) {
        best = { target, distance, evidence, rows: total(otherGroup) };
      }
    }
    if (!best) continue;
    // every spelling of this name moves to the other name's lead spelling
    for (const spelling of group) {
      matches.push({
        id: `name:${spelling.text}`,
        variant: spelling.text,
        canonical: best.target.text,
        rows: spelling.rows,
        tidyOnly: false,
        evidence: best.evidence,
      });
    }
  }

  // a tidy match inside a name that is itself a typo of another is covered by the typo
  const typos = new Set(matches.filter((m) => !m.tidyOnly).map((m) => m.variant));
  const kept = matches.filter((m) => !(m.tidyOnly && typos.has(m.variant)));

  // follow chains, so every spelling points at the final name, never at another variant
  const target = new Map(kept.map((m) => [m.variant, m.canonical]));
  const final = (name: string) => {
    let current = name;
    for (let steps = 0; target.has(current) && steps < kept.length; steps += 1) {
      current = target.get(current) ?? current;
    }
    return current;
  };
  return kept.map((m) => ({ ...m, canonical: final(m.variant) }));
}

// Contact details shared, and details that differ, between two names.
function compare(
  a: Spelling[],
  b: Spelling[],
  columns: string[],
): { support: string[]; against: string[] } {
  const support: string[] = [];
  const against: string[] = [];
  const gather = (group: Spelling[], header: string) =>
    new Set(group.flatMap((s) => [...(s.contacts.get(header) ?? [])]));
  for (const header of columns) {
    const [x, y] = [gather(a, header), gather(b, header)];
    if (x.size === 0 || y.size === 0) continue;
    if ([...x].some((value) => y.has(value))) support.push(`Same ${header}.`);
    else against.push(`Different ${header}.`);
  }
  return { support, against };
}
