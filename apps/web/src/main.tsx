import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import { App } from './App';
import { applySettings, initialCalm, initialTheme } from './theme';
import { fromOldHash } from './routes';
import './styles.css';

// old "#/help" links still work: swap them for the real address before anything draws
const moved = fromOldHash(location.hash);
if (moved) history.replaceState(null, '', moved);

// set the theme before the first paint so the page doesn't flash
applySettings(initialTheme(), initialCalm());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
