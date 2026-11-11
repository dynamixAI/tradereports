import { Page } from './Page';

// open-source parts that ship in the site, with their licences
const PARTS = [
  { name: 'React and React DOM', use: 'Builds the pages', licence: 'MIT' },
  { name: 'three.js', use: 'The 3D animation on the home page', licence: 'MIT' },
  { name: 'PapaParse', use: 'Reads CSV files', licence: 'MIT' },
  {
    name: 'SheetJS Community Edition',
    use: 'Reads Excel and LibreOffice files',
    licence: 'Apache 2.0',
  },
  { name: 'PptxGenJS', use: 'Makes the PowerPoint file', licence: 'MIT' },
  { name: 'JSZip', use: 'Packs the PowerPoint file', licence: 'MIT' },
  { name: 'Space Grotesk', use: 'The typeface', licence: 'SIL Open Font Licence 1.1' },
];

export function Licences() {
  return (
    <Page
      title="Licences"
      intro="TradeReports is built with these open-source parts. Thank you to the people who make them."
    >
      <div className="r-table-wrap">
        <table className="r-table">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">What it does here</th>
              <th scope="col">Licence</th>
            </tr>
          </thead>
          <tbody>
            {PARTS.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.use}</td>
                <td>{p.licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Each licence&apos;s full text comes with its part, and is linked from the project&apos;s
        page on the web.
      </p>
    </Page>
  );
}
