import { useState } from 'react';
import {
  acceptSuggested,
  askQuestions,
  emptyAnswers,
  type Answers,
  type CsvTable,
  type Field,
  type Question,
} from '@tradereports/core';
import {
  blocks,
  FIELD_NAMES,
  fitCheck,
  givenAnswers,
  MEANING_NAMES,
  reply,
  type Reply,
} from './answers';
import type { ToolFile } from './files';

const MEANINGS = ['paid', 'unpaid', 'part paid', 'ignore'] as const;

// how many questions are left before the report can be made
export function openCount(file: ToolFile): number {
  return askQuestions(file.upload.table, file.answers).filter(blocks).length;
}

// one home-made sheet: the next question, a way to take every suggestion, and the answers so far
export function QuestionBox({
  file,
  onAnswers,
  onRemove,
}: {
  file: ToolFile;
  onAnswers: (answers: Answers) => void;
  onRemove: () => void;
}) {
  const { table } = file.upload;
  const questions = askQuestions(table, file.answers);
  const needed = questions.filter(blocks);
  const optional = questions.filter((q) => !blocks(q));
  // must-answer questions first, then the optional checks
  const current = needed[0] ?? optional[0];
  const given = givenAnswers(file.answers);
  // only offer the shortcut when it would answer something; a suggested column that
  // doesn't fit is left for the visitor to pick
  const suggested = keepFitting(acceptSuggested(table, file.answers), file.answers, table);
  const canSuggest = JSON.stringify(suggested) !== JSON.stringify(file.answers);
  const answer = (r: Reply) => onAnswers(reply(file.answers, r));
  // judged on the file alone: nothing looks like an invoice number, customer or total
  const unsure = askQuestions(table, emptyAnswers()).filter(
    (q) => q.kind === 'column' && q.required && q.suggested === null,
  ).length;
  // once they've picked the invoice number and customer themselves, stop warning
  const picked = file.answers.columns.invoiceNumber && file.answers.columns.customer;
  const notInvoices = unsure >= 2 && !picked;

  return (
    <div className="check-grid">
      <section className="card qbox" aria-live="polite">
        <p className="file-slot">{file.upload.fileName}</p>
        {notInvoices && (
          <div className="warn" role="alert">
            <p>
              <b>This doesn't look like an invoices file.</b> If it's quotes or jobs from your job
              software, use the report export with all columns. Files made for importing into job
              software won't work here.
            </p>
            <button type="button" className="ghost" onClick={onRemove}>
              Remove this file
            </button>
            <p className="muted">Or carry on below and pick the columns yourself.</p>
          </div>
        )}
        {current ? (
          <>
            <p className="muted q-count">
              {needed.length > 0
                ? `${needed.length} ${needed.length === 1 ? 'question' : 'questions'} left`
                : `Optional: ${optional.length} ${optional.length === 1 ? 'thing' : 'things'} we spotted`}
            </p>
            {/* a new key resets the form when the question changes */}
            <Ask
              key={questionId(current)}
              question={current}
              table={table}
              onReply={answer}
              onRemove={onRemove}
            />
            <div className="q-bulk">
              {/* on a file that doesn't look like invoices, each column is picked by hand */}
              {canSuggest && !notInvoices && (
                <button type="button" className="ghost" onClick={() => onAnswers(suggested)}>
                  Use all suggestions
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="q-done">All checked. Your report is ready.</p>
        )}
      </section>

      <section className="card">
        <h2 className="side-title">Your answers</h2>
        {given.length === 0 ? (
          <p className="muted">Nothing answered yet.</p>
        ) : (
          <ul className="given">
            {given.map((g) => (
              <li key={g.text}>
                <span>{g.text}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => onAnswers(g.undo(file.answers))}
                >
                  Change
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// drop suggested columns that fail the sense check, keeping anything already answered
function keepFitting(next: Answers, before: Answers, table: CsvTable): Answers {
  const columns = Object.fromEntries(
    Object.entries(next.columns).filter(
      ([field, header]) =>
        field in before.columns || !header || !fitCheck(field as Field, header, table),
    ),
  );
  return { ...next, columns };
}

function questionId(q: Question): string {
  switch (q.kind) {
    case 'column':
      return `column:${q.field}`;
    case 'date-order':
      return 'date-order';
    case 'status':
      return `status:${q.value}`;
    case 'year':
      return `year:${q.value}`;
    case 'repair':
      return `repair:${q.repair.key}`;
    case 'same-customer':
      return `same:${q.match.id}`;
    case 'split-customer':
      return `split:${q.split.id}`;
    case 'note-amount':
      return `note:${q.key}`;
  }
}

const pounds = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

// one question and its buttons
function Ask({
  question: q,
  table,
  onReply,
  onRemove,
}: {
  question: Question;
  table: CsvTable;
  onReply: (r: Reply) => void;
  onRemove: () => void;
}) {
  if (q.kind === 'column') {
    return <AskColumn question={q} table={table} onReply={onReply} onRemove={onRemove} />;
  }
  if (q.kind === 'year') return <AskYear question={q} onReply={onReply} />;

  if (q.kind === 'date-order') {
    return (
      <Choice
        title={`How are the dates in "${q.column}" written?`}
        detail={`For example: ${q.examples.join(', ')}`}
        options={[
          {
            label: 'Day first, like 3/11 for 3 November (UK)',
            act: () => onReply({ kind: 'date-order', order: 'day-first' }),
          },
          {
            label: 'Month first, like 11/3 for 3 November (US)',
            act: () => onReply({ kind: 'date-order', order: 'month-first' }),
          },
        ]}
      />
    );
  }

  if (q.kind === 'status') {
    const shown = q.value ? `"${q.value}"` : 'A blank';
    return (
      <Choice
        title={`${shown} in "${q.column}" means…`}
        detail={`${q.count} ${q.count === 1 ? 'row says' : 'rows say'} this.`}
        options={MEANINGS.map((m) => ({
          label: MEANING_NAMES[m],
          suggested: q.suggested === m,
          act: () => onReply({ kind: 'status', value: q.value, meaning: m }),
        }))}
      />
    );
  }

  if (q.kind === 'repair') {
    const r = q.repair;
    const title =
      r.action === 'swap'
        ? `Row ${r.row}: "${r.from}" and "${r.to}" look swapped`
        : r.action === 'shift'
          ? `Row ${r.row}: the values look moved along one column`
          : r.action === 'remove-copy'
            ? `Row ${r.row}: "${r.value}" in "${r.from}" looks like a copy`
            : `Row ${r.row}: "${r.value}" looks like it belongs in "${r.to}", not "${r.from}"`;
    return (
      <Choice
        title={title}
        detail={r.evidence.join(' ')}
        options={[
          { label: 'Fix it', act: () => onReply({ kind: 'repair', key: r.key, accept: true }) },
          {
            label: 'Leave it as typed',
            act: () => onReply({ kind: 'repair', key: r.key, accept: false }),
          },
        ]}
      />
    );
  }

  if (q.kind === 'note-amount') {
    const a = q.amount;
    return (
      <Choice
        title={`Row ${q.row}: the note says ${pounds(a.paidPence)} was paid`}
        detail={`"${a.note}". That leaves ${pounds(a.duePence)} still owed.`}
        options={[
          {
            label: 'Use these amounts',
            act: () => onReply({ kind: 'repair', key: q.key, accept: true }),
          },
          {
            label: 'Ignore the note',
            act: () => onReply({ kind: 'repair', key: q.key, accept: false }),
          },
        ]}
      />
    );
  }

  if (q.kind === 'same-customer') {
    const m = q.match;
    return (
      <Choice
        title={`Are "${m.variant}" and "${m.canonical}" the same customer?`}
        detail={m.evidence.join(' ')}
        options={[
          {
            label: `Yes, use "${m.canonical}"`,
            act: () => onReply({ kind: 'name', id: m.id, choice: 'same' }),
          },
          {
            label: 'No, keep them apart',
            act: () => onReply({ kind: 'name', id: m.id, choice: 'separate' }),
          },
        ]}
      />
    );
  }

  const s = q.split;
  return (
    <Choice
      title={`"${s.name}" might be ${s.groups.length} different customers`}
      detail={`Told apart by: ${s.groups.map((g) => g.label).join(', ')}.`}
      options={[
        {
          label: 'Different customers',
          act: () => onReply({ kind: 'name', id: s.id, choice: 'separate' }),
        },
        { label: 'One customer', act: () => onReply({ kind: 'name', id: s.id, choice: 'same' }) },
      ]}
    />
  );
}

interface Option {
  label: string;
  suggested?: boolean;
  act: () => void;
}

function Choice({ title, detail, options }: { title: string; detail?: string; options: Option[] }) {
  return (
    <div>
      <h2 className="q-title">{title}</h2>
      {detail && <p className="muted">{detail}</p>}
      <div className="q-options">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={o.suggested ? 'choice suggested' : 'choice'}
            onClick={o.act}
          >
            <b>{o.label}</b>
            {o.suggested && <span>Suggested</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskColumn({
  question: q,
  table,
  onReply,
  onRemove,
}: {
  question: Extract<Question, { kind: 'column' }>;
  table: CsvTable;
  onReply: (r: Reply) => void;
  onRemove: () => void;
}) {
  const { headers } = table;
  const name = FIELD_NAMES[q.field].toLowerCase().replace('vat', 'VAT');
  // likely: the columns that stood out; fitting: also the others that pass the sense
  // check; every: all of them
  const [list, setList] = useState<'likely' | 'fitting' | 'every'>(
    q.options.length > 0 ? 'likely' : 'fitting',
  );
  // a choice that doesn't look right waits here until the visitor confirms it
  const [doubt, setDoubt] = useState<{ header: string; warning: string } | null>(null);
  const pick = (header: string) => {
    const warning = fitCheck(q.field, header, table);
    if (warning) setDoubt({ header, warning });
    else onReply({ kind: 'column', field: q.field, header });
  };

  if (doubt) {
    return (
      <div>
        <h2 className="q-title">Are you sure about "{doubt.header}"?</h2>
        <p className="muted">{doubt.warning}</p>
        <div className="q-options">
          <button type="button" className="choice" onClick={() => setDoubt(null)}>
            <b>Pick another column</b>
          </button>
          <button
            type="button"
            className="choice"
            onClick={() => onReply({ kind: 'column', field: q.field, header: doubt.header })}
          >
            <b>Use it anyway</b>
          </button>
        </div>
      </div>
    );
  }

  const likely = new Set(q.options.map((o) => o.header));
  const others = headers.filter((h) => !likely.has(h));
  const fitting = others.filter((h) => !fitCheck(q.field, h, table));
  const rest = others.filter((h) => !fitting.includes(h));
  const plain = (names: string[]) => names.map((header) => ({ header, evidence: [] }));
  const options =
    list === 'likely'
      ? q.options
      : list === 'fitting'
        ? [...q.options, ...plain(fitting)]
        : [...q.options, ...plain(fitting), ...plain(rest)];
  const nothing = q.options.length === 0;
  // nothing stood out and nothing passes the sense check either
  const noFit = nothing && fitting.length === 0 && list !== 'every';

  return (
    <div>
      <h2 className="q-title">Which column has the {name}?</h2>
      {!q.required && (
        <p className="muted">Optional. Pick "Not in this file" if you don't have one.</p>
      )}
      {nothing && !noFit && (
        <p className="muted">
          {list === 'every'
            ? 'Here is every column in the file.'
            : 'Nothing stood out, so here are the columns that could fit.'}
        </p>
      )}
      {noFit && (
        <div className="warn" role="alert">
          <p>
            <b>No column in this file looks like the {name}.</b>
            {q.required && " Without it we can't make a report from this file."}
          </p>
          {q.required && (
            <button type="button" className="ghost" onClick={onRemove}>
              Remove this file
            </button>
          )}
        </div>
      )}
      <div className="q-options">
        {options.map((o) => (
          <button
            key={o.header}
            type="button"
            className={q.suggested === o.header ? 'choice suggested' : 'choice'}
            onClick={() => pick(o.header)}
          >
            <b>{o.header}</b>
            <span>
              {q.suggested === o.header ? 'Suggested. ' : ''}
              {o.evidence[0] ?? ''}
            </span>
          </button>
        ))}
        {!q.required && (
          <button
            type="button"
            className={q.noneSuggested || noFit ? 'choice suggested' : 'choice'}
            onClick={() => onReply({ kind: 'column', field: q.field, header: null })}
          >
            <b>Not in this file</b>
            {(q.noneSuggested || noFit) && <span>Suggested</span>}
          </button>
        )}
      </div>
      {list === 'likely' && fitting.length > 0 && (
        <button type="button" className="link q-more" onClick={() => setList('fitting')}>
          Choose a different column
        </button>
      )}
      {list !== 'every' && rest.length > 0 && (
        <button type="button" className="link q-more" onClick={() => setList('every')}>
          {noFit ? 'Show every column anyway' : "Show columns that don't look right"}
        </button>
      )}
    </div>
  );
}

function AskYear({
  question: q,
  onReply,
}: {
  question: Extract<Question, { kind: 'year' }>;
  onReply: (r: Reply) => void;
}) {
  const [year, setYear] = useState(String(q.suggested ?? new Date().getFullYear()));
  const valid = /^\d{4}$/.test(year);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onReply({ kind: 'year', value: q.value, year: Number(year) });
      }}
    >
      <h2 className="q-title">"{q.value}" has no year. Which year is it?</h2>
      <p className="muted">From the "{q.column}" column.</p>
      <div className="q-year">
        <label>
          <span className="sr-only">Year</span>
          <input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.trim())}
            aria-invalid={!valid}
          />
        </label>
        <button type="submit" className="choice">
          <b>Use this year</b>
        </button>
      </div>
      {!valid && <p className="problem-text">Enter a year like 2026.</p>}
    </form>
  );
}
