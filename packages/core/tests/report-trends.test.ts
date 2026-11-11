import { describe, expect, it } from 'vitest';
import { derived, stated, type Invoice } from '../src/model';
import { periodLabel, periodStart, trends } from '../src/reports/trends';

// a sent invoice for £100 before VAT on the given date
function invoice(issueDate: string, netPence = 10000, changes: Partial<Invoice> = {}): Invoice {
  return {
    businessId: 'test-business',
    number: issueDate,
    customerName: 'Ann',
    jobNumbers: [],
    issueDate,
    dueDate: null,
    status: stated('unpaid'),
    taxMode: derived('exclusive', 'test'),
    netPence: stated(netPence),
    taxPence: 0,
    grossPence: netPence,
    paidPence: stated(0),
    duePence: stated(netPence),
    sent: stated(true),
    lines: [],
    source: { tool: 'tradify', file: 'test.csv', rows: [2] },
    ...changes,
  };
}

const income = (report: ReturnType<typeof trends>) => {
  const found = report.trends.find((t) => t.metric === 'income');
  if (!found) throw new Error('no income trend');
  return found;
};

describe('periods', () => {
  it('starts weeks on Monday', () => {
    // 10 November 2026 is a Tuesday; 15 November a Sunday
    expect(periodStart('2026-11-10', 'week')).toBe('2026-11-09');
    expect(periodStart('2026-11-15', 'week')).toBe('2026-11-09');
    expect(periodStart('2026-11-09', 'week')).toBe('2026-11-09');
    expect(periodStart('2026-11-30', 'month')).toBe('2026-11-01');
  });

  it('labels weeks and months', () => {
    expect(periodLabel('2026-11-02', 'week')).toBe('w/c 2 Nov');
    expect(periodLabel('2026-11-01', 'month')).toBe('Nov 2026');
  });
});

describe('trends', () => {
  // three full weeks from Monday 19 Oct, then Mon and Tue of the week of 9 Nov
  const invoices = [
    invoice('2026-10-19', 10000),
    invoice('2026-10-27', 20000),
    invoice('2026-10-28', 5000),
    invoice('2026-11-03', 15000),
    invoice('2026-11-09', 4000),
    invoice('2026-11-10', 1000),
  ];

  it('compares the last two complete weeks', () => {
    const t = income(trends({ invoices, jobs: [], quotes: [] }, 'week', '2026-11-10'));
    expect(t.comparison?.current.label).toBe('w/c 2 Nov');
    expect(t.comparison?.current.value).toBe(15000);
    expect(t.comparison?.previous.value).toBe(25000);
    expect(t.comparison?.change).toBe(-10000);
    expect(t.comparison?.percent).toBe(-40);
  });

  it('compares the week so far with the same days last week', () => {
    const t = income(trends({ invoices, jobs: [], quotes: [] }, 'week', '2026-11-10'));
    expect(t.soFar?.days).toBe(2);
    expect(t.soFar?.current.value).toBe(5000);
    // Monday and Tuesday of the week of 2 Nov: just the 3 Nov invoice
    expect(t.soFar?.previousSameDays).toBe(15000);
  });

  it('keeps empty weeks in the timeline as zero', () => {
    const gap = [invoice('2026-10-05'), invoice('2026-10-26')];
    const t = income(trends({ invoices: gap, jobs: [], quotes: [] }, 'week', '2026-11-01'));
    expect(t.points.map((p) => p.value)).toEqual([10000, 0, 0, 10000]);
  });

  it("won't compare a first period the files may only partly cover", () => {
    // the files start on a Thursday, so that week isn't a fair comparison
    const late = [invoice('2026-10-22'), invoice('2026-10-27')];
    const t = income(trends({ invoices: late, jobs: [], quotes: [] }, 'week', '2026-11-02'));
    expect(t.comparison).toBeNull();
  });

  it('counts up to the newest date in the files, not today', () => {
    const report = trends({ invoices, jobs: [], quotes: [] }, 'month', '2026-12-31');
    expect(report.upTo).toBe('2026-11-10');
    expect(income(report).points.at(-1)?.complete).toBe(false);
  });

  it('leaves drafts and cancelled invoices out', () => {
    const mixed = [
      invoice('2026-11-02'),
      invoice('2026-11-03', 99900, { status: stated('draft') }),
      invoice('2026-11-04', 99900, { status: stated('cancelled') }),
    ];
    const t = income(trends({ invoices: mixed, jobs: [], quotes: [] }, 'month', '2026-11-30'));
    expect(t.points[0]?.value).toBe(10000);
  });

  it('only gives measures whose files are there', () => {
    const report = trends({ invoices, jobs: [], quotes: [] }, 'week', '2026-11-10');
    expect(report.trends.map((t) => t.metric)).toEqual(['income', 'invoices']);
  });

  it('gives nothing without dated records', () => {
    expect(trends({ invoices: [], jobs: [], quotes: [] }, 'week', '2026-11-10')).toEqual({
      upTo: null,
      from: null,
      trends: [],
    });
  });
});
