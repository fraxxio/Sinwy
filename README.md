# Sinwy

Platform to upload your service business online.

## Tech Stack

- **Runtime / package manager:** [Bun](https://bun.com)
- **Backend** (`Sinwy.Backend`): custom lightweight HTTP framework on `Bun.serve`, [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL, [Better Auth](https://better-auth.com), [Polar](https://polar.sh) (billing), [Resend](https://resend.com) (email)
- **Frontend** (`Sinwy.WebFrontend`): React 19, [TanStack Start](https://tanstack.com/start) (Router, Query, Form), Vite, Tailwind CSS 4, shadcn/Base UI
- **Shared** (`Sinwy.Shared`): shared TypeScript types, imported as `@sinwy/shared`
- **Tooling:** TypeScript, Biome (format + lint), Zod for validation, Docker Compose for the local database

## Workspace Layout

```
Sinwy/
├── Sinwy.Backend/      # Bun HTTP server (@sinwy/backend)
├── Sinwy.Shared/       # Shared TypeScript types (@sinwy/shared)
├── Sinwy.WebFrontend/  # TanStack Start frontend (@sinwy/webfrontend)
└── docs/               # Architecture & roadmap docs
```

## Prerequisites

- [Bun](https://bun.com) v1.3+
- Docker (for local PostgreSQL)
- [ngrok](https://ngrok.com) (only if you need Polar webhooks locally — see below)

## Local Setup

1. **Install dependencies** (repo root):

   ```bash
   bun install
   ```

2. **Configure environment** — copy the backend env template and fill in the values (Postgres credentials, Polar/Resend/auth keys). Values left empty fall back to their defaults:

   ```bash
   cp Sinwy.Backend/.env.example Sinwy.Backend/.env
   ```

3. **Start PostgreSQL** (Docker):

   ```bash
   bun db:up
   ```

4. **Run database migrations:**

   ```bash
   bun db:migrate
   ```

5. **Start everything:**

   ```bash
   bun start
   ```

   The frontend runs on http://localhost:3000; the backend port comes from your `.env`. To run one side only:

   ```bash
   bun start:web      # frontend only
   bun start:server   # backend only
   ```

### Polar webhooks (optional)

Polar can't reach `localhost`, so webhook testing needs a public HTTPS tunnel. We use ngrok with a static domain (free tier includes one):

1. Sign up at [ngrok](https://ngrok.com), claim your free static domain, and run `ngrok config add-authtoken <token>`.
2. Add a named tunnel to your ngrok config (`ngrok config check` shows its path):

   ```yaml
   tunnels:
     sinwy:
       proto: http
       addr: 3001 # your backend port
       domain: <your-static-domain>.ngrok-free.dev
   ```

3. Point the webhook URL in Polar's dashboard at `https://<your-static-domain>.ngrok-free.dev/api/auth/polar/webhooks` and put its signing secret in `POLAR_WEBHOOK_SECRET`.
4. Start the tunnel alongside the backend:

   ```bash
   bun start:localproxy
   ```

## AI Agents

Agents work against the local stack: the DB through `psql`, the browser through `bunx playwright-cli`, Polar sandbox and docs through the MCP servers in `.mcp.json`, and the dev toolkit (`bun run dev:*`). The plan and the reasoning behind it are in [docs/ai-agent-tooling.md](docs/ai-agent-tooling.md).

### One-time setup

1. Do the [Local Setup](#local-setup) above. The backend `.env` must hold only local and sandbox values, because agents run the backend and tests that load it:
   - `NODE_ENV=local`, `POLAR_SERVER=sandbox` and a local Postgres
   - `EMAIL_DRIVER=console` (the default for `local`), so emails go to `Sinwy.Backend/.emails/` for `bun run dev:last-email`
   - `SEED_EMAIL_BASE`: an address on a domain that receives mail, for `bun run dev:seed-scenario`
2. Create the agent DB roles and write `~/.pg_service.conf` and `~/.pgpass` (again after recreating the Docker volume):

   ```bash
   bun run db:agent:setup
   ```

3. The Polar sandbox MCP server logs in with OAuth in the browser the first time an agent uses it.

Skills live in `.agents/skills/`; the `.claude/skills/` links are committed, so a clone needs no extra step. Run `bun run skills:link` after adding or removing a skill.

### Environment variables

Export these in the shell that starts the agent only if Chromium isn't at `/run/current-system/sw/bin/chromium`:

| Variable | Used by |
| --- | --- |
| `CHROMIUM_PATH` | Chrome DevTools MCP server (`.mcp.json`) |
| `PLAYWRIGHT_MCP_EXECUTABLE_PATH` | `bunx playwright-cli` (overrides `.playwright/cli.config.json`) |

Nothing else needs exporting: the backend and the dev tools read `Sinwy.Backend/.env`, `psql` reads its service file, and the remote MCP servers need no keys.

### Starting the stack

```bash
bun run db:up
bun run start:server   # backend on PORT (3001)
bun run start:web      # frontend on http://localhost:3000
```

Run the two servers as separate long-running processes, each with its output in a log file the agent can read, rather than `bun start`, which mixes both logs. Add `bun run start:localproxy` only for real Polar webhook deliveries (see above). The `e2e-test` skill (`.agents/skills/e2e-test/`) covers checking what is already running, seeding and logging in.

## Common Scripts

All run from the repo root.

| Command | Description |
| --- | --- |
| `bun start` / `start:web` / `start:server` | Run app (all / frontend / backend) |
| `bun start:localproxy` | ngrok tunnel for Polar webhooks (needs setup above) |
| `bun run build` | Build all workspaces |
| `bun run test` / `test:web` / `test:server` | Run tests |
| `bun typecheck` | TypeScript type check (`--watch` via `typecheck:watch`) |
| `bun check` / `bun check:fix` | Biome lint + format check / auto-fix |
| `bun db:up` / `bun db:down` | Start / stop local PostgreSQL |
| `bun db:generate` / `bun db:migrate` | Generate / apply Drizzle migrations |
| `bun auth:schema:generate` | Regenerate the Better Auth schema |

## Further Reading

- `CLAUDE.md` — architecture conventions (module pattern, code style)
- `docs/` — design rules, docs
