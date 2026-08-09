import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import './i18n/config';

// When running as a packaged desktop app (Electron) the page is loaded via the
// file:// protocol, where BrowserRouter cannot resolve paths. Use HashRouter in
// that case, and keep BrowserRouter for the normal web build.
const isDesktop = window.location.protocol === 'file:';
const Router = isDesktop ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
