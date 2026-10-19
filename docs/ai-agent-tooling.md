# AI Agent Tooling

Goal: agents can use the app and its services directly (DB, Polar sandbox, email, browser, docs), not only read and edit code, and can test features in a browser the way a user would.

Implementation is split into one-session phases in [ai-agent-tooling-phases.md](ai-agent-tooling-phases.md).

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
- [ ] When another harness (Codex CLI, Cursor) is used: port the deny rules above to its config. They apply only in Claude Code

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
- [x] `playwright-cli` skill in `.agents/skills/`, linked from `.claude/skills/` (regenerate with `bunx playwright-cli install --skills agents` after upgrading, then `bun run skills:link`)
- [ ] Decide whether to allow `Bash(bunx playwright-cli:*)` in `.claude/settings.json`: the skill's `allowed-tools` matches only the bare `playwright-cli` command, not the `bunx` form `CLAUDE.md` asks for
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

The toolkit is only useful if it behaves like the real thing. A webhook payload that differs from what Polar actually sends can make every test pass and still break in production. Each tool replaces only the outside party (Polar, the inbox, the user logging in) and goes through the same app code as production: no test-only branches in app code and no flags that skip signature or session checks.

- [ ] `seed-scenario`: seed named data sets (e.g. owner with org, org with staff, subscribed org)
  - [ ] Creates data through module services, so it gets the same validation and invariants as the app, not raw SQL
  - [ ] A subscribed org becomes `active` through `simulate-polar-webhook`, not by setting the status column
- [x] `login-as`: get a session for any user, for API calls and browser tests (`bun run dev:login-as --email <email> [--state]`)
  - [x] Creates the session through Better Auth, not by inserting session rows or forging cookies
  - [x] Checks its own output: the session works against a protected endpoint
- [x] `last-email`: read the latest email sent by the console email driver (`bun run dev:last-email [--to <email>] [--subject <text>] [--count <n>]`)
  - [ ] The console driver renders each template into its outbox file, but Resend delivery is untested. Before release, send each new template once through Resend to a dev domain
- [ ] `simulate-polar-webhook`: send a signed Polar webhook event to the local backend
  - [ ] Payloads are fixtures recorded from real Polar sandbox deliveries, not written by hand; the tool substitutes only ids and `referenceId`
  - [ ] Fixtures record the capture date and `@polar-sh/sdk` version, and a test parses them with the SDK's webhook schemas, so an SDK upgrade that changes the shape fails `bun run verify` until they are re-recorded
  - [ ] Signs with the Standard Webhooks scheme and `POLAR_WEBHOOK_SECRET`, and posts to the same endpoint Polar calls. A test sends a badly signed event and expects it to be rejected
  - [ ] Covers what real Polar does: redelivery of the same event, events out of order (`subscription.revoked` before `subscription.active`), an unknown `referenceId`
  - [ ] Real-delivery check: before billing work is called done, run one sandbox checkout with webhooks delivered through `bun run start:localproxy`, and compare the resulting DB state with what the simulated event produced
- [ ] Each tool has a test in `bun run verify` that checks it against the real code path

## Skills

Repo skills use the generic Agent Skills format, so each skill has one canonical copy any harness can use. Harness-specific wiring lives in adapters outside the skill directory. Only Claude Code is in use and tested for now.

### Format

- [x] `.agents/skills/<skill-name>/` is the canonical location, with one self-contained directory per skill: `SKILL.md`, plus optional `scripts/`, `references/` and `assets/`
- [x] The directory name matches the `name` field (lowercase letters, digits and hyphens)
- [x] `SKILL.md` frontmatter has only `name` and `description`. The description says what the skill does and when to use it. Detail goes in `references/`, so `SKILL.md` stays short
- [x] Instructions use only repo-relative paths, standard shell commands, `bun run` scripts and scripts in the skill's `scripts/` directory. No harness tool names (`Read`, `Bash`, MCP tool ids), slash commands or `~/.claude` paths
- [x] Anything harness-specific (e.g. Claude Code `allowed-tools`, an MCP server) lives in that harness's adapter or is marked optional in the text, with a shell fallback
- [x] `bun run skills:check` validates every skill (frontmatter fields, name matches directory, no harness-only keys) and checks that every adapter link resolves. It is part of `bun run verify`

### Adapters

- [x] Claude Code: `.claude/skills/<name>` is a relative symlink to `../../.agents/skills/<name>`, the same pattern as `~/.claude/skills` → `~/.agents/skills`. Permissions a skill needs go in `.claude/settings.json`
- [x] `bun run skills:link` (re)creates the adapter symlinks, so adding a skill is: create the directory, run the script
- [ ] Later, when another harness is used: check whether it discovers `.agents/skills/` itself or needs an adapter (e.g. Cursor via `.cursor/skills/`)

### Migration

- [x] Move `playwright-cli` to `.agents/skills/` (`bunx playwright-cli install --skills agents`), symlink it from `.claude/skills/` and update the regenerate note under [Browser](#browser). It is generated upstream, so it is exempt from the format rules (it keeps its `allowed-tools`); `skills:check` skips it

### Repo Skills

- [ ] `e2e-test`: seed a scenario, log in, drive the browser, check the DB and email (uses the [sinwy-dev Toolkit](#sinwy-dev-toolkit))
  - [ ] Tells the agent to treat the toolkit as a stand-in to be checked, not trusted: if the toolkit's result looks wrong, or the toolkit could hide a bug, check it against the source of truth (Polar docs and SDK types, Better Auth docs, the real sandbox)
  - [ ] When the toolkit and the real behaviour disagree, fix the toolkit; never change app code to fit the toolkit
  - [ ] The final report lists what was simulated (webhooks, email) and which real checks remain, such as the sandbox delivery check, instead of reporting simulated passes as done
- [ ] Candidates, confirm before building: `db-migration` (edit `Sinwy.Backend/db/schema/`, `db:generate`, review the SQL, `db:migrate`), `backend-module` (module layout, `index.ts` public API, Zod DTOs)

## Setup Docs

- [ ] Document which environment variables to export for agents and how to start the stack
- [x] `CLAUDE.md` names `.agents/skills/` as the home for new skills and says to run `bun run skills:link` after adding one
