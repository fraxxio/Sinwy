## Commands

All commands run from the repo root unless noted. The runtime and package manager is **Bun** — use `bun` (not `npm`/`npx`).

- `bun run verify` — Biome check, skill check, type check of every workspace and all tests; the one command to run before calling work done. Run it once, after the last code change.
- `bun run check` / `bun run typecheck` / `bun run test` — the individual steps. `bun run verify:full` runs them all with unfiltered output.

Agent setup, environment variables and starting the stack: the AI Agents section of `README.md`.

When running linters, type checks or tests, never truncate their output (`tail`, `head`, `grep`) before reading it. Report the exit code and the full diagnostics. Only say "clean" or "passing" when the command exited 0.

`bun run verify` prints its own summary, which is the one exception: on a pass it prints Biome and type-check output in full, test totals, the distinct WARN/ERROR messages each test file logged, and any output not from the app logger; a failing step is printed in full. Read all of it. A logged error that doesn't fit the test that logged it, or new "other output", is a finding even when everything passes. The full log is in `.verify.log`.

Read code in parts: find it with `grep -n`, then read only the line ranges you need. When a tool's output overflows to a file, grep that file; never read it in full.

Use `psql` with the service entries created by `bun run db:agent:setup`. Never pass connection strings or passwords.

- Reads: `psql service=sinwy_ro -c "<sql>"` (read-only role)
- Writes: `psql service=sinwy_rw -c "<sql>"` (data changes only; schema changes go through Drizzle migrations)
- Always add `LIMIT` and select only the columns you need. Table definitions live in `Sinwy.Backend/db/schema/`.

Drive the browser with `bunx playwright-cli` (see the `playwright-cli` skill, which writes the command without `bunx`). Use the Chrome DevTools MCP only for performance traces, Lighthouse audits and memory debugging, if it's disabled ask user to enable it.

New repo skills go in `.agents/skills/<name>/`, never directly in `.claude/skills/`. A skill holds only `SKILL.md`, `scripts/`, `references/` and `assets/`; frontmatter has only `name` (lowercase-hyphenated, at most 64 characters), `description` (at most 1024) and optionally `disable-model-invocation: true` for skills only the user starts; no `~/.claude` paths or MCP tool ids in the text. Run `bun run skills:link` after adding or removing one; `bun run skills:check` validates them.

## Workspace Layout
```
Sinwy/
├── Sinwy.Backend/      # Bun HTTP server (@sinwy/backend)
├── Sinwy.Shared/       # Shared TypeScript types (@sinwy/shared)
├── Sinwy.WebFrontend/  # Tanstack Start frontend (@sinwy/webfrontend)
└── docs/               # Architecture & roadmap docs
```

`Sinwy.*` workspaces are declared in the root `package.json`. Shared code lives in `@sinwy/shared` (imported by the other projects as a workspace dep).

## Backend Architecture

The backend is a custom lightweight HTTP framework built on top of Bun's native `Bun.serve`, **not Hono or Express**. It lives in `Sinwy.Backend/lib/app/`.

**Module pattern** (`modules/<name>/`):
Each module exposes its public API through `index.ts`.
Cross-module imports must go through each module's `index.ts`. Never import from internal paths of another module. Never access another module's repository directly — call its service.

**Path aliases** (defined in `Sinwy.Backend/import_map.json` and `tsconfig.json`):

## Frontend Architecture

`Sinwy.WebFrontend/src/shared/` must never import from `src/modules/`. Cross-cutting infrastructure (e.g. the Better Auth client in `shared/lib/auth/`) lives in `shared/`; modules depend on shared, not the other way around.

## Code Style
- **Formatter/linter:** Biome (tabs, double quotes for JS/TS strings)
- **Validation:** Zod everywhere; infer DTO types from schemas (`z.infer<typeof schema>`)
- **Style:** prefer plain functions over classes; keep services functional
- **DB types:** use Drizzle inferred types (`$inferSelect`, `$inferInsert`) for internal DB entities, never expose them directly to API consumers — map to DTOs first
- Avoid premature abstractions; split files only when complexity justifies it
- Follow modular monolith and vertical slice architecture patterns
- Avoid long paragraphs of comments on code, if we need to write such long comments think of new solution that wouldn't need such comments.
- Don't add comments specific to the current conversation session for example explaning what you did or why you did it, comments should be added only when absolutely necessary.
