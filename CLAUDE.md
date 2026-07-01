## Commands

All commands run from the repo root unless noted. The runtime and package manager is **Bun** — use `bun` (not `npm`/`npx`).

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

## Code Style

- **Formatter/linter:** Biome (tabs, double quotes for JS/TS strings)
- **Validation:** Zod everywhere; infer DTO types from schemas (`z.infer<typeof schema>`)
- **Style:** prefer plain functions over classes; keep services functional
- **DB types:** use Drizzle inferred types (`$inferSelect`, `$inferInsert`) for internal DB entities, never expose them directly to API consumers — map to DTOs first
- Avoid premature abstractions; split files only when complexity justifies it
- Follow modular monolith and vertical slice architecture patterns
