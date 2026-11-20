import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { boot } from './app/boot';
// Fonts ship with the app, so loading a page never contacts a font server, and they work offline.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

boot()
  .then((b) => {
    root.render(
      <StrictMode>
        <App boot={b} />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(
      <main className="fatal">
        <h1>Staffroom could not start</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </main>,
    );
  });

// The service worker keeps the pages on this laptop, so the app opens with no connection.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
