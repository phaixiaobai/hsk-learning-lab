import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// vite-plugin-pwa registers the service worker for us automatically
// when `registerType: 'autoUpdate'` is set in vite.config.ts.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
