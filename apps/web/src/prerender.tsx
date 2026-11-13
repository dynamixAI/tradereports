// Runs at build time, not in the browser: draws each page to plain HTML so search engines
// and slow phones see the words straight away. The app then takes over as normal.
import type { JSX } from 'react';
import { renderToString } from 'react-dom/server';
import { Footer } from './Footer';
import { Landing } from './landing/Landing';
import { About } from './pages/About';
import { Accessibility } from './pages/Accessibility';
import { Contact } from './pages/Contact';
import { Help } from './pages/Help';
import { Licences } from './pages/Licences';
import { Page } from './pages/Page';
import { Privacy } from './pages/Privacy';
import { Request } from './pages/Request';
import { Storage } from './pages/Storage';
import { Terms } from './pages/Terms';
import { WhatsNew } from './pages/WhatsNew';

export { NOT_FOUND, ORIGIN, ROUTES } from './routes';

const PAGES: Record<string, () => JSX.Element> = {
  '/new': WhatsNew,
  '/request': Request,
  '/help': Help,
  '/about': About,
  '/privacy': Privacy,
  '/terms': Terms,
  '/storage': Storage,
  '/accessibility': Accessibility,
  '/contact': Contact,
  '/licences': Licences,
};

// the tool needs the browser, so its pages get a short stand-in until it loads
function ToolStandIn({ example }: { example: boolean }) {
  return (
    <Page
      title={example ? 'Example report' : 'Make your report'}
      intro={
        example
          ? 'A full report made from made-up files: money owed, income, VAT quarters, top customers and work not invoiced.'
          : 'Add your invoices, quotes and jobs exports, or your own spreadsheet, and get checked numbers in seconds. Your files stay on your computer.'
      }
    >
      <p>Loading the tool…</p>
    </Page>
  );
}

function NotFound() {
  return (
    <Page title="Page not found" intro="That page doesn't exist, or it has moved.">
      <p>
        Go to the <a href="/">home page</a> or <a href="/app">make your report</a>.
      </p>
    </Page>
  );
}

function body(path: string): JSX.Element {
  if (path === '/') return <Landing dark calm={false} />;
  if (path === '/app') return <ToolStandIn example={false} />;
  if (path === '/example') return <ToolStandIn example />;
  const Shown = PAGES[path];
  return Shown ? <Shown /> : <NotFound />;
}

export function render(path: string): string {
  return renderToString(
    <>
      <header className="top">
        <a className="logo" href="/">
          Trade<span>Reports</span>
        </a>
      </header>
      {body(path)}
      <Footer />
    </>,
  );
}
