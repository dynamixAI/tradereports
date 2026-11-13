import { useCallback, useEffect, useState, type DragEvent } from 'react';
import {
  addUpload,
  dropUnsure,
  dropWaiting,
  MAIN_SLOTS,
  needsQuestions,
  removeFile,
  setAnswers,
  SLOT_NAMES,
  sortedFiles,
  UNLOCKS,
  unlockStatus,
  type Business,
  type Step,
  type ToolFile,
  type ToolState,
  useAsInvoices,
} from './files';
import { openCount, QuestionBox } from './Check';
import { readUpload, type Upload } from './readUpload';
import { Report } from './Report';
import { BusinessStep } from './BusinessStep';
import { OpenSaved } from './Saved';
import { mergeMemory, readSavedFile, saveMemory, type Memory, type SavedFile } from './memory';
import { allowedFolder, newestAnswers } from './folder';
import { FolderPicker } from './FolderPicker';
import { saveBusiness } from './business';
import { countStep } from '../count';

const ACCEPT = '.csv,.txt,.xlsx,.xls,.ods';
const PREVIEW_ROWS = 5;

const STEPS: { step: Step; label: string }[] = [
  { step: 'business', label: 'Your business' },
  { step: 'add', label: 'Add files' },
  { step: 'check', label: 'Check columns' },
  { step: 'report', label: 'Your report' },
];

interface ToolProps {
  state: ToolState;
  onChange: (update: (state: ToolState) => ToolState) => void;
  // leave the made-up example for the visitor's own tool
  onLeaveExample?: () => void;
}

// the tool: add files, check columns, see the report
export function Tool({ state, onChange, onLeaveExample }: ToolProps) {
  const [busy, setBusy] = useState(false);
  const at = STEPS.findIndex((s) => s.step === state.step);
  const go = (step: Step) => onChange((s) => ({ ...s, step, notice: null }));
  // remembered on this device as well as in the tool
  const setMemory = useCallback(
    (memory: Memory) => {
      saveMemory(memory);
      onChange((s) => ({ ...s, memory }));
    },
    [onChange],
  );
  // a saved file was opened: with a name it can go straight to adding files
  const opened = (business: Business, memory: Memory) => {
    countStep('copy-opened');
    onChange((s) => ({
      ...s,
      business,
      memory,
      step: s.step === 'business' && business.name.trim() ? 'add' : s.step,
    }));
  };
  // answers left in the shared folder by someone else (or this person on another computer)
  const team = useCallback(
    (file: SavedFile) =>
      onChange((s) => {
        const memory = mergeMemory(s.memory, file.memory);
        // their name only fills a blank; a name already typed here wins
        const business = s.business.name.trim() ? s.business : file.business;
        if (JSON.stringify(memory) === JSON.stringify(s.memory) && business === s.business) {
          return s;
        }
        saveMemory(memory);
        saveBusiness(business);
        countStep('team-answers-used');
        return {
          ...s,
          memory,
          business,
          step: s.step === 'business' && business.name.trim() ? 'add' : s.step,
          notice: 'Brought in your team’s answers from the shared folder.',
        };
      }),
    [onChange],
  );
  // on opening the tool, check the shared folder quietly, if the browser already allows it
  useEffect(() => {
    let live = true;
    if (state.example) return;
    void (async () => {
      const folder = await allowedFolder();
      const text = folder ? await newestAnswers(folder).catch(() => null) : null;
      const read = text === null ? null : readSavedFile(text);
      if (live && read && typeof read !== 'string') team(read);
    })();
    return () => {
      live = false;
    };
  }, [team, state.example]);
  // questions still open across every file; the report waits for these
  const left = state.files.reduce((n, f) => n + (needsQuestions(f) ? openCount(f) : 0), 0);
  // home-made sheets with questions still open; their results aren't ready yet
  const unchecked = new Set(
    state.files.filter((f) => needsQuestions(f) && openCount(f) > 0).map((f) => f.id),
  );

  // each step starts at the top of the page
  // braces matter: newer browsers return a promise from scrollTo, which React can't clean up
  useEffect(() => {
    window.scrollTo(0, 0);
    // anonymous funnel: how far people get (each counts once per visit)
    if (state.step === 'check') countStep('check-columns-opened');
  }, [state.step]);
  useEffect(() => {
    // the example isn't someone using the tool
    if (!state.example) countStep('tool-opened');
  }, [state.example]);

  // read files one after another, adding each as it's done
  async function take(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        const upload = await readUpload(file.name, new Uint8Array(await file.arrayBuffer()));
        onChange((s) => addUpload(s, upload));
      }
      if (files.length) countStep('files-added');
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
          // earlier steps can be revisited; later ones open once there's enough to go on
          const named = state.business.name.trim() !== '';
          const ready =
            (i === 1 && named) || (state.files.length > 0 && (i === 2 || (i === 3 && left === 0)));
          const reachable = i !== at && (i < at || ready);
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

      {state.step === 'business' && (
        <>
          <BusinessStep
            business={state.business}
            onDone={(business) => onChange((s) => ({ ...s, business, step: 'add', notice: null }))}
          />
          <OpenSaved business={state.business} memory={state.memory} onOpened={opened} />
          <p className="field-help">
            Just looking? <a href="/example">See an example report</a> made from made-up files.
          </p>
          {/* a team folder can hold answers someone already gave */}
          <FolderPicker onTeam={team} lead="Shared team folder:" empty="none yet" />
        </>
      )}

      {state.step === 'add' && (
        <div className="tool-grid">
          <div>
            <p className="biz-name">{state.business.name}</p>
            <h1 className="tool-title">Add files</h1>
            <p className="tool-sub">
              Invoices, quotes, jobs or your own spreadsheet. Nothing leaves your computer.
            </p>
            <Checklist files={state.files} />
            {state.files.length === 0 && (
              <OpenSaved business={state.business} memory={state.memory} onOpened={opened} />
            )}

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

            {state.unsure.map(({ id, upload }) => (
              <div className="warn" role="alert" key={id}>
                <p>
                  <b>{upload.fileName}:</b> {upload.what}
                </p>
                <p className="muted">
                  TradeReports reads invoices you keep yourself, and invoices, quotes, jobs, visits
                  or customer lists exported from job software. If this came from your job software,
                  use the report export with all columns, not a file made for importing.
                </p>
                <div className="warn-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onChange((s) => dropUnsure(s, id))}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onChange((s) => useAsInvoices(s, id))}
                  >
                    It's my invoices, use it
                  </button>
                </div>
              </div>
            ))}

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

          <Unlocks files={state.files} unchecked={unchecked} />
        </div>
      )}

      {state.step === 'check' && (
        <>
          <h1 className="tool-title">Check columns</h1>
          <p className="tool-sub">
            Tell us what each column means. Most have a suggested answer already.
          </p>
          {sortedFiles(state.files).map((f) =>
            needsQuestions(f) ? (
              <QuestionBox
                key={f.id}
                file={f}
                onAnswers={(answers) => onChange((s) => setAnswers(s, f.id, answers))}
                onRemove={() => onChange((s) => removeFile(s, f.id))}
              />
            ) : (
              <section key={f.id} className="card known">
                <p className="file-slot">{SLOT_NAMES[f.slot]}</p>
                <h2 className="card-title">{f.upload.fileName}</h2>
                <p className="muted">Recognised, so there are no questions for this file.</p>
              </section>
            ),
          )}
          <div className="step-actions">
            <button type="button" className="ghost" onClick={() => go('add')}>
              Back to your files
            </button>
            {left === 0 ? (
              <button type="button" className="try" onClick={() => go('report')}>
                Next: your report
              </button>
            ) : (
              <span className="muted">
                {left} {left === 1 ? 'question' : 'questions'} left before your report.
              </span>
            )}
          </div>
        </>
      )}

      {state.step === 'report' && (
        <Report
          files={state.files}
          business={state.business}
          onBusiness={(business) => onChange((s) => ({ ...s, business }))}
          memory={state.memory}
          onMemory={setMemory}
          onAddFiles={() => go('add')}
          onTeam={team}
          example={state.example ?? false}
          onLeaveExample={onLeaveExample}
        />
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
function Unlocks({ files, unchecked }: { files: ToolFile[]; unchecked: Set<number> }) {
  return (
    <aside className="side">
      <section className="card">
        <h2 className="side-title">What your files unlock</h2>
        <ul className="unlocks">
          {UNLOCKS.map((u) => {
            const status = unlockStatus(u, files, unchecked);
            return (
              <li key={u.label} className={status.ready ? 'ready' : ''}>
                <span>{u.label}</span>
                <span className="tag">{status.text}</span>
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
