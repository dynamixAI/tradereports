// A change from one period to the next, like a price board: ▲ +£325, ▼ −3, or — 0.
// Green is good news and red is bad; for money owed, going up is bad.

export type Better = 'up' | 'down';

export function Change({
  change,
  better,
  format,
  detail,
}: {
  change: number;
  better: Better;
  format: (n: number) => string;
  // shown smaller after the number, e.g. "+18% vs last week"
  detail?: string;
}) {
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
  const mood = direction === 'same' ? 'same' : direction === better ? 'good' : 'bad';
  const mark = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
  // a real minus sign reads better than a hyphen next to numbers
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';
  const words =
    direction === 'same'
      ? 'no change'
      : `${direction === 'up' ? 'up' : 'down'} ${format(Math.abs(change))}`;

  return (
    <span className={`chg ${mood}`}>
      <span aria-hidden="true">
        <span className="chg-mark">{mark}</span> {sign}
        {format(Math.abs(change))}
      </span>
      {/* screen readers hear "up £325" rather than symbols */}
      <span className="sr-only">{words}</span>
      {detail && <span className="chg-detail"> {detail}</span>}
    </span>
  );
}
