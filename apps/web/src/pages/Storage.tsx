import { Page } from './Page';

// everything the site keeps in the browser, kept in step with the code that writes it
const ITEMS = [
  {
    name: 'tr-theme',
    what: 'Whether you chose the dark or light theme.',
  },
  {
    name: 'tr-motion',
    what: 'Whether you turned on Reduce motion.',
  },
  {
    name: 'tr-business',
    what: 'Your business name and which months your VAT quarters end in.',
  },
  {
    name: 'tr-memory',
    what: 'Your answers about your spreadsheet columns, and a few totals from each report (money owed, overdue, unbilled work) so the next report can show what changed. No customer names or invoice rows.',
  },
  {
    name: 'tr-remember',
    what: 'Only if you turned off Remember my answers: a note to keep nothing.',
  },
  {
    name: 'tr-folder',
    what: 'Only if you chose a folder: which folder your reports go into. Chrome and Edge keep this in their own small database rather than with the others. The folder and its files stay yours; this only points to it.',
  },
];

export function Storage() {
  return (
    <Page
      title="Cookies and storage"
      intro="No cookies. A few settings are kept in your browser so you don't have to type them again."
      updated
    >
      <h2>Cookies</h2>
      <p>
        This site doesn&apos;t use cookies, so there&apos;s no cookie banner. There&apos;s no
        advertising and no tracking.
      </p>

      <h2>What is kept in your browser</h2>
      <p>
        These items are saved in your browser&apos;s storage on this computer. They are never sent
        to us. They are only there to make the tool easier to use, so the law treats them as
        strictly necessary and they don&apos;t need your consent.
      </p>
      <div className="r-table-wrap">
        <table className="r-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">What it holds</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((item) => (
              <tr key={item.name}>
                <td>
                  <code>{item.name}</code>
                </td>
                <td>{item.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Your files</h2>
      <p>
        The files you add are read while the page is open and are not stored. Close the tab and
        they&apos;re gone from the tool.
      </p>

      <h2>Removing it</h2>
      <p>
        Open the menu and choose <b>Clear my saved data</b>. That removes every item above from this
        browser. Clearing your browser&apos;s data for this site does the same.
      </p>
    </Page>
  );
}
