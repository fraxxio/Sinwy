## Commands

All commands run from the repo root unless noted. The runtime is **Bun** — use `bun` (not `npm`/`npx`).

## Workspace Layout

```
Sinwy/
├── Sinwy.Backend/      # Bun HTTP server (@sinwy/backend)
├── Sinwy.Shared/       # Shared TypeScript types (@sinwy/shared)
├── Sinwy.BusinessFrontend/   # (not yet implemented)
├── Sinwy.PlatformFrontend/   # (not yet implemented)
└── docs/               # Architecture & roadmap docs
```

`Sinwy.*` workspaces are declared in the root `package.json`. Shared code lives in `@sinwy/shared` (imported by the backend as a workspace dep).

## Backend Architecture

The backend is a custom lightweight HTTP framework built on top of Bun's native `Bun.serve`, **not Hono or Express**. It lives in `Sinwy.Backend/lib/app/`.

**Request lifecycle:**

```
Bun.serve → IApp.route() → compose(globalMiddlewares + routeMiddlewares) → Handler → Response
```

- `IApp` (`lib/app/types.ts`) — interface: `.use()` for middleware, `.route()` for routes, `.listen()` to start
- `ReqContext` (`lib/app/index.ts`) — request context object; carries typed key-value store via `set()`/`get()` (typed through `ReqContextValues` in `lib/sharedTypes.ts`)
- `compose()` — middleware chaining (Koa-style `next()`)

**Module pattern** (`modules/<name>/`):

Each module exposes its public API through `index.ts` and registers routes via a `register*Routes(app: IApp)` function called in `index.ts` (root entry point). Internal files follow the thin-controller pattern:

```
routes.ts       → parse/validate → call service → return response
controller.ts   → (optional, same as above for complex cases)
service.ts      → business logic, orchestration, permission checks
repository.ts   → Drizzle DB queries only, returns DB entities
dto.ts          → API request/response shapes (NOT DB entities)
mapper.ts       → DB entity → DTO conversion
schemas.ts      → Zod validation schemas
errors.ts       → typed domain errors
```

Cross-module imports must go through each module's `index.ts`. Never import from internal paths of another module. Never access another module's repository directly — call its service.

**Path aliases** (defined in `Sinwy.Backend/import_map.json` and `tsconfig.json`):

| Alias | Resolves to |
|---|---|
| `@db` | `./db` |
| `@db/*` | `./db/*` |
| `@config` | `./lib/appConfig.ts` |
| `@authModule` | `./modules/auth` |
| `@backend/*` | `./*` |

## Database

- **ORM:** Drizzle ORM with `drizzle-orm/bun-sql` (Bun's native SQL client)
- **DB:** PostgreSQL (local dev via Docker Compose in `Sinwy.Backend/docker-compose.yml`)
- **Schema files:** `Sinwy.Backend/db/schema/*.ts` — one file per domain table group
- **Migrations output:** `Sinwy.Backend/drizzle/`
- **Config:** `Sinwy.Backend/drizzle.config.ts`

## Code Style

- **Formatter/linter:** Biome (tabs, double quotes for JS/TS strings)
- **Validation:** Zod everywhere; infer DTO types from schemas (`z.infer<typeof schema>`)
- **Style:** prefer plain functions over classes; keep services functional
- **DB types:** use Drizzle inferred types (`$inferSelect`, `$inferInsert`) for internal DB entities, never expose them directly to API consumers — map to DTOs first
- Avoid premature abstractions; split files only when complexity justifies it
