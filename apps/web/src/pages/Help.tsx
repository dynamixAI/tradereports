import type { ReactNode } from 'react';
import { Page } from './Page';

// each question opens to show its answer
const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: 'Which files can I use?',
    a: (
      <>
        Exports from your job software (invoices, quotes, jobs and customer lists), or a spreadsheet
        you keep yourself. CSV, Excel (.xlsx, .xls) and LibreOffice (.ods) files all work. Export
        with all columns: extra columns do no harm.
      </>
    ),
  },
  {
    q: 'Do I need all the files?',
    a: (
      <>
        No. Invoices alone give you money owed, income, VAT quarters and customers. Add jobs or
        quotes to see work that hasn&apos;t been invoiced. The <b>What your files unlock</b> panel
        shows what each file adds.
      </>
    ),
  },
  {
    q: 'Are my files uploaded anywhere?',
    a: (
      <>
        No. They are read by your browser, on your computer, and never sent to us or anyone else.
        See <a href="#/privacy">Privacy</a>.
      </>
    ),
  },
  {
    q: 'Why does it ask me questions about my columns?',
    a: (
      <>
        Every spreadsheet is laid out differently. When the tool can&apos;t be sure which column is
        the total or what &quot;Pd&quot; means, it asks rather than guesses. It remembers your
        answers, so a sheet laid out the same way needs no questions next time.
      </>
    ),
  },
  {
    q: 'It says it’s not sure what my file is. What now?',
    a: (
      <>
        It may be a file made for importing into job software rather than a report exported from it.
        Try the report export with all columns. If it really is your invoices, choose{' '}
        <b>It&apos;s my invoices, use it</b>, but check the figures carefully.
      </>
    ),
  },
  {
    q: 'Why does it say overdue is unknown?',
    a: (
      <>
        Your file has no due dates, so the tool can&apos;t tell what&apos;s late. It shows what
        you&apos;re owed and leaves overdue out, rather than showing a misleading £0.
      </>
    ),
  },
  {
    q: 'How do I compare with last week?',
    a: (
      <>
        Your files already hold past weeks, so <b>This week against last</b> works from the first
        report. For money owed and overdue, the tool remembers a few totals from each report on this
        computer, and <b>Since your last report</b> shows what changed next time.
      </>
    ),
  },
  {
    q: 'Can I use it on another computer?',
    a: (
      <>
        Yes. On the report, choose <b>Save answers</b>. On the other computer, choose{' '}
        <b>Open your saved file</b> on the first step. Your business name, column answers and past
        report totals come with it.
      </>
    ),
  },
  {
    q: 'How do I share a report?',
    a: (
      <>
        Choose <b>Download PowerPoint</b>. The file opens in PowerPoint, LibreOffice, Google Slides
        or Keynote, and can be saved as a PDF from there. It contains customer names, so share it as
        carefully as any business document.
      </>
    ),
  },
  {
    q: 'Can I trust the figures?',
    a: (
      <>
        The sums are checked by thousands of automated tests, and the report says when something is
        uncertain. But it can only be as good as your files and answers, so check important figures
        before acting on them. It isn&apos;t accounting or tax advice.
      </>
    ),
  },
  {
    q: 'How do I start again?',
    a: (
      <>
        Open the menu and choose <b>Clear my saved data</b>. That removes your business name,
        answers and past totals from this browser.
      </>
    ),
  },
];

export function Help() {
  return (
    <Page
      title="Help and FAQ"
      intro="Quick answers. Still stuck? Get in touch from the Contact page."
    >
      <div className="faq">
        {QUESTIONS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}
