# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`, with `electron.ts` handling the main Electron process, `server.ts` exposing the Express API, and domain helpers under `services/`, `utils/`, and `types/`. UI assets stay in `public/`, while icons and tray art sit in `assets/`. Generated JavaScript and packaged builds land in `dist/`. Temporary artifacts (`uploads/`, `temp/`) can be cleared safely, and `test-pdfs/` provides fixtures for manual and scripted checks. The Gemini CLI shim is in `gemini-cli-local/`; its `.gemini/` credentials directory is git-ignored.

## Build, Test, and Development Commands
Run `npm start` (alias `npm run electron`) to compile TypeScript and launch the Electron shell. Use `npm run dev` for a server-only watch loop, or `npm run server` / `npm run server:dev` to start the API from built output or ts-node, respectively. `npm run build:ts` performs a strict type-check and emits JS to `dist/`, while `npm run build` packages the desktop app via electron-builder. Initial setup flows through `npm run setup`; you'll authenticate Gemini with `npm run gemini-auth` and can exercise the CLI via `npm run gemini`. AI service smoke tests run with `npm run test:ai`.

## Coding Style & Naming Conventions
TypeScript is in strict mode; format with 2-space indentation, single quotes, and semicolons. Name variables and functions in `camelCase`, classes and types in `PascalCase`, and environment variables in `SCREAMING_SNAKE_CASE`. File names follow kebab-case (`pdf-service.ts`), and service modules prefer the `.service.ts` suffix. Keep modules focused and colocate shared helpers in `src/utils/`.

## Testing Guidelines
Lightweight ts-node scripts (`src/test-*.ts`) act as unit or integration probes; mirror that pattern when adding coverage. Use `npm run build:ts` as a gate before commits, then validate Electron startup (`npm start`) and critical API flows. Reference assets in `test-pdfs/` when scripting PDF scenarios, and document any manual validation steps in PR descriptions.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). PRs should outline the change, link related issues, and include screenshots or GIFs for UI impacts—macOS remains the primary target. List the commands you ran (e.g., `npm run build:ts`, `npm start`) and note any manual test matrix.

## Security & Configuration Tips
Never commit credentials; ensure `gemini-cli-local/.gemini/`, `uploads/`, and `temp/` stay untracked. Configure runtime options through `.env` (created via `npm run setup`), covering ports, rate limits, and file caps. Packaged apps log to `userData/app.log`; avoid capturing sensitive PDF contents.
