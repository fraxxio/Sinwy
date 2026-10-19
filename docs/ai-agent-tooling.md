# AI Agent Tooling

Goal: agents can use the app and its services directly (DB, Polar sandbox, email, browser, docs), not only read and edit code, and can test features in a browser the way a user would.

## Guardrails

- [x] Shared `.mcp.json` at the repo root, committed, with no secrets; credentials are loaded from gitignored `.env` files by the server's launch command (`bun --env-file`) or by a `headersHelper` script for remote servers
- [x] Agents can't read `.env` files (`.claude/settings.json` deny rules)
- [x] Only local or sandbox credentials are reachable by agents; no production DSNs or API keys. Agents run the backend and tests, which load `.env`, so anything in it is reachable through a subprocess; keep only local and sandbox values there
  - [x] Backend config rejects `POLAR_SERVER=production` unless `NODE_ENV` is `prod`
  - [x] Local backend `.env` uses `NODE_ENV=local`, Polar sandbox, a local DB and the console email driver
  - [ ] Remove `RESEND_API_KEY` from the local backend `.env` (the console driver doesn't need it), or replace it with a sending-only key for a dev domain
  - [ ] Confirm the Google OAuth client in `.env` is a dev client
- [x] Dev helpers refuse to run unless `NODE_ENV` is `local` or `dev` and the DB host is local (`Sinwy.Backend/scripts/assertLocalDev.ts`)
- [x] Deny commands that print container secrets: `docker inspect`, `docker exec`, `docker compose exec`, `docker compose config` and reads of `/proc/*/environ`. Deny rules match the command text, not the program, so they stop the usual forms only

## MCP Servers

All servers live in the shared `.mcp.json`. Claude Code's tool search loads only tool names at startup, so idle servers cost little context; the cost is in tool output. Prefer a CLI with a skill when a server returns large results on every call.

- [x] Better Auth docs
- [x] Polar sandbox (OAuth)
- [x] shadcn (repo's pinned `shadcn` version)
- [x] Context7 (docs for TanStack, Drizzle, Bun, Zod, etc.; replaces the TanStack gitmcp servers)
- [x] Chrome DevTools (`--isolated`, pinned root dev dependency, system Chromium, override with `CHROMIUM_PATH`): performance traces, Lighthouse and memory debugging only
- [x] Postgres access (see [Database Access](#database-access))
- [x] Remove the misconfigured local `sentry` entry
- [x] Remove Resend: about 145 tools, full account access over OAuth, and local dev reads emails from the console driver (see `last-email`)
- [x] Replace the Playwright MCP with the Playwright CLI (see [Browser](#browser))

## Browser

Agents drive the browser with `bunx playwright-cli`. Unlike the Playwright MCP, it writes page snapshots to `.playwright-cli/` (gitignored) and returns only the file path, so a snapshot enters the context only when the agent reads or searches it.

- [x] `@playwright/cli` pinned as a root dev dependency
- [x] `.playwright/cli.config.json` uses the system Chromium; override with `PLAYWRIGHT_MCP_EXECUTABLE_PATH`
- [x] `playwright-cli` skill in `.claude/skills/` (regenerate with `bunx playwright-cli install --skills` after upgrading)
- [x] Usage rule in `CLAUDE.md`

## Database Access

Agents use `psql` through libpq service entries, so connection details and passwords never enter their context. Limits are enforced by Postgres roles, not by the agent.

- [x] Approach: `psql` with `~/.pg_service.conf` and `~/.pgpass` (no MCP server)
- [x] `bun run db:agent:setup` creates the roles and writes both files (refuses unless `NODE_ENV` is `local` or `dev`)
- [x] `sinwy_agent_ro` role (`service=sinwy_ro`): `SELECT` only, read-only transactions, 5s statement timeout
- [x] `sinwy_agent_rw` role (`service=sinwy_rw`): `SELECT`/`INSERT`/`UPDATE`/`DELETE` only, no DDL, 15s statement timeout
- [x] Usage rules in `CLAUDE.md` (which service to use, always `LIMIT`)
- [x] Run `bun run db:agent:setup` against the local DB (again after recreating the Docker volume)
- [x] Claude Code permissions: allow `psql service=sinwy_ro`, ask for `psql service=sinwy_rw`, deny reading `~/.pgpass`
- [ ] Hosted dev DB: add `sslmode=require` to its service entry when one is used

## sinwy-dev Toolkit

- [ ] `seed-scenario`: seed named data sets (e.g. owner with org, org with staff, subscribed org)
- [ ] `login-as`: get a session for any user, for API calls and browser tests
- [ ] `last-email`: read the latest email sent by the console email driver
- [ ] `simulate-polar-webhook`: send a signed Polar webhook event to the local backend

## Skills

- [ ] End-to-end testing flow (seed scenario, log in, drive the browser, check DB and email)

## Setup Docs

- [ ] Document which environment variables to export for agents and how to start the stack
