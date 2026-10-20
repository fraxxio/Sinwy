# AI Agent Tooling: Implementation Phases

How to implement [ai-agent-tooling.md](ai-agent-tooling.md). Each phase is one agent session that covers one domain. Start a session with: "Implement Phase N of `docs/ai-agent-tooling-phases.md`."

## Session Rules

1. Before starting, read `docs/ai-agent-tooling.md`, this file (including the notes from earlier phases) and `CLAUDE.md`. Confirm the previous phase is finished: its items are ticked and `bun run verify` exits 0. If it isn't, stop and tell the user.
2. Work only on this phase. If you find something that belongs to another phase, or that the plan is missing, add it as an unchecked item in `ai-agent-tooling.md` and leave it for that phase.
3. Tick an item in `ai-agent-tooling.md` only when it is done and you have checked that it works. If an item turns out to be wrong or unnecessary, change or remove it and give the reason in the notes.
4. Write short notes under the phase's **Notes** heading for anything a later session needs: decisions and why you made them, where things live, commands, surprises, and anything left unverified. Don't repeat the checklist.
5. Stop and ask the user when a step needs them: logging in to Polar in a browser, `.env` values, or a choice the plan leaves open.
6. Finish with `bun run verify` exiting 0, then summarize the changes for the user in compact manner. Note if anything needs to be by the user manually or is everyhing done and next phase can be done now.
7. Commit code changes after each phase is done.

## User Tasks

Agents can't read `.env`, so these are for the user:

- Remove `RESEND_API_KEY` from the local backend `.env`, or replace it with a sending-only key for a dev domain
- Confirm the Google OAuth client in `.env` is a dev client
- Hosted dev DB: add `sslmode=require` to its service entry when one is used

## Phase 1: Skills Infrastructure

Plan items: Skills > Format, Adapters, Migration; the `CLAUDE.md` skills item under Setup Docs.

- Create `.agents/skills/`. Put the repo tooling scripts (`skills:check`, `skills:link`) in a root `scripts/` directory, since they aren't backend code, and add `skills:check` to `verify`.
- `skills:link` creates a relative symlink in `.claude/skills/` for each skill and removes links whose target is gone. Running it twice changes nothing.
- Migrate `playwright-cli` with `bunx playwright-cli install --skills agents`. Check where it writes, remove the old `.claude/skills/playwright-cli`, run `skills:link`, then update the Browser section of the plan.
- Check `skills:check` against a deliberately broken skill in a temporary directory: it must fail with a clear message. Then delete that skill and confirm the real skills pass.
- Claude Code reads skills when a session starts, so this session can't confirm it finds the symlinked skill. Leave that for Phase 2.

**Notes**

- Scripts: `scripts/checkSkills.ts` and `scripts/linkSkills.ts` export `checkSkills(root)` / `linkSkills(root)` and run against the repo root when executed. `scripts/skills.test.ts` covers them against temp directories (broken frontmatter, name mismatch, missing/dangling/misdirected links, idempotent linking).
- `verify` now runs `skills:check` after Biome; `test` runs `test:scripts` (`bun test ./scripts`, the `./` keeps it from matching `Sinwy.Backend/scripts`); `typecheck` includes `tsc -p scripts`.
- `scripts/` needed Bun types, so `@types/bun` is a root dev dependency. That puts it in the root `node_modules/@types`, which every workspace would pick up, so `Sinwy.Shared/tsconfig.json` now sets `"types": []` to keep Bun globals out of browser-shared code. The frontend already limits `types`.
- Upstream skills that skip the format checks are listed in `upstreamSkills` in `checkSkills.ts` (only `playwright-cli`); their adapter link is still checked.
- Beyond the plan, `skills:check` also flags unexpected top-level entries in a skill directory and `~/.claude` paths or `mcp__` tool ids in any `.md` file. Other harness-neutral rules (no tool names, slash commands) aren't machine-checked; review for them.
- `skills:link` refuses to replace a real directory in `.claude/skills/` and only deletes symlinks that no longer resolve.
- `playwright-cli install --skills agents` writes `.agents/skills/playwright-cli/` (identical to the old `.claude` copy for 0.1.22) and also downloads Chrome for Testing (~190 MiB) to `~/.cache/ms-playwright`; `.playwright/cli.config.json` was left untouched.
- Checked manually: a broken skill in `.agents/skills/tmp-broken` made `skills:check` exit 1 with one line per problem (unlinked, linked, then dangling after deletion); after `skills:link` removed the dangling link the real skills passed.
- Added an unchecked Browser item: the skill's `allowed-tools` (`Bash(playwright-cli:*)`) doesn't match the `bunx playwright-cli` form `CLAUDE.md` asks for, so those calls still prompt.
- Unverified: whether Claude Code discovers the symlinked skill (Phase 2).

## Phase 2: Session and Email Tools

Plan items: sinwy-dev Toolkit > `login-as`, `last-email`.

- First, confirm that `playwright-cli` appears in this session's skill list, which proves Claude Code follows the Phase 1 symlink. Write the result in the notes.
- Decide where the toolkit lives and how it is run, and record the decision. Suggestion: `Sinwy.Backend/scripts/dev/<tool>.ts`, exposed as root `bun run dev:<tool>` scripts. Every tool calls `assertLocalDev` first and imports other modules only through their `index.ts`.
- `login-as` creates the session through the Better Auth server API. It prints the cookie for API calls and can write a Playwright storage-state file under `.playwright-cli/` for browser tests. A test shows the session works against a protected endpoint.
- `last-email`: the console driver (`infrastructure/email/consoleEmailClient.ts`) only logs to stdout, which an agent may not be able to read. Decide how the tool gets the emails (e.g. the console driver also writes each email as JSON to a gitignored directory) and record the decision.

**Notes**

- `playwright-cli` appears in this session's skill list, so Claude Code follows the `.claude/skills/` symlink.
- Toolkit: `Sinwy.Backend/scripts/dev/<tool>.ts`, run from the repo root as `bun run dev:<tool>` (no `cd`, so relative paths resolve against the root; the backend tsconfig aliases still apply). Each file exports a function for tests and runs its CLI under `import.meta.main`, which calls `assertLocalDev` first (it rejects `NODE_ENV=test`, so tests call the function). Tests live in `scripts/dev/tests/` and run with `test:server`.
- `login-as` calls `testUtils().init(await auth.$context)` from Better Auth's `testUtils` plugin (`better-auth/plugins`) and then `test.login`: `internalAdapter.createSession` and Better Auth's own cookie signing, on the app's own auth context. The plugin is never added to the app's auth config (its docs advise against that). A second `betterAuth` instance with the plugin failed to type-check under `exactOptionalPropertyTypes`; `init()` needs an `as unknown as AuthContext` widening instead. It refuses unverified users (real sign-in would too), checks the cookie with `auth.api.getSession` and prints JSON with `cookie`. `--state` writes `.playwright-cli/auth/<userId>.json` with the cookie domain set to the `WEB_APP_URL` host; load it with `playwright-cli state-load <file>`. Unlike a real sign-in, the session has empty `ipAddress`/`userAgent`.
- `last-email`: the console driver now also writes each email (subject, rendered `html`, props) as JSON to `EMAIL_OUTBOX_DIR` (default `Sinwy.Backend/.emails`, gitignored; tests use a temp dir). File names are UUIDv7, so sorting gives the send order. The tool prints the newest matches without `html`, with `links` (hrefs from the html) and `file` for the full body. Nothing prunes the directory; delete it when it gets large.
- Checked manually against the running stack (2026-10-19): the `login-as` cookie got 200 from `/api/user/flags` (401 without it); after `state-load`, `/auth/postlogin` took the browser to the user's org dashboard; a password-reset request made over HTTP showed up in `last-email` with its link.
- `test/helpers.ts` still forges session cookies with hand-rolled HMAC for the existing tests. `testUtils` login could replace that later; it's out of scope here.

## Phase 3: Polar Webhooks

Plan items: sinwy-dev Toolkit > `simulate-polar-webhook`.

Assume the simulator is wrong until real Polar deliveries show it isn't. This phase exists to stop the "tests pass, real webhooks fail" case.

- Ask the user up front for what this phase needs: `bun run start:localproxy` running, the sandbox webhook endpoint pointed at the ngrok URL, and a sandbox checkout done in the browser.
- Find the webhook endpoint and events through the `webhooks()` plugin in `Sinwy.Backend/modules/auth/auth.ts` and the handler in `modules/auth/subscriptionStatus.ts`.
- Record fixtures from real sandbox deliveries (Polar sandbox API, MCP server or dashboard) and store them with the capture date and `@polar-sh/sdk` version.
- Sign events with an existing Standard Webhooks implementation from the dependencies if one is available, rather than writing your own.
- Tests: fixtures parse with the SDK webhook schemas; a badly signed event is rejected; redelivery, out-of-order events and an unknown `referenceId` each leave the correct DB state.
- Real-delivery check: compare the DB state after the real sandbox checkout with the state after the simulated event. Write the result and date in the notes, including any differences and how they were fixed.

**Notes**

- Endpoint: the `webhooks()` plugin serves `POST /api/auth/polar/webhooks`; the app handles only `subscription.active` and `subscription.revoked` (`modules/auth/subscriptionStatus.ts`). Every other event gets 200 and is ignored.
- Tools: `Sinwy.Backend/scripts/dev/simulatePolarWebhook.ts` (fixtures in `scripts/dev/fixtures/polar/`) and `capturePolarFixture.ts`, which fetches the newest real delivery of a type through the app's Polar client (its token has `webhooks:read`) and replaces customer emails and avatar URLs, since fixtures are committed. Signing uses `standardwebhooks`, the library `@polar-sh/sdk` verifies with; it's now a direct backend dev dependency because Bun's isolated installs hide transitive packages.
- Simulator defaults: a fresh subscription id, `timestamp` = now and a fresh `webhook-id`. For redelivery, pass the printed `--subscription-id`, `--timestamp` and `--webhook-id` back in; for a revoke of the same subscription, pass `--subscription-id`. Posts to `http://localhost:$PORT` (override with `--url`).
- App fix (agreed with the user): the handler set the status from the event type alone, so a late `subscription.active` (retry or out-of-order delivery) re-activated a revoked org, and reconcile only ever upgrades. `organization.subscription_status_at` (migration `0007`) now stores the payload `timestamp` of the applied event, and `setStatus` applies a change only if it is newer (`applied`/`outdated`/`unknown`). Reconcile stamps the time before it asks Polar, so a revoke that lands during the lookup still wins.
- Real-delivery check (2026-10-19, sandbox, API version `2026-04`, SDK 0.47.1): a fresh user checked out org `Testingification`; all 25 deliveries got 200 (the endpoint secret matches `.env`). `subscription.active` set `status=active`, `subscription_status_at` = event timestamp; an immediate cancel in the dashboard (ends `ended_at` now) sent `subscription.updated`, `subscription.canceled`, `subscription.revoked`, and the revoke set `inactive`. The simulator run on a second org (`Simulated Phase3`) changed the same columns with the same log lines; only the timestamp values differ. A stale `active` redelivery on the running backend was logged as ignored. No differences needed fixing.
- The sandbox webhook endpoint was pointed at the ngrok URL for the check and then restored to `https://sinwydev.dev/api/auth/polar/webhooks`, disabled. Re-point and enable it (Polar dashboard or `PATCH /v1/webhooks/endpoints/{id}`) for the next real-delivery check.
- Polar refuses sign-up emails on domains that can't receive mail (`example.com`); use a real domain, e.g. a Gmail `+` address.
- Found, outside this plan (app, not tooling): Polar's `allow_multiple_subscriptions` is off, and the Polar customer is the user, so a user who already pays for one org can't check out a second one (Polar says "You already have an active subscription"); `checkoutGuard` doesn't catch it. Also, auth forms show raw server error text, e.g. Polar's customer-creation error on sign-up; the user has noted this one to fix separately.

## Phase 4: Seed Scenarios

Plan items: sinwy-dev Toolkit > `seed-scenario`.

- Scenarios: owner with org, org with staff, subscribed org. Create them through module services. The subscribed org becomes `active` through `simulate-polar-webhook`.
- Each run creates fresh users with unique emails and prints the ids and emails, so the output can be passed straight to `login-as`.
- Check one scenario against the real flow: create the same data through the browser once, then compare the DB rows. Fix any differences in the seeder, not in the app.

**Notes**

- Tool: `Sinwy.Backend/scripts/dev/seedScenario.ts`, `bun run dev:seed-scenario <scenario> [--staff <n>] [--url <backend>]`; test in `scripts/dev/tests/seedScenario.test.ts` (in-process server, Polar `customers` API stubbed).
- Decision: it seeds over the backend's HTTP API, not by calling services in-process. It posts the sign-up form, clicks the verification link from the outbox (via `lastEmails`), which signs the user in, then calls the org endpoints with that cookie. The onboarding services take a `Membership` that only the permission middleware builds, and the HTTP path also runs the controllers' validation. The catch is that the backend must be running; the CLI checks for it before creating anything.
- Scenarios: `owner-with-org` = owner + `inactive` org (state after `/organizations/new`). `subscribed-org` adds a simulated `subscription.active` (then confirms `active` through `GET .../status`, since the endpoint answers 200 for ignored events) plus profile + onboarding complete. `org-with-staff` adds `--staff` members (default 1). For "paid but onboarding pending", seed `owner-with-org` and run `dev:simulate-polar-webhook` on its org. The output prints `password`, the org (with `subscriptionId` for a later revoke) and each user's id and email, for `dev:login-as --email`.
- Sign-up runs the Polar plugin's `createCustomerOnSignUp`, so each seeded user gets a real sandbox customer. Polar rejects domains without mail, so emails are plus-aliases of `SEED_EMAIL_BASE` (backend `.env`, `<local>+seed-<run>-<role>@<domain>`). Empty counts as unset, so the `.env.example` placeholder doesn't break config parsing.
- Staff join through `auth.api.addMember` (server-only), because the app has no invite flow yet; there's an unchecked item to switch over.
- A seeded subscribed org has no Polar subscription behind it, so the customer portal shows nothing and account deletion has nothing to revoke. For billing behaviour, use a real sandbox checkout.
- Real-flow check (2026-10-20): in the browser, registered `Real Owner`, clicked the verify link, created org `Real Phase Four`, paid the Polar sandbox checkout with card 4242… (playwright-cli fills Stripe's `Secure payment input frame` iframe via `run-code` frame locators; the billing country is a native `select`), then onboarding with the seeder's profile values. Compared to a `subscribed-org` seed with ids, emails and timestamps masked, `user`, `account`, `organization`, `member` and `organization_profile` rows match, as do the Polar customers (`external_id` = user id). Only difference: the browser session has `active_organization_id`, because the plan, onboarding and dashboard routes call `organization.setActive` on the browser's session. Seeded sessions are never reused (`login-as` makes a new one, and the dashboard sets the active org), so the seeder wasn't changed.
- Because the sandbox webhook endpoint is still disabled (Phase 3), the real org was activated by the `/status` reconcile backstop, not a webhook delivery. Phase 3 already compared real and simulated webhook deliveries.
- Found, outside this plan (app): the onboarding pending state renders a `Skeleton` `<div>` inside `PageShell`'s description `<p>` (`$id.onboarding.tsx:86`), a hydration warning. The Vite console echo it triggers is now an unchecked Browser item.

## Phase 5: E2E Test Skill

Plan items: Skills > Repo Skills > `e2e-test`.

- Write `.agents/skills/e2e-test/SKILL.md` following the Format rules, with usage details for each toolkit tool in `references/`. Then run `skills:link` and `skills:check`.
- Try it out: in a fresh pass, follow only the skill to test an existing flow (e.g. create an org, subscribe, open the dashboard). Fix any gaps you find in the skill or the toolkit.
- Confirm the report format separates simulated checks from the real checks that remain.

**Notes**

- Layout: `SKILL.md` holds the workflow (stack → plan → seed → log in → browser → side effects → clean up → report), the stand-in rules and the report template. `references/` has one file per tool (`seed-scenario`, `login-as`, `last-email`, `simulate-polar-webhook`, which also covers `capture-polar-fixture`) plus `app-map.md`: the funnel URLs, which steps are real or simulated, and the tables and columns to check. `scripts/console-errors.sh` summarises a playwright-cli console log.
- The skill uses `bunx playwright-cli`, as `CLAUDE.md` asks, and names the Polar and Better Auth docs without MCP tool ids, so it stays harness-neutral. The `e2e-test` skill showed up in this session's skill list after `skills:link`.
- Try-out (2026-10-20): followed the skill to test create org → subscribe → dashboard on a fresh stack. Seeded a user, logged in with `login-as --state`, created the org in the browser, ran the simulated `subscription.active`, reloaded the plan page (it redirected to onboarding), completed onboarding and landed on `/<slug>`. Checked the org, member, profile and session rows with `psql` and the verification email with `last-email`. No backend warnings. The run was done by this session right after writing the skill, not by a cold agent, so wording that is only clear with this session's context may still be there.
- Gaps found and fixed: (1) No scenario gave a verified user without an org, so testing org creation needed a manual sign-up. Added a `user` scenario (role `user`, email label `-user`) with a test. (2) `jq` isn't installed; the `login-as` API example now parses the cookie with `bun -e`. (3) After picking a select option, the Save button's ref went stale, and the click failed silently because its output was discarded. The skill now says to read every command's output and take a new snapshot before reusing refs. (4) `/auth/postlogin` and the funnel guards redirect on the client, so the first snapshot shows the old URL; the skill says to check `location.href`. (5) The Vite echo turned one hydration warning into 191 errors and a 20 MB console log, and `console error` printed 1.7 MB. `scripts/console-errors.sh` strips the echo prefixes and prints distinct messages with counts. (6) The `last-email` example lacked `id`/`sentAt`, and `file` is absolute.
- Report format: the trial report put the login, the org creation and the onboarding under Checked, the payment, the email verification and the login under Simulated, and the plan button (Polar checkout creation), the checkout and the `/checkout/success` redirect under Real checks still needed. The plan button isn't exercised on the simulated path; the webhook reference now says so.
- Left in the DB from the try-out: user `webdevrokas+seed-fa6b5d7a-user@gmail.com` and org `e2e-skill-trial`, plus a Polar sandbox customer for that user.

## Phase 6: Setup Docs and Plan Review

Plan items: Setup Docs; everything still unchecked.

- Document which environment variables to export for agents and how to start the stack. Pick one place for this (a README section or a new doc) and link it from `CLAUDE.md`.
- Fresh-clone check: clone the repo into a temporary directory, run `bun install`, `bun run skills:link` and `bun run skills:check`, and confirm the symlinks survive a clone.
- Review the whole plan. Every item should be ticked, or left unchecked with a note saying who or what it waits for.
- Ask the user whether to build the candidate skills (`db-migration`, `backend-module`). If they want them, add one phase per skill to this file.

**Notes**

- Setup docs: the AI Agents section of `README.md` (one-time setup, environment variables, starting the stack), linked from `CLAUDE.md`. The only variables to export are `CHROMIUM_PATH` (Chrome DevTools MCP) and `PLAYWRIGHT_MCP_EXECUTABLE_PATH` (`playwright-cli`), and only when Chromium isn't at the NixOS path. Checked that the `playwright-cli` variable beats `.playwright/cli.config.json`: a bogus path made `open` fail with "executable doesn't exist at" that path.
- `.env.example`: `appConfig.ts` drops empty values before parsing, so optional ones get their defaults (checked by parsing the copied template with dummy required values: `sandbox`, `console`, `.emails`, `.storage`) and the `SEED_EMAIL_BASE` `""` special case is gone. Behaviour change: an empty required value (e.g. `GOOGLE_CLIENT_ID=""`) now fails at startup instead of passing as `""`. The real `.env` still parses.
- Fresh-clone check (2026-10-20): `git clone` into a temp dir keeps `.claude/skills/*` as symlinks (git mode `120000`); `bun install`, `skills:link` ("up to date", tree clean) and `skills:check` all exit 0. A Windows checkout without `core.symlinks` would get text files instead; untested.
- Added `scripts/dev/tests/capturePolarFixture.test.ts` (Polar API stubbed), so every toolkit tool now has a test: re-capturing the committed fixture with real-looking contact details gives back the committed payload, with the versions recorded.
- Decisions (user, 2026-10-20): `Bash(bunx playwright-cli:*)` allowed; build `db-migration` (Phase 7); `backend-module` not wanted, removed from the plan. The two user tasks above (`RESEND_API_KEY`, Google client) aren't done yet.
- Polar endpoint events: tracked in issue #55. Findings: SDK 0.47.1 throws `Unknown event type` for `subscription.paused`/`resumed` (the plugin answers 400), but a `paused` status inside `subscription.updated` parses (open enum). Polar disables an endpoint after 10 consecutive failed deliveries. Upgrade path: see the plan item.
- Found, outside this plan (app): Polar says a paused subscription loses access (`subscription.paused` fires when the pause takes effect at period end), but the app handles only `active`/`revoked`, so a paused org stays `active`. Customers can pause from the portal if its pause setting is on; merchants can always pause through the dashboard or API.

## Phase 7: db-migration Skill

Plan items: Skills > Repo Skills > `db-migration`.

- Write `.agents/skills/db-migration/SKILL.md` following the Format rules: edit `Sinwy.Backend/db/schema/`, `bun run db:generate`, review the generated SQL in `Sinwy.Backend/drizzle/` (data loss, defaults on existing rows, locks), `bun run db:migrate`. Run `skills:link` and `skills:check`.
- Cover what the repo adds: Better Auth tables come from `bun run auth:schema:generate`; tests build their DB with `drizzle-kit push` (`Sinwy.Backend/test/setup.ts`), so passing tests don't prove a migration exists or applies; check with `psql service=sinwy_ro` that the local DB has the change. New tables need no `db:agent:setup` re-run (it sets default privileges).
- Try it out on a real small schema change agreed with the user, or on a throwaway change that is reverted (both the schema edit and the migration files), and fix gaps in the skill.

**Notes**

_None yet._
