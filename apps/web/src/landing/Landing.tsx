import { lazy, Suspense } from 'react';
import { FlipCard } from './FlipCard';

// the 3D machine loads after the text, so the page appears straight away
const Machine = lazy(() => import('./Machine'));

const PAINS = [
  {
    title: 'Hours lost every month',
    text: 'Export, paste, fix, add up. Again and again, just to see how the business is doing.',
  },
  {
    title: 'The exports are wrong',
    text: 'Paid invoices still show as owed. Drafts you never sent look overdue. One customer is split into two.',
  },
  {
    title: 'Money slips through',
    text: 'Jobs finished but never billed. Customers who owe you, never chased.',
  },
];

export function Landing({ dark, calm }: { dark: boolean; calm: boolean }) {
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero">
        <div>
          <h1>
            Stop fixing
            <br />
            spreadsheets.
            <br />
            <em>Get paid.</em>
          </h1>
          <p className="sub">
            You run a trade, not a spreadsheet. Drop in your export and get numbers you can trust in
            seconds, not hours.
          </p>
          <a className="try" href="#/app">
            Try it free
          </a>
        </div>
        <div className="visual">
          <Suspense fallback={null}>
            <Machine dark={dark} calm={calm} />
          </Suspense>
          <FlipCard calm={calm} />
        </div>
      </section>

      <section className="block">
        <p className="kicker">Sound familiar?</p>
        <h2>Two hours in Excel. A number you still don't trust.</h2>
        <div className="grid">
          {PAINS.map((p, i) => (
            <div className="tile" key={p.title}>
              <div className="n">0{i + 1}</div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block" id="how">
        <p className="kicker">TradeReports fixes that</p>
        <h2>Drop your file in. Get the answers out.</h2>
        <p className="lead">
          It finds the mistakes and asks you before changing anything. Then it shows{' '}
          <b>who owes you</b>, <b>what you haven't billed</b>, <b>your income and VAT</b> and{' '}
          <b>your best customers</b>, with every number explained.
        </p>
        <p className="lead">
          <b>Free. No sign-up. Your file never leaves your computer.</b>
        </p>
        <a className="try" href="#/app">
          Try it free
        </a>
      </section>
    </main>
  );
}
