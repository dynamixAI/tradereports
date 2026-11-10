import { describe, expect, it } from 'vitest';
import { acceptSuggested } from '@tradereports/core';
import jobberInvoices from '../../../../packages/core/tests/fixtures/jobber/invoices-report.csv?raw';
import jobberClients from '../../../../packages/core/tests/fixtures/jobber/clients-export.csv?raw';
import jobberJobs from '../../../../packages/core/tests/fixtures/jobber/one-off-jobs-report.csv?raw';
import jobberQuotes from '../../../../packages/core/tests/fixtures/jobber/quotes-report.csv?raw';
import tradifyInvoices from '../../../../packages/core/tests/fixtures/tradify/invoices-export.csv?raw';
import homemade from '../../../../packages/core/tests/fixtures/homemade/dave-invoices.csv?raw';
import { addUpload, emptyTool, useAsInvoices, type ToolState } from './files';
import { readUpload } from './readUpload';
import { buildReport, longDate, money, plain, today } from './report';

const AS_OF = '2026-11-10';

// read each file the way the tool does and add it
async function load(files: Record<string, string>): Promise<ToolState> {
  let state = emptyTool();
  for (const [name, text] of Object.entries(files)) {
    state = addUpload(state, await readUpload(name, new TextEncoder().encode(text)));
  }
  return state;
}

describe('buildReport', () => {
  it('fills every part from a full set of exports', async () => {
    const state = await load({
      'invoices.csv': jobberInvoices,
      'clients.csv': jobberClients,
      'jobs.csv': jobberJobs,
      'quotes.csv': jobberQuotes,
    });
    const report = buildReport(state.files, AS_OF, 1);
    expect(report.owed?.invoices.length).toBeGreaterThan(0);
    expect(report.income?.byMonth.length).toBeGreaterThan(0);
    expect(report.customers).not.toBeNull();
    expect(report.unbilled).not.toBeNull();
    expect(report.hasJobs).toBe(true);
    expect(report.doubts).toEqual([]);
  });

  it('knows finished work needs a jobs file when only quotes are given', async () => {
    const state = await load({ 'invoices.csv': jobberInvoices, 'quotes.csv': jobberQuotes });
    const report = buildReport(state.files, AS_OF, 1);
    expect(report.hasJobs).toBe(false);
    // 10 accepted quotes, less a £50 discount on one
    expect(report.unbilled?.agreedNotStartedPence).toBe(648000);
  });

  it('leaves work not invoiced out without jobs or quotes', async () => {
    const state = await load({ 'invoices.csv': tradifyInvoices });
    const report = buildReport(state.files, AS_OF, 1);
    expect(report.owed).not.toBeNull();
    expect(report.unbilled).toBeNull();
  });

  it('has no money parts without an invoices file', async () => {
    const state = await load({ 'clients.csv': jobberClients });
    const report = buildReport(state.files, AS_OF, 1);
    expect(report.owed).toBeNull();
    expect(report.income).toBeNull();
    expect(report.health.checks).toBeDefined();
  });

  it('reads a home-made sheet with the answers given', async () => {
    const state = await load({ 'dave.csv': homemade });
    const file = state.files[0];
    if (!file) throw new Error('no file');
    // this sheet's suggestions answer every question
    const answers = acceptSuggested(file.upload.table, file.answers);
    const report = buildReport([{ ...file, answers }], AS_OF, 1);
    expect(report.owed?.summary[0]).toMatch(/^You're owed £4,494.00 across 5 invoices/);
    // no due dates in the sheet, so overdue can't be judged
    expect(report.owed?.noDueDates).toBe(true);
    expect(report.income?.byMonth.length).toBeGreaterThan(0);
  });

  it('warns about a file forced in as invoices', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => `Town ${i},2026-01,${100 + i}`);
    const text = ['area,month,crimes', ...rows].join('\n');
    let state = await load({ 'figures.csv': text });
    const unsure = state.unsure[0];
    if (!unsure) throw new Error('expected an unsure file');
    state = useAsInvoices(state, unsure.id);
    const file = state.files[0];
    if (!file) throw new Error('no file');
    const forced = { ...file, answers: { ...file.answers, columns: { gross: 'area' } } };
    const report = buildReport([forced], AS_OF, 1);
    expect(report.doubts[0]).toMatch(/you said this is your invoices/);
    expect(report.doubts[1]).toMatch(/"area" was used as the total/);
  });
});

describe('report wording', () => {
  it('keeps trade names off the page', () => {
    expect(plain('This is a Jobber invoices export.')).toBe('This is your invoices export.');
    expect(plain('The Tradify jobs export has no money')).toBe('Your jobs export has no money');
    expect(plain('Made in Tradify')).toBe('Made in your job software');
  });

  it('writes dates and money the UK way', () => {
    expect(longDate('2026-11-03')).toBe('3 November 2026');
    expect(money(123456)).toBe('£1,234.56');
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
