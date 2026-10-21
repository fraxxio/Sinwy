---
name: e2e-test
description: Test a Sinwy flow end to end the way a user would. Seed users and orgs, log in, drive the browser, then check the database and sent emails, with Polar webhooks and email simulated locally. Use when asked to test, QA or verify a flow in the running app (sign-up, org creation, subscription, onboarding, dashboard), or to check in the browser that a change works, not only in unit tests.
---

# E2E Test

Run everything from the repo root. The toolkit (`bun run dev:*`) replaces only the outside parties: Polar, the inbox and the user typing a password. Everything else is the real app.

## Workflow

1. **Start the stack.** Check what is already up before starting anything:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/   # backend (any code = up)
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # web app
   psql service=sinwy_ro -c "SELECT 1"                               # database
   ```
   Start only what is down: `bun run db:up`, then `bun run start:server` and `bun run start:web` as long-running background processes, each with its output sent to a log file you can read. The tools need `EMAIL_DRIVER=console` and `SEED_EMAIL_BASE` in `Sinwy.Backend/.env`. You can't read `.env`. If a tool says a value is missing, ask the user to set it.
2. **Plan the test.** Write down the steps a user takes and what each step should change: the page, DB rows, an email, a Polar call. Mark each step as real or simulated (see [references/app-map.md](references/app-map.md)).
3. **Seed.** Start from the nearest scenario. Click through only the steps you are testing ([references/seed-scenario.md](references/seed-scenario.md)).
4. **Log in.** Use `dev:login-as --state` and load the file into the browser ([references/login-as.md](references/login-as.md)). If the test is about login itself, use the form.
5. **Drive the browser** with `bunx playwright-cli` (see the `playwright-cli` skill).
   - Read the output of every command; don't discard it. Refs are valid only for the latest snapshot, and picking an option or submitting re-renders the form. A click on a stale ref fails, and you only see that in its output. Take a new snapshot before reusing refs.
   - Many routes redirect on the client after the page loads (`/auth/postlogin`, the funnel guards), so the first snapshot can show the old URL. Run `bunx playwright-cli --raw eval "location.href"` before asserting on a page.
   - Console: each command's page status shows `Console: N errors`. Don't print `console error` in full: the Vite dev server echoes one warning thousands of times, which can mean megabytes. Run `.agents/skills/e2e-test/scripts/console-errors.sh` for the distinct messages with counts. The `[vite… @vite/client` line is the echo; the other lines are the real errors.
6. **Check side effects** against the source, not only the page:
   - DB: `psql service=sinwy_ro -c "<sql> LIMIT 5"`, selecting only the columns you need. The tables are in `Sinwy.Backend/db/schema/`.
   - Email: `bun run dev:last-email --to <email>`, then open the link from `links` in the browser ([references/last-email.md](references/last-email.md)).
   - Polar: `bun run dev:simulate-polar-webhook` stands in for the payment ([references/simulate-polar-webhook.md](references/simulate-polar-webhook.md)).
   - Backend log: warnings and errors logged during the run.
7. **Clean up.** Run `bunx playwright-cli close`. Stop only the processes you started. Leave seeded data in place, because every run creates fresh users.
8. **Report** in the format below.

## Treat the toolkit as a stand-in

- A tool's result is a claim to check. When a result looks wrong, or when the toolkit could be hiding a bug (signatures, payload shape, session cookies, email links), compare it with the source of truth: the Polar docs and `@polar-sh/sdk` types, the Better Auth docs, or the real sandbox.
- When the toolkit and the real behaviour disagree, fix the toolkit (in `Sinwy.Backend/scripts/dev/`, with a test). Never change app code to fit the toolkit. Add no test-only branches and no flags that skip signature or session checks.
- A failure caused by the app is a finding. Report it with its reproduction steps. Fix it only if fixing it is part of the task.
- Write no rows that the app would write. Use `psql service=sinwy_rw` only to set up a state the app can't reach through the UI or the toolkit, and say so in the report.

## Report format

```markdown
## E2E: <flow>

Scenario: <seed command and the ids and emails it printed>

### Checked (real app code)
- [x] <step>: <what was observed: page, DB row, email>
- [ ] <step>: <what failed, how to reproduce, relevant log lines>

### Simulated
- <part>: <tool that stood in, e.g. Polar payment → dev:simulate-polar-webhook subscription.active>

### Real checks still needed
- <e.g. sandbox checkout with webhooks delivered through `bun run start:localproxy`, Resend delivery of a new email template>

### Findings
- <app bugs, toolkit gaps (fixed or not), warnings in the console or backend log>
```

A pass that depended on a simulated part goes under **Checked**, and that part goes under **Simulated**. If the flow touches billing or email delivery, **Real checks still needed** can't be empty. Never call a flow done when it has only passed against the toolkit.
