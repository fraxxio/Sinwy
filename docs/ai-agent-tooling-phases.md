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

_None yet._

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

_None yet._

## Phase 4: Seed Scenarios

Plan items: sinwy-dev Toolkit > `seed-scenario`.

- Scenarios: owner with org, org with staff, subscribed org. Create them through module services. The subscribed org becomes `active` through `simulate-polar-webhook`.
- Each run creates fresh users with unique emails and prints the ids and emails, so the output can be passed straight to `login-as`.
- Check one scenario against the real flow: create the same data through the browser once, then compare the DB rows. Fix any differences in the seeder, not in the app.

**Notes**

_None yet._

## Phase 5: E2E Test Skill

Plan items: Skills > Repo Skills > `e2e-test`.

- Write `.agents/skills/e2e-test/SKILL.md` following the Format rules, with usage details for each toolkit tool in `references/`. Then run `skills:link` and `skills:check`.
- Try it out: in a fresh pass, follow only the skill to test an existing flow (e.g. create an org, subscribe, open the dashboard). Fix any gaps you find in the skill or the toolkit.
- Confirm the report format separates simulated checks from the real checks that remain.

**Notes**

_None yet._

## Phase 6: Setup Docs and Plan Review

Plan items: Setup Docs; everything still unchecked.

- Document which environment variables to export for agents and how to start the stack. Pick one place for this (a README section or a new doc) and link it from `CLAUDE.md`.
- Fresh-clone check: clone the repo into a temporary directory, run `bun install`, `bun run skills:link` and `bun run skills:check`, and confirm the symlinks survive a clone.
- Review the whole plan. Every item should be ticked, or left unchecked with a note saying who or what it waits for.
- Ask the user whether to build the candidate skills (`db-migration`, `backend-module`). If they want them, add one phase per skill to this file.

**Notes**

_None yet._
