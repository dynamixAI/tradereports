import { SITE } from '../site';
import { Page } from './Page';

export function Terms() {
  return (
    <Page
      title="Terms of use"
      intro="The rules for using the tool. They're short because the tool is free and keeps nothing of yours."
      updated
    >
      <h2>Who these terms are with</h2>
      <p>
        {SITE.name} is made by {SITE.operator}, based in {SITE.place}. By using the site you agree
        to these terms. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <h2>What the tool does</h2>
      <p>
        {SITE.name} reads files you choose, on your own computer, and works out reports from them:
        money owed, income, customers, unbilled work and checks on your data. It is free to use.
      </p>

      <h2>Check before you rely on it</h2>
      <p>
        The reports are only as good as the files you give the tool and the answers you give it. We
        work hard to get the figures right and to say plainly when something is unclear, but we
        can&apos;t promise they are complete or free of mistakes. Check important figures against
        your own records before you act on them, for example before chasing a customer, filing a VAT
        return or making a decision about money.
      </p>
      <p>
        {SITE.name} is not accounting, tax, legal or financial advice. For those, speak to a
        qualified accountant or adviser.
      </p>

      <h2>Your data and your responsibilities</h2>
      <ul>
        <li>
          Your files stay on your computer, and you remain responsible for them and for your
          customers&apos; information in them.
        </li>
        <li>Only use files you have the right to use.</li>
        <li>
          Keep the files the tool makes for you, such as the PowerPoint, as safe as your other
          business documents.
        </li>
        <li>Don&apos;t try to break, overload or misuse the site, or use it to harm anyone.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We may change, pause or stop the tool at any time, and we don&apos;t promise it will always
        be available or work in every browser. Because your files and saved answers stay with you,
        nothing of yours is lost if the site changes.
      </p>

      <h2>Our liability</h2>
      <p>
        The tool is provided free and as it is. As far as the law allows, we are not liable for any
        loss arising from using it or relying on its reports, including lost money, lost profit or
        lost data. Nothing in these terms limits liability that can&apos;t be limited by law, such
        as for death or personal injury caused by negligence, or for fraud.
      </p>

      <h2>The law that applies</h2>
      <p>These terms are governed by the law of England and Wales.</p>

      <h2>Changes and questions</h2>
      <p>
        We may update these terms. The date at the top shows when they last changed. Questions go to{' '}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>
    </Page>
  );
}
