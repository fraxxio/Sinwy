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

2. **Configure environment** — copy the backend env template and fill in the values (Postgres credentials, Polar/Resend/auth keys):

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
