// A small bar chart: bars drawn as SVG that stretches to fit, with the labels as normal
// text so they stay readable on a phone and a wide screen alike. No chart library.
// One or two series; the last bar is lighter while that period fills up.

export interface Series {
  name: string;
  values: number[];
  // 'main' is copper, 'second' is the muted line colour
  tone: 'main' | 'second';
}

export function BarChart({
  title,
  labels,
  series,
  format,
  partialLast,
}: {
  title: string;
  labels: string[];
  series: Series[];
  format: (n: number) => string;
  // the last period isn't over yet
  partialLast: boolean;
}) {
  const top = niceCeiling(Math.max(1, ...series.flatMap((s) => s.values)));
  const slots = Math.max(1, labels.length);
  // bars take 70% of each slot, split between the series
  const barW = (70 / series.length) * (1 / slots);
  const height = (v: number) => (v / top) * 100;
  // counted back from the newest, so the newest label always shows; CSS hides some on
  // narrow screens (every 2nd on a wide screen, every 4th on a phone)
  const labelClass = (i: number) => {
    const back = labels.length - 1 - i;
    return [back % 2 === 0 ? 'k2' : '', back % 4 === 0 ? 'k4' : ''].join(' ').trim() || undefined;
  };

  return (
    <figure className="chart">
      <div className="chart-body">
        {/* the scale, as text beside the bars */}
        <div className="chart-scale" aria-hidden="true">
          <span>{format(top)}</span>
          <span>{format(top / 2)}</span>
          <span>{format(0)}</span>
        </div>
        <div className="chart-plot">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}: ${labels
              .map((l, i) => `${l} ${series.map((s) => format(s.values[i] ?? 0)).join(' and ')}`)
              .join(', ')}`}
          >
            {[0, 50, 100].map((y) => (
              <line key={y} className="chart-grid" x1="0" x2="100" y1={y} y2={y} />
            ))}
            {labels.map((label, i) => {
              const partial = partialLast && i === labels.length - 1;
              const slotStart = (i / slots) * 100 + (100 / slots) * 0.15;
              return series.map((s, j) => {
                const v = s.values[i] ?? 0;
                return (
                  <rect
                    key={`${label}-${s.name}`}
                    className={`chart-bar ${s.tone}${partial ? ' partial' : ''}`}
                    x={slotStart + j * barW}
                    y={100 - height(v)}
                    width={barW * 0.9}
                    height={height(v)}
                  >
                    <title>{`${label}${partial ? ' (so far)' : ''}: ${s.name} ${format(v)}`}</title>
                  </rect>
                );
              });
            })}
          </svg>
          {/* up to 8 labels all fit on a wide screen */}
          <div
            className={labels.length <= 8 ? 'chart-labels all' : 'chart-labels'}
            aria-hidden="true"
          >
            {labels.map((label, i) => (
              <span key={label} className={labelClass(i)}>
                {partialLast && i === labels.length - 1 ? 'so far' : label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {series.length > 1 && (
        <figcaption className="chart-key">
          {series.map((s) => (
            <span key={s.name}>
              <span className={`chart-swatch ${s.tone}`} aria-hidden="true" /> {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

// 1, 2 or 5 times a power of ten, so the top line is a round number
function niceCeiling(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n));
  const scaled = n / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}
