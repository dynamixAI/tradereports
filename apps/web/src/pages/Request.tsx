import { useState } from 'react';
import { SITE, mailto } from '../site';
import { Page } from './Page';

const SOFTWARE = ['Job software', 'A spreadsheet I keep myself', 'Accounting software', 'Other'];

// a short form that fills in an email; nothing is sent until you press send in your email app
export function Request() {
  const [report, setReport] = useState('');
  const [why, setWhy] = useState('');
  const [source, setSource] = useState(SOFTWARE[0] ?? '');
  const [touched, setTouched] = useState(false);
  const missing = report.trim() === '';

  const body = [
    `The report I'd like: ${report.trim()}`,
    '',
    `What it would help me do: ${why.trim() || '(not given)'}`,
    '',
    `My data is in: ${source}`,
  ].join('\n');

  return (
    <Page
      title="Request a report"
      intro="Tell us what you'd like to see. The most asked-for reports get built first."
    >
      <form
        className="card biz-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (missing) return;
          location.href = mailto('Report request', body);
        }}
      >
        <label className="field">
          <span>What report would you like?</span>
          <textarea
            rows={3}
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="Which jobs made the most money, after materials"
            maxLength={600}
            aria-invalid={touched && missing ? true : undefined}
            aria-describedby={touched && missing ? 'req-error' : undefined}
          />
          {touched && missing && (
            <span id="req-error" className="field-error">
              Say what report you&apos;d like to carry on.
            </span>
          )}
        </label>

        <label className="field">
          <span>What would it help you do? (optional)</span>
          <textarea
            rows={2}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Stop quoting too low on bathroom jobs"
            maxLength={600}
          />
        </label>

        <label className="field">
          <span>Where is your data now?</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOFTWARE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <div className="biz-actions">
          <button type="submit" className="try">
            Open in my email
          </button>
        </div>
        <p className="field-help">
          This opens your email app with your request filled in, ready to send to {SITE.email}.
          Nothing is sent until you press send there. Sending it shares your email address with us,
          and we use it only to reply. You don&apos;t need to include your name.
        </p>
      </form>
    </Page>
  );
}
