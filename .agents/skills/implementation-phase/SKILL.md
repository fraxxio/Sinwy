---
name: implementation-phase
description: Implement the next phase (or a named one) of a docs/*-plan.md implementation plan, verify it, and record it in the plan's log.
disable-model-invocation: true
---

# Implementation Phase

The user names the plan file, and sometimes a phase. With no phase named, take the first `todo` phase whose dependencies are `done`. With no plan file named, list `docs/*-plan.md` and ask which one.

## Before you start

1. **Read only the plan file.** `CLAUDE.md` is already loaded. Don't open the log (`docs/<topic>-log.md`) unless a standing note points to an entry. Stop if the phase's dependencies aren't `done`.
2. **Trust the standing notes.** They are verified facts; don't check them again. When you do need an external fact (API behaviour, error codes, timing), get it from the sandbox or a docs server in as few calls as possible rather than grepping minified SDK type files.
3. **Start from the phase's Files list.** Find code with `grep -n` and read line ranges, not whole files. When a tool's output overflows to a file, grep it; never read it in full.

## While you work

- Write the code and the **Tests that matter**. Check small things in the browser inline while you build; keep page trees out of your context (the `e2e-test` skill says how).
- When you wait on something external, use one blocking loop with a timeout per condition. Don't wait for timings the standing notes already record.
- If the plan turns out wrong or impossible, don't work around it silently: note it for the log entry and the standing notes, and stop and ask if it changes a **Decision**.

## Verify

1. Run `bun run verify` once, after the last code change, and read its whole summary. Doc edits afterwards don't need another run.
2. If the phase's **Verify** isn't "None", run it in a subagent. Give it:
   - the `e2e-test` skill and the phase's Verify brief, copied in full;
   - which servers are running and where their logs are;
   - anything already set up (seeded ids and emails, sandbox objects), and anything it must not touch.
   It returns the skill's report. When the report shows a failure, reproduce that one step inline before fixing it, then rerun only what the fix affects.
3. Every item in **Done when** holds, or the gap is reported to the user.

## Finish

1. Move the phase's section from the plan to the end of the log, followed by its entry:
   ```md
   ### Log (YYYY-MM-DD, `<commit title>`)
   - Shipped: …
   - Differs from plan: … (and why)
   - Checked in the running app: … (and what wasn't)
   ```
2. Set the phase's status row to `done`, with the commit title.
3. Update **Standing notes**: add what later phases must know (verified external behaviour, timings, gotchas, decisions made mid-phase), one or two lines each, pointing to the log for detail. Remove notes that no longer matter. Don't repeat what the code or `CLAUDE.md` already says.
4. Rewrite the next phase's **Files** list from what you learned.
5. Commit the code, the plan and the log together, with a single-line title in the repo's style (`feat(backend, web): …`, `fix(backend): …`, `docs: …`).
6. Report to the user: what shipped, the verify exit code, the e2e report's findings and anything left unchecked. If the user needs to perform any action to continue to next phase or is everything good and ready to move on to next phase.
