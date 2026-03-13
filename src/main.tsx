import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BlinkProvider, BlinkAuthProvider } from '@blinkdotnew/react';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BlinkProvider projectId={import.meta.env.VITE_BLINK_PROJECT_ID || 'movies-tv-recaps-maker-hub-hr704mxx'}>
      <BlinkAuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BlinkAuthProvider>
    </BlinkProvider>
  </StrictMode>,
);
