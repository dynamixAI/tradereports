import { useEffect, useState, type JSX } from 'react';
import { Landing } from './landing/Landing';
import { Menu } from './Menu';
import { Footer } from './Footer';
import { Logo } from './Logo';
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
import { Page } from './pages/Page';
import { NOT_FOUND, clean, findRoute, navigate } from './routes';
import { Tool } from './tool/Tool';
import { emptyTool, type ToolState } from './tool/files';
import { loadBusiness, saveBusiness } from './tool/business';
import { forgetFolder } from './tool/folder';
import { loadMemory, saveMemory } from './tool/memory';
import { remembering, setRemembering } from './tool/remember';
import { countPage, countStep, counting, noticeSeen, setCounting } from './count';
import { CountNotice } from './CountNotice';
import { exampleTool } from './tool/example';
import { CopyAnswers, OpenSaved } from './tool/Saved';
import {
  applySettings,
  clearSaved,
  initialCalm,
  initialTheme,
  saveCalm,
  saveTheme,
  type Theme,
} from './theme';

// each address and the page it shows; the build also writes a ready-made HTML file for each
const PAGES: Record<string, () => JSX.Element> = {
  '/new': WhatsNew,
  '/request': Request,
  '/help': Help,
  '/about': About,
  '/privacy': Privacy,
  '/terms': Terms,
  '/storage': Storage,
  '/accessibility': Accessibility,
  '/contact': Contact,
  '/licences': Licences,
};

// the page address, kept up to date as the visitor moves around
function usePath(): string {
  const [path, setPath] = useState(() => clean(location.pathname));
  useEffect(() => {
    const onChange = () => setPath(clean(location.pathname));
    addEventListener('popstate', onChange);
    return () => removeEventListener('popstate', onChange);
  }, []);
  return path;
}

// links to our own pages change page without reloading, so the tool keeps its files
function useLinks(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = e.target instanceof Element ? e.target.closest('a') : null;
      if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      // email links and other sites open as normal
      if (url.origin !== location.origin) return;
      // a jump to a section on this page: let the browser do it
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      navigate(url.pathname + url.hash);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

function NotFound() {
  return (
    <Page title="Page not found" intro="That page doesn't exist, or it has moved.">
      <p>
        Go to the <a href="/">home page</a> or <a href="/app">make your report</a>.
      </p>
    </Page>
  );
}

export function App() {
  const path = usePath();
  useLinks();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [calm, setCalm] = useState(initialCalm);
  // kept here so the files survive a visit to another page
  const [tool, setTool] = useState<ToolState>(() => emptyTool(loadBusiness(), loadMemory()));
  const [remember, setRemember] = useState(remembering);

  // keep the page in step with the settings
  useEffect(() => {
    applySettings(theme, calm);
  }, [theme, calm]);

  // new page: go to the top, or to the "how it works" section
  useEffect(() => {
    if (location.hash === '#how') document.getElementById('how')?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [path]);

  // the tab title, then the anonymous page count (nothing is sent if switched off)
  useEffect(() => {
    document.title = (findRoute(path) ?? NOT_FOUND).title;
    countPage(path, document.title);
  }, [path]);
  const [count, setCount] = useState(counting);

  // /example shows a report from made-up files; /app always means the visitor's own tool
  const fresh = () => emptyTool(loadBusiness(), loadMemory());
  useEffect(() => {
    if (path === '/example' && !tool.example) {
      countStep('example-opened');
      void exampleTool().then(setTool);
    }
    if (path === '/app' && tool.example) setTool(fresh());
  }, [path, tool.example]);

  const Shown = PAGES[path];
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
        <Logo />
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
        remember={remember}
        count={count}
        onCount={(on) => {
          setCounting(on);
          setCount(on);
          // they've found the switch, so the notice isn't needed
          noticeSeen();
        }}
        onRemember={(on) => {
          setRemembering(on);
          setRemember(on);
          // switched back on: keep what this visit already knows
          if (on) {
            saveBusiness(tool.business);
            saveMemory(tool.memory);
          }
        }}
        answers={
          <>
            <CopyAnswers business={tool.business} memory={tool.memory} />
            <OpenSaved
              business={tool.business}
              memory={tool.memory}
              label="Open a copy"
              onOpened={(business, memory) => setTool((s) => ({ ...s, business, memory }))}
            />
          </>
        }
        onClear={() => {
          clearSaved();
          // and forget the chosen folder (the folder and its files are left alone)
          void forgetFolder();
          setRemember(true);
          setCount(true);
          setTheme(initialTheme());
          setCalm(initialCalm());
          // the business name goes too, and the tool starts over
          setTool(emptyTool());
        }}
      />
      {path === '/example' && !tool.example ? (
        // a moment while the made-up files are read; the empty tool would count as a visit
        <main id="main" className="page">
          <p className="page-intro">Loading the example…</p>
        </main>
      ) : path === '/app' || path === '/example' ? (
        <Tool
          state={tool}
          onChange={setTool}
          onLeaveExample={() => {
            setTool(fresh());
            navigate('/app');
          }}
        />
      ) : path === '/' ? (
        <Landing dark={theme === 'dark'} calm={calm} />
      ) : Shown ? (
        <Shown />
      ) : (
        <NotFound />
      )}
      <Footer />
      {/* once only: what is counted, and how to stop it */}
      {count && (
        <CountNotice
          onTurnOff={() => {
            setCounting(false);
            setCount(false);
          }}
        />
      )}
    </>
  );
}
