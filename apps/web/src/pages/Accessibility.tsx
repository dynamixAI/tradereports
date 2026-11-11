import { SITE, mailto } from '../site';
import { Page } from './Page';

export function Accessibility() {
  return (
    <Page
      title="Accessibility"
      intro="We want everyone to be able to use TradeReports. Here's what works, what doesn't yet, and how to tell us."
      updated
    >
      <h2>What we aim for</h2>
      <p>
        We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. The site
        hasn&apos;t been checked by an outside auditor yet, so we can&apos;t claim it fully meets
        them.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li>Use the whole tool with a keyboard, including the menu and every question.</li>
        <li>Use a screen reader: pages have headings and labels, and changes are announced.</li>
        <li>
          Turn on <b>Reduce motion</b> in the menu to stop the animation. It also follows your
          device&apos;s own reduce-motion setting.
        </li>
        <li>Switch between dark and light themes.</li>
        <li>Zoom in: the layout rearranges itself, down to phone size.</li>
        <li>
          Read changes without relying on colour: every ▲ or ▼ comes with a + or − and the amount.
        </li>
      </ul>

      <h2>Known gaps</h2>
      <ul>
        <li>
          Charts are pictures. Every figure in them is also given in words or in a table next to
          them, and screen readers get a description.
        </li>
        <li>The 3D animation on the home page is decoration only and can be turned off.</li>
        <li>
          The PowerPoint file hasn&apos;t been fully checked with screen readers. Its tables are
          real tables, so they can be read.
        </li>
      </ul>

      <h2>Tell us about a problem</h2>
      <p>
        If something is hard to use, or you need the report in another format, email{' '}
        <a href={mailto('Accessibility problem')}>{SITE.email}</a>. Tell us what you were trying to
        do and what device or software you use. We aim to reply within 48 hours.
      </p>
    </Page>
  );
}
