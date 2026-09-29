# Repository Guidelines

## Project Structure & Module Organization

Local Vue/Bun/MySQL application using Pi Coding Agent. Run commands from `ai_dev/`.

- `backend/gateway/` and `server.mjs`: requirements, conversations, MySQL persistence, and browser HTTP/SSE APIs.
- `backend/executor/` and `executor.mjs`: Pi sessions, Git worktrees, tools, and static previews. Keep model credentials here and database configuration in the gateway.
- `frontend/src/`: Vue pages, components, composables, and CSS assets.
- `migrations/`: numbered, repeatable SQL files such as `002_conversations.sql`.
- `tests/`: integration tests, smoke tests, and shared fixtures.
- `docs/` and `docs/adr/`: architecture, verification records, and decisions; `tasks/` tracks implementation work.
- `skills/`: agent skill definitions. `.data/`, `workspaces/`, and `dist/` are ignored runtime/build output.

## Build, Test, and Development Commands

Prepare MySQL and configure `.env` using `.env.example`, then run:

- `bun install`: install dependencies using `bun.lock`.
- `bun run check:env`: validate local prerequisites.
- `bun run db:migrate`: create application tables in the existing database.
- `bun run dev`: start gateway and executor with Vite development support; open `http://127.0.0.1:4417`.
- `bun run build`: build the frontend.
- `bun run start`: run the application after building.
- `bun test`: run the standard test suite.
- `bun run smoke:ui`, `bun run smoke:pi`, `bun run smoke:flow`: run browser or real-model checks.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, double quotes, and semicolons, following nearby code. Backend files use `.mjs`; Vue components use PascalCase filenames and `<script setup>`. Use camelCase functions and variables, `useSomething.js` composables, and descriptive kebab-case module filenames. No formatter or linter is configured; avoid unrelated formatting changes.

## Testing Guidelines

Use `bun:test` with `tests/*.test.mjs`; smoke tests use `*.smoke.mjs`, with Playwright for browser checks. Set `TEST_DATABASE_URL` to a dedicated test database. Assert behavior through public HTTP/SSE, file/preview, and browser interfaces; replace only the external model HTTP boundary for deterministic integration tests. No coverage threshold is configured.

UI smoke tests require Chrome (`CHROME_PATH` can override its location). Pi/flow smoke tests require real model credentials and incur API costs. Never use a business database for tests.

## Commit & Pull Request Guidelines

History includes Chinese descriptions with `feat:`, `refactor:`, and `docs:` prefixes; prefer this pattern for focused commits. Stage intended files only. PRs should explain changes, link issues, report validation, and include screenshots for UI changes. Document service boundary changes.

## Security & Configuration

Never commit `.env`, credentials, or runtime data. Keep services on loopback: Pi Shell runs with the local user's permissions, without an OS sandbox.
