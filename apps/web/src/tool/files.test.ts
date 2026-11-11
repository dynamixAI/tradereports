import { describe, expect, it } from 'vitest';
import type { CsvTable } from '@tradereports/core';
import {
  addUpload,
  emptyTool,
  removeFile,
  sortedFiles,
  stillNeeds,
  UNLOCKS,
  unlockStatus,
  useAsInvoices,
} from './files';
import type { Fit, Upload } from './readUpload';

const table: CsvTable = { headers: ['A'], rows: [], rowNumbers: [], issues: [] };

function read(
  fileName: string,
  known: Extract<Upload, { kind: 'table' }>['known'],
  fit: Fit = known ? 'export' : 'invoices',
): Upload {
  return { kind: 'table', fileName, sheet: null, table, what: '', known, fit, notes: [] };
}

describe('tool files', () => {
  it('puts a home-made sheet in the invoices slot', () => {
    const state = addUpload(emptyTool(), read('mine.csv', null));
    expect(state.files.map((f) => f.slot)).toEqual(['invoices']);
    expect(state.notice).toMatch(/added as your invoices file/);
  });

  it('keeps one file per slot and says which was replaced', () => {
    let state = addUpload(emptyTool(), read('old.csv', 'invoices'));
    state = addUpload(state, read('quotes.csv', 'quotes'));
    state = addUpload(state, read('new.csv', 'invoices'));
    expect(state.files.map((f) => f.upload.fileName).sort()).toEqual(['new.csv', 'quotes.csv']);
    expect(state.notice).toMatch(/new.csv replaced old.csv/);
  });

  it('keeps a file it cannot place out of the slots until the visitor decides', () => {
    let state = addUpload(emptyTool(), read('clients.csv', null, 'unsure'));
    expect(state.files).toHaveLength(0);
    expect(state.unsure).toHaveLength(1);
    state = useAsInvoices(state, state.unsure[0]?.id ?? 0);
    expect(state.unsure).toHaveLength(0);
    expect(state.files.map((f) => f.slot)).toEqual(['invoices']);
  });

  it('holds back files that need a sheet chosen or failed', () => {
    const state = addUpload(emptyTool(), { kind: 'error', fileName: 'a.pdf', message: 'no' });
    expect(state.files).toHaveLength(0);
    expect(state.waiting).toHaveLength(1);
  });

  it('goes back to the first step when the last file is removed', () => {
    let state = addUpload(emptyTool(), read('a.csv', 'invoices'));
    state = { ...state, step: 'check' };
    const id = state.files[0]?.id ?? 0;
    state = removeFile(state, id);
    expect(state.files).toHaveLength(0);
    expect(state.step).toBe('add');
  });

  it('lists files invoices first, then quotes, then jobs', () => {
    let state = addUpload(emptyTool(), read('j.csv', 'jobs'));
    state = addUpload(state, read('q.csv', 'quotes'));
    state = addUpload(state, read('i.csv', 'invoices'));
    expect(sortedFiles(state.files).map((f) => f.slot)).toEqual(['invoices', 'quotes', 'jobs']);
  });
});

describe('the business step', () => {
  it('starts at the business questions until a name is given', () => {
    expect(emptyTool().step).toBe('business');
    expect(emptyTool({ name: 'Smith Plumbing', stagger: 2 }).step).toBe('add');
    expect(emptyTool({ name: '   ', stagger: 1 }).step).toBe('business');
  });
});

describe('what files unlock', () => {
  function unlock(label: string) {
    const found = UNLOCKS.find((u) => u.label === label);
    if (!found) throw new Error(`no result called ${label}`);
    return found;
  }

  it('says what is missing before any file is added', () => {
    expect(stillNeeds(unlock('Money owed and overdue'), [])).toBe('Needs invoices');
    expect(stillNeeds(unlock('Data health'), [])).toBe('Needs any file');
  });

  it('asks for both parts when a result needs two kinds of file', () => {
    const files = addUpload(emptyTool(), read('i.csv', 'invoices')).files;
    expect(stillNeeds(unlock('Money owed and overdue'), files)).toBeNull();
    expect(stillNeeds(unlock('Work not yet invoiced'), files)).toBe('Needs jobs or quotes');
  });

  it('is ready once each part has a file', () => {
    let state = addUpload(emptyTool(), read('i.csv', 'invoices'));
    state = addUpload(state, read('j.csv', 'jobs'));
    expect(stillNeeds(unlock('Work not yet invoiced'), state.files)).toBeNull();
  });
});

describe('ready tags', () => {
  const owed = UNLOCKS[0];
  if (!owed) throw new Error('no results listed');

  it('waits for the columns to be checked before saying ready', () => {
    const files = addUpload(emptyTool(), read('mine.csv', null)).files;
    const id = files[0]?.id ?? 0;
    expect(unlockStatus(owed, files, new Set([id]))).toEqual({
      text: 'Check columns first',
      ready: false,
    });
    expect(unlockStatus(owed, files, new Set())).toEqual({ text: 'Ready', ready: true });
  });

  it('still says what is missing first', () => {
    expect(unlockStatus(owed, [], new Set()).text).toBe('Needs invoices');
  });

  it('marks a file the visitor forced in as theirs', () => {
    let state = addUpload(emptyTool(), read('odd.csv', null, 'unsure'));
    state = useAsInvoices(state, state.unsure[0]?.id ?? 0);
    expect(state.files[0]?.upload.what).toMatch(/You said this is your invoices/);
  });
});
