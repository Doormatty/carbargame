# Repository Guidelines

## Project Structure & Module Organization

This is a static browser game. `index.html` defines the game shell and loads the CSS and JavaScript with deferred scripts. `styles.css` contains all visual styling and responsive layout rules. `src/app.js` owns game state, map rendering, input handling, scoring, zooming, outline mode, and opt-in Playwright test hooks. `src/data.js` contains large precomputed geography data plus curated question arrays; keep generated map/path data separate from hand-authored question additions. `tests/` contains Node data validation and Playwright browser smoke/layout checks. `output/playwright/` contains generated test artifacts and should not be treated as source.

## Build, Test, and Development Commands

No build step is required. Install Node dependencies before running the full test suite.

- `python3 -m http.server 8000`: serves the repo locally at `http://localhost:8000/`.
- `npm ci`: installs the pinned test dependencies from `package-lock.json`.
- `npx playwright install chromium`: installs the local Chromium browser binary used by Playwright; CI uses `--with-deps`.
- `npm test`: runs JavaScript syntax checks, question-data validation, and Playwright browser tests.
- `npm run test:syntax`: runs `node --check` for `src/app.js` and `src/data.js`.
- `npm run test:data`: validates question ids, answer arrays, duplicate answers, and answer targets against map regions.
- `npm run test:e2e`: runs the Playwright suite on desktop and mobile Chromium using a local server on port `9324`.
- `node --check src/app.js`: checks the main game script for JavaScript syntax errors.
- `node --check src/data.js`: checks the data bundle syntax after editing question data.
- `node -e 'global.window={}; require("./src/data.js"); console.log(window.GEOGRAPHY_GAME_DATA.questions.length)'`: confirms the data file loads in Node and reports the question count.

## Coding Style & Naming Conventions

Use two-space indentation for HTML, CSS, and JavaScript. Keep JavaScript in plain browser-compatible ES syntax; this app does not use modules, bundlers, or transpilation. Prefer `const` and `let`, small helper functions, and existing naming patterns such as `handlePointerDown`, `renderQuestion`, and kebab-case question ids like `capital-ottawa`.

When adding questions, use the existing compact array format in `makePromptQuestions`: `[id, type, points, clue, prompt, answers]`. Use existing region ids, and make multi-answer prompts explicit with arrays.

## Testing Guidelines

Before finishing changes, run `npm test` when practical. For narrow JavaScript-only edits, at minimum run `npm run test:syntax`; for question-data changes, run `npm run test:data` as well. Browser behavior should be checked through the local server, not by opening files directly, because the app expects normal web loading behavior.

Playwright is configured to capture screenshots and traces only on failure. Prefer adding or adjusting DOM, state, and layout assertions in `tests/e2e/geopin.spec.js` instead of manually analyzing screenshots. The app exposes `window.__GEOPIN_TEST__` only when `window.__GEOPIN_ENABLE_TEST_HOOKS__` is set before load; keep those hooks gated and minimal.

## Commit & Pull Request Guidelines

This checkout has no local Git history, so no repository-specific commit convention is visible. Use short imperative commit subjects, for example `Add geography question batch`. Pull requests should describe gameplay impact, list validation commands run, and include screenshots only for visual changes that cannot be understood from automated failure artifacts.

## Agent-Specific Instructions

Avoid rewriting generated geography/path data in `src/data.js` unless the task explicitly requires it. Keep edits scoped, preserve unrelated screenshot artifacts, and validate question answer ids against the map data after adding or changing questions. Do not commit `node_modules/` or generated `output/playwright/` artifacts.
