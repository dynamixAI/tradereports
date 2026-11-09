import { useEffect, useState } from 'react';
import { Landing } from './landing/Landing';
import { Menu } from './Menu';
import { Placeholder } from './Placeholder';
import { Tool } from './tool/Tool';
import type { Upload } from './tool/readUpload';
import {
  applySettings,
  clearSaved,
  initialCalm,
  initialTheme,
  saveCalm,
  saveTheme,
  type Theme,
} from './theme';

// pages live after the # so GitHub Pages never needs to know about them
const PAGES: Record<string, string> = {
  '#/new': "What's new",
  '#/request': 'Request a report',
  '#/help': 'Help and FAQ',
  '#/privacy': 'Privacy',
  '#/terms': 'Terms of use',
  '#/storage': 'Cookies and storage',
  '#/accessibility': 'Accessibility',
  '#/contact': 'Contact',
};

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [calm, setCalm] = useState(initialCalm);
  // kept here so the file survives a visit to another page
  const [upload, setUpload] = useState<Upload | null>(null);

  // keep the page in step with the settings
  useEffect(() => applySettings(theme, calm), [theme, calm]);

  // new page: go to the top, or to the "how it works" section
  useEffect(() => {
    if (hash === '#/how') document.getElementById('how')?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);

  const page = PAGES[hash];
  return (
    <>
      {/* jump to the content without changing the page address */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="top">
        <a className="logo" href="#/">
          Trade<span>Reports</span>
        </a>
      </header>
      <Menu
        dark={theme === 'dark'}
        calm={calm}
        onDark={(on) => {
          const next = on ? 'dark' : 'light';
          setTheme(next);
          saveTheme(next);
        }}
        onCalm={(on) => {
          setCalm(on);
          saveCalm(on);
        }}
        onClear={() => {
          clearSaved();
          setTheme(initialTheme());
          setCalm(initialCalm());
        }}
      />
      {hash === '#/app' ? (
        <Tool upload={upload} onUpload={setUpload} />
      ) : page ? (
        <Placeholder title={page} />
      ) : (
        <Landing dark={theme === 'dark'} calm={calm} />
      )}
      <footer className="foot">
        <span>© 2026 DynamixAI</span>
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
        <a href="#/storage">Cookies and storage</a>
        <a href="#/accessibility">Accessibility</a>
        <a href="#/contact">Contact</a>
      </footer>
    </>
  );
}
