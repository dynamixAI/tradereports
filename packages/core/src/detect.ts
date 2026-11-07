import type { SourceTool } from './model';

export type FileKind = 'invoices' | 'quotes' | 'jobs' | 'visits' | 'customers';

export interface Profile {
  tool: SourceTool;
  kind: FileKind;
  // headers that together only appear in this file, taken from real exports
  signature: string[];
}

// Money headers carry a currency label: "Total ($)". It is removed before matching,
// so "(£)" works too.
const CURRENCY_LABEL = / \((?:\$|£)\)$/;

export const PROFILES: Profile[] = [
  {
    tool: 'tradify',
    kind: 'invoices',
    signature: ['Invoice Number', 'Line Number', 'Line Amount', 'Delivery Status', 'Entered By'],
  },
  {
    tool: 'tradify',
    kind: 'quotes',
    signature: ['Quote No', 'Line Unit Sell Price', 'Total Gross Profit', 'Status'],
  },
  {
    tool: 'tradify',
    kind: 'jobs',
    signature: ['Job Number', 'Category #1', 'Signed Off On', 'Place Id'],
  },
  {
    tool: 'tradify',
    kind: 'customers',
    signature: ['Customer Name', 'Tradify Id', 'Pricing Level', 'Document Theme'],
  },
  {
    tool: 'jobber',
    kind: 'invoices',
    signature: [
      'Invoice #',
      'Client name',
      'Line items',
      'Pre-tax total',
      'Balance',
      'Marked paid date',
    ],
  },
  {
    tool: 'jobber',
    kind: 'quotes',
    signature: ['Quote #', 'Client name', 'Drafted date', 'Converted date'],
  },
  {
    tool: 'jobber',
    kind: 'jobs',
    signature: ['Job #', 'Client name', 'Invoice #s', 'Profit'],
  },
  {
    tool: 'jobber',
    kind: 'visits',
    signature: ['Job #', 'Visit title', 'Visit completed date'],
  },
];

export interface Candidate {
  profile: Profile;
  found: string[];
  missing: string[];
}

export interface Detection {
  // set only when every signature header is present
  match: Profile | null;
  // best partial match, to explain what the file is closest to
  closest: Candidate | null;
  message: string;
}

const LABELS: Record<SourceTool, string> = { jobber: 'Jobber', tradify: 'Tradify' };

// Say which tool and file a CSV came from, from its headers alone.
export function detectFile(headers: string[]): Detection {
  const present = new Set(headers.map((header) => header.trim().replace(CURRENCY_LABEL, '')));

  const candidates = PROFILES.map((profile) => ({
    profile,
    found: profile.signature.filter((name) => present.has(name)),
    missing: profile.signature.filter((name) => !present.has(name)),
  }))
    // most of its signature found first; ties go to the longer, more specific signature
    .sort(
      (a, b) =>
        b.found.length / b.profile.signature.length - a.found.length / a.profile.signature.length ||
        b.profile.signature.length - a.profile.signature.length,
    );

  const best = candidates[0];
  const closest = best && best.found.length > 0 ? best : null;

  if (closest && closest.missing.length === 0) {
    const { profile } = closest;
    return {
      match: profile,
      closest,
      message: `This is a ${LABELS[profile.tool]} ${profile.kind} export (found ${profile.signature.join(', ')}).`,
    };
  }

  if (closest) {
    const { profile, found, missing } = closest;
    return {
      match: null,
      closest,
      message: `This looks a bit like a ${LABELS[profile.tool]} ${profile.kind} export (found ${found.join(', ')}), but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. Match the columns by hand.`,
    };
  }

  return {
    match: null,
    closest: null,
    message: "This file doesn't match any export we know. Match the columns by hand.",
  };
}
