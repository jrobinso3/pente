# Pente — Mobile Web App (PWA)

A mobile-friendly Progressive Web App version of **Pente — 5-in-a-Row Strategy Game**, configured to run on **GitHub Pages** and install on iOS and Android home screens with offline support.

## Project Files

- `index.html` — Main game entry point with PWA meta tags, safe-area inset handling, and service worker registration.
- `manifest.webmanifest` — Web App Manifest (`standalone` display, relative `start_url`/`scope` for GitHub Pages subpaths).
- `sw.js` — Service worker for offline caching of the app shell and assets.
- `icons/` — App icons (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`).
- `.nojekyll` — Disables Jekyll processing on GitHub Pages.
- `.github/workflows/pages.yml` — GitHub Actions workflow for deploying to GitHub Pages.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (e.g. `main` branch):
   ```bash
   git init -b main
   git add .
   git commit -m "Configure Pente mobile web app for GitHub Pages"
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In your GitHub repository, go to **Settings → Pages**:
   - Under **Build and deployment → Source**, choose **GitHub Actions** (uses `.github/workflows/pages.yml`), **or** choose **Deploy from a branch** (`main`, `/ (root)`).
3. Open `https://<your-username>.github.io/<your-repo>/` on your phone.

## Install as a Mobile App

- **iPhone / iPad (Safari):** Open the GitHub Pages URL, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** Open the GitHub Pages URL, tap the menu (**⋮**) or install banner, then **Install app** / **Add to Home screen**.
