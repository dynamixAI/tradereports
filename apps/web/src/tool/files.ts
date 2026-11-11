import { emptyAnswers, type Answers, type FileKind, type VatStagger } from '@tradereports/core';
import type { Upload } from './readUpload';

// the four steps of the tool
export type Step = 'business' | 'add' | 'check' | 'report';

// the quick questions before any files go in; the name goes on every report
export interface Business {
  name: string;
  // which months the VAT quarters end in
  stagger: VatStagger;
}

export type TableUpload = Extract<Upload, { kind: 'table' }>;

// a file that was read; its slot says what it holds
export interface ToolFile {
  id: number;
  slot: FileKind;
  upload: TableUpload;
  // what the visitor told us about a home-made sheet's columns
  answers: Answers;
  // the visitor said it's their invoices though it didn't look like it
  forced: boolean;
}

export interface ToolState {
  step: Step;
  business: Business;
  files: ToolFile[];
  // files that need something first: a sheet to choose, or a problem to show
  waiting: { id: number; upload: Exclude<Upload, TableUpload> }[];
  // files we couldn't place; the visitor decides
  unsure: { id: number; upload: TableUpload }[];
  // one line about the last change, for the visitor and screen readers
  notice: string | null;
  nextId: number;
}

export const SLOT_NAMES: Record<FileKind, string> = {
  invoices: 'Invoices',
  quotes: 'Quotes',
  jobs: 'Jobs',
  visits: 'Visits',
  customers: 'Customers',
};

// always shown in the checklist; the others appear once added
export const MAIN_SLOTS: FileKind[] = ['invoices', 'quotes', 'jobs'];

export function emptyTool(business: Business = { name: '', stagger: 1 }): ToolState {
  return {
    // a remembered name skips the first step
    step: business.name.trim() ? 'add' : 'business',
    business,
    files: [],
    waiting: [],
    unsure: [],
    notice: null,
    nextId: 1,
  };
}

// a home-made spreadsheet is read as invoices
export function slotOf(upload: TableUpload): FileKind {
  return upload.known ?? 'invoices';
}

// add what came back from reading a file; a new file replaces one in the same slot
export function addUpload(state: ToolState, upload: Upload, forced = false): ToolState {
  const id = state.nextId;
  const base = { ...state, nextId: id + 1 };
  if (upload.kind !== 'table') {
    return { ...base, waiting: [...state.waiting, { id, upload }] };
  }
  if (upload.fit === 'unsure') {
    return { ...base, unsure: [...state.unsure, { id, upload }] };
  }
  const slot = slotOf(upload);
  const old = state.files.find((f) => f.slot === slot);
  const files = [
    ...state.files.filter((f) => f.slot !== slot),
    { id, slot, upload, answers: emptyAnswers(), forced },
  ];
  const name = SLOT_NAMES[slot].toLowerCase();
  const notice = old
    ? `${upload.fileName} replaced ${old.upload.fileName} as your ${name} file.`
    : `${upload.fileName} added as your ${name} file.`;
  return { ...base, files, notice };
}

export function removeFile(state: ToolState, id: number): ToolState {
  const file = state.files.find((f) => f.id === id);
  const files = state.files.filter((f) => f.id !== id);
  return {
    ...state,
    files,
    // nothing left to check: back to the start
    step: files.length === 0 ? 'add' : state.step,
    notice: file ? `${file.upload.fileName} removed.` : state.notice,
  };
}

// a home-made sheet needs its columns checked; known exports don't
export function needsQuestions(file: ToolFile): boolean {
  return file.upload.known === null;
}

export function setAnswers(state: ToolState, id: number, answers: Answers): ToolState {
  return { ...state, files: state.files.map((f) => (f.id === id ? { ...f, answers } : f)) };
}

// the visitor says an unclear file is their invoices after all
export function useAsInvoices(state: ToolState, id: number): ToolState {
  const found = state.unsure.find((u) => u.id === id);
  if (!found) return state;
  const rest = { ...state, unsure: state.unsure.filter((u) => u.id !== id) };
  const what = "You said this is your invoices. We'll check the columns together.";
  return addUpload(rest, { ...found.upload, fit: 'invoices', what }, true);
}

export function dropUnsure(state: ToolState, id: number): ToolState {
  return { ...state, unsure: state.unsure.filter((u) => u.id !== id) };
}

export function dropWaiting(state: ToolState, id: number): ToolState {
  return { ...state, waiting: state.waiting.filter((w) => w.id !== id) };
}

// files in checklist order
export function sortedFiles(files: ToolFile[]): ToolFile[] {
  const order: FileKind[] = ['invoices', 'quotes', 'jobs', 'visits', 'customers'];
  return [...files].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
}

// what each part of the report needs; any one of the files in a group will do
export interface Unlock {
  label: string;
  needs: FileKind[][];
}

export const UNLOCKS: Unlock[] = [
  { label: 'Money owed and overdue', needs: [['invoices']] },
  { label: 'Income by month and VAT quarter', needs: [['invoices']] },
  { label: 'Top and quiet customers', needs: [['invoices']] },
  { label: 'Work not yet invoiced', needs: [['invoices'], ['jobs', 'quotes']] },
  {
    label: 'Data health',
    needs: [['invoices', 'quotes', 'jobs', 'visits', 'customers']],
  },
];

// null when ready, otherwise what is still missing, in plain words
export function stillNeeds(unlock: Unlock, files: ToolFile[]): string | null {
  const have = new Set(files.map((f) => f.slot));
  const missing = unlock.needs.filter((group) => !group.some((slot) => have.has(slot)));
  if (missing.length === 0) return null;
  const words = missing.map((group) => {
    // every kind of file will do
    if (group.length === Object.keys(SLOT_NAMES).length) return 'any file';
    const names = group.map((slot) => SLOT_NAMES[slot].toLowerCase());
    const last = names.pop();
    return names.length > 0 ? `${names.join(', ')} or ${last}` : (last ?? '');
  });
  return `Needs ${words.join(', plus ')}`;
}

// the tag shown for one part of the report: "Ready" only when the files behind it are checked
export function unlockStatus(
  unlock: Unlock,
  files: ToolFile[],
  unchecked: Set<number>,
): { text: string; ready: boolean } {
  const needs = stillNeeds(unlock, files);
  if (needs) return { text: needs, ready: false };
  // every part needs at least one checked file
  const checked = files.filter((f) => !unchecked.has(f.id));
  const ok = unlock.needs.every((group) => checked.some((f) => group.includes(f.slot)));
  return ok ? { text: 'Ready', ready: true } : { text: 'Check columns first', ready: false };
}
