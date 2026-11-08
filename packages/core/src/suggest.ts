import type { CsvTable } from './csv';
import { parseMoney } from './money';
import { countsUp, scanTable, type ColumnScan } from './scan';
import { readStatus } from './status';

// Suggest which column holds each invoice field (ADR 0006). Method: a column must first
// be able to do the job (its values fit), then the ones left are ranked by their header
// name, their values and, strongest of all, the arithmetic across columns. A tie is left
// for the user, and nothing is final until the user confirms it.

export type Field = 'invoiceNumber' | 'date' | 'customer' | 'net' | 'vat' | 'gross' | 'status';

export const FIELDS: Field[] = [
  'invoiceNumber',
  'date',
  'customer',
  'net',
  'vat',
  'gross',
  'status',
];
const REQUIRED: Field[] = ['invoiceNumber', 'customer', 'gross'];

export interface Candidate {
  header: string;
  score: number;
  // plain-English reasons, shown to the user
  evidence: string[];
}

export interface FieldSuggestion {
  // null when nothing fits, or when the top two are level
  best: string | null;
  tie: boolean;
  // strongest first
  candidates: Candidate[];
}

export interface Suggestions {
  fields: Record<Field, FieldSuggestion>;
  // required fields with no suggestion and no tie
  missing: Field[];
  vatFound: boolean;
}

// header words that point to a field; checked as whole words after tidying the header
const NAMES: Record<Field, string[]> = {
  invoiceNumber: ['invoice', 'inv', 'ref', 'reference', 'bill', 'no', 'number', 'num', 'id'],
  date: ['date', 'dt', 'when', 'day', 'issued', 'raised', 'done'],
  customer: [
    'customer',
    'client',
    'cust',
    'name',
    'who',
    'account',
    'business',
    'company',
    'contact',
    'site',
  ],
  net: ['net', 'before', 'ex', 'exc', 'excl', 'excluding', 'pre', 'subtotal'],
  vat: ['vat', 'tax'],
  gross: [
    'gross',
    'total',
    'inc',
    'incl',
    'including',
    'charge',
    'charged',
    'amount',
    'due',
    'price',
  ],
  status: ['status', 'state', 'paid', 'received', 'settled', 'cleared', 'payment'],
};

// header words that point away from a field
const NOT: Partial<Record<Field, string[]>> = {
  invoiceNumber: [
    'date',
    'job',
    'phone',
    'tel',
    'postcode',
    'email',
    'time',
    'days',
    'payment',
    'total',
    'amount',
  ],
  date: ['due', 'paid', 'contacted', 'entered', 'follow'],
  customer: [
    'notes',
    'note',
    'job',
    'work',
    'description',
    'details',
    'subject',
    'address',
    'street',
    'city',
    'town',
    'county',
    'province',
    'zip',
    'postcode',
    'source',
    'status',
    'method',
    'item',
    'items',
    'tel',
    'phone',
    'email',
    'salesperson',
  ],
  net: ['inc', 'incl', 'including', 'gross'],
  vat: [
    'inc',
    'incl',
    'including',
    'before',
    'ex',
    'exc',
    'excl',
    'excluding',
    'pre',
    'net',
    'reg',
    'number',
  ],
  // "how paid", "payment method", "paid by": these say how, not whether
  status: [
    'how',
    'method',
    'type',
    'by',
    'mode',
    'cash',
    'bacs',
    'bank',
    'card',
    'cheque',
    'date',
    'on',
    'terms',
    'term',
    'via',
    'using',
  ],
  gross: ['pre', 'before', 'ex', 'exc', 'excl', 'excluding', 'net', 'tax', 'vat'],
};
// "inc VAT" is the total and "Total inc" too: a qualifier beats the vat word
NOT.gross = (NOT.gross ?? []).filter((word) => word !== 'vat' && word !== 'tax');

// VAT rates to check the arithmetic against: standard and reduced
const VAT_RATES = [0.2, 0.05];
// the arithmetic has to hold on most rows to count
const MOST = 0.6;

export function suggestColumns(table: CsvTable): Suggestions {
  const scans = scanTable(table);
  const columns = table.headers.filter((header) => (scans[header]?.filled ?? 0) > 0);
  const values = (header: string) =>
    table.rows.map((row) => row[header] ?? null).filter((v): v is string => v !== null);

  const lists: Record<Field, Candidate[]> = {
    invoiceNumber: [],
    date: [],
    customer: [],
    net: [],
    vat: [],
    gross: [],
    status: [],
  };
  const add = (field: Field, header: string, score: number, evidence: string[]) => {
    const existing = lists[field].find((c) => c.header === header);
    if (existing) {
      existing.score += score;
      existing.evidence.push(...evidence);
    } else {
      lists[field].push({ header, score, evidence: [...evidence] });
    }
  };

  // 1. each column against each field: can it do the job, and what do name and values say
  const money: string[] = [];
  for (const header of columns) {
    const scan = scans[header];
    if (!scan) continue;
    const cells = values(header);
    const name = nameEvidence(header);
    const counting = countsUp(cells);

    if (fitsInvoiceNumber(scan, cells)) {
      const evidence = [...name('invoiceNumber')];
      let score = nameScore(header, 'invoiceNumber');
      if (counting) {
        score += 1;
        evidence.push('The numbers count up, like invoice numbers.');
      } else if (cells.some((c) => /[a-z]/i.test(c)) && sameShape(cells) >= 0.8) {
        score += 1;
        evidence.push(
          `${percent(sameShape(cells))} follow the same pattern, such as "${cells[0] ?? ''}".`,
        );
      }
      if (scan.unique) {
        score += 0.5;
        evidence.push('Every value is different.');
      }
      add('invoiceNumber', header, score, evidence);
    }

    const dateShare = scan.share.date + scan.noYear.length / scan.filled;
    if (dateShare >= 0.5) {
      const fill = scan.filled / (scan.filled + scan.empty);
      add('date', header, nameScore(header, 'date') + fill, [
        ...name('date'),
        `${percent(dateShare)} are dates.`,
        ...(fill < 1 ? [`${percent(1 - fill)} of rows have no date here.`] : []),
      ]);
    }

    if (fitsCustomer(scan, cells)) {
      const short = averageWords(cells) <= 4;
      add('customer', header, nameScore(header, 'customer') + (short ? 0.5 : 0), [
        ...name('customer'),
        short ? 'Short text, like names.' : 'Text.',
      ]);
    }

    // a status is read from its words, or recognised by its shape: a few short codes
    // that repeat (SET, DUE, PD), whose meaning the user gives
    const statusShare = statusWords(cells);
    const codes = shortCodes(cells);
    // a few repeated words (HONOURED, OPEN, OVERDUE) count when the header names a status
    // or one of them reads as paid or unpaid; otherwise "Area: Wigan, Leigh" would too
    const labels =
      !codes &&
      fewLabels(cells) &&
      (nameScore(header, 'status') > 0 ||
        cells.some((c) => ['paid', 'unpaid', 'part paid'].includes(readStatus(c) ?? '')));
    if (statusShare >= 0.5 || codes || labels) {
      const methods = cells.filter((c) => readStatus(c) === 'method').length;
      const evidence = [...name('status')];
      if (statusShare >= 0.5)
        evidence.push(
          methods > cells.length / 2
            ? `${percent(statusShare)} are words like bank or cash, which say how it was paid.`
            : `${percent(statusShare)} say paid or unpaid, such as "${cells.find((c) => readStatus(c) !== null && readStatus(c) !== 'method') ?? ''}".`,
        );
      if (codes)
        evidence.push(
          `A few short codes that repeat (${[...new Set(cells)].slice(0, 4).join(', ')}), like a status. You'll be asked what each means.`,
        );
      if (labels)
        evidence.push(
          `A few repeated words (${[...new Set(cells)].slice(0, 4).join(', ')}), like a status. You'll be asked what each means.`,
        );
      const score =
        nameScore(header, 'status') + 2 * statusWords(cells, true) + (codes || labels ? 0.5 : 0);
      add('status', header, score, evidence);
    }

    // money: mostly amounts, and not a run of numbers counting up
    if (scan.share.money >= 0.8 && !counting) {
      money.push(header);
      for (const field of ['net', 'vat', 'gross'] as const) {
        const score = nameScore(header, field);
        // a money column needs its name or the arithmetic to be any of these
        if (score > 0)
          add(field, header, score + 1, [
            ...name(field),
            `${percent(scan.share.money)} are money amounts.`,
          ]);
      }
    }
  }

  // 2. the arithmetic: a + b = c on most rows. With b a VAT rate of a, that is net, VAT
  // and total; otherwise c is still a total of two parts, such as labour and materials.
  for (const triple of sums(table, money)) {
    if (triple.vatRows !== null) {
      const [net, vat, gross] = [triple.a, triple.b, triple.c];
      const adds = `Equals ${net} + ${vat} on ${triple.matched} of ${triple.rows} rows.`;
      add('gross', gross, 3, [adds]);
      add('net', net, 3, [
        `With ${vat}, adds up to ${gross} on ${triple.matched} of ${triple.rows} rows.`,
      ]);
      add('vat', vat, 3, [
        `Is ${triple.rate * 100}% of ${net} on ${triple.vatRows} of ${triple.rows} rows.`,
      ]);
    } else {
      add('gross', triple.c, 2, [
        `Equals ${triple.a} + ${triple.b} on ${triple.matched} of ${triple.rows} rows.`,
      ]);
    }
  }

  // with a single column of amounts there is nothing to add up, but it must be the total
  const [onlyMoney] = money;
  if (money.length === 1 && onlyMoney) {
    add('gross', onlyMoney, 1, ['The only column of money amounts.']);
  }

  // 3. strongest claims first, and each column goes to one field only
  for (const field of FIELDS)
    lists[field].sort((x, y) => y.score - x.score || x.header.localeCompare(y.header));
  const order = [...FIELDS].sort((x, y) => (lists[y][0]?.score ?? 0) - (lists[x][0]?.score ?? 0));
  const taken = new Set<string>();
  const fields = {} as Record<Field, FieldSuggestion>;
  // a tie can settle once another field takes one of the tied columns, so go round
  // again until nothing changes
  for (let changed = true; changed;) {
    changed = false;
    for (const field of order) {
      if (fields[field]?.best) continue;
      const open = lists[field].filter((c) => !taken.has(c.header));
      const [first, second] = open;
      const tie =
        first !== undefined && second !== undefined && Math.abs(first.score - second.score) < 0.01;
      // a column with no positive evidence is listed as an option, never suggested
      const best = first && !tie && first.score > 0 ? first.header : null;
      if (best) {
        taken.add(best);
        changed = true;
      }
      fields[field] = { best, tie, candidates: open.length > 0 ? open : lists[field] };
    }
  }

  const missing = REQUIRED.filter((field) => fields[field].best === null && !fields[field].tie);
  return { fields, missing, vatFound: fields.vat.best !== null };
}

interface Triple {
  a: string;
  b: string;
  c: string;
  rows: number;
  matched: number;
  // rows where b is the VAT rate of a, or null when it isn't VAT
  vatRows: number | null;
  rate: number;
}

// Every pair of money columns that adds up to a third on most rows.
function sums(table: CsvTable, money: string[]): Triple[] {
  const amounts = (header: string) => table.rows.map((row) => parseMoney(row[header] ?? ''));
  const found: Triple[] = [];
  for (const c of money) {
    for (let i = 0; i < money.length; i += 1) {
      for (let j = i + 1; j < money.length; j += 1) {
        const first = money[i];
        const second = money[j];
        if (!first || !second || first === c || second === c) continue;
        const [xs, ys, zs] = [amounts(first), amounts(second), amounts(c)];
        let rows = 0;
        let matched = 0;
        let larger = 0;
        for (let r = 0; r < table.rows.length; r += 1) {
          const [x, y, z] = [xs[r], ys[r], zs[r]];
          if (
            x === null ||
            y === null ||
            z === null ||
            x === undefined ||
            y === undefined ||
            z === undefined
          )
            continue;
          rows += 1;
          if (x !== 0 && y !== 0 && Math.abs(x + y - z) <= 2) matched += 1;
          if (x >= y) larger += 1;
        }
        if (rows < 3 || matched / rows < MOST) continue;
        // the bigger of the two parts is the net when they are net and VAT
        const [a, b] = larger >= rows / 2 ? [first, second] : [second, first];
        const vat = vatShare(amounts(a), amounts(b));
        found.push({ a, b, c, rows, matched, ...vat });
      }
    }
  }
  return found;
}

// How many rows have b as a VAT rate of a, for the rate that fits best.
function vatShare(
  net: (number | null)[],
  vat: (number | null)[],
): { vatRows: number | null; rate: number } {
  let bestRows = 0;
  let bestRate = VAT_RATES[0] ?? 0.2;
  let nonZero = 0;
  for (const rate of VAT_RATES) {
    let rows = 0;
    nonZero = 0;
    for (let r = 0; r < net.length; r += 1) {
      const [n, v] = [net[r], vat[r]];
      if (n === null || v === null || n === undefined || v === undefined || v === 0) continue;
      nonZero += 1;
      if (Math.abs(Math.round(n * rate) - v) <= 1) rows += 1;
    }
    if (rows > bestRows) [bestRows, bestRate] = [rows, rate];
  }
  const ok = nonZero >= 3 && bestRows / nonZero >= MOST;
  return { vatRows: ok ? bestRows : null, rate: bestRate };
}

// Short codes with a digit, nearly all different: not dates, amounts with pence or contacts.
function fitsInvoiceNumber(scan: ColumnScan, cells: string[]): boolean {
  const s = scan.share;
  if (s.date >= 0.5 || s.phone >= 0.5 || s.email >= 0.5 || s.postcode >= 0.5) return false;
  if (cells.filter((c) => /\.\d{2}$/.test(c)).length / cells.length >= 0.5) return false;
  const withDigit = cells.filter((c) => /\d/.test(c)).length / cells.length;
  const short = cells.filter((c) => c.trim().split(/\s+/).length <= 2).length / cells.length;
  const distinct = new Set(cells).size / cells.length;
  return withDigit >= 0.8 && short >= 0.8 && distinct >= 0.75;
}

// Mostly letters, more than one value, and not amounts, dates, contacts or status words.
function fitsCustomer(scan: ColumnScan, cells: string[]): boolean {
  const s = scan.share;
  if ([s.money, s.date, s.phone, s.email, s.postcode, s['yes/no']].some((share) => share >= 0.5))
    return false;
  if (statusWords(cells) >= 0.5) return false;
  const letters = cells.filter((c) => /[A-Za-z]/.test(c)).length / cells.length;
  const digits = cells.filter((c) => /\d/.test(c)).length / cells.length;
  if (digits >= 0.5) return false;
  return letters >= 0.7 && new Set(cells).size >= 2 && averageWords(cells) <= 6;
}

// share of values that read as a status; method words count half when weighted, as
// "Bank" says how it was paid, not whether every unpaid row is marked
function statusWords(cells: string[], weighted = false): number {
  if (cells.length === 0) return 0;
  let total = 0;
  for (const cell of cells) {
    const reading = readStatus(cell);
    if (reading === 'method') total += weighted ? 0.25 : 1;
    else if (reading !== null) total += 1;
  }
  return total / cells.length;
}

// 2 to 8 different values, each 4 characters or fewer, and repeating: PD, OS, SET, ✓
function shortCodes(cells: string[]): boolean {
  const distinct = new Set(cells.map((c) => c.trim()));
  return (
    cells.length >= 4 &&
    distinct.size >= 2 &&
    distinct.size <= 8 &&
    distinct.size < cells.length &&
    // codes we can't read; known payment methods (Bank, Cash) say how, not whether
    [...distinct].every(
      (c) => [...c].length <= 4 && !/^\d+([.,]\d+)?$/.test(c) && readStatus(c) !== 'method',
    )
  );
}

// 2 to 8 different values of one or two short words, repeating, and not payment methods
function fewLabels(cells: string[]): boolean {
  const distinct = new Set(cells.map((c) => c.trim()));
  return (
    cells.length >= 4 &&
    distinct.size >= 2 &&
    distinct.size <= 8 &&
    distinct.size < cells.length &&
    [...distinct].every(
      (c) =>
        c.length <= 12 &&
        c.split(/\s+/).length <= 2 &&
        /[a-z]/i.test(c) &&
        readStatus(c) !== 'method',
    )
  );
}

// share of values with the most common shape once digits are ignored: "NSH-26-001" -> "nsh-9-9"
function sameShape(cells: string[]): number {
  const shapes = new Map<string, number>();
  for (const cell of cells) {
    const shape = cell.trim().toLowerCase().replace(/\d+/g, '9');
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  return Math.max(0, ...shapes.values()) / cells.length;
}

function averageWords(cells: string[]): number {
  if (cells.length === 0) return 0;
  return cells.reduce((sum, c) => sum + c.trim().split(/\s+/).length, 0) / cells.length;
}

// "Pre-tax total ($)" -> ["pre", "tax", "total"]
function words(header: string): string[] {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');
}

// +2 when the header names the field, -3 when it names something else, 0 otherwise
function nameScore(header: string, field: Field): number {
  const ws = words(header);
  if ((NOT[field] ?? []).some((word) => ws.includes(word)))
    return NAMES[field].some((w) => ws.includes(w)) ? -1 : -3;
  return NAMES[field].some((word) => ws.includes(word)) ? 2 : 0;
}

function nameEvidence(header: string): (field: Field) => string[] {
  return (field) => {
    const score = nameScore(header, field);
    if (score > 0) return [`The header "${header}" fits.`];
    if (score < 0) return [`The header "${header}" suggests something else.`];
    return [];
  };
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
