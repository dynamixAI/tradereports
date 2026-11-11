// "Choose a folder": in Chrome and Edge, reports and saved files go straight into a folder
// the user picked (a shared Drive, OneDrive or office folder works if it is synced to the
// computer). Other browsers carry on downloading as normal.
// Two rules: never overwrite a file, never delete one.

// just the parts of the browser's folder and file handles we use, so tests can fake them
export interface Writable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface FileEntry {
  createWritable(): Promise<Writable>;
}
export interface Folder {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileEntry>;
}

// the real handle also asks for permission; older type files don't know these yet
interface RealFolder extends Folder {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<RealFolder>;
};

// "report.pptx" with n = 3 becomes "report (3).pptx"; n = 1 keeps the name
export function nextName(name: string, n: number): string {
  if (n <= 1) return name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}

// does a file with this name already exist in the folder?
async function exists(folder: Folder, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false;
    throw err;
  }
}

// write into the folder under the first free name, and say which name was used
export async function writeUnique(folder: Folder, name: string, blob: Blob): Promise<string> {
  let n = 1;
  while (await exists(folder, nextName(name, n))) n++;
  const free = nextName(name, n);
  const file = await folder.getFileHandle(free, { create: true });
  const out = await file.createWritable();
  await out.write(blob);
  await out.close();
  return free;
}

// only Chrome and Edge on a computer can write into a folder
export function canPickFolder(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ---- remembering the folder on this computer ----
// a folder can't go in localStorage, so it lives in the browser's small database
const DB = 'tr-folder';
const STORE = 'folder';
const KEY = 'chosen';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open storage'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error('Storage failed'));
    });
  } finally {
    db.close();
  }
}

// kept here once known, so the database is only read once per visit
let current: RealFolder | null | undefined;

export async function loadFolder(): Promise<RealFolder | null> {
  if (!canPickFolder()) return null;
  if (current !== undefined) return current;
  try {
    current = (await run<RealFolder | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    current = null;
  }
  return current;
}

// open the browser's folder picker; null if the user closes it
export async function pickFolder(): Promise<RealFolder | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const folder = await picker({ id: 'tradereports', mode: 'readwrite' });
    current = folder;
    // remember it for next time too; if that fails it still works for this visit
    await run('readwrite', (s) => s.put(folder, KEY)).catch(() => undefined);
    return folder;
  } catch {
    return null;
  }
}

// go back to normal downloads (the folder itself is left alone)
export async function forgetFolder(): Promise<void> {
  current = null;
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // nothing stored
  }
}

// ---- saving ----

// call this straight after a click: the browser only shows its "allow?" question then
export async function readyFolder(): Promise<RealFolder | null> {
  const folder = await loadFolder();
  if (!folder) return null;
  try {
    const mode = { mode: 'readwrite' } as const;
    if ((await folder.queryPermission(mode)) === 'granted') return folder;
    return (await folder.requestPermission(mode)) === 'granted' ? folder : null;
  } catch {
    return null;
  }
}

export interface Saved {
  name: string;
  // the folder's name, or null when it went to Downloads
  folder: string | null;
  // true when a folder was chosen but couldn't be reached
  fellBack: boolean;
}

// put the file in the folder if we have one, otherwise download it
export async function saveFile(folder: Folder | null, blob: Blob, name: string): Promise<Saved> {
  if (folder) {
    try {
      return { name: await writeUnique(folder, name, blob), folder: folder.name, fellBack: false };
    } catch {
      // folder moved, deleted or offline: don't lose the file, download it instead
      downloadBlob(blob, name);
      return { name, folder: null, fellBack: true };
    }
  }
  downloadBlob(blob, name);
  return { name, folder: null, fellBack: false };
}

// hand a file to the browser's download
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment to start the download before the link is thrown away
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// one line to show after saving
export function savedMessage(s: Saved): string | null {
  if (s.fellBack) return `Couldn't reach your folder, so "${s.name}" went to Downloads instead.`;
  if (s.folder) return `Saved to ${s.folder} as "${s.name}".`;
  return null;
}
