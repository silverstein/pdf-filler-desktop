# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript sources — `electron.ts` (Electron main), `server.ts` (Express API), `preload.ts`, `services/` (PDF, CSV, Gemini, profiles), `utils/`, `types/`.
- `public/`: Static UI assets (e.g., `index.html`, themes).
- `assets/`: App icons and tray assets.
- `gemini-cli-local/`: Local Gemini CLI; credentials live under `.gemini` (git-ignored).
- `uploads/`, `temp/`: Ephemeral files; safe to delete.
- `dist/`: Compiled JS and packaged app artifacts.
- `test-pdfs/`: Sample PDFs for manual/verification tests.

## Build, Test, and Development Commands
- `npm start`: Compile TypeScript then launch Electron app.
- `npm run electron`: Same as `npm start`.
- `npm run dev`: Watch/auto-restart server (API-only dev loop).
- `npm run server` | `npm run server:dev`: Start API (built | ts-node).
- `npm run build:ts`: Type-check and emit JS to `dist/`.
- `npm run build`: Package app with electron-builder (+ post-build copy).
- `npm run setup`: Guided setup (.env, deps, Gemini auth hints).
- `npm run gemini-auth`: Open Gemini CLI OAuth; `npm run gemini` to invoke CLI.
- `npm run test:ai`: Run `src/test-ai-service.ts` via ts-node.

## Coding Style & Naming Conventions
- TypeScript strict mode (see `tsconfig.json`). Use 2-space indent, single quotes, semicolons.
- Naming: `camelCase` for vars/functions, `PascalCase` for classes/types, `SCREAMING_SNAKE_CASE` for env.
- Files: kebab-case (`pdf-service.ts`); services may use `.service.ts` suffix.
- Prefer small, focused modules in `src/services/` and helpers in `src/utils/`.

## Testing Guidelines
- No Jest/Mocha yet. Add lightweight TS test scripts (`src/test-*.ts`) and run with ts-node.
- Use `test-pdfs/` for fixtures. Document manual steps in PRs (inputs, expected outputs).
- Minimum: `npm run build:ts` passes; validate critical endpoints and Electron launch locally.

## Commit & Pull Request Guidelines
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- PRs should include: clear description, linked issues, screenshots/GIFs for UI, reproduction/test steps, and platform notes (macOS target).
- Ensure lint/type-checks pass (`npm run build:ts`) and app runs (`npm start`).

## Security & Configuration Tips
- Do not commit secrets. Keep `gemini-cli-local/.gemini/`, `uploads/`, and `temp/` out of VCS.
- Configure via `.env` (e.g., `PORT`, rate limits, file size caps). Example file is auto-created by `npm run setup`.
- Packaged app writes logs to `userData/app.log`; avoid logging sensitive PDF contents.
