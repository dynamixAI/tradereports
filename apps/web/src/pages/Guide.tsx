import type { CompiledGuide } from '../guides/compile';
import { GUIDES, longDate } from '../guides';

// one guide: the words, then a nudge to try the tool, then the other guides
export function Guide({ guide }: { guide: CompiledGuide }) {
  const others = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);
  return (
    <main id="main" tabIndex={-1} className="page guide">
      <p className="guide-back">
        <a href="/guides/">← All guides</a>
      </p>
      <h1>{guide.title}</h1>
      <p className="page-intro">{guide.description}</p>
      <p className="page-updated">
        {guide.minutes} min read · Updated {longDate(guide.updated)}
      </p>
      {/* our own guide, turned into HTML when the site is built */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: guide.html }} />
      <aside className="guide-cta">
        <p className="guide-cta-title">See who owes you, in seconds</p>
        <p>
          Drop in the export from your job software, or your own spreadsheet. TradeReports shows who
          owes you, how late they are, and the work you haven&apos;t billed. Free, and your files
          never leave your computer.
        </p>
        <a className="try" href="/app">
          Try it free
        </a>
      </aside>
      {others.length > 0 && (
        <nav className="guide-more" aria-label="More guides">
          <p className="guide-more-title">More guides</p>
          <ul>
            {others.map((g) => (
              <li key={g.slug}>
                <a href={`/guides/${g.slug}`}>{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
