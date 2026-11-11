import { SITE } from '../site';
import { Page } from './Page';

export function Privacy() {
  return (
    <Page
      title="Privacy"
      intro="Short version: your files never leave your computer, and we don't collect anything about you."
      updated
    >
      <h2>Who we are</h2>
      <p>
        {SITE.name} is made by {SITE.operator}, based in {SITE.place}. If you have a question about
        this page, email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>

      <h2>Your files</h2>
      <p>
        When you add a file, it is read by your own web browser, on your own computer. It is not
        uploaded to us or to anyone else. We never see your invoices, quotes, jobs, customers or
        figures, and we couldn&apos;t see them if we wanted to.
      </p>
      <p>
        Your files often contain your customers&apos; names and details. That information belongs to
        your business, and you are responsible for it, as you are when you open the same file in a
        spreadsheet. {SITE.name} doesn&apos;t change that, because the data stays with you.
      </p>

      <h2>What is kept on your computer</h2>
      <p>
        To save you typing things again, the tool remembers a few things in your browser&apos;s own
        storage, on this computer only: your theme and motion settings, your business name and VAT
        quarters, the answers you gave about your spreadsheet columns, and a few totals from each
        report so the next one can show what changed. No customer names or invoice rows are kept.
        The <a href="#/storage">Cookies and storage</a> page lists every item.
      </p>
      <p>
        You can remove all of it at any time with <b>Clear my saved data</b> in the menu, or by
        clearing your browser&apos;s data for this site.
      </p>

      <h2>Files you save</h2>
      <p>
        <b>Save answers</b> and <b>Download PowerPoint</b> create files on your computer. Where they
        go after that, and who you share them with, is up to you. The PowerPoint contains your
        figures and customer names, so treat it like any other business document.
      </p>

      <h2>Visits to the website</h2>
      <p>
        The site is hosted by GitHub Pages. Like any web host, GitHub receives your IP address when
        your browser asks for the pages, so it can send them to you, and may keep it in its logs for
        security. We can&apos;t see those logs. GitHub&apos;s own privacy statement explains how it
        handles them.
      </p>
      <p>
        We don&apos;t use cookies, advertising, or tracking. We don&apos;t count visitors yet. If we
        start, it will be with a service that uses no cookies and keeps no IP addresses, and
        we&apos;ll update this page first.
      </p>

      <h2>If you email us</h2>
      <p>
        If you choose to email us, we&apos;ll see your email address and anything you write, and use
        them only to reply. Please don&apos;t send us your business files or customer details. The
        mailbox is hosted by Microsoft Outlook. We delete messages within 12 months of our last
        reply, or sooner if you ask.
      </p>

      <h2>Your rights</h2>
      <p>
        Under UK data protection law you can ask what we hold about you, and ask us to correct or
        delete it. In practice the only thing we could hold is an email you sent us. Email{' '}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we&apos;ll reply within a month. If
        you&apos;re unhappy with how we&apos;ve handled your information, you can complain to the
        Information Commissioner&apos;s Office at ico.org.uk.
      </p>

      <h2>Changes</h2>
      <p>
        If this page changes, the date at the top changes too, and we&apos;ll say so on the{' '}
        <a href="#/new">What&apos;s new</a> page.
      </p>
    </Page>
  );
}
