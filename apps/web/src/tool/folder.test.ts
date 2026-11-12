import { describe, expect, it } from 'vitest';
import {
  ANSWERS_FOLDER,
  newestAnswers,
  nextName,
  savedMessage,
  writeAnswersCopy,
  writeUnique,
  type Folder,
  type TeamFolder,
} from './folder';

// a pretend folder: a list of file names and what was written to each
function fakeFolder(names: string[] = []) {
  const files = new Map<string, string>(names.map((n) => [n, 'old']));
  const folder: Folder = {
    name: 'Office reports',
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create) {
        throw new DOMException('not found', 'NotFoundError');
      }
      return {
        async createWritable() {
          let text = '';
          return {
            async write(data: Blob) {
              text = await data.text();
            },
            async close() {
              files.set(name, text);
            },
          };
        },
      };
    },
  };
  return { folder, files };
}

describe('picking a name that is free', () => {
  it('keeps the name when nothing has it', () => {
    expect(nextName('report.pptx', 1)).toBe('report.pptx');
  });

  it('adds a number before the extension', () => {
    expect(nextName('2026-11-11 Smith report.pptx', 2)).toBe('2026-11-11 Smith report (2).pptx');
    expect(nextName('saved answers.json', 3)).toBe('saved answers (3).json');
  });

  it('copes with a name that has no extension', () => {
    expect(nextName('notes', 2)).toBe('notes (2)');
  });
});

describe('writing into a chosen folder', () => {
  it('writes a new file under its own name', async () => {
    const { folder, files } = fakeFolder();
    const name = await writeUnique(folder, 'report.pptx', new Blob(['new']));
    expect(name).toBe('report.pptx');
    expect(files.get('report.pptx')).toBe('new');
  });

  it('never overwrites a file that is already there', async () => {
    const { folder, files } = fakeFolder(['report.pptx', 'report (2).pptx']);
    const name = await writeUnique(folder, 'report.pptx', new Blob(['new']));
    expect(name).toBe('report (3).pptx');
    expect(files.get('report.pptx')).toBe('old');
    expect(files.get('report (2).pptx')).toBe('old');
    expect(files.get('report (3).pptx')).toBe('new');
  });

  it('never deletes anything', async () => {
    const { folder, files } = fakeFolder(['a.pptx', 'b.json']);
    await writeUnique(folder, 'a.pptx', new Blob(['new']));
    expect([...files.keys()].sort()).toEqual(['a (2).pptx', 'a.pptx', 'b.json']);
  });

  it('passes on errors other than "not found"', async () => {
    const folder: Folder = {
      name: 'Locked',
      getFileHandle() {
        return Promise.reject(new DOMException('no', 'NotAllowedError'));
      },
    };
    await expect(writeUnique(folder, 'a.pptx', new Blob(['x']))).rejects.toThrow('no');
  });
});

describe('the line shown after saving', () => {
  it('names the folder and the file', () => {
    expect(savedMessage({ name: 'a (2).pptx', folder: 'Office', fellBack: false })).toBe(
      'Saved to Office as "a (2).pptx".',
    );
  });

  it('says so when the folder could not be reached', () => {
    expect(savedMessage({ name: 'a.pptx', folder: null, fellBack: true })).toContain('Downloads');
  });

  it('stays quiet for a normal download', () => {
    expect(savedMessage({ name: 'a.pptx', folder: null, fellBack: false })).toBeNull();
  });
});

// a pretend shared folder with an answers folder inside, for the team copies
function sharedFolder(copies: { name: string; text: string; at: number }[] | null) {
  const inner = new Map(copies?.map((c) => [c.name, c]) ?? []);
  let made = copies !== null;
  const sub = {
    name: ANSWERS_FOLDER,
    getFileHandle(name: string, options?: { create?: boolean }) {
      if (!inner.has(name) && !options?.create) {
        return Promise.reject(new DOMException('not found', 'NotFoundError'));
      }
      return Promise.resolve({
        createWritable: () => {
          let text = '';
          return Promise.resolve({
            write: async (b: Blob) => {
              text = await b.text();
            },
            close: () => {
              inner.set(name, { name, text, at: 999 });
              return Promise.resolve();
            },
          });
        },
      });
    },
    async *values() {
      // a sub-folder in there is skipped
      yield { kind: 'directory' as const, name: 'old' };
      for (const c of inner.values()) {
        yield {
          kind: 'file' as const,
          name: c.name,
          getFile: () =>
            Promise.resolve({ lastModified: c.at, text: () => Promise.resolve(c.text) }),
        };
      }
    },
  };
  const top: TeamFolder = {
    name: 'Office',
    getFileHandle: () => Promise.reject(new DOMException('not found', 'NotFoundError')),
    getDirectoryHandle(name, options) {
      if (name !== ANSWERS_FOLDER) throw new Error('wrong folder');
      if (!made && !options?.create) {
        return Promise.reject(new DOMException('not found', 'NotFoundError'));
      }
      made = true;
      return Promise.resolve(sub);
    },
  };
  return { top, inner };
}

describe('team answers in the shared folder', () => {
  it('finds nothing when no one has saved answers yet', async () => {
    const { top } = sharedFolder(null);
    expect(await newestAnswers(top)).toBeNull();
  });

  it('reads the newest copy', async () => {
    const { top } = sharedFolder([
      { name: 'a.json', text: 'old', at: 1 },
      { name: 'b.json', text: 'newest', at: 3 },
      { name: 'c.json', text: 'middle', at: 2 },
      { name: 'notes.txt', text: 'not answers', at: 9 },
    ]);
    expect(await newestAnswers(top)).toBe('newest');
  });

  it('adds a copy in its own folder without touching the others', async () => {
    const { top, inner } = sharedFolder([{ name: 'answers.json', text: 'old', at: 1 }]);
    const name = await writeAnswersCopy(top, 'answers.json', new Blob(['new']));
    expect(name).toBe('answers (2).json');
    expect(inner.get('answers.json')?.text).toBe('old');
    expect(inner.get('answers (2).json')?.text).toBe('new');
  });

  it('makes the answers folder the first time', async () => {
    const { top, inner } = sharedFolder(null);
    await writeAnswersCopy(top, 'answers.json', new Blob(['first']));
    expect(inner.get('answers.json')?.text).toBe('first');
  });
});
