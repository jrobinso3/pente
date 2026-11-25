# Pente — Mobile Web App (PWA)

A mobile-friendly Progressive Web App version of **Pente — 5-in-a-Row Strategy Game**, built with modular ES6 OOP classes and configured to run on **GitHub Pages** with offline support.

## Project Structure

- `index.html` — App shell, PWA meta tags, and `<script type="module" src="./src/main.js">` entry point.
- `styles/app.css` — Theme variables, safe-area inset layout, and board/pip styling.
- `src/`
  - `main.js` — Application bootstrap and service worker registration.
  - `app/PenteApp.js` — `PenteApp` controller coordinating engine, AI, audio, HUD, and modals.
  - `engine/PenteGame.js` — `PenteGame` rules engine (19×19 board, captures, 5-in-a-row, undo, Zobrist hashing).
  - `engine/PenteAI.js` — `PenteAI` iterative deepening alpha-beta search and threat evaluator.
  - `audio/SoundFX.js` — `SoundFX` Web Audio API sound synthesizer.
  - `state/ProfileStore.js` — `ProfileStore` `localStorage` persistence and achievement queue.
  - `config/constants.js` — Game constants, AI profiles, themes, achievements, story chapters, and puzzle curriculum.
  - `ui/BoardRenderer.js` — `BoardRenderer` canvas renderer and touch/pointer pan & zoom handler.
  - `ui/MentorCoach.js` — `MentorCoach` move analysis and puzzle drills.
  - `ui/ModalManager.js` — `ModalManager` for Story Mode, Setup, Shop, Puzzles, Achievements, and Rules.
- `manifest.webmanifest` — Web App Manifest (`standalone` display, relative `start_url`/`scope`).
- `sw.js` — Service worker for offline caching.
- `icons/` — PWA app icons (`192x192`, `512x512`, maskable `512x512`, `180x180` Apple touch icon).
- `.github/workflows/pages.yml` — GitHub Actions workflow for deploying to GitHub Pages.

## Install on Mobile

1. Open `https://jrobinso3.github.io/pente/` on your phone.
2. **iPhone / iPad (Safari):** Tap **Share** → **Add to Home Screen**.
3. **Android (Chrome):** Tap **⋮** (or the install prompt) → **Install app** / **Add to Home screen**.
