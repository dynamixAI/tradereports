import { BarChart } from './BarChart';
import { Change, type Better } from './Change';
import { snapshotOf, type Memory, type Snapshot } from './memory';
import { longDate, type ToolReport } from './report';

// how many past reports the "money owed over time" chart shows
const CHART_REPORTS = 12;

const pounds = (pence: number) =>
  (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });

interface Row {
  label: string;
  key: 'owedPence' | 'overduePence' | 'notBilledPence' | 'agreedPence';
  // for money owed, going down is good news
  better: Better;
}

const ROWS: Row[] = [
  { label: 'Money owed', key: 'owedPence', better: 'down' },
  { label: 'Overdue', key: 'overduePence', better: 'down' },
  { label: 'Finished work not invoiced', key: 'notBilledPence', better: 'down' },
  { label: 'Quotes agreed, not booked', key: 'agreedPence', better: 'down' },
];

// What changed since the last report: money owed, overdue and unbilled work, with ▲ ▼ —
export function Since({
  report,
  previous,
  memory,
}: {
  report: ToolReport;
  previous: Snapshot | null;
  memory: Memory;
}) {
  if (!previous) {
    return (
      <section className="card r-section since-first" aria-labelledby="r-since-h">
        <h2 id="r-since-h" className="r-title">
          Since your last report
        </h2>
        <p className="muted">
          This is your first report on this computer. Next time, this shows what changed: money
          owed, overdue and work not invoiced, up or down. To compare with a report from another
          computer, open the file you saved there.
        </p>
      </section>
    );
  }

  const now = snapshotOf(report, '');
  // only rows with a figure both times
  const rows = ROWS.filter((r) => now[r.key] !== null && previous[r.key] !== null);
  const history = memory.snapshots.filter((s) => s.owedPence !== null).slice(-CHART_REPORTS);

  return (
    <section id="r-since" className="card r-section" aria-labelledby="r-since-h">
      <h2 id="r-since-h" className="r-title">
        Since your last report
      </h2>
      <p className="muted">
        Compared with your report from {whenWas(previous)}. Going down is good news here: less owed,
        less late, less unbilled.
      </p>
      {rows.length === 0 ? (
        <p className="muted">
          That report used different files, so there&apos;s nothing to compare yet.
        </p>
      ) : (
        <div className="trend-tiles">
          {rows.map((r) => {
            const was = previous[r.key] ?? 0;
            const is = now[r.key] ?? 0;
            return (
              <div key={r.key} className="t-tile">
                <p className="s-title">{r.label}</p>
                <p className="t-value">{pounds(is)}</p>
                <Change
                  change={is - was}
                  better={r.better}
                  format={pounds}
                  detail={`was ${pounds(was)}`}
                />
              </div>
            );
          })}
        </div>
      )}
      {history.length >= 2 && (
        <>
          <h3 className="r-sub">Money owed at each report</h3>
          <BarChart
            title="Money owed at each report"
            labels={labelsFor(history)}
            series={[{ name: 'Owed', values: history.map((s) => s.owedPence ?? 0), tone: 'main' }]}
            format={pounds}
            partialLast={false}
          />
        </>
      )}
    </section>
  );
}

// "3 November 2026", or "earlier today, at 14:05" for a report from the same day
function whenWas(s: Snapshot): string {
  const then = new Date(s.at);
  const sameDay = then.toDateString() === new Date().toDateString();
  if (sameDay) {
    const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `earlier today, at ${time}`;
  }
  return longDate(s.asOf);
}

// "3 Nov", plus the time when two reports share a day, so every label is different
function labelsFor(history: Snapshot[]): string[] {
  const day = (s: Snapshot) =>
    new Date(s.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = (s: Snapshot) =>
    new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = history.map(day);
  return history.map((s, i) =>
    days.filter((d) => d === days[i]).length > 1 ? `${days[i]} ${time(s)}` : (days[i] ?? ''),
  );
}
