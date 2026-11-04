import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Реєстрація Service Worker для повноцінної офлайн-роботи PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
