import { SITE } from '../site';
import { Page } from './Page';

export function About() {
  return (
    <Page title="About" intro="Why TradeReports exists, and who's behind it.">
      <h2>The problem</h2>
      <p>
        Most trades businesses already have the answers to their biggest money questions sitting in
        their job software or in a spreadsheet: who owes them, what&apos;s overdue, which jobs were
        finished but never invoiced, how this month compares with last. Getting those answers out
        usually means hours of filtering, copying and adding up, or paying for another subscription.
        So it doesn&apos;t get done, and money slips through.
      </p>

      <h2>What TradeReports does</h2>
      <p>
        You export what you already have, add it to TradeReports, and get a clear report in a few
        minutes. The tool checks the data as it goes, asks plain questions when something is
        unclear, and says honestly when it can&apos;t be sure. Your files never leave your computer.
      </p>

      <h2>Who&apos;s behind it</h2>
      <p>
        I&apos;m {SITE.owner}, a data analyst based in {SITE.place}, with an MSc in Data Science. I
        build tools under the name DynamixAI that turn messy data into answers people can act on.
        TradeReports started from a simple idea: small businesses shouldn&apos;t need a data team,
        or to hand over their customers&apos; details, to know where their money is.
      </p>

      <h2>How it&apos;s built</h2>
      <ul>
        <li>
          <b>Private by design.</b> Everything runs in your browser. There&apos;s no account, no
          upload and nothing to collect.
        </li>
        <li>
          <b>Honest numbers.</b> Thousands of automated tests check the sums. Where the files
          can&apos;t answer a question, the report says so instead of guessing.
        </li>
        <li>
          <b>Free to use.</b> If it helps your business, telling another tradesperson about it is
          the best thanks.
        </li>
      </ul>

      <p>
        Got an idea or a problem? <a href="/contact">Get in touch</a>.
      </p>
    </Page>
  );
}
