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

// "Open a copy": brings back the answers and past report totals from another computer
export function OpenSaved({
  business,
  memory,
  onOpened,
  label = 'Used TradeReports on another computer? Open your copy',
  className = 'open-saved',
}: {
  business: Business;
  memory: Memory;
  onOpened: (business: Business, memory: Memory) => void;
  label?: string;
  className?: string;
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
    <div className={className}>
      <button type="button" className="link" onClick={() => input.current?.click()}>
        {label}
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

// "Copy my answers to another computer": a small file to open on the other computer
export function CopyAnswers({ business, memory }: { business: Business; memory: Memory }) {
  const [done, setDone] = useState<string | null>(null);
  const copy = async () => {
    // ask about the folder first, while the click still counts
    const folder = await readyFolder();
    const file = savedFile(business, memory, new Date().toISOString());
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const name = savedFileName(new Date().toISOString().slice(0, 10), business.name);
    setDone(savedMessage(await saveFile(folder, blob, name)) ?? 'Saved to your Downloads.');
  };
  return (
    <div className="open-saved">
      <button type="button" className="link" onClick={() => void copy()}>
        Copy my answers to another computer
      </button>
      {done && (
        <p className="field-help" role="status">
          {done}
        </p>
      )}
    </div>
  );
}
