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
  action: 'move' | 'swap' | 'remove-copy' | 'shift';
  // spreadsheet row
  row: number;
  from: string;
  to: string;
  value: string;
  // for a swap, the value going the other way
  other: string | null;
  // similar repairs share a group, so they can be accepted together
  group: string;
  // for a shift, every cell of the row as it would be once put back
  cells?: Record<string, string | null>;
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
export function columnKind(values: (string | null)[]): Kind | null {
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
  const repairs: Repair[] = findShifts(table, columns);
  const shifted = new Set(repairs.map((r) => r.row));

  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    // a shifted row is put back as a whole, not cell by cell
    if (shifted.has(rowNumber)) return;
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

      // swapped: the home holds a value that belongs here. Plain text (a name) only goes
      // back into a text column, as half of a swap the other value proves
      const swap = homes.find((home) => {
        const there = cell(home.header);
        if (there === null || used.has(home.header)) return false;
        if (ownKind !== null) return kindOf(there) === ownKind;
        return kindOf(there) === null && /[a-z]/i.test(there);
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
            ownKind
              ? `Row ${rowNumber}: "${header}" has ${label} and "${swap.header}" has ${WORDS[ownKind]} (${there}). Each fits the other column.`
              : `Row ${rowNumber}: "${header}" has ${label} and "${swap.header}" has "${there}", which is not ${WORDS[kind]}. They look swapped.`,
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
  repairs.push(...moneySwaps(table, columns, repairs));
  return repairs;
}

// A shifted row: from some column on, every value sits one column out, after a stray
// extra cell (values pushed right) or a missing one (values pulled left). Suggested only
// when putting them back makes nearly every value that says what it is fit its column.
function findShifts(table: CsvTable, columns: { header: string; kind: Kind | null }[]): Repair[] {
  const typed = columns.map((c) => c.kind);
  const fits = (values: (string | null)[]) =>
    values.filter((v, j) => v !== null && typed[j] !== null && kindOf(v) === typed[j]).length;
  const said = (values: (string | null)[]) =>
    values.filter((v, j) => v !== null && typed[j] !== null && kindOf(v) !== null).length;

  // money columns side by side all look like money however a row is shifted, so the sum
  // that holds on most rows is the evidence there: holding after a shift counts as two
  const sum = commonSum(table, columns);
  const at = (header: string) => columns.findIndex((c) => c.header === header);
  const adds = (values: (string | null)[]) => {
    if (!sum) return false;
    const money = (h: string) => parseMoney(values[at(h)] ?? '');
    return holds(money(sum.a), money(sum.b), money(sum.c));
  };
  const score = (values: (string | null)[]) => fits(values) + (adds(values) ? 2 : 0);

  const shifts: Repair[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const values = columns.map((c) => row[c.header] ?? null);
    const beyond = table.overflow?.[index] ?? [];
    const before = score(values);

    let best: {
      values: (string | null)[];
      from: number;
      way: 'left' | 'right';
      fit: number;
    } | null = null;
    for (let from = 0; from < columns.length; from += 1) {
      // pushed right by a stray cell: take each value from one column further on
      const left = values.map((v, j) =>
        j < from ? v : j + 1 < values.length ? (values[j + 1] ?? null) : beyond[0] || null,
      );
      // pulled left by a missing cell: take each value from one column back
      const right = values.map((v, j) =>
        j < from ? v : j === from ? null : (values[j - 1] ?? null),
      );
      for (const [way, candidate] of [
        ['left', left],
        ['right', right],
      ] as const) {
        const fit = score(candidate);
        // at least two more values fit (or the sum now adds up), and nearly all that say
        // what they are
        if (fit < before + 2 || fits(candidate) < 0.8 * said(candidate)) continue;
        // on a tie, a stray extra cell is usually the empty one typed by mistake, so start
        // there; otherwise the latest start, the smallest change that explains the row
        const strayHere = way === 'left' && values[from] === null;
        const strayBest = best?.way === 'left' && values[best.from] === null;
        if (
          !best ||
          fit > best.fit ||
          (fit === best.fit && strayHere && !strayBest) ||
          (fit === best.fit && strayHere === strayBest && from > best.from)
        ) {
          best = { values: candidate, from, way, fit };
        }
      }
    }
    if (!best) return;

    const start = columns[best.from]?.header ?? '';
    const cells = Object.fromEntries(columns.map((c, j) => [c.header, best?.values[j] ?? null]));
    const lost =
      best.way === 'left' && beyond[0]
        ? [`The last value, "${beyond[0]}", was beyond the last column.`]
        : [];
    shifts.push({
      id: `shift:${rowNumber}:${start}:${best.way}`,
      action: 'shift',
      row: rowNumber,
      from: start,
      to: '',
      value: '',
      other: null,
      group: 'shifted rows',
      cells,
      evidence: [
        best.way === 'left'
          ? `Row ${rowNumber}: from "${start}" on, each value sits one column to the right of where it belongs, as if an extra cell was typed.`
          : `Row ${rowNumber}: from "${start}" on, each value sits one column to the left of where it belongs, as if a cell was missed.`,
        adds(best.values) && !adds(values)
          ? `Moving them back makes ${sum?.a ?? ''} + ${sum?.b ?? ''} = ${sum?.c ?? ''} add up on this row, as on ${sum?.rows ?? 0} other rows.`
          : `Moving them back puts ${fits(best.values)} values where they fit, against ${fits(values)} now.`,
        ...lost,
        ...(best.way === 'right' ? [`"${start}" would then be empty.`] : []),
      ],
    });
  });
  return shifts;
}

// a + b = c, with neither part zero, to within a penny
const holds = (x: number | null, y: number | null, z: number | null) =>
  x !== null && y !== null && z !== null && x !== 0 && y !== 0 && Math.abs(x + y - z) <= 1;

// The sum a + b = c (net + VAT = total, say) that holds on most rows with all three filled.
function commonSum(
  table: CsvTable,
  columns: { header: string; kind: Kind | null }[],
): { a: string; b: string; c: string; rows: number } | null {
  const money = columns.filter((col) => col.kind === 'money').map((col) => col.header);
  const amount = (row: Record<string, string | null>, header: string) =>
    parseMoney(row[header] ?? '');
  let best: { a: string; b: string; c: string; rows: number } | null = null;
  for (const c of money) {
    for (const a of money) {
      for (const b of money) {
        if (a >= b || a === c || b === c) continue;
        const filled = table.rows.filter((row) => [a, b, c].every((h) => amount(row, h) !== null));
        const good = filled.filter((row) => holds(amount(row, a), amount(row, b), amount(row, c)));
        if (
          filled.length >= 4 &&
          good.length / filled.length >= 0.6 &&
          good.length > (best?.rows ?? 0)
        ) {
          best = { a, b, c, rows: good.length };
        }
      }
    }
  }
  return best;
}

// Two money cells swapped on a row (net and total, say) look fine one by one; only the
// sum shows it. Find the sum that holds on most rows, and on a row where it fails, try
// swapping two of its cells. Suggest the swap only if it makes the sum hold.
function moneySwaps(
  table: CsvTable,
  columns: { header: string; kind: Kind | null }[],
  found: Repair[],
): Repair[] {
  const amount = (row: Record<string, string | null>, header: string) =>
    parseMoney(row[header] ?? '');
  const best = commonSum(table, columns);
  if (!best) return [];
  const { a, b, c, rows: agreeing } = best;
  const busy = new Set(found.flatMap((r) => [`${r.row}:${r.from}`, `${r.row}:${r.to}`]));
  const shiftedRows = new Set(found.filter((r) => r.action === 'shift').map((r) => r.row));

  const swaps: Repair[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const [x, y, z] = [amount(row, a), amount(row, b), amount(row, c)];
    if (x === null || y === null || z === null || holds(x, y, z)) return;
    if (shiftedRows.has(rowNumber) || [a, b, c].some((h) => busy.has(`${rowNumber}:${h}`))) return;
    // a + b is the same either way round, so only a swap with the total can help
    const tries: [string, string, boolean][] = [
      [a, c, holds(z, y, x)],
      [b, c, holds(x, z, y)],
    ];
    const fixes = tries.filter(([, , ok]) => ok);
    const [fix] = fixes;
    if (fixes.length !== 1 || !fix) return;
    const [from, to] = fix;
    swaps.push({
      id: `swap:${rowNumber}:${from}:${to}`,
      action: 'swap',
      row: rowNumber,
      from,
      to,
      value: row[from] ?? '',
      other: row[to] ?? '',
      group: `swap ${from} and ${to}`,
      evidence: [
        `Row ${rowNumber}: ${a} + ${b} should equal ${c}, as on ${agreeing} other rows, but ${pounds(x)} + ${pounds(y)} is not ${pounds(z)}.`,
        `With ${from} and ${to} swapped, it adds up.`,
      ],
    });
  });
  return swaps;
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
    } else if (repair.action === 'shift' && repair.cells) {
      Object.assign(row, repair.cells);
      for (const header of Object.keys(repair.cells)) {
        notes.push({ row: repair.row, header, rule: `you put back the shifted row ${repair.row}` });
      }
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
