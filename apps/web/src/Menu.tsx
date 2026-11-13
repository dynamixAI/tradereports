import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Toggle } from './Toggle';

interface MenuProps {
  dark: boolean;
  calm: boolean;
  remember: boolean;
  count: boolean;
  onCount: (on: boolean) => void;
  onDark: (dark: boolean) => void;
  onCalm: (calm: boolean) => void;
  onRemember: (on: boolean) => void;
  // the copy and open buttons for taking answers to another computer
  answers: ReactNode;
  onClear: () => void;
}

const PAGES = [
  { href: '/', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/new', label: "What's new" },
  { href: '/request', label: 'Request a report' },
  { href: '/help', label: 'Help and FAQ' },
  { href: '/about', label: 'About' },
];

const LEGAL = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/storage', label: 'Cookies and storage' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/contact', label: 'Contact' },
  { href: '/licences', label: 'Licences' },
];

// the ☰ button and the panel that swings in from the right
export function Menu({
  dark,
  calm,
  remember,
  count,
  onCount,
  onDark,
  onCalm,
  onRemember,
  answers,
  onClear,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // close on Esc, keep Tab inside the menu, stop the page scrolling behind it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !wrap.current) return;
      const items = wrap.current.querySelectorAll<HTMLElement>('a, button');
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const close = () => setOpen(false);
  // each item gets a number so the CSS can bring them in one after another
  let n = 0;
  const step = () => ({ '--i': n++ }) as CSSProperties;

  return (
    <div ref={wrap} className={open ? 'menu open' : 'menu'}>
      <button
        ref={button}
        type="button"
        className="burger"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="menu-panel"
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="backdrop" onClick={close} aria-hidden="true" />
      <nav id="menu-panel" ref={panel} className="panel" aria-label="Menu" inert={!open}>
        <a className="try menu-try" href="/app" onClick={close} style={step()}>
          Try the tool
        </a>
        <ul className="menu-links">
          {PAGES.map((p) => (
            <li key={p.href} style={step()}>
              <a href={p.href} onClick={close}>
                {p.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="menu-settings">
          <p className="menu-head" style={step()}>
            Settings
          </p>
          <div style={step()}>
            <Toggle label="Dark theme" on={dark} onChange={onDark} />
          </div>
          <div style={step()}>
            <Toggle label="Reduce motion" on={calm} onChange={onCalm} />
          </div>
          <div style={step()}>
            <Toggle label="Remember my answers" on={remember} onChange={onRemember} />
            <p className="menu-note">
              {remember
                ? 'Your business name and column answers are kept on this computer.'
                : 'Nothing is kept. The tool asks again each time.'}
            </p>
          </div>
          <div style={step()}>
            <Toggle label="Count my visits anonymously" on={count} onChange={onCount} />
            <p className="menu-note">
              {count ? (
                <>
                  Only totals, like how many reports were made. No cookies, no IDs.{' '}
                  <a href="/privacy">What is counted</a>
                </>
              ) : (
                'Nothing is counted from this computer.'
              )}
            </p>
          </div>
          <div style={step()}>{answers}</div>
          <div style={step()}>
            <button
              type="button"
              className="clear"
              onClick={() => {
                onClear();
                setCleared(true);
              }}
            >
              {cleared ? 'Saved data cleared' : 'Clear my saved data'}
            </button>
          </div>
        </div>
        <ul className="menu-legal">
          {LEGAL.map((p) => (
            <li key={p.href} style={step()}>
              <a href={p.href} onClick={close}>
                {p.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
