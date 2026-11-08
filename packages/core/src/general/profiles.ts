import type { CsvTable } from '../csv';
import { emptyAnswers, type Answers } from './questions';

// Saved profiles (ADR 0006): the user's answers for one spreadsheet, kept so the next
// upload of the same sheet only asks about what is new. Plain data, so the web app can
// keep it in the user's own browser; nothing here stores anything.

export interface Profile {
  version: 1;
  // shown to the user: "Dave's invoices"
  name: string;
  headers: string[];
  answers: Answers;
  // YYYY-MM-DD, passed in so tests always give the same profile
  savedOn: string;
}

export type ProfileMatch =
  // the same headers in the same order: reuse without asking
  | { kind: 'exact'; profile: Profile }
  // most headers the same: always ask before reusing
  | { kind: 'similar'; profile: Profile; matching: number; total: number; question: string };

// at least this share of headers must match for a sheet to count as similar
const SIMILAR_SHARE = 0.75;

const tidy = (header: string) => header.trim().toLowerCase().replace(/\s+/g, ' ');

export function makeProfile(
  name: string,
  table: CsvTable,
  answers: Answers,
  savedOn: string,
): Profile {
  return { version: 1, name, headers: [...table.headers], answers, savedOn };
}

// The saved profile this sheet belongs to: an exact match first, then the most similar.
export function findProfile(table: CsvTable, profiles: Profile[]): ProfileMatch | null {
  const headers = table.headers.map(tidy);
  const exact = profiles.find(
    (p) => p.headers.length === headers.length && p.headers.every((h, i) => tidy(h) === headers[i]),
  );
  if (exact) return { kind: 'exact', profile: exact };

  let best: { profile: Profile; matching: number; total: number } | null = null;
  for (const profile of profiles) {
    const saved = new Set(profile.headers.map(tidy));
    const matching = headers.filter((h) => saved.has(h)).length;
    const total = Math.max(headers.length, saved.size);
    if (matching < 2 || matching / total < SIMILAR_SHARE) continue;
    if (!best || matching / total > best.matching / best.total) best = { profile, matching, total };
  }
  if (!best) return null;
  return {
    kind: 'similar',
    ...best,
    question: `This looks like your "${best.profile.name}" sheet (${best.matching} of ${best.total} columns match). Use the same answers?`,
  };
}

// The saved answers that still fit this sheet, and a plain note for each one dropped so
// it is asked again. Answers about rows or values that are gone simply never come up.
export function reuseAnswers(
  table: CsvTable,
  profile: Profile,
): { answers: Answers; dropped: string[] } {
  const present = new Set(table.headers);
  const dropped: string[] = [];
  const columns: Answers['columns'] = {};
  for (const [field, header] of Object.entries(profile.answers.columns)) {
    // "this file has none" still holds; a chosen column must still be there
    if (header === null || header === undefined || present.has(header)) {
      columns[field as keyof Answers['columns']] = header ?? null;
    } else {
      dropped.push(
        `The column "${header}" is not in this file, so you'll be asked again which column is the ${field}.`,
      );
    }
  }
  // status meanings only make sense with the same status column
  const statusKept = profile.answers.columns.status === columns.status;
  return {
    answers: {
      ...emptyAnswers(),
      ...profile.answers,
      columns,
      status: statusKept ? profile.answers.status : {},
    },
    dropped,
  };
}
