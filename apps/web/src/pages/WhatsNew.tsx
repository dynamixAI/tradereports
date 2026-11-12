import { Page } from './Page';

// newest first; add a line each time something people would notice changes
const CHANGES: { date: string; items: string[] }[] = [
  {
    date: '12 November 2026',
    items: [
      'Teams sharing a folder share answers too: one person answers the column questions, everyone gets them.',
      'New switch in the menu: Remember my answers. Turn it off on a shared computer.',
      'Copy my answers to another computer has moved into the menu.',
      'Anonymous counting of totals, with no cookies or IDs, and a switch in the menu to turn it off.',
      'See an example: a full report from made-up files, before you use your own.',
    ],
  },
  {
    date: '11 November 2026',
    items: [
      'Your answers are remembered, so a spreadsheet laid out the same way needs no questions next time.',
      'Since your last report: see what changed in money owed, overdue and unbilled work.',
      'Save answers and Open your saved file, to carry your answers to another computer.',
      'Download your report as a PowerPoint, with your business name on it.',
      'This week against last, with charts, from the dates in your files.',
      'About, Help, Privacy, Terms and the other pages are now written.',
      'Choose a folder (Chrome and Edge): reports go straight into a shared or office folder, and nothing there is ever overwritten.',
    ],
  },
  {
    date: '10 November 2026',
    items: [
      'Your report: money owed, income by month and VAT quarter, customers, unbilled work and data health.',
      'The tool now checks a column makes sense before using it, and asks if it doesn’t.',
    ],
  },
  {
    date: '9 November 2026',
    items: [
      'Add several files at once, and see what each one unlocks.',
      'Home-made spreadsheets work, with plain questions about the columns.',
    ],
  },
  {
    date: '8 November 2026',
    items: ['TradeReports goes online.'],
  },
];

export function WhatsNew() {
  return (
    <Page title="What's new" intro="Changes to TradeReports, newest first.">
      {CHANGES.map((c) => (
        <section key={c.date} className="change">
          <h2>{c.date}</h2>
          <ul>
            {c.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
