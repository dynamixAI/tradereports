import type { CsvIssue } from '../csv';
import type { ConvertIssue } from '../model';

export type HealthLevel = 'fix' | 'check' | 'handled';

export interface HealthItem {
  file: string;
  rows: number[];
  message: string;
}

export interface HealthCheck {
  title: string;
  // what it means, in plain English
  explanation: string;
  level: HealthLevel;
  items: HealthItem[];
}

export interface HealthReport {
  checks: HealthCheck[];
  toFix: number;
  toCheck: number;
  handled: number;
  summary: string[];
}

// the issues found in one file, by the reader, a converter or the linking step
export interface FileIssues {
  file: string;
  issues: (ConvertIssue | CsvIssue)[];
}

type Kind = ConvertIssue['kind'] | 'file-layout';

const CHECKS: Record<Kind, { title: string; explanation: string; level: HealthLevel }> = {
  'missing-column': {
    title: "Files we couldn't read",
    explanation: "These don't look like the export we expected, so nothing was taken from them.",
    level: 'fix',
  },
  'inconsistent-rows': {
    title: 'Lines that disagree',
    explanation:
      'One document has different totals on different lines, so its figures were left out.',
    level: 'fix',
  },
  'totals-do-not-add-up': {
    title: "Totals that don't add up",
    explanation:
      "The amounts in the file don't fit together, so the affected figures are marked unknown.",
    level: 'fix',
  },
  'duplicate-name': {
    title: 'Customers sharing a name',
    explanation:
      "Invoices and quotes only give a name, so these customers' figures may be mixed together.",
    level: 'fix',
  },
  'links-disagree': {
    title: 'Links that disagree',
    explanation: 'Two files say different things about which records belong together.',
    level: 'fix',
  },
  'bad-value': {
    title: "Values we couldn't read",
    explanation:
      'A cell had something unexpected in it. Often a sign it was put in the wrong column.',
    level: 'check',
  },
  'possible-draft': {
    title: 'Invoices that may be drafts',
    explanation:
      "These show money owed but were never sent. If they're drafts, nobody owes that money yet.",
    level: 'check',
  },
  'missing-link': {
    title: "Links to records that aren't in your files",
    explanation:
      'Something points to a record the export left out. The export may have been filtered.',
    level: 'check',
  },
  'customer-not-found': {
    title: 'Names with no customer record',
    explanation:
      "These names don't match anyone in the customers file, so contact details can't be shown.",
    level: 'check',
  },
  'file-layout': {
    title: 'File layout problems',
    explanation:
      'Rows with missing or extra cells, unnamed or repeated columns, or broken quote marks.',
    level: 'check',
  },
  'source-quirk': {
    title: 'Export quirks we corrected for',
    explanation:
      'Known problems with how the tool exports data. TradeReports has already allowed for them.',
    level: 'handled',
  },
};

const LEVEL_ORDER: HealthLevel[] = ['fix', 'check', 'handled'];

// Every problem found in the user's files, grouped into one plain-English checklist.
export function dataHealth(files: FileIssues[]): HealthReport {
  const grouped = new Map<Kind, HealthItem[]>();
  for (const { file, issues } of files) {
    for (const issue of issues) {
      // the CSV reader reports one row; converters report several
      const kind: Kind = 'row' in issue ? 'file-layout' : issue.kind;
      const rows = 'row' in issue ? [issue.row] : issue.rows;
      grouped.set(kind, [...(grouped.get(kind) ?? []), { file, rows, message: issue.message }]);
    }
  }

  const checks: HealthCheck[] = [...grouped].map(([kind, items]) => ({ ...CHECKS[kind], items }));
  // most urgent level first, then the biggest groups
  checks.sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
      b.items.length - a.items.length,
  );

  const count = (level: HealthLevel) =>
    checks
      .filter((check) => check.level === level)
      .reduce((sum, check) => sum + check.items.length, 0);
  const toFix = count('fix');
  const toCheck = count('check');
  const handled = count('handled');

  const summary: string[] = [];
  if (toFix + toCheck + handled === 0) {
    summary.push('No problems found in your files.');
  } else {
    summary.push(
      `${toFix} ${toFix === 1 ? 'thing' : 'things'} to fix, ${toCheck} to check, and ${handled} ${handled === 1 ? 'quirk' : 'quirks'} already handled.`,
    );
    for (const check of checks.filter((c) => c.level !== 'handled')) {
      summary.push(`${check.title}: ${check.items.length}.`);
    }
  }

  return { checks, toFix, toCheck, handled, summary };
}
