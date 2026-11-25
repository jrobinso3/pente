import { PenteApp } from './app/PenteApp.js';

const app = new PenteApp();

window.addEventListener('load', () => {
  app.init();

  if (
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1')
  ) {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  }
});
