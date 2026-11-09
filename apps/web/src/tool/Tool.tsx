import { useRef, useState, type DragEvent } from 'react';
import { readUpload, type Upload } from './readUpload';

const ACCEPT = '.csv,.txt,.xlsx,.xls,.ods';
const PREVIEW_ROWS = 5;
const NOTES_SHOWN = 5;

interface ToolProps {
  upload: Upload | null;
  onUpload: (upload: Upload | null) => void;
}

// the tool page: drop a file, see what it is and what we found
export function Tool({ upload, onUpload }: ToolProps) {
  const [busy, setBusy] = useState(false);

  async function read(fileName: string, bytes: Uint8Array, sheet?: string) {
    setBusy(true);
    try {
      onUpload(await readUpload(fileName, bytes, sheet));
    } finally {
      setBusy(false);
    }
  }

  async function take(file: File) {
    await read(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  return (
    <main id="main" tabIndex={-1} className="tool">
      <p className="kicker">Step 1 of 3</p>
      <h1 className="tool-title">Check your file</h1>
      {/* the result is announced to screen readers when it arrives */}
      <div aria-live="polite">
        {busy && <p className="busy">Reading your file…</p>}
        {!busy && upload?.kind === 'error' && (
          <p className="problem" role="alert">
            <b>{upload.fileName}:</b> {upload.message}
          </p>
        )}
        {!busy && upload?.kind === 'choose-sheet' && (
          <SheetChoice
            upload={upload}
            onChoose={(sheet) => void read(upload.fileName, upload.bytes, sheet)}
          />
        )}
        {!busy && upload?.kind === 'table' && (
          <Summary upload={upload} onReset={() => onUpload(null)} />
        )}
      </div>
      {upload?.kind !== 'table' && !busy && <DropZone onFile={(f) => void take(f)} />}
    </main>
  );
}

// a big target to drop a file on, or click to choose one
function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <label
      className={over ? 'drop over' : 'drop'}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // let the same file be chosen again
          e.target.value = '';
        }}
      />
      <span className="drop-big">Drop your file here</span>
      <span className="drop-small">or click to choose one: CSV, Excel or LibreOffice</span>
      <span className="drop-safe">Your file is read on this computer. Nothing is uploaded.</span>
    </label>
  );
}

function SheetChoice({
  upload,
  onChoose,
}: {
  upload: Extract<Upload, { kind: 'choose-sheet' }>;
  onChoose: (sheet: string) => void;
}) {
  return (
    <section className="card">
      <h2 className="card-title">Which sheet holds your invoices?</h2>
      <p className="muted">{upload.fileName} has more than one sheet with data in it.</p>
      <div className="choices">
        {upload.sheets.map((s) => (
          <button key={s.name} type="button" className="choice" onClick={() => onChoose(s.name)}>
            <b>{s.name}</b>
            <span>
              {s.rows} {s.rows === 1 ? 'row' : 'rows'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// what we read: the file, its size, anything worth knowing, and a peek at the rows
function Summary({
  upload,
  onReset,
}: {
  upload: Extract<Upload, { kind: 'table' }>;
  onReset: () => void;
}) {
  const [allNotes, setAllNotes] = useState(false);
  const { table, notes } = upload;
  const shownNotes = allNotes ? notes : notes.slice(0, NOTES_SHOWN);

  return (
    <section className="card">
      <div className="summary-head">
        <div>
          <h2 className="card-title">{upload.fileName}</h2>
          {upload.sheet && <p className="muted">Sheet: {upload.sheet}</p>}
        </div>
        <button type="button" className="ghost" onClick={onReset}>
          Use a different file
        </button>
      </div>
      <p>{upload.what}</p>
      <div className="stats">
        <div>
          <b>{table.rows.length.toLocaleString('en-GB')}</b>
          <span>rows read</span>
        </div>
        <div>
          <b>{table.headers.length}</b>
          <span>columns</span>
        </div>
        <div>
          <b>{notes.length}</b>
          <span>{notes.length === 1 ? 'thing to know' : 'things to know'}</span>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="notes">
          <h3>What we noticed</h3>
          <ul>
            {shownNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
          {notes.length > NOTES_SHOWN && (
            <button type="button" className="ghost" onClick={() => setAllNotes(!allNotes)}>
              {allNotes ? 'Show fewer' : `Show all ${notes.length}`}
            </button>
          )}
        </div>
      )}

      <div className="preview">
        <h3>The first {Math.min(PREVIEW_ROWS, table.rows.length)} rows</h3>
        {/* wide sheets scroll sideways inside this box */}
        <div className="preview-scroll" tabIndex={0} aria-label="Preview of your file">
          <table>
            <thead>
              <tr>
                <th scope="col">Row</th>
                {table.headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={table.rowNumbers[i] ?? i}>
                  <td className="muted">{table.rowNumbers[i]}</td>
                  {table.headers.map((h) => (
                    <td key={h}>{row[h] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="next">
        Next: confirm what each column means. That step is coming in the next update.
      </p>
    </section>
  );
}
