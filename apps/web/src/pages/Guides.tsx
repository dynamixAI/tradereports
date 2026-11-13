import { GUIDES, longDate } from '../guides';
import { Page } from './Page';

// the list of guides
export function Guides() {
  return (
    <Page
      title="Guides"
      intro="Plain-English help with getting paid, VAT and the numbers behind your business."
    >
      <ul className="guide-list">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <a className="guide-card" href={`/guides/${g.slug}`}>
              <span className="guide-card-title">{g.title}</span>
              <span className="guide-card-text">{g.description}</span>
              <span className="guide-card-meta">
                {g.minutes} min read · Updated {longDate(g.updated)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Page>
  );
}
