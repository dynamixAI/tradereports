import { useEffect, useState, type DragEvent } from 'react';
import {
  addUpload,
  dropWaiting,
  MAIN_SLOTS,
  removeFile,
  SLOT_NAMES,
  sortedFiles,
  stillNeeds,
  UNLOCKS,
  type Step,
  type ToolFile,
  type ToolState,
} from './files';
import { readUpload, type Upload } from './readUpload';

const ACCEPT = '.csv,.txt,.xlsx,.xls,.ods';
const PREVIEW_ROWS = 5;

const STEPS: { step: Step; label: string }[] = [
  { step: 'add', label: 'Add files' },
  { step: 'check', label: 'Check columns' },
  { step: 'report', label: 'Your report' },
];

interface ToolProps {
  state: ToolState;
  onChange: (update: (state: ToolState) => ToolState) => void;
}

// the tool: add files, check columns, see the report
export function Tool({ state, onChange }: ToolProps) {
  const [busy, setBusy] = useState(false);
  const at = STEPS.findIndex((s) => s.step === state.step);
  const go = (step: Step) => onChange((s) => ({ ...s, step, notice: null }));

  // each step starts at the top of the page
  // braces matter: newer browsers return a promise from scrollTo, which React can't clean up
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  // read files one after another, adding each as it's done
  async function take(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        const upload = await readUpload(file.name, new Uint8Array(await file.arrayBuffer()));
        onChange((s) => addUpload(s, upload));
      }
    } finally {
      setBusy(false);
    }
  }

  async function chooseSheet(id: number, fileName: string, bytes: Uint8Array, sheet: string) {
    setBusy(true);
    try {
      const upload = await readUpload(fileName, bytes, sheet);
      onChange((s) => addUpload(dropWaiting(s, id), upload));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" tabIndex={-1} className="tool">
      <ol className="steps">
        {STEPS.map((s, i) => {
          // earlier steps can be revisited; later ones open with the Next button
          const reachable = i < at || (i === at + 1 && state.files.length > 0 && i === 1);
          return (
            <li key={s.step} className={i === at ? 'now' : i < at ? 'done' : ''}>
              {reachable ? (
                <button type="button" onClick={() => go(s.step)}>
                  <span className="step-n">{i + 1}</span> {s.label}
                </button>
              ) : (
                <span aria-current={i === at ? 'step' : undefined}>
                  <span className="step-n">{i + 1}</span> {s.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {state.step === 'add' && (
        <div className="tool-grid">
          <div>
            <h1 className="tool-title">Add files</h1>
            <p className="tool-sub">
              Invoices, quotes, jobs or your own spreadsheet. Nothing leaves your computer.
            </p>
            <Checklist files={state.files} />

            {/* changes are announced to screen readers */}
            <div aria-live="polite">
              {busy && <p className="busy">Reading your file…</p>}
              {state.notice && !busy && <p className="notice">{state.notice}</p>}
            </div>

            {state.waiting.map(({ id, upload }) =>
              upload.kind === 'error' ? (
                <div className="problem" role="alert" key={id}>
                  <p>
                    <b>{upload.fileName}:</b> {upload.message}
                  </p>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onChange((s) => dropWaiting(s, id))}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <SheetChoice
                  key={id}
                  upload={upload}
                  onChoose={(sheet) => void chooseSheet(id, upload.fileName, upload.bytes, sheet)}
                />
              ),
            )}

            {!busy && <DropZone more={state.files.length > 0} onFiles={(f) => void take(f)} />}

            <div className="file-list">
              {sortedFiles(state.files).map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  onRemove={() => onChange((s) => removeFile(s, f.id))}
                />
              ))}
            </div>

            {state.files.length > 0 && (
              <div className="step-actions">
                <button type="button" className="try" onClick={() => go('check')}>
                  Next: check columns
                </button>
              </div>
            )}
          </div>

          <Unlocks files={state.files} />
        </div>
      )}

      {state.step === 'check' && (
        <>
          <h1 className="tool-title">Check columns</h1>
          <p className="tool-sub">
            Here you'll confirm what each column means. This step is coming in the next update.
          </p>
          <div className="step-actions">
            <button type="button" className="ghost" onClick={() => go('add')}>
              Back to your files
            </button>
          </div>
        </>
      )}

      {state.step === 'report' && (
        <>
          <h1 className="tool-title">Your report</h1>
          <p className="tool-sub">Coming soon.</p>
        </>
      )}
    </main>
  );
}

// which files are in, and which would unlock more of the report
function Checklist({ files }: { files: ToolFile[] }) {
  const have = new Set(files.map((f) => f.slot));
  const extra = files.filter((f) => !MAIN_SLOTS.includes(f.slot)).map((f) => f.slot);
  return (
    <ul className="checklist" aria-label="Your files">
      {[...MAIN_SLOTS, ...extra].map((slot) => (
        <li key={slot} className={have.has(slot) ? 'in' : ''}>
          <span aria-hidden="true">{have.has(slot) ? '✓' : '+'}</span> {SLOT_NAMES[slot]}
          <span className="sr-only">{have.has(slot) ? ' added' : ' not added yet'}</span>
        </li>
      ))}
    </ul>
  );
}

// the side panel: each part of the report, and whether the files so far are enough
function Unlocks({ files }: { files: ToolFile[] }) {
  return (
    <aside className="side">
      <section className="card">
        <h2 className="side-title">What your files unlock</h2>
        <ul className="unlocks">
          {UNLOCKS.map((u) => {
            const needs = stillNeeds(u, files);
            return (
              <li key={u.label} className={needs ? '' : 'ready'}>
                <span>{u.label}</span>
                <span className="tag">{needs ?? 'Ready'}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2 className="side-title">Tips</h2>
        <ul className="tips">
          <li>Export with all columns. Extra columns do no harm.</li>
          <li>A spreadsheet you keep yourself works too.</li>
          <li>One file of each kind. A new one replaces the old.</li>
          <li>Excel workbooks with several sheets: you pick the sheet.</li>
        </ul>
      </section>
    </aside>
  );
}

// a big target to drop files on, or click to choose them
function DropZone({ more, onFiles }: { more: boolean; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) onFiles(files);
  };

  return (
    <label
      className={`drop${over ? ' over' : ''}${more ? ' small' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0) onFiles(files);
          // let the same file be chosen again
          e.target.value = '';
        }}
      />
      <span className="drop-big">{more ? 'Add another file' : 'Drop your files here'}</span>
      <span className="drop-small">or click to choose: CSV, Excel or LibreOffice</span>
      {!more && (
        <span className="drop-safe">
          Your files are read on this computer. Nothing is uploaded.
        </span>
      )}
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
      <h2 className="card-title">Which sheet should we read?</h2>
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

// one file: what it is, its size, and the details if wanted
function FileCard({ file, onRemove }: { file: ToolFile; onRemove: () => void }) {
  const { upload } = file;
  const { table, notes } = upload;
  return (
    <section className="card file-card">
      <div className="summary-head">
        <div>
          <p className="file-slot">{SLOT_NAMES[file.slot]}</p>
          <h2 className="card-title">{upload.fileName}</h2>
          {upload.sheet && <p className="muted">Sheet: {upload.sheet}</p>}
        </div>
        <button type="button" className="ghost" onClick={onRemove}>
          Remove
        </button>
      </div>
      <p>{upload.what}</p>
      <p className="muted">
        {table.rows.length.toLocaleString('en-GB')} {table.rows.length === 1 ? 'row' : 'rows'} ·{' '}
        {table.headers.length} columns · {notes.length}{' '}
        {notes.length === 1 ? 'thing to know' : 'things to know'}
      </p>

      <details className="file-details">
        <summary>Details</summary>
        {notes.length > 0 && (
          <div className="notes">
            <h3>What we noticed</h3>
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="preview">
          <h3>The first {Math.min(PREVIEW_ROWS, table.rows.length)} rows</h3>
          {/* wide sheets scroll sideways inside this box */}
          <div className="preview-scroll" tabIndex={0} aria-label={`Preview of ${upload.fileName}`}>
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
      </details>
    </section>
  );
}
