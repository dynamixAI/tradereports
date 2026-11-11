import { useEffect, useState, type JSX } from 'react';
import { Landing } from './landing/Landing';
import { Menu } from './Menu';
import { About } from './pages/About';
import { Accessibility } from './pages/Accessibility';
import { Contact } from './pages/Contact';
import { Help } from './pages/Help';
import { Licences } from './pages/Licences';
import { Privacy } from './pages/Privacy';
import { Request } from './pages/Request';
import { Storage } from './pages/Storage';
import { Terms } from './pages/Terms';
import { WhatsNew } from './pages/WhatsNew';
import { Tool } from './tool/Tool';
import { emptyTool, type ToolState } from './tool/files';
import { loadBusiness } from './tool/business';
import { loadMemory } from './tool/memory';
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
const PAGES: Record<string, () => JSX.Element> = {
  '#/new': WhatsNew,
  '#/request': Request,
  '#/help': Help,
  '#/about': About,
  '#/privacy': Privacy,
  '#/terms': Terms,
  '#/storage': Storage,
  '#/accessibility': Accessibility,
  '#/contact': Contact,
  '#/licences': Licences,
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
  // kept here so the files survive a visit to another page
  const [tool, setTool] = useState<ToolState>(() => emptyTool(loadBusiness(), loadMemory()));

  // keep the page in step with the settings
  useEffect(() => {
    applySettings(theme, calm);
  }, [theme, calm]);

  // new page: go to the top, or to the "how it works" section
  useEffect(() => {
    if (hash === '#/how') document.getElementById('how')?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);

  const Page = PAGES[hash];
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
          // the business name goes too, and the tool starts over
          setTool(emptyTool());
        }}
      />
      {hash === '#/app' ? (
        <Tool state={tool} onChange={setTool} />
      ) : Page ? (
        <Page />
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
        <a href="#/about">About</a>
        <a href="#/licences">Licences</a>
      </footer>
    </>
  );
}
