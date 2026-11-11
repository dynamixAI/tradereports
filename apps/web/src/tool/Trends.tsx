import type { Grain, Trend, TrendMetric, TrendsReport } from '@tradereports/core';
import { BarChart } from './BarChart';
import { Change } from './Change';
import { longDate } from './report';

// how many periods the charts show
const CHART_PERIODS = 12;

const NAMES: Record<TrendMetric, string> = {
  income: 'Income before VAT',
  invoices: 'Invoices sent',
  jobsFinished: 'Jobs finished',
  quotesSent: 'Quotes sent',
  quotesAccepted: 'Quotes accepted',
};

const MONEY: TrendMetric[] = ['income'];

// whole pounds on the charts and tiles; the tables below keep the pence
const pounds = (pence: number) =>
  (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
const count = (n: number) => n.toLocaleString('en-GB');

const formatFor = (metric: TrendMetric) => (MONEY.includes(metric) ? pounds : count);

// this week against last (or month against month), with charts
export function Trends({
  report,
  grain,
  onGrain,
}: {
  report: TrendsReport;
  grain: Grain;
  onGrain: (g: Grain) => void;
}) {
  const word = grain === 'week' ? 'week' : 'month';
  const find = (m: TrendMetric) => report.trends.find((t) => t.metric === m);
  const income = find('income');
  const jobs = find('jobsFinished');
  const sent = find('quotesSent');
  const accepted = find('quotesAccepted');

  return (
    <section id="r-trends" className="card r-section" aria-labelledby="r-trends-h">
      <div className="r-head-row">
        <h2 id="r-trends-h" className="r-title">
          This {word} against last
        </h2>
        <div className="seg no-print" role="group" aria-label="Compare by">
          {(['week', 'month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={grain === g ? 'on' : undefined}
              aria-pressed={grain === g}
              onClick={() => onGrain(g)}
            >
              {g === 'week' ? 'Weeks' : 'Months'}
            </button>
          ))}
        </div>
      </div>

      {report.upTo && report.from ? (
        <p className="muted">
          Your files run from {longDate(report.from)} to {longDate(report.upTo)}. Only complete{' '}
          {word}s are compared.
        </p>
      ) : (
        <p className="muted">There are no dated records in your files to compare yet.</p>
      )}

      <div className="trend-tiles">
        {report.trends.map((t) => (
          <Tile key={t.metric} trend={t} word={word} />
        ))}
      </div>

      {income && (
        <>
          <h3 className="r-sub">Income by {word}, before VAT</h3>
          <BarChart
            title={`Income by ${word}`}
            {...chartData([income])}
            series={[{ name: 'Income', values: last(income).map((p) => p.value), tone: 'main' }]}
            format={pounds}
          />
        </>
      )}
      {jobs && (
        <>
          <h3 className="r-sub">Jobs finished by {word}</h3>
          <BarChart
            title={`Jobs finished by ${word}`}
            {...chartData([jobs])}
            series={[
              { name: 'Jobs finished', values: last(jobs).map((p) => p.value), tone: 'main' },
            ]}
            format={count}
          />
        </>
      )}
      {sent && accepted && (
        <>
          <h3 className="r-sub">Quotes sent and accepted by {word}</h3>
          <BarChart
            title={`Quotes sent and accepted by ${word}`}
            {...chartData([sent])}
            series={[
              { name: 'Sent', values: last(sent).map((p) => p.value), tone: 'second' },
              { name: 'Accepted', values: last(accepted).map((p) => p.value), tone: 'main' },
            ]}
            format={count}
          />
        </>
      )}
    </section>
  );
}

// one measure: the last complete period, how it moved, and the period so far
function Tile({ trend, word }: { trend: Trend; word: string }) {
  const format = formatFor(trend.metric);
  const { comparison, soFar } = trend;
  return (
    <div className="t-tile">
      <p className="s-title">{NAMES[trend.metric]}</p>
      {comparison ? (
        <>
          <p className="t-value">{format(comparison.current.value)}</p>
          <p className="t-sub">{comparison.current.label}</p>
          <Change
            change={comparison.change}
            better="up"
            format={format}
            detail={
              comparison.percent === null
                ? `vs ${format(comparison.previous.value)}`
                : `${comparison.percent > 0 ? '+' : ''}${comparison.percent}% vs last ${word}`
            }
          />
        </>
      ) : (
        <p className="t-sub">Not enough complete {word}s in your files to compare.</p>
      )}
      {soFar && (
        <p className="t-sofar">
          So far this {word}: {format(soFar.current.value)}{' '}
          <Change
            change={soFar.current.value - soFar.previousSameDays}
            better="up"
            format={format}
            detail={`vs same ${soFar.days} ${soFar.days === 1 ? 'day' : 'days'} last ${word}`}
          />
        </p>
      )}
    </div>
  );
}

// the latest periods, oldest first
function last(trend: Trend) {
  return trend.points.slice(-CHART_PERIODS);
}

function chartData(trendsShown: Trend[]) {
  const first = trendsShown[0];
  const points = first ? last(first) : [];
  return {
    labels: points.map((p) => p.label),
    partialLast: points.length > 0 && points[points.length - 1]?.complete === false,
  };
}
