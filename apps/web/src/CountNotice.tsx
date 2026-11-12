import { useState } from 'react';
import { noticeDue, noticeSeen } from './count';

// A slim bar at the bottom, shown once: what is counted, and a way to turn it off.
// It doesn't block anything; counting carries on unless they turn it off.
export function CountNotice({ onTurnOff }: { onTurnOff: () => void }) {
  const [open, setOpen] = useState(noticeDue);
  if (!open) return null;

  const close = () => {
    noticeSeen();
    setOpen(false);
  };

  return (
    <section className="count-notice" aria-label="About counting">
      <p>
        We count visits anonymously: totals only, no cookies, nothing about your files.{' '}
        <a href="#/privacy">What we count</a>
      </p>
      <div className="count-notice-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onTurnOff();
            close();
          }}
        >
          Turn off
        </button>
        <button type="button" className="try" onClick={close}>
          OK
        </button>
      </div>
    </section>
  );
}
