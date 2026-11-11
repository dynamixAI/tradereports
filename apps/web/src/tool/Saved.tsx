import { useRef, useState } from 'react';
import { saveBusiness } from './business';
import { readyFolder, saveFile, savedMessage } from './folder';
import type { Business } from './files';
import {
  mergeMemory,
  readSavedFile,
  savedFile,
  savedFileName,
  saveMemory,
  type Memory,
} from './memory';

// "Open a saved file": brings back the answers and past report totals from another visit
export function OpenSaved({
  business,
  memory,
  onOpened,
}: {
  business: Business;
  memory: Memory;
  onOpened: (business: Business, memory: Memory) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const open = async (file: File) => {
    const read = readSavedFile(await file.text());
    if (typeof read === 'string') {
      setMessage({ ok: false, text: read });
      return;
    }
    const merged = mergeMemory(memory, read.memory);
    // the file's name only fills a blank; a name already typed here wins
    const next = business.name.trim() ? business : read.business;
    saveMemory(merged);
    saveBusiness(next);
    onOpened(next, merged);
    const reports = read.memory.snapshots.length;
    const layouts = read.memory.layouts.length;
    setMessage({
      ok: true,
      text: `Opened. ${layouts} ${layouts === 1 ? 'spreadsheet layout' : 'spreadsheet layouts'} and ${reports} past ${reports === 1 ? 'report' : 'reports'} brought back.`,
    });
  };

  return (
    <div className="open-saved">
      <button type="button" className="link" onClick={() => input.current?.click()}>
        Used TradeReports before? Open your saved file
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void open(file);
        }}
      />
      {message && (
        <p className={message.ok ? 'field-help' : 'field-error'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

// "Save answers": a small file to keep, or open on another computer
export function SaveButton({
  business,
  memory,
  asOf,
  onSaved,
}: {
  business: Business;
  memory: Memory;
  asOf: string;
  // tells the report where the file went
  onSaved: (note: string | null) => void;
}) {
  const save = async () => {
    // ask about the folder first, while the click still counts
    const folder = await readyFolder();
    const file = savedFile(business, memory, new Date().toISOString());
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    onSaved(savedMessage(await saveFile(folder, blob, savedFileName(asOf, business.name))));
  };
  return (
    <button type="button" className="ghost" onClick={() => void save()}>
      Save answers
    </button>
  );
}
