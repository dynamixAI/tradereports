import { describe, expect, it } from 'vitest';
import { acceptSuggested, askQuestions, emptyAnswers, readSheet } from '@tradereports/core';
import jobberInvoices from '../../../../packages/core/tests/fixtures/jobber/invoices-report.csv?raw';
import homemade from '../../../../packages/core/tests/fixtures/homemade/dave-invoices.csv?raw';
import { addUpload, emptyTool } from './files';
import {
  emptyMemory,
  hashKey,
  lastBefore,
  mergeMemory,
  readSavedFile,
  recordSnapshot,
  rememberLayout,
  restore,
  savedFile,
  savedFileName,
  signature,
  snapshotOf,
  toSaved,
  type Snapshot,
} from './memory';
import { readUpload } from './readUpload';
import { buildReport } from './report';

const bytes = (text: string) => new TextEncoder().encode(text);

function snap(at: string, owedPence: number): Snapshot {
  return {
    at,
    asOf: at.slice(0, 10),
    owedPence,
    overduePence: null,
    notBilledPence: null,
    agreedPence: null,
    toFix: 0,
  };
}

describe('remembering a spreadsheet layout', () => {
  it('knows a layout by its column names, whatever their order or case', () => {
    expect(signature(['Total', 'Customer', 'No'])).toBe(signature(['no', ' customer', 'TOTAL']));
    expect(signature(['Total', 'Customer'])).not.toBe(signature(['Total', 'Client']));
  });

  it('answers the questions next time for a sheet laid out the same', async () => {
    // first visit: answer everything
    let state = addUpload(emptyTool(), await readUpload('dave.csv', bytes(homemade)));
    const first = state.files[0];
    if (!first) throw new Error('no file');
    // a fresh sheet asks questions; these answers settle them all
    expect(askQuestions(first.upload.table, first.answers).length).toBeGreaterThan(0);
    const answers = acceptSuggested(first.upload.table, first.answers);
    const memory = rememberLayout(emptyMemory(), first.upload.table.headers, answers, 'now');

    // next visit: the same layout comes back already answered
    state = addUpload(
      emptyTool({ name: 'Dave', stagger: 1 }, memory),
      await readUpload('dave-december.csv', bytes(homemade)),
    );
    const again = state.files[0];
    if (!again) throw new Error('no file');
    expect(again.answers.columns).toEqual(answers.columns);
    expect(askQuestions(again.upload.table, again.answers)).toEqual(
      askQuestions(first.upload.table, answers),
    );
    expect(state.notice).toMatch(/We used your answers from last time/);
  });

  it('keeps no customer names in "same customer?" answers', () => {
    const answers = { ...emptyAnswers(), names: { 'name:Bob Smyth': 'same' as const } };
    const saved = toSaved(answers);
    expect(JSON.stringify(saved)).not.toContain('Smyth');
    expect(saved.names[hashKey('name:Bob Smyth')]).toBe('same');
  });

  it('brings hashed name answers back for the sheet that asks them', () => {
    const table = readSheet('Invoice,Customer,Total\n1,Bob Smith,10\n2,Bob Smyth,20\n');
    const answered = acceptSuggested(table, emptyAnswers());
    const asked = askQuestions(table, answered).find((q) => q.kind === 'same-customer');
    if (asked?.kind !== 'same-customer') throw new Error('expected a same-customer question');
    // answer it, save, and bring it back
    const saved = toSaved({ ...answered, names: { [asked.match.id]: 'same' } });
    expect(JSON.stringify(saved)).not.toContain('Smyth');
    expect(restore(table, saved).names[asked.match.id]).toBe('same');
  });
});

describe('report snapshots', () => {
  it('takes only totals from a report', async () => {
    const state = addUpload(emptyTool(), await readUpload('i.csv', bytes(jobberInvoices)));
    const s = snapshotOf(buildReport(state.files, '2026-11-11', 1), '2026-11-11T09:00:00Z');
    expect(s.owedPence).toBe(1950600);
    expect(s.overduePence).toBe(1950600);
    // no jobs file, so finished work not invoiced is unknown, not £0
    expect(s.notBilledPence).toBeNull();
    expect(Object.keys(s).sort()).toEqual(
      ['agreedPence', 'asOf', 'at', 'notBilledPence', 'overduePence', 'owedPence', 'toFix'].sort(),
    );
  });

  it('replaces its own snapshot in the same visit, and compares with the visit before', () => {
    let memory = recordSnapshot(emptyMemory(), snap('2026-11-03T09:00:00Z', 1000));
    memory = recordSnapshot(memory, snap('2026-11-11T09:00:00Z', 900));
    memory = recordSnapshot(memory, snap('2026-11-11T09:00:00Z', 800));
    expect(memory.snapshots.map((s) => s.owedPence)).toEqual([1000, 800]);
    expect(lastBefore(memory, '2026-11-11T09:00:00Z')?.owedPence).toBe(1000);
    expect(lastBefore(memory, '2026-11-03T09:00:00Z')).toBeNull();
  });
});

describe('the saved file', () => {
  it('reads back what it wrote', () => {
    const memory = recordSnapshot(emptyMemory(), snap('2026-11-03T09:00:00Z', 1000));
    const file = savedFile({ name: 'Smith Plumbing', stagger: 2 }, memory, '2026-11-11T10:00:00Z');
    const read = readSavedFile(JSON.stringify(file));
    expect(read).toEqual(file);
  });

  it('turns away files that are not ours', () => {
    expect(readSavedFile('not json')).toMatch(/isn't a TradeReports file/);
    expect(readSavedFile('{"kind":"something else"}')).toMatch(/isn't a TradeReports file/);
    expect(readSavedFile('{"kind":"tradereports","version":99}')).toMatch(/newer version/);
  });

  it('drops anything odd inside a file instead of trusting it', () => {
    const read = readSavedFile(
      JSON.stringify({
        kind: 'tradereports',
        version: 1,
        business: { name: 42, stagger: 7 },
        memory: {
          layouts: [
            { signature: 'a|b', answers: { status: { paid: 'hacked' }, columns: { gross: 5 } } },
          ],
          snapshots: [{ at: 'x', asOf: 'y', owedPence: 'lots' }, 'nonsense'],
        },
      }),
    );
    if (typeof read === 'string') throw new Error(read);
    expect(read.business).toEqual({ name: '', stagger: 1 });
    expect(read.memory.layouts[0]?.answers.status).toEqual({});
    expect(read.memory.layouts[0]?.answers.columns).toEqual({});
    expect(read.memory.snapshots).toHaveLength(1);
    expect(read.memory.snapshots[0]?.owedPence).toBeNull();
  });

  it('merges two memories, keeping the newest answers and every report', () => {
    const a = rememberLayout(
      recordSnapshot(emptyMemory(), snap('2026-11-03T09:00:00Z', 1000)),
      ['Total'],
      { ...emptyAnswers(), columns: { gross: 'Total' } },
      '2026-11-03',
    );
    const b = rememberLayout(
      recordSnapshot(emptyMemory(), snap('2026-11-10T09:00:00Z', 900)),
      ['Total'],
      { ...emptyAnswers(), columns: { gross: null } },
      '2026-11-10',
    );
    const merged = mergeMemory(a, b);
    expect(merged.snapshots).toHaveLength(2);
    expect(merged.layouts).toHaveLength(1);
    expect(merged.layouts[0]?.answers.columns.gross).toBeNull();
  });

  it('names the file with the date and business', () => {
    expect(savedFileName('2026-11-11', 'Smith Plumbing')).toBe(
      '2026-11-11 Smith Plumbing answers.json',
    );
  });
});
