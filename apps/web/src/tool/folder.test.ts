import { describe, expect, it } from 'vitest';
import { nextName, savedMessage, writeUnique, type Folder } from './folder';

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
