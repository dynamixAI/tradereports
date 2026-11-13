// every page the site has, with what Google and the browser tab show for it
export interface Route {
  path: string;
  title: string;
  description: string;
  // false keeps a page out of the sitemap
  index: boolean;
}

export const ORIGIN = 'https://tradereports.co.uk';

export const ROUTES: Route[] = [
  {
    path: '/',
    title: 'TradeReports: checked numbers from your job software exports',
    description:
      'Turn your job software exports and spreadsheets into checked numbers: money owed, income, VAT and work not invoiced. Free, and your file never leaves your computer.',
    index: true,
  },
  {
    path: '/app',
    title: 'Make your report | TradeReports',
    description:
      'Add your invoices, quotes and jobs exports and get a checked report in seconds. Free, no sign-up, and your files stay on your computer.',
    index: true,
  },
  {
    path: '/example',
    title: 'Example report | TradeReports',
    description:
      'See a full TradeReports report made from made-up files: money owed, income, VAT quarters, top customers and work not invoiced.',
    index: true,
  },
  {
    path: '/help',
    title: 'Help and FAQ | TradeReports',
    description:
      'Which files work, why the tool asks about your columns, and how your data stays on your computer.',
    index: true,
  },
  {
    path: '/about',
    title: 'About | TradeReports',
    description: 'Who makes TradeReports, and why it is free.',
    index: true,
  },
  {
    path: '/new',
    title: "What's new | TradeReports",
    description: 'Recent changes to TradeReports.',
    index: true,
  },
  {
    path: '/request',
    title: 'Request a report | TradeReports',
    description: "Tell us about a report you'd like the tool to make.",
    index: true,
  },
  {
    path: '/privacy',
    title: 'Privacy | TradeReports',
    description:
      'Your files are read on your computer and never uploaded. What is counted, and how to switch it off.',
    index: true,
  },
  {
    path: '/terms',
    title: 'Terms | TradeReports',
    description: 'The terms for using TradeReports.',
    index: true,
  },
  {
    path: '/storage',
    title: 'Cookies and storage | TradeReports',
    description: 'Every item TradeReports keeps on your device, and why. No cookies.',
    index: true,
  },
  {
    path: '/accessibility',
    title: 'Accessibility | TradeReports',
    description: 'How TradeReports works for everyone, and how to report a problem.',
    index: true,
  },
  {
    path: '/contact',
    title: 'Contact | TradeReports',
    description: 'How to get in touch about TradeReports.',
    index: true,
  },
  {
    path: '/licences',
    title: 'Licences | TradeReports',
    description: 'The open-source software TradeReports is built with.',
    index: true,
  },
];

export const NOT_FOUND: Route = {
  path: '/404',
  title: 'Page not found | TradeReports',
  description: 'That page does not exist.',
  index: false,
};

// "/help/" and "/help" are the same page
export function clean(path: string): string {
  const p = path.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function findRoute(path: string): Route | undefined {
  return ROUTES.find((r) => r.path === clean(path));
}

// old links used "#/help"; turn them into "/help" (and "#/how" into the section on the home page)
export function fromOldHash(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const old = hash.slice(1);
  if (old === '/how') return '/#how';
  return clean(old);
}

// change page without reloading
export function navigate(to: string): void {
  history.pushState(null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
}
