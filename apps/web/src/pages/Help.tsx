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
        Yes. If your team shares a folder (see the next question but one), the answers travel
        through it on their own. Otherwise, open the menu and choose{' '}
        <b>Copy my answers to another computer</b>. Get that file to the other computer, for example
        by email, and there choose <b>Open your copy</b> on the first step. Your business name,
        column answers and past report totals come with it.
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
    q: 'Can reports go straight into a shared folder?',
    a: (
      <>
        Yes, in Chrome and Edge on a computer. Under the report buttons, choose{' '}
        <b>Choose a folder</b> and pick the folder, for example a Google Drive, OneDrive or
        SharePoint folder that is synced to your computer through the OneDrive or Google Drive app.
        From then on, each PowerPoint goes straight in there. Each file gets its own name, so
        nothing is ever overwritten: if the name is taken, the new one gets (2), (3) and so on.
        Nothing is ever deleted. In other browsers, files go to Downloads as normal.
      </>
    ),
  },
  {
    q: 'Does my team have to answer the column questions too?',
    a: (
      <>
        No, if you all use the same shared folder. Each time a report is saved there, a copy of the
        answers goes in a small folder inside it called <b>TradeReports answers</b>. When someone
        else chooses the same folder, the tool reads the newest copy, so the questions are already
        answered. The copies hold your business name, what each column means and a few report
        totals. No customer names or invoice rows.
      </>
    ),
  },
  {
    q: 'What does Remember my answers do?',
    a: (
      <>
        It&apos;s a switch in the menu, on to start with. When it&apos;s on, this computer keeps
        your business name and column answers, so you&apos;re not asked again, and a few totals for{' '}
        <b>Since your last report</b>. Turn it off on a computer other people use: what was kept is
        removed, nothing new is kept, and no answers copies go into a shared folder.
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
