import type PptxGenJS from 'pptxgenjs';
import type { Trend, TrendMetric } from '@tradereports/core';
import { longDate, money, plain, type ToolReport } from './report';

// Builds the report as a PowerPoint file, on the visitor's computer. Real slides, with
// tables and charts that can be edited in PowerPoint, LibreOffice or Google Slides.

export interface DeckOptions {
  businessName: string;
  // file names, for the title slide
  files: string[];
  theme: 'dark' | 'light';
}

// slide size in inches (16:9)
const W = 13.33;
const H = 7.5;
const MARGIN = 0.6;
const BODY_W = W - MARGIN * 2;
// how many rows a table shows before "and N more"
const TABLE_ROWS = 10;

// the site's colours, as hex without the hash
const THEMES = {
  dark: {
    bg: '0C0C0D',
    ink: 'F3EFE9',
    muted: 'A39D94',
    copper: 'E2784A',
    card: '17171A',
    line: '2A2A2E',
    good: '3FBF7F',
    bad: 'F06A5A',
  },
  light: {
    bg: 'F3F2EE',
    ink: '121212',
    muted: '55534E',
    copper: 'C2531F',
    card: 'FFFFFF',
    line: 'DCDAD3',
    good: '1A7F4B',
    bad: 'C33A2C',
  },
};

type Colours = (typeof THEMES)['dark'];
type Slide = PptxGenJS.Slide;

const FONT = 'Calibri';

const TREND_NAMES: Record<TrendMetric, string> = {
  income: 'Income before VAT',
  invoices: 'Invoices sent',
  jobsFinished: 'Jobs finished',
  quotesSent: 'Quotes sent',
  quotesAccepted: 'Quotes accepted',
};

// whole pounds for charts and headline numbers
const pounds = (pence: number) =>
  (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });

export async function buildDeck(report: ToolReport, options: DeckOptions): Promise<Blob> {
  // the library is only fetched when someone asks for a deck
  const { default: PptxGen } = await import('pptxgenjs');
  const pptx = new PptxGen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'TradeReports';
  pptx.title = `${options.businessName} report, ${longDate(report.asOf)}`;
  const c = THEMES[options.theme];
  const deck = new Deck(pptx, c, options.businessName || 'Your business');

  deck.title(report, options);
  deck.glance(report);
  if (report.owed) deck.owed(report);
  if (report.trends.trends.length > 0) deck.trends(report);
  if (report.income) deck.income(report);
  if (report.customers) deck.customers(report);
  if (report.unbilled) deck.unbilled(report);
  deck.health(report);
  deck.notes(report);

  const out = await pptx.write({ outputType: 'blob' });
  return out as Blob;
}

// a name for the download: "2026-11-11 Smith Plumbing report.pptx"
export function deckFileName(asOf: string, businessName: string): string {
  // characters file systems refuse become spaces, and runs of spaces collapse
  const safe = businessName
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${asOf} ${safe || 'Business'} report.pptx`;
}

class Deck {
  constructor(
    private pptx: PptxGenJS,
    private c: Colours,
    // goes in the footer of every slide
    private business: string,
  ) {}

  // ---------- slides ----------

  title(report: ToolReport, options: DeckOptions) {
    const s = this.slide();
    s.addText(options.businessName || 'Your business', {
      x: MARGIN,
      y: 2.2,
      w: BODY_W,
      h: 1.2,
      fontSize: 40,
      bold: true,
      color: this.c.ink,
      fontFace: FONT,
    });
    s.addText('Business report', {
      x: MARGIN,
      y: 3.4,
      w: BODY_W,
      h: 0.6,
      fontSize: 24,
      color: this.c.copper,
      fontFace: FONT,
    });
    s.addText(
      [
        { text: `Worked out on ${longDate(report.asOf)}`, options: { breakLine: true } },
        {
          text: `From ${options.files.length} ${options.files.length === 1 ? 'file' : 'files'}: ${options.files.join(', ')}`,
          options: { breakLine: true },
        },
        { text: 'Nothing left your computer.' },
      ],
      { x: MARGIN, y: 4.3, w: BODY_W, h: 1.4, fontSize: 14, color: this.c.muted, fontFace: FONT },
    );
    this.footer(s, 1);
  }

  glance(report: ToolReport) {
    const s = this.heading('At a glance', longDate(report.asOf));
    const { owed, income, customers, unbilled, health } = report;
    const latestMonth = income?.byMonth[income.byMonth.length - 1];
    const top = customers?.top[0];
    const tiles: { title: string; value: string; detail: string }[] = [
      {
        title: 'Money owed',
        value: owed ? pounds(owed.owedPence) : 'Needs invoices',
        detail: owed
          ? owed.noDueDates
            ? 'No due dates, so overdue is unknown'
            : `${pounds(owed.overduePence)} overdue`
          : '',
      },
      {
        title: 'Income',
        value: latestMonth ? pounds(latestMonth.netPence) : 'Needs invoices',
        detail: latestMonth ? `${latestMonth.label}, before VAT` : '',
      },
      {
        title: 'Top customer',
        value: top ? top.customer : 'Needs invoices',
        detail: top ? `${pounds(top.invoicedPence)} invoiced before VAT` : '',
      },
      {
        title: report.hasJobs ? 'Work not invoiced' : 'Quotes agreed, not booked',
        value: unbilled
          ? pounds(report.hasJobs ? unbilled.doneNotBilledPence : unbilled.agreedNotStartedPence)
          : 'Needs jobs or quotes',
        detail: unbilled
          ? report.hasJobs
            ? `${pounds(unbilled.agreedNotStartedPence)} agreed, not started`
            : 'Add a jobs file for finished work not billed'
          : '',
      },
      {
        title: 'Data health',
        value: `${health.toFix} to fix`,
        detail: `${health.toCheck} to check, ${health.handled} handled`,
      },
    ];
    this.tiles(s, tiles, 1.5);

    // the plain-English lines from each part
    const lines = [owed, income, customers, unbilled]
      .flatMap((part) => part?.summary.slice(0, 1) ?? [])
      .map(plain);
    s.addText(
      lines.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      {
        x: MARGIN,
        y: 4.0,
        w: BODY_W,
        h: 2.6,
        fontSize: 14,
        color: this.c.ink,
        fontFace: FONT,
        valign: 'top',
        paraSpaceAfter: 6,
      },
    );
    this.footer(s, 2);
  }

  owed(report: ToolReport) {
    const owed = report.owed;
    if (!owed) return;
    const s = this.heading('Money owed and overdue', plain(owed.summary[0] ?? ''));
    const rows = owed.byCustomer.map((cu) =>
      owed.noDueDates
        ? [cu.customer, money(cu.owedPence), cu.invoices.join(', ')]
        : [
            cu.customer,
            money(cu.owedPence),
            money(cu.overduePence),
            cu.oldestDueDate ? longDate(cu.oldestDueDate) : '–',
          ],
    );
    const head = owed.noDueDates
      ? ['Customer', 'Owed', 'Invoices']
      : ['Customer', 'Owed', 'Overdue', 'Oldest due'];
    const tableW = owed.noDueDates ? BODY_W : 7.2;
    this.table(s, head, rows, { x: MARGIN, y: 1.5, w: tableW, money: [1, 2] });

    if (!owed.noDueDates) {
      const bands = owed.byAge.filter((b) => b.invoices.length > 0);
      if (bands.length > 0) {
        s.addText('How late', this.subhead(8.2, 1.4, 4.5));
        this.barChart(s, {
          x: 8.2,
          y: 1.8,
          w: 4.5,
          h: 3.6,
          labels: bands.map((b) => b.band),
          series: [{ name: 'Owed', values: bands.map((b) => b.pence / 100) }],
          money: true,
          horizontal: true,
        });
      }
    }
    this.footer(s, 3);
  }

  trends(report: ToolReport) {
    const t = report.trends;
    const grain = t.trends[0]?.grain ?? 'week';
    const word = grain === 'week' ? 'week' : 'month';
    const s = this.heading(
      `This ${word} against last`,
      t.from && t.upTo
        ? `Your files run from ${longDate(t.from)} to ${longDate(t.upTo)}. Only complete ${word}s are compared.`
        : '',
    );
    const tiles = t.trends.map((tr) => {
      const isMoney = tr.metric === 'income';
      const fmt = isMoney ? pounds : (n: number) => n.toLocaleString('en-GB');
      const cmp = tr.comparison;
      return {
        title: TREND_NAMES[tr.metric],
        value: cmp ? fmt(cmp.current.value) : '–',
        detail: cmp ? cmp.current.label : `Not enough complete ${word}s to compare`,
        change: cmp
          ? { value: cmp.change, text: this.changeText(cmp.change, fmt, cmp.percent, word) }
          : null,
      };
    });
    this.tiles(s, tiles, 1.5);

    const income = t.trends.find((tr) => tr.metric === 'income');
    const jobs = t.trends.find((tr) => tr.metric === 'jobsFinished');
    const charts = [income, jobs].filter((x): x is Trend => x !== undefined);
    const chartW = charts.length > 1 ? (BODY_W - 0.4) / 2 : BODY_W;
    charts.forEach((tr, i) => {
      const points = tr.points.slice(-12);
      const isMoney = tr.metric === 'income';
      const x = MARGIN + i * (chartW + 0.4);
      s.addText(`${TREND_NAMES[tr.metric]} by ${word}`, this.subhead(x, 3.9, chartW));
      this.barChart(s, {
        x,
        y: 4.3,
        w: chartW,
        h: 2.5,
        labels: points.map((p) => (p.complete ? p.label : `${p.label} (so far)`)),
        series: [
          {
            name: TREND_NAMES[tr.metric],
            values: points.map((p) => (isMoney ? p.value / 100 : p.value)),
          },
        ],
        money: isMoney,
      });
    });
    this.footer(s, 4);
  }

  income(report: ToolReport) {
    const inc = report.income;
    if (!inc) return;
    const s = this.heading('Income by month and VAT quarter', plain(inc.summary[0] ?? ''));
    const months = inc.byMonth.slice(-12);
    this.barChart(s, {
      x: MARGIN,
      y: 1.5,
      w: 6.6,
      h: 3.2,
      labels: months.map((m) => m.label),
      series: [
        { name: 'Before VAT', values: months.map((m) => m.netPence / 100) },
        { name: 'VAT', values: months.map((m) => m.vatPence / 100) },
      ],
      money: true,
      stacked: true,
    });
    const quarters = [...inc.byVatQuarter].reverse();
    this.table(
      s,
      ['VAT quarter', 'Before VAT', 'VAT', 'Total'],
      quarters.map((q) => [q.label, money(q.netPence), money(q.vatPence), money(q.grossPence)]),
      { x: 7.6, y: 1.5, w: 5.1, money: [1, 2, 3] },
    );
    s.addText(plain(inc.summary[2] ?? ''), {
      x: MARGIN,
      y: 5.0,
      w: BODY_W,
      h: 0.8,
      fontSize: 12,
      color: this.c.muted,
      fontFace: FONT,
      valign: 'top',
    });
    this.footer(s, 5);
  }

  customers(report: ToolReport) {
    const cu = report.customers;
    if (!cu) return;
    const s = this.heading('Top and quiet customers', plain(cu.summary[0] ?? ''));
    const half = (BODY_W - 0.4) / 2;
    const toRows = (list: typeof cu.top) =>
      list.map((x) => [
        x.customer,
        money(x.invoicedPence),
        x.lastInvoiceDate ? longDate(x.lastInvoiceDate) : '–',
      ]);
    s.addText('Your biggest customers', this.subhead(MARGIN, 1.4, half));
    this.table(s, ['Customer', 'Invoiced before VAT', 'Last invoice'], toRows(cu.top), {
      x: MARGIN,
      y: 1.85,
      w: half,
      money: [1],
      rows: 8,
    });
    const rightTitle =
      cu.winBack.length > 0
        ? `No invoice in ${cu.winBackMonths} months: worth a call`
        : 'Owing on more than one invoice';
    const right = cu.winBack.length > 0 ? cu.winBack : cu.owingOnSeveral;
    s.addText(rightTitle, this.subhead(MARGIN + half + 0.4, 1.4, half));
    if (right.length > 0) {
      this.table(s, ['Customer', 'Invoiced before VAT', 'Last invoice'], toRows(right), {
        x: MARGIN + half + 0.4,
        y: 1.85,
        w: half,
        money: [1],
        rows: 8,
      });
    } else {
      s.addText('Nobody at the moment.', {
        x: MARGIN + half + 0.4,
        y: 1.85,
        w: half,
        h: 0.5,
        fontSize: 13,
        color: this.c.muted,
        fontFace: FONT,
      });
    }
    this.footer(s, 6);
  }

  unbilled(report: ToolReport) {
    const un = report.unbilled;
    if (!un) return;
    const s = this.heading('Work not yet invoiced', plain(un.summary[0] ?? ''));
    const groups = [
      { title: 'Finished, not invoiced', items: un.finishedNotInvoiced },
      { title: 'Finished, invoice still a draft', items: un.finishedDraftOnly },
      { title: 'Quote accepted, no job yet', items: un.acceptedNoJob },
    ].filter((g) => g.items.length > 0);
    let y = 1.4;
    for (const g of groups.slice(0, 2)) {
      s.addText(g.title, this.subhead(MARGIN, y, BODY_W));
      const rows = g.items.map((it) => [
        it.number,
        it.customer,
        it.valuePence.value === null ? 'Not known' : money(it.valuePence.value),
        it.since ? longDate(it.since) : '–',
      ]);
      const shown = Math.min(rows.length, 5);
      this.table(s, ['Number', 'Customer', 'Value before VAT', 'Since'], rows, {
        x: MARGIN,
        y: y + 0.45,
        w: BODY_W,
        money: [2],
        rows: 5,
      });
      y += 0.45 + 0.34 * (shown + 1) + (rows.length > 5 ? 0.3 : 0) + 0.3;
    }
    const third = groups[2];
    if (third) {
      s.addText(
        `${third.title}: ${third.items.length} ${third.items.length === 1 ? 'item' : 'items'}, see the full report.`,
        { x: MARGIN, y, w: BODY_W, h: 0.4, fontSize: 12, color: this.c.muted, fontFace: FONT },
      );
    }
    this.footer(s, 7);
  }

  health(report: ToolReport) {
    const h = report.health;
    const s = this.heading('Data health', plain(h.summary[0] ?? ''));
    const rows = h.checks.map((ch) => [
      ch.level === 'fix' ? 'Fix' : ch.level === 'check' ? 'Check' : 'Handled',
      ch.title,
      String(ch.items.length),
      ch.explanation,
    ]);
    if (rows.length === 0) {
      s.addText('Nothing to report. Your files read cleanly.', {
        x: MARGIN,
        y: 1.5,
        w: BODY_W,
        h: 0.5,
        fontSize: 14,
        color: this.c.ink,
        fontFace: FONT,
      });
    } else {
      this.table(s, ['', 'Check', 'Items', 'What it means'], rows, {
        x: MARGIN,
        y: 1.5,
        w: BODY_W,
        widths: [1.0, 3.6, 0.8, BODY_W - 5.4],
        rows: 12,
      });
    }
    this.footer(s, 8);
  }

  notes(report: ToolReport) {
    const s = this.heading('Notes', 'How these figures were worked out');
    const lines: { text: string; indent: number }[] = [];
    if (report.doubts.length > 0) {
      lines.push({
        text: 'Some figures may be wrong. These choices were made against the advice given:',
        indent: 0,
      });
      lines.push(...report.doubts.map((d) => ({ text: d, indent: 1 })));
    }
    lines.push(
      {
        text: 'Income uses the date each invoice was issued. If you use VAT cash accounting, VAT is due when you are paid instead.',
        indent: 0,
      },
      { text: 'Draft and cancelled invoices are left out of income and money owed.', indent: 0 },
      {
        text: 'Weeks start on Monday. Only complete periods fully covered by your files are compared.',
        indent: 0,
      },
      { text: `Made with TradeReports on ${longDate(report.asOf)}.`, indent: 0 },
    );
    s.addText(
      lines.map((l) => ({
        text: l.text,
        options: { bullet: true, indentLevel: l.indent, breakLine: true },
      })),
      {
        x: MARGIN,
        y: 1.5,
        w: BODY_W,
        h: 5,
        fontSize: 13,
        color: this.c.ink,
        fontFace: FONT,
        valign: 'top',
        paraSpaceAfter: 6,
      },
    );
    this.footer(s, 9);
  }

  // ---------- building blocks ----------

  private slide(): Slide {
    const s = this.pptx.addSlide();
    s.background = { color: this.c.bg };
    return s;
  }

  // a slide with a title and a one-line summary under it
  private heading(title: string, sub: string): Slide {
    const s = this.slide();
    s.addText(title, {
      x: MARGIN,
      y: 0.4,
      w: BODY_W,
      h: 0.6,
      fontSize: 26,
      bold: true,
      color: this.c.ink,
      fontFace: FONT,
    });
    if (sub) {
      s.addText(sub, {
        x: MARGIN,
        y: 0.95,
        w: BODY_W,
        h: 0.45,
        fontSize: 13,
        color: this.c.muted,
        fontFace: FONT,
      });
    }
    return s;
  }

  private subhead(x: number, y: number, w: number) {
    return { x, y, w, h: 0.4, fontSize: 14, bold: true, color: this.c.ink, fontFace: FONT };
  }

  private footer(s: Slide, n: number) {
    s.addText(`${this.business}  ·  ${n}`, {
      x: MARGIN,
      y: H - 0.5,
      w: BODY_W,
      h: 0.3,
      fontSize: 9,
      color: this.c.muted,
      fontFace: FONT,
      align: 'right',
    });
  }

  // a row of cards with a headline number each
  private tiles(
    s: Slide,
    tiles: {
      title: string;
      value: string;
      detail: string;
      change?: { value: number; text: string } | null;
    }[],
    y: number,
  ) {
    const gap = 0.2;
    const w = (BODY_W - gap * (tiles.length - 1)) / tiles.length;
    const h = 2.2;
    tiles.forEach((t, i) => {
      const x = MARGIN + i * (w + gap);
      s.addShape(this.pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h,
        fill: { color: this.c.card },
        line: { color: this.c.line, width: 0.75 },
        rectRadius: 0.12,
      });
      s.addText(t.title.toUpperCase(), {
        x: x + 0.15,
        y: y + 0.15,
        w: w - 0.3,
        h: 0.35,
        fontSize: 9,
        color: this.c.muted,
        fontFace: FONT,
        charSpacing: 1,
      });
      s.addText(t.value, {
        x: x + 0.15,
        y: y + 0.5,
        w: w - 0.3,
        h: 0.7,
        fontSize: t.value.length > 14 ? 16 : 22,
        bold: true,
        color: this.c.ink,
        fontFace: FONT,
        fit: 'shrink',
      });
      s.addText(t.detail, {
        x: x + 0.15,
        y: y + 1.2,
        w: w - 0.3,
        h: 0.5,
        fontSize: 10,
        color: this.c.muted,
        fontFace: FONT,
        valign: 'top',
      });
      if (t.change) {
        const v = t.change.value;
        s.addText(t.change.text, {
          x: x + 0.15,
          y: y + 1.7,
          w: w - 0.3,
          h: 0.4,
          fontSize: 11,
          bold: true,
          color: v > 0 ? this.c.good : v < 0 ? this.c.bad : this.c.muted,
          fontFace: FONT,
        });
      }
    });
  }

  // "▲ +£325  +18% vs last week"
  private changeText(
    change: number,
    fmt: (n: number) => string,
    percent: number | null,
    word: string,
  ): string {
    const mark = change > 0 ? '▲ +' : change < 0 ? '▼ −' : '— ';
    const pct = percent === null ? '' : `  ${percent > 0 ? '+' : ''}${percent}% vs last ${word}`;
    return `${mark}${fmt(Math.abs(change))}${pct}`;
  }

  private table(
    s: Slide,
    head: string[],
    rows: string[][],
    opts: { x: number; y: number; w: number; money?: number[]; widths?: number[]; rows?: number },
  ) {
    const limit = opts.rows ?? TABLE_ROWS;
    const shown = rows.slice(0, limit);
    const cell = (text: string, i: number, headRow: boolean): PptxGenJS.TableCell => ({
      text,
      options: {
        fontSize: headRow ? 10 : 11,
        bold: headRow,
        color: headRow ? this.c.muted : this.c.ink,
        fontFace: FONT,
        align: opts.money?.includes(i) ? 'right' : 'left',
        fill: { color: this.c.card },
        border: [
          { type: 'none' },
          { type: 'none' },
          { type: 'solid', color: this.c.line, pt: 0.5 },
          { type: 'none' },
        ],
        margin: [0.04, 0.08, 0.04, 0.08],
      },
    });
    const data: PptxGenJS.TableRow[] = [
      head.map((h, i) => cell(h, i, true)),
      ...shown.map((r) => r.map((v, i) => cell(v, i, false))),
    ];
    s.addTable(data, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      ...(opts.widths ? { colW: opts.widths } : {}),
      rowH: 0.34,
      autoPage: false,
    });
    if (rows.length > limit) {
      s.addText(`And ${rows.length - limit} more in the full report.`, {
        x: opts.x,
        y: opts.y + 0.34 * (shown.length + 1) + 0.05,
        w: opts.w,
        h: 0.3,
        fontSize: 10,
        italic: true,
        color: this.c.muted,
        fontFace: FONT,
      });
    }
  }

  // a native PowerPoint bar chart, editable after download
  private barChart(
    s: Slide,
    opts: {
      x: number;
      y: number;
      w: number;
      h: number;
      labels: string[];
      series: { name: string; values: number[] }[];
      money: boolean;
      horizontal?: boolean;
      stacked?: boolean;
    },
  ) {
    // sideways bars draw from the bottom up, so reverse them to read top-down
    const order = <T>(xs: T[]) => (opts.horizontal ? [...xs].reverse() : xs);
    const data = opts.series.map((se) => ({
      name: se.name,
      labels: order(opts.labels),
      values: order(se.values),
    }));
    s.addChart(this.pptx.ChartType.bar, data, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      barDir: opts.horizontal ? 'bar' : 'col',
      barGrouping: opts.stacked ? 'stacked' : 'clustered',
      barGapWidthPct: 60,
      // one colour per series; with one series PowerPoint would otherwise vary it per bar
      chartColors: opts.series.length > 1 ? [this.c.copper, this.c.muted] : [this.c.copper],
      catAxisLabelColor: this.c.muted,
      catAxisLabelFontSize: 9,
      catAxisLabelFontFace: FONT,
      catAxisLineShow: false,
      valAxisLabelColor: this.c.muted,
      valAxisLabelFontSize: 9,
      valAxisLabelFontFace: FONT,
      valAxisLineShow: false,
      valGridLine: { color: this.c.line, style: 'solid', size: 0.5 },
      valAxisLabelFormatCode: opts.money ? '£#,##0' : '0',
      showLegend: opts.series.length > 1,
      legendPos: 'b',
      legendColor: this.c.muted,
      legendFontSize: 9,
      legendFontFace: FONT,
      plotArea: { fill: { color: this.c.bg } },
      chartArea: { fill: { color: this.c.bg } },
    });
  }
}
