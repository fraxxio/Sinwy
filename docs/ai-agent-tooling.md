# AI Agent Tooling

Tools an AI agent (Claude Code) could connect to so it can inspect, test and change every part of Sinwy, including the services outside the repo. This is a list only. Nothing here is set up yet.

Researched September 2026. Commands and URLs come from each vendor's docs. Check them again when you install.

## Summary

| # | Area | Tool | Type | Priority |
|---|------|------|------|----------|
| 1 | Database | Postgres MCP Pro (`crystaldba/postgres-mcp`) | MCP (local) | Must |
| 2 | Billing | Polar MCP, **sandbox** endpoint | MCP (remote, OAuth) | Must |
| 3 | Browser / E2E | Playwright MCP | MCP (local) | Must |
| 4 | Users, orgs, sessions, webhooks | **Custom `sinwy-dev` toolkit** (see [Gaps](#gaps-custom-tooling-to-build)) | MCP or CLI in repo | Must |
| 5 | Browser debugging | Chrome DevTools MCP | MCP (local) | Should |
| 6 | Email | Resend MCP / Claude Code plugin | MCP (remote, OAuth) | Should |
| 7 | Webhook tunnel | ngrok local agent API (`127.0.0.1:4040/api`) | HTTP via Bash | Should |
| 8 | Library docs | Context7 MCP + Better Auth docs MCP | MCP (remote) | Should |
| 9 | UI components | shadcn MCP | MCP (local) | Nice |
| 10 | Auth API discovery | Better Auth `openAPI` plugin | App plugin | Nice |
| 11 | API collections | Bruno CLI (`@usebruno/cli`) | CLI | Nice |
| 12 | Repo / PRs / CI | `gh` CLI (installed) or GitHub MCP | CLI / MCP | Nice |
| 13 | Containers | Docker CLI (already used by `db:up`) | CLI | Have |
| 14 | Lint, types, tests, migrations | `bun run verify`, `drizzle-kit` | CLI | Have |

"Have" means the agent can already use it through Bash.

---

## 1. Database: PostgreSQL 18 (Docker) + Drizzle

**Postgres MCP Pro**: [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp)
- Runs SQL, lists schemas and tables, runs `EXPLAIN`, gives index advice and health checks.
- Has two modes. Use `--access-mode=unrestricted` for the local dev DB so the agent can insert, update and delete. Use `restricted` (read-only) for any shared or remote DB.
- Connects with the `DATABASE_URI` env var. Build it from the same `POSTGRES_*` values the backend uses.
- Runs with `uvx postgres-mcp` or its Docker image.

**Alternative**: [DBHub](https://github.com/bytebase/dbhub). It's lighter, and one config covers several database engines.

**Do not use** `@modelcontextprotocol/server-postgres`. It has been deprecated since December 2024 and has a known way to bypass its read-only mode.

**Already usable from Bash (no MCP needed):**
- `docker exec -it postgres-dev psql -U <user> -d <db>` for ad-hoc SQL
- `bun db:generate` / `bun db:migrate`, plus `drizzle-kit check` and `drizzle-kit push`
- `bun db:ui` (Drizzle Studio) is a UI for humans. An agent gets nothing from it.

Things the agent can inspect here: `user`, `account`, `session`, `verification`, `organization` (`status`, `industry`, `onboardingCompletedAt`), `member`, `invitation`, plus any tables the Polar plugin adds.

## 2. Billing: Polar (sandbox)

**Polar MCP**: official and remote, with OAuth login. [Docs](https://polar.sh/docs/integrate/mcp)

```bash
claude mcp add --transport http polar-sandbox https://mcp.polar.sh/mcp/polar-sandbox
# then /mcp → authenticate
```

About 100 operations, loaded on demand through `search_tools`, `describe_tools` and `execute_tool`:
- **Products and prices**: create or edit the Starter, Professional and Enterprise plans.
- **Checkouts**: create checkout sessions and links, and inspect them.
- **Customers**: list, create, delete, and map to external IDs. Sign-up creates a customer through `createCustomerOnSignUp`.
- **Subscriptions**: list, update, revoke. Revoking fires `onSubscriptionRevoked`, which flips the org back to `inactive`.
- **Orders, refunds, invoices, discounts, benefits, meters, custom fields, seats**
- **Webhooks**: manage endpoints, list deliveries, **redeliver events**
- **Organization**: read and update settings

**Only connect the sandbox endpoint.** Add the production endpoint (`/mcp/polar-mcp`) separately, and only when you really need it.

**What the MCP can't do, and the fallback:**
- **Dashboard-only settings**: the agent uses Playwright MCP on `sandbox.polar.sh`, logged in with your sandbox account.
- **Completing a payment**: the agent opens the checkout URL in Playwright and pays with Stripe's test card `4242 4242 4242 4242` (any future date, any CVC). That runs the whole real flow end to end: checkout → webhook → org becomes `active` → `/checkout/success`.
- **Product IDs in `.env`**: if the agent creates or replaces products, the IDs in `POLAR_PRODUCT_STARTER`, `POLAR_PRODUCT_PROFESSIONAL` and `POLAR_PRODUCT_ENTERPRISE` must be updated to match.

**Extra:** [polarsource/skills](https://github.com/polarsource/skills) has official Claude skills for Polar integration patterns.

## 3. Browser and frontend: TanStack Start, React 19, Vite

**Playwright MCP**: [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
```bash
claude mcp add playwright -- bunx @playwright/mcp@latest
```
- Runs the real user flows: sign-up → verify email → post-login routing → create org → checkout → onboarding wizard → dashboards.
- Can load session cookies so it skips the login UI (see the `login-as` tool under [Gaps](#gaps-custom-tooling-to-build)).
- Can also drive third-party dashboards: Polar sandbox, and the Resend and Google consoles.

**Chrome DevTools MCP**: [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
```bash
claude mcp add chrome-devtools -- bunx chrome-devtools-mcp@latest
```
- Gives the agent the console, network requests (including `/api/auth/*` calls), performance traces, screenshots and DOM snapshots.
- The TanStack Router and Query devtools are already in the page, so the agent can read them through either browser MCP.

**shadcn MCP**: built into the `shadcn` CLI (v4.13 is installed).
```bash
bunx shadcn@latest mcp init --client claude
```
- Browses the component registry and adds components that match `components.json`.

## 4. Auth, users and organizations: Better Auth 1.6

No MCP can act on the app's auth data. The [Better Auth MCP](https://better-auth.com/docs/ai-resources/mcp) only searches the docs:
```bash
bunx auth@latest mcp --claude-code
```

Building blocks that already exist:
- **`test-utils` plugin** (ships with better-auth 1.6.11): `createUser`, `saveUser`, `saveOrganization`, `addMember`, `deleteUser`, `deleteOrganization`, `login({ userId })` (returns headers, cookies and token), `getAuthHeaders`, `getCookies`, plus `getOTP` / `clearOTPs`. This is the natural base for agent seeding and "login as" tools. Enable it for dev only.
- **`admin` plugin**: HTTP endpoints to create users, list and search users, set passwords, ban and unban, **impersonate**, and list or revoke sessions. It changes the product (it needs an admin role), so decide on it separately.
- **`openAPI` plugin**: serves an OpenAPI reference for every `/api/auth/*` endpoint, including the organization and Polar plugin routes. The agent can use it to discover endpoints instead of reading library source.
- **Existing test helpers** in [Sinwy.Backend/test/helpers.ts](../Sinwy.Backend/test/helpers.ts): `createUserWithSession`, `insertOrganization`, `joinOrganization` and `sessionCookie` (forges signed session cookies). They're already proven to work, but they only exist for tests.

Watch out: real sign-up through `/sign-up/email` calls Polar (`createCustomerOnSignUp`), so every test user also creates a sandbox customer. Seeding straight into the DB skips that.

**Google OAuth:** no workable automation.
- Google blocks automated logins, and there's no supported API or CLI for standard OAuth web clients.
- The agent tests with email/password users or forged sessions. Changes to the Google console stay manual, or the agent does them through Playwright with you watching.

## 5. Email: Resend and console driver

**Local (`EMAIL_DRIVER=console`, the default for `local`/`test`)**
- The email logger prints `to`, `subject` and `props`, and the props include `verifyUrl`, `resetUrl`, `confirmUrl` and `deleteUrl`.
- The agent can already read these links from backend output when it runs `bun start:server` as a background process.

**Resend MCP**: official. [Docs](https://resend.com/docs/mcp-server), [repo](https://github.com/resend/resend-mcp)
```bash
claude plugin install resend@claude-plugins-official
# or: claude mcp add --transport http resend https://mcp.resend.com/mcp
```
- Covers sent-email logs and status, domains and DNS checks, templates, contacts, broadcasts and inbound email.
- Useful when `EMAIL_DRIVER=resend` (the dev/prod-like setup) and to check `RESEND_EMAIL_DOMAIN`.

## 6. Webhooks and the local tunnel: ngrok

**ngrok agent API**: built in, no MCP needed. While `bun start:localproxy` runs, the agent can call it with `curl`:
- `GET http://127.0.0.1:4040/api/tunnels`: the public URL
- `GET http://127.0.0.1:4040/api/requests/http`: every webhook Polar sent, with headers and body
- `POST http://127.0.0.1:4040/api/requests/http` with `{"id": "..."}`: **replay** a webhook

Together with Polar MCP redelivery, the agent can debug `onSubscriptionActive` and `onSubscriptionRevoked` without waiting for a real payment.

## 7. Backend HTTP API: custom `Bun.serve` framework

- `curl` via Bash with a session cookie. It covers everything once `login-as` exists.
- **Bruno CLI** (`bunx @usebruno/cli run`) runs the collection in [Sinwy.Backend/apiRequests/](../Sinwy.Backend/apiRequests/). That collection is only a placeholder right now. It's only worth keeping if it becomes a real suite of requests.

## 8. Logs, processes and storage

- **Processes**: Claude Code can run `bun start:server` and `bun start:web` as background tasks and read their output.
- **Logs**: the logger only has a `console` transport, and `LOG_LEVEL=debug` shows Better Auth internals. There's no log history once the process restarts (see [Gaps](#gaps-custom-tooling-to-build)).
- **Storage**: `STORAGE_DRIVER=local` writes to `Sinwy.Backend/.storage`, which the agent can read directly. If this moves to S3 or R2 later, add that provider's MCP (AWS or Cloudflare).
- **Docker**: `docker ps`, `docker logs postgres-dev`, `bun db:down`, `bun db:up`. [Docker MCP Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/) is optional. The CLI is enough for one container.

## 9. Code, repo and docs

- **Checks**: `bun run verify` (Biome, `tsc` and `bun test`) already works.
- **GitHub**: `gh` is installed and authenticated. The [GitHub MCP](https://github.com/github/github-mcp-server) only adds a structured interface on top.
- **Context7 MCP**: current docs for TanStack Start, Router, Query and Form, Drizzle, Zod 4, Tailwind 4 and Base UI.
  ```bash
  claude mcp add --transport http context7 https://mcp.context7.com/mcp
  ```

---

## Gaps: custom tooling to build

Off-the-shelf tools can't do the following. Build them as one dev-only `sinwy-dev` MCP server, or as `bun` scripts in the repo. They reuse the app's own services, config and the Better Auth `test-utils` plugin.

| Tool | What it does | Why it's needed |
|------|--------------|-----------------|
| `seed-scenario` | Creates a verified user, optionally with an org (`inactive`/`active`, onboarding done or not), members with a role, and extra users | Sets up any state in the flow map in one call, without touching Polar |
| `login-as <userId>` | Returns a session cookie and a Playwright storage-state file | curl and the browser can act as any user or role immediately |
| `last-email <to>` | Returns the latest captured email (subject and links) for a recipient | Verification, reset, change-email and delete flows without scraping logs. Needs a capture email driver (a file or in-memory store). |
| `simulate-polar-webhook <event> <orgId>` | Signs a Standard Webhooks payload with `POLAR_WEBHOOK_SECRET` and POSTs it to `/api/auth/polar/webhooks` | Tests `subscription.active` and `subscription.revoked` offline, with no ngrok or real checkout |
| `set-org-status` / `reconcile-org` | Forces or re-derives org status (see `modules/organizations/reconcileStatus.ts`) | Recovers from mismatches between the DB and Polar |
| `reset-db` | Drops and re-migrates the local DB, then optionally seeds a baseline | Clean runs that repeat the same way every time |
| `logs --scope <s> --since <t>` | Queries structured logs | Needs a JSON or file log transport next to `console` |
| `sync-polar-products` | Reads sandbox products and prints the right `POLAR_PRODUCT_*` values | Keeps `.env` in sync after the agent changes products |

## Safety rules for the setup phase

- **Sandbox only.** Use a Polar sandbox org token or OAuth, a Resend key scoped to a test domain, and the local DB only. Never give unrestricted DB access to anything except local Docker.
- **Secrets.** [.claude/settings.json](../.claude/settings.json) blocks the agent from reading `.env`, so MCP servers need their credentials through their own config (`env` in `.mcp.json` or user-scoped `claude mcp add -e`). Don't lift the deny rule.
- **Dev-only code.** `test-utils`, the capture email driver and the custom toolkit must only load when `NODE_ENV` is `local`, `dev` or `test`, and must never ship to prod.
- **Project scope.** Put shared servers in `.mcp.json` (checked in, no secrets) and personal or credentialed ones in user scope.

## Suggested rollout order

1. Postgres MCP Pro + Playwright MCP (inspect data and drive the UI)
2. Polar sandbox MCP (billing state and webhook redelivery)
3. Custom `sinwy-dev` toolkit: `seed-scenario`, `login-as`, `last-email`, `simulate-polar-webhook`
4. Chrome DevTools MCP, Context7, Resend MCP
5. Everything else as needed

## Sources

- [Polar over MCP](https://polar.sh/docs/integrate/mcp)
- [polarsource/skills](https://github.com/polarsource/skills)
- [Resend MCP server](https://resend.com/docs/mcp-server), [resend/resend-mcp](https://github.com/resend/resend-mcp), [Resend Claude Code plugin](https://resend.com/changelog/resend-claude-code-plugin)
- [Better Auth MCP](https://better-auth.com/docs/ai-resources/mcp)
- [Top open-source Postgres MCP servers (Bytebase)](https://www.bytebase.com/blog/top-open-source-postgres-mcp-servers/), [Best Postgres MCP servers 2026](https://datamcp.app/blog/best-postgres-mcp-2026)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
