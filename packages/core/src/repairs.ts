import { cleanPostcode, readEmails, readPhones } from './clean';
import type { CsvTable } from './csv';
import { readDate } from './dates';
import { pounds } from './invoice-checks';
import { parseMoney } from './money';

// Repair suggestions (ADR 0007): values typed into the wrong column. Only values that
// identify themselves are moved: an email, a UK phone, a UK postcode, a full date, or an
// amount written with £ or pence. Nothing is applied until the user accepts it.

export type Kind = 'email' | 'phone' | 'postcode' | 'date' | 'money';

export interface Repair {
  // the same file always gives the same id, so answers can be saved and reused
  id: string;
  action: 'move' | 'swap' | 'remove-copy';
  // spreadsheet row
  row: number;
  from: string;
  to: string;
  value: string;
  // for a swap, the value going the other way
  other: string | null;
  // similar repairs share a group, so they can be accepted together
  group: string;
  evidence: string[];
}

// a column holds a kind when most of its values are that kind
const COLUMN_SHARE = 0.7;
// a stray value only counts as out of place if its kind is rare in its own column
const RARE_SHARE = 0.3;

// What a single cell is, if it says so itself. Checked from the most to the least
// distinctive, so a postcode is never read as anything else.
export function kindOf(text: string | null): Kind | null {
  if (!text) return null;
  const value = text.trim();
  if (value === '') return null;
  const emails = readEmails(value);
  if (emails.emails.length === 1 && emails.rejected.length === 0) return 'email';
  if (cleanPostcode(value).value !== null) return 'postcode';
  const phones = readPhones(value);
  if (phones.phones.length === 1 && phones.rejected.length === 0) return 'phone';
  if (readDate(value, 'day-first') || readDate(value, 'month-first')) return 'date';
  // a bare whole number could be an invoice number or a count, so it is never moved
  if (parseMoney(value) !== null && /£|\.\d{2}$/.test(value)) return 'money';
  return null;
}

// the kind most values in a column share, if any
function columnKind(values: (string | null)[]): Kind | null {
  const kinds = values.map(kindOf).filter((kind): kind is Kind => kind !== null);
  const filled = values.filter((v) => v !== null && v.trim() !== '').length;
  if (filled === 0) return null;
  const tally = new Map<Kind, number>();
  for (const kind of kinds) tally.set(kind, (tally.get(kind) ?? 0) + 1);
  // whole-number money columns ("450") count as money too
  const money = values.filter(
    (v) => v !== null && parseMoney(v) !== null && kindOf(v) === null,
  ).length;
  tally.set('money', (tally.get('money') ?? 0) + money);
  const [best] = [...tally].sort((a, b) => b[1] - a[1]);
  return best && best[1] / filled >= COLUMN_SHARE ? best[0] : null;
}

function share(values: (string | null)[], kind: Kind): number {
  const filled = values.filter((v) => v !== null && v.trim() !== '');
  return filled.length === 0 ? 0 : filled.filter((v) => kindOf(v) === kind).length / filled.length;
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, '') === b.trim().toLowerCase().replace(/\s+/g, '');

const WORDS: Record<Kind, string> = {
  email: 'an email address',
  phone: 'a phone number',
  postcode: 'a postcode',
  date: 'a date',
  money: 'an amount',
};

export function findRepairs(table: CsvTable): Repair[] {
  const columns = table.headers.map((header) => {
    const values = table.rows.map((row) => row[header] ?? null);
    return { header, values, kind: columnKind(values) };
  });
  const kindOfColumn = new Map(columns.map((c) => [c.header, c.kind]));
  const repairs: Repair[] = [];

  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const cell = (header: string) => row[header] ?? null;
    const used = new Set<string>();
    // cells that hold a copy will be emptied, so something else may belong there
    const emptied = new Set<string>();

    // each stray cell on the row: a value of a kind its column doesn't hold
    const strays = columns.flatMap(({ header, values, kind: ownKind }) => {
      const value = cell(header);
      const kind = kindOf(value);
      if (!value || !kind || ownKind === kind || share(values, kind) >= RARE_SHARE) return [];
      const homes = columns.filter((c) => c.kind === kind && c.header !== header);
      return homes.length > 0 ? [{ header, value, kind, ownKind, homes }] : [];
    });

    // first, copies: already in its right column
    for (const { header, value, kind, homes } of strays) {
      const copy = homes.find((home) => {
        const there = cell(home.header);
        return there !== null && same(there, value);
      });
      if (!copy) continue;
      repairs.push({
        id: `remove-copy:${rowNumber}:${header}`,
        action: 'remove-copy',
        row: rowNumber,
        from: header,
        to: copy.header,
        value,
        other: null,
        group: `remove copies of ${kind}s from ${header}`,
        evidence: [
          `Row ${rowNumber}: "${header}" has ${WORDS[kind]} (${value}), which is already in "${copy.header}".`,
        ],
      });
      used.add(header);
      emptied.add(header);
    }

    // then swaps and moves
    for (const { header, value, kind, ownKind, homes } of strays) {
      if (used.has(header)) continue;
      const label = `${WORDS[kind]} (${value})`;

      // swapped: the home holds a value that belongs here
      const swap = homes.find((home) => {
        const there = cell(home.header);
        return (
          there !== null && !used.has(home.header) && ownKind !== null && kindOf(there) === ownKind
        );
      });
      if (swap) {
        const there = cell(swap.header) ?? '';
        repairs.push({
          id: `swap:${rowNumber}:${header}:${swap.header}`,
          action: 'swap',
          row: rowNumber,
          from: header,
          to: swap.header,
          value,
          other: there,
          group: `swap ${header} and ${swap.header}`,
          evidence: [
            `Row ${rowNumber}: "${header}" has ${label} and "${swap.header}" has ${WORDS[ownKind ?? kind]} (${there}). Each fits the other column.`,
          ],
        });
        used.add(header);
        used.add(swap.header);
        continue;
      }

      // one empty home: move it there. Several: we can't tell which, so suggest nothing
      const empty = homes.filter((home) => cell(home.header) === null || emptied.has(home.header));
      const [only] = empty;
      if (empty.length !== 1 || !only) continue;
      const evidence = [
        emptied.has(only.header)
          ? `Row ${rowNumber}: "${header}" has ${label}, and "${only.header}" will be empty once its copy is removed.`
          : `Row ${rowNumber}: "${header}" has ${label}, and "${only.header}" is empty on this row.`,
      ];
      if (kind === 'money')
        evidence.push(...sumEvidence(table.headers, kindOfColumn, row, only.header, value));
      repairs.push({
        id: `move:${rowNumber}:${header}:${only.header}`,
        action: 'move',
        row: rowNumber,
        from: header,
        to: only.header,
        value,
        other: null,
        group: `move ${kind}s from ${header} to ${only.header}`,
        evidence,
      });
      used.add(header);
    }
  });
  return repairs;
}

// With the amount moved, do two money columns on the row add up to a third?
function sumEvidence(
  headers: string[],
  kinds: Map<string, Kind | null>,
  row: Record<string, string | null>,
  target: string,
  value: string,
): string[] {
  const amount = (header: string) =>
    header === target ? parseMoney(value) : parseMoney(row[header] ?? '');
  const money = headers.filter((h) => kinds.get(h) === 'money' && amount(h) !== null);
  for (const c of money) {
    for (const a of money) {
      for (const b of money) {
        if (a >= b || a === c || b === c || ![a, b, c].includes(target)) continue;
        const [x, y, z] = [amount(a) ?? 0, amount(b) ?? 0, amount(c) ?? 0];
        if (x !== 0 && y !== 0 && Math.abs(x + y - z) <= 1) {
          return [
            `Then ${a} + ${b} = ${c} on this row (${pounds(x)} + ${pounds(y)} = ${pounds(z)}).`,
          ];
        }
      }
    }
  }
  return [];
}

// The table with the accepted repairs applied. The original is not changed. Returns
// where each repaired value now sits, so figures that use it can say so.
export function applyRepairs(
  table: CsvTable,
  repairs: Repair[],
  accepted: (repair: Repair) => boolean,
): { table: CsvTable; notes: { row: number; header: string; rule: string }[] } {
  const rows = table.rows.map((row) => ({ ...row }));
  const notes: { row: number; header: string; rule: string }[] = [];
  for (const repair of repairs) {
    if (!accepted(repair)) continue;
    const index = table.rowNumbers.indexOf(repair.row);
    const row = rows[index];
    if (!row) continue;
    if (repair.action === 'move') {
      // never overwrite: if the copy it was waiting on was kept, the move is skipped
      if (row[repair.to] !== null && row[repair.to] !== undefined) continue;
      row[repair.to] = row[repair.from] ?? null;
      row[repair.from] = null;
      notes.push({
        row: repair.row,
        header: repair.to,
        rule: `you moved ${repair.value} from ${repair.from} to ${repair.to} on row ${repair.row}`,
      });
    } else if (repair.action === 'swap') {
      [row[repair.from], row[repair.to]] = [row[repair.to] ?? null, row[repair.from] ?? null];
      const rule = `you swapped ${repair.from} and ${repair.to} on row ${repair.row}`;
      notes.push(
        { row: repair.row, header: repair.to, rule },
        { row: repair.row, header: repair.from, rule },
      );
    } else {
      row[repair.from] = null;
      notes.push({
        row: repair.row,
        header: repair.from,
        rule: `you removed a copy of ${repair.value} from ${repair.from} on row ${repair.row}`,
      });
    }
  }
  return { table: { ...table, rows }, notes };
}
