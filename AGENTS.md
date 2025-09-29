# Repository Guidelines

## Project Structure & Module Organization
- `server/index.js`: Node MCP server exposing PDF tools shared by Claude Desktop and Cursor. Keep tool definitions and helper utilities here; prefer incremental updates over rewrites.
- `pdf-filler-mcp-share/`: Packaged variant used by `package-for-friend.js`; mirror changes from `server/index.js` when APIs evolve.
- `manifest.json` and `index.html`: Claude Desktop extension metadata and UI stub. Update versions alongside `package.json`.
- `example-fw9.pdf`: Sample form for smoke tests. Keep anonymized assets only.

## Build, Test, and Development Commands
- `npm install`: install runtime dependencies (Node.js 18+).
- `node server/index.js`: run the MCP server over stdio for local hosts (Cursor, Claude) and watch stderr for diagnostics.
- `node package-for-friend.js`: regenerate `pdf-filler-mcp.zip`; requires the `zip` CLI and ensures shareable installers stay current.
- `dxt pack`: rebuild the `.dxt` extension after code or asset updates; install via Claude Desktop to validate.

## Coding Style & Naming Conventions
- Use 2-space indentation, `const`/`let` semantics, and double-quoted strings to match `server/index.js` and shipped bundles.
- Favor composable helpers over inlined logic; reuse `resolvePath`, `fillPdfFields`, and profile utilities instead of duplicating them.
- Tool names stay snake_case (`list_pdfs`, `fill_pdf`); new tools should follow that pattern and return structured text blocks.

## Testing Guidelines
- No automated test suite yet; perform manual runs against `example-fw9.pdf` via the MCP host. Exercise `list_pdfs`, `read_pdf_fields`, `fill_pdf`, and one profile flow.
- Validate CSV workflows with a two-row fixture before publishing. Check stdout for ✓/✗ markers and confirm generated files open cleanly.

## Commit & Pull Request Guidelines
- Follow the existing imperative subject style (`Update index.html to improve structure`). Group related changes and note version bumps explicitly.
- Include PR context: summary of affected tools, manual test evidence, linked issue if applicable, and screenshots only when UI assets change.
- Regenerate artifacts (`pdf-filler-mcp.zip`, `.dxt`) in separate commits or attach them to releases rather than merging binaries directly.

## Security & Configuration Tips
- Never hard-code personal paths; rely on `resolvePath` and default directories (`~/Documents`, `~/.pdf-filler-profiles`).
- Scrub PDFs or CSVs before committing, and point contributors to local-only credentials files when testing protected documents.
