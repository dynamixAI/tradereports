import { SITE, mailto } from '../site';
import { Page } from './Page';

export function Contact() {
  return (
    <Page title="Contact" intro="Questions, problems or ideas: we'd like to hear them.">
      <h2>Email</h2>
      <p>
        <a className="try" href={mailto(`${SITE.name} question`)}>
          Email {SITE.email}
        </a>
      </p>
      <p>We read every message and aim to reply within 48 hours.</p>

      <h2>Before you write</h2>
      <ul>
        <li>
          Please don&apos;t attach your business files or send customer details. We don&apos;t need
          them, and your files are safer staying with you.
        </li>
        <li>
          If a file won&apos;t read, tell us which job software it came from and what the screen
          said. Column names help too, without the rows.
        </li>
        <li>
          Want a report the tool doesn&apos;t do yet? Use <a href="#/request">Request a report</a>.
        </li>
      </ul>
      <p>
        If you email us, we&apos;ll see your email address and message and use them only to reply.
        The <a href="#/privacy">Privacy</a> page says more.
      </p>
    </Page>
  );
}
