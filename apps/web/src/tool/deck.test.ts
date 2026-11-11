import { describe, expect, it } from 'vitest';
import jobberInvoices from '../../../../packages/core/tests/fixtures/jobber/invoices-report.csv?raw';
import jobberJobs from '../../../../packages/core/tests/fixtures/jobber/one-off-jobs-report.csv?raw';
import jobberQuotes from '../../../../packages/core/tests/fixtures/jobber/quotes-report.csv?raw';
import { buildDeck, deckFileName } from './deck';
import { addUpload, emptyTool } from './files';
import { readUpload } from './readUpload';
import { buildReport } from './report';

// every bit of text in the slides, in order
async function slideText(blob: Blob): Promise<string[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort();
  const out: string[] = [];
  for (const name of names) {
    const xml = await zip.file(name)?.async('string');
    for (const m of (xml ?? '').matchAll(/<a:t>([^<]*)<\/a:t>/g)) out.push(m[1] ?? '');
  }
  return out;
}

describe('deckFileName', () => {
  it('puts the date first and keeps the name safe for a file', () => {
    expect(deckFileName('2026-11-11', 'Smith Plumbing')).toBe(
      '2026-11-11 Smith Plumbing report.pptx',
    );
    expect(deckFileName('2026-11-11', 'A/B: "Heating"?')).toBe(
      '2026-11-11 A B Heating report.pptx',
    );
    expect(deckFileName('2026-11-11', '')).toBe('2026-11-11 Business report.pptx');
  });
});

describe('buildDeck', () => {
  it('makes a PowerPoint file from a full report', async () => {
    let state = emptyTool();
    for (const [name, text] of Object.entries({
      'invoices.csv': jobberInvoices,
      'jobs.csv': jobberJobs,
      'quotes.csv': jobberQuotes,
    })) {
      state = addUpload(state, await readUpload(name, new TextEncoder().encode(text)));
    }
    const report = buildReport(state.files, '2026-11-11', 1);
    const blob = await buildDeck(report, {
      businessName: 'Example Heating Ltd',
      files: state.files.map((f) => f.upload.fileName),
      theme: 'dark',
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // a .pptx is a zip file, which starts with "PK"
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe('PK');
    expect(bytes.length).toBeGreaterThan(20_000);
    // the business name is in the title and every footer; the tool's name isn't
    const text = await slideText(blob);
    expect(text[0]).toBe('Example Heating Ltd');
    expect(text.filter((t) => t.startsWith('Example Heating Ltd  ·'))).toHaveLength(9);
    expect(text.filter((t) => t.startsWith('TradeReports'))).toHaveLength(0);
  }, 20_000);

  it('still makes a deck from one invoices file', async () => {
    const state = addUpload(
      emptyTool(),
      await readUpload('invoices.csv', new TextEncoder().encode(jobberInvoices)),
    );
    const report = buildReport(state.files, '2026-11-11', 1);
    const blob = await buildDeck(report, {
      businessName: '',
      files: ['invoices.csv'],
      theme: 'light',
    });
    expect(blob.size).toBeGreaterThan(20_000);
  }, 20_000);
});
