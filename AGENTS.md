# Repository Guidelines

## Project Structure & Module Organization

This is a static browser game. `index.html` defines the game shell and loads the CSS and JavaScript with deferred scripts. `styles.css` contains all visual styling and responsive layout rules. `src/app.js` owns game state, map rendering, input handling, scoring, zooming, and outline mode. `src/data.js` contains large precomputed geography data plus curated question arrays; keep generated map/path data separate from hand-authored question additions. `output/playwright/` contains generated screenshot artifacts and should not be treated as source.

There is no dedicated test directory today. If tests are added, prefer `tests/` for integration checks and focused `*.test.js` files for logic extracted from `src/app.js`.

## Build, Test, and Development Commands

No package install or build step is required.

- `python3 -m http.server 8000`: serves the repo locally at `http://localhost:8000/`.
- `node --check src/app.js`: checks the main game script for JavaScript syntax errors.
- `node --check src/data.js`: checks the data bundle syntax after editing question data.
- `node -e 'global.window={}; require("./src/data.js"); console.log(window.GEOGRAPHY_GAME_DATA.questions.length)'`: confirms the data file loads in Node and reports the question count.

## Coding Style & Naming Conventions

Use two-space indentation for HTML, CSS, and JavaScript. Keep JavaScript in plain browser-compatible ES syntax; this app does not use modules, bundlers, or transpilation. Prefer `const` and `let`, small helper functions, and existing naming patterns such as `handlePointerDown`, `renderQuestion`, and kebab-case question ids like `capital-ottawa`.

When adding questions, use the existing compact array format in `makePromptQuestions`: `[id, type, points, clue, prompt, answers]`. Use existing region ids, and make multi-answer prompts explicit with arrays.

## Testing Guidelines

Before finishing changes, run syntax checks for touched JavaScript files. For question-data changes, also load `src/data.js` in Node and verify there are no duplicate ids or missing answer targets when practical. Browser behavior should be checked through the local server, not by opening files directly, because the app expects normal web loading behavior.

## Commit & Pull Request Guidelines

This checkout has no local Git history, so no repository-specific commit convention is visible. Use short imperative commit subjects, for example `Add geography question batch`. Pull requests should describe gameplay impact, list validation commands run, and include screenshots for visual or interaction changes.

## Agent-Specific Instructions

Avoid rewriting generated geography/path data in `src/data.js` unless the task explicitly requires it. Keep edits scoped, preserve unrelated screenshot artifacts, and validate question answer ids against the map data after adding or changing questions.
