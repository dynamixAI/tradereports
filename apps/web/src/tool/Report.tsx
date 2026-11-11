import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerSummary, Grain, PeriodTotal, VatStagger } from '@tradereports/core';
import { stillNeeds, UNLOCKS, type Business, type ToolFile } from './files';
import { saveBusiness, STAGGERS } from './business';
import { buildReport, longDate, money, plain, today } from './report';
import { Trends } from './Trends';
import { Download } from './Download';

// how many rows to show before "show all"
const SHORT_LIST = 8;

// the five parts of the report, in the order they appear
const PARTS = [
  { id: 'r-owed', unlock: 'Money owed and overdue' },
  { id: 'r-income', unlock: 'Income by month and VAT quarter' },
  { id: 'r-customers', unlock: 'Top and quiet customers' },
  { id: 'r-unbilled', unlock: 'Work not yet invoiced' },
  { id: 'r-health', unlock: 'Data health' },
] as const;

type PartId = (typeof PARTS)[number]['id'];

// the report: summary cards at the top, each one jumps to its full section below
export function Report({
  files,
  business,
  onBusiness,
  onAddFiles,
}: {
  files: ToolFile[];
  business: Business;
  onBusiness: (business: Business) => void;
  onAddFiles: () => void;
}) {
  const stagger = business.stagger;
  const setStagger = (next: VatStagger) => {
    const updated = { ...business, stagger: next };
    saveBusiness(updated);
    onBusiness(updated);
  };
  const [grain, setGrain] = useState<Grain>('week');
  const report = useMemo(
    () => buildReport(files, today(), stagger, grain),
    [files, stagger, grain],
  );
  const { owed, income, customers, unbilled, health } = report;

  const jump = (id: PartId) => {
    const calm = document.documentElement.dataset.motion === 'calm';
    document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  };
  // what's missing for a part, or null when it's there
  const needs = (id: PartId) => {
    const part = PARTS.find((p) => p.id === id);
    const unlock = UNLOCKS.find((u) => u.label === part?.unlock);
    return unlock ? stillNeeds(unlock, files) : null;
  };

  // open every health check before printing, so the printout has the details too
  useEffect(() => {
    const openAll = () => {
      document.querySelectorAll<HTMLDetailsElement>('.report details').forEach((d) => {
        d.open = true;
      });
    };
    window.addEventListener('beforeprint', openAll);
    return () => {
      window.removeEventListener('beforeprint', openAll);
    };
  }, []);

  const latestMonth = income?.byMonth[income.byMonth.length - 1];
  const topCustomer = customers?.top[0];

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <p className="biz-name">{business.name}</p>
          <h1 className="tool-title">Your report</h1>
          <p className="tool-sub">Worked out on {longDate(report.asOf)}.</p>
        </div>
        <div className="report-actions no-print">
          <button type="button" className="ghost" onClick={onAddFiles}>
            Add or change files
          </button>
          <button type="button" className="ghost" onClick={() => window.print()}>
            Print
          </button>
          <Download report={report} files={files} businessName={business.name} />
        </div>
      </div>

      {report.doubts.length > 0 && (
        <div className="warn" role="alert">
          <p>
            <b>Some of these figures may be wrong.</b> You chose to carry on with:
          </p>
          <ul>
            {report.doubts.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* the quick look: one card per part */}
      <div className="summary-cards">
        <SummaryCard
          title="Money owed"
          value={owed ? money(owed.owedPence) : null}
          detail={
            owed
              ? owed.noDueDates
                ? 'No due dates, so overdue is unknown'
                : `${money(owed.overduePence)} overdue`
              : null
          }
          needs={needs('r-owed')}
          onOpen={() => jump('r-owed')}
          onAddFiles={onAddFiles}
        />
        <SummaryCard
          title="Income"
          value={latestMonth ? money(latestMonth.netPence) : null}
          detail={latestMonth ? `${latestMonth.label}, before VAT` : 'No sent invoices'}
          needs={needs('r-income')}
          onOpen={() => jump('r-income')}
          onAddFiles={onAddFiles}
        />
        <SummaryCard
          title="Top customer"
          value={topCustomer ? topCustomer.customer : null}
          detail={
            topCustomer ? `${money(topCustomer.invoicedPence)} invoiced before VAT` : 'No sales yet'
          }
          needs={needs('r-customers')}
          onOpen={() => jump('r-customers')}
          onAddFiles={onAddFiles}
        />
        {/* with quotes but no jobs, only agreed work can be shown, not finished work */}
        <SummaryCard
          title={report.hasJobs ? 'Work not invoiced' : 'Quotes agreed, not booked'}
          value={
            unbilled
              ? money(report.hasJobs ? unbilled.doneNotBilledPence : unbilled.agreedNotStartedPence)
              : null
          }
          detail={
            unbilled
              ? report.hasJobs
                ? `${money(unbilled.agreedNotStartedPence)} agreed, not started`
                : 'Add your jobs file to see finished work not billed'
              : null
          }
          needs={needs('r-unbilled')}
          onOpen={() => jump('r-unbilled')}
          onAddFiles={onAddFiles}
        />
        <SummaryCard
          title="Data health"
          value={`${health.toFix} to fix`}
          detail={`${health.toCheck} to check, ${health.handled} handled for you`}
          needs={null}
          onOpen={() => jump('r-health')}
          onAddFiles={onAddFiles}
        />
      </div>

      {/* this week against last, before the detail */}
      {report.trends.trends.length > 0 && (
        <Trends report={report.trends} grain={grain} onGrain={setGrain} />
      )}

      {/* the full report */}
      <Section id="r-owed" title="Money owed and overdue" needs={needs('r-owed')}>
        {owed && (
          <>
            <Summary lines={owed.summary} />
            {owed.byCustomer.length > 0 && (
              <>
                <h3 className="r-sub">Who owes you</h3>
                {/* without due dates, overdue and lateness mean nothing, so they're left off */}
                {owed.noDueDates ? (
                  <ShortTable
                    head={['Customer', 'Owed', 'Invoices']}
                    money={[1]}
                    rows={owed.byCustomer.map((c) => [
                      c.warning ? `${c.customer} ⚠` : c.customer,
                      money(c.owedPence),
                      c.invoices.join(', '),
                    ])}
                  />
                ) : (
                  <>
                    <ShortTable
                      head={['Customer', 'Owed', 'Overdue', 'Oldest due', 'Invoices']}
                      money={[1, 2]}
                      rows={owed.byCustomer.map((c) => [
                        c.warning ? `${c.customer} ⚠` : c.customer,
                        money(c.owedPence),
                        money(c.overduePence),
                        c.oldestDueDate ? longDate(c.oldestDueDate) : '–',
                        c.invoices.join(', '),
                      ])}
                    />
                    <h3 className="r-sub">How late</h3>
                    <Bars
                      items={owed.byAge
                        .filter((b) => b.invoices.length > 0)
                        .map((b) => ({ label: b.band, pence: b.pence }))}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </Section>

      <Section id="r-income" title="Income by month and VAT quarter" needs={needs('r-income')}>
        {income && (
          <>
            <label className="r-pick no-print">
              Your VAT quarters end in{' '}
              <select
                value={stagger}
                onChange={(e) => setStagger(Number(e.target.value) as VatStagger)}
              >
                {STAGGERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <Summary lines={income.summary} />
            <h3 className="r-sub">By month</h3>
            <PeriodTable periods={income.byMonth} />
            <h3 className="r-sub">By VAT quarter</h3>
            <PeriodTable periods={income.byVatQuarter} />
          </>
        )}
      </Section>

      <Section id="r-customers" title="Top and quiet customers" needs={needs('r-customers')}>
        {customers && (
          <>
            <Summary lines={customers.summary} />
            <CustomerTable title="Your biggest customers" list={customers.top} />
            <CustomerTable title="Owing on more than one invoice" list={customers.owingOnSeveral} />
            <CustomerTable
              title={`No invoice in ${customers.winBackMonths} months: worth a call`}
              list={customers.winBack}
            />
          </>
        )}
      </Section>

      <Section id="r-unbilled" title="Work not yet invoiced" needs={needs('r-unbilled')}>
        {unbilled && (
          <>
            <Summary lines={unbilled.summary} />
            {!report.hasJobs && (
              <p className="muted">
                Add your jobs file to see work that's finished but hasn't been billed.
              </p>
            )}
            <WorkTable title="Finished, not invoiced" items={unbilled.finishedNotInvoiced} />
            <WorkTable title="Finished, invoice still a draft" items={unbilled.finishedDraftOnly} />
            <WorkTable title="Quote accepted, no job yet" items={unbilled.acceptedNoJob} />
          </>
        )}
      </Section>

      <Section id="r-health" title="Data health" needs={null}>
        <Summary lines={health.summary} />
        {health.checks.map((check) => (
          <details key={check.title} className={`health ${check.level}`}>
            <summary>
              <span className="health-level">{LEVEL_NAMES[check.level]}</span> {check.title} (
              {check.items.length})
            </summary>
            <p className="muted">{check.explanation}</p>
            <ul>
              {check.items.slice(0, 50).map((item, i) => (
                <li key={i}>
                  <b>{item.file}</b>
                  {item.rows.length > 0 && `, row ${item.rows.join(', ')}`}: {plain(item.message)}
                </li>
              ))}
            </ul>
            {check.items.length > 50 && (
              <p className="muted">And {check.items.length - 50} more like these.</p>
            )}
          </details>
        ))}
      </Section>
    </div>
  );
}

const LEVEL_NAMES = { fix: 'Fix', check: 'Check', handled: 'Handled' } as const;

function SummaryCard({
  title,
  value,
  detail,
  needs,
  onOpen,
  onAddFiles,
}: {
  title: string;
  value: string | null;
  detail: string | null;
  needs: string | null;
  onOpen: () => void;
  onAddFiles: () => void;
}) {
  // locked: says which file would open it
  if (needs) {
    return (
      <div className="s-card locked">
        <p className="s-title">{title}</p>
        <p className="s-value" aria-hidden="true">
          🔒
        </p>
        <p className="s-detail">{needs}</p>
        <button type="button" className="link no-print" onClick={onAddFiles}>
          Add a file
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="s-card" onClick={onOpen}>
      <span className="s-title">{title}</span>
      <span className="s-value">{value ?? '–'}</span>
      {detail && <span className="s-detail">{detail}</span>}
    </button>
  );
}

function Section({
  id,
  title,
  needs,
  children,
}: {
  id: PartId;
  title: string;
  needs: string | null;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card r-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="r-title">
        {title}
      </h2>
      {needs ? <p className="muted">{needs} to show this part.</p> : children}
    </section>
  );
}

// the engine's plain-English lines, without trade names
function Summary({ lines }: { lines: string[] }) {
  return (
    <div className="r-summary">
      {lines.map((line) => (
        <p key={line}>{plain(line)}</p>
      ))}
    </div>
  );
}

// a table that shows the first few rows, with a button for the rest
function ShortTable({
  head,
  rows,
  money: moneyColumns = [],
}: {
  head: string[];
  rows: string[][];
  money?: number[];
}) {
  const [all, setAll] = useState(false);
  const cell = (i: number) => (moneyColumns.includes(i) ? 'num' : undefined);
  return (
    <>
      <div className="r-table-wrap">
        <table className={all ? 'r-table all' : 'r-table'}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={cell(i)} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              // every row is there for printing; the extra ones show on request
              <tr key={r} className={r >= SHORT_LIST ? 'extra' : undefined}>
                {row.map((value, i) => (
                  <td key={i} className={cell(i)}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHORT_LIST && (
        <button type="button" className="link q-more no-print" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

function PeriodTable({ periods }: { periods: PeriodTotal[] }) {
  if (periods.length === 0) return <p className="muted">Nothing to show yet.</p>;
  // newest first: the latest figures are what people look for
  return (
    <ShortTable
      head={['Period', 'Before VAT', 'VAT', 'Total', 'Invoices']}
      money={[1, 2, 3]}
      rows={[...periods]
        .reverse()
        .map((p) => [
          p.label,
          money(p.netPence) + (p.netUnknown.length > 0 ? ' *' : ''),
          money(p.vatPence),
          money(p.grossPence),
          String(p.invoices.length),
        ])}
    />
  );
}

function CustomerTable({ title, list }: { title: string; list: CustomerSummary[] }) {
  if (list.length === 0) return null;
  return (
    <>
      <h3 className="r-sub">{title}</h3>
      <ShortTable
        head={['Customer', 'Invoiced before VAT', 'Last invoice', 'Contact']}
        money={[1]}
        rows={list.map((c) => [
          c.customer,
          money(c.invoicedPence),
          c.lastInvoiceDate ? longDate(c.lastInvoiceDate) : '–',
          [...c.phones, ...c.emails].join(', ') || '–',
        ])}
      />
    </>
  );
}

function WorkTable({
  title,
  items,
}: {
  title: string;
  items: {
    number: string;
    customer: string;
    valuePence: { value: number | null };
    since: string | null;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="r-sub">{title}</h3>
      <ShortTable
        head={['Number', 'Customer', 'Value before VAT', 'Since']}
        money={[2]}
        rows={items.map((item) => [
          item.number,
          item.customer,
          item.valuePence.value === null ? 'Not known' : money(item.valuePence.value),
          item.since ? longDate(item.since) : '–',
        ])}
      />
    </>
  );
}

// simple bars; the widest is the biggest amount
function Bars({ items }: { items: { label: string; pence: number }[] }) {
  const most = Math.max(1, ...items.map((i) => i.pence));
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(item.pence / most) * 100}%` }} />
          </span>
          <span className="bar-value">{money(item.pence)}</span>
        </li>
      ))}
    </ul>
  );
}
