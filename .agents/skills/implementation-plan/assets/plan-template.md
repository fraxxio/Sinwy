# <Topic> plan

<Two to four sentences: what this delivers and why.>

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [<topic>-log.md](<topic>-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | <title> | – | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **<Decision>.** <One or two lines.>

### Defaults (not yet confirmed; change only if asked)

1. <Default.>

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- <Note.>

---

## Phase 1: <title>

**Goal:** <One sentence: what is true when this ships.>

**Files:** <Paths to read or change, with function names where they help.>

**Steps:**
- <Decision or constraint.>

**Tests that matter:**
- <Behaviour, especially the risky paths.>

**Done when:**
- <Observable outcome.>

**Verify:** <The e2e brief: the seed scenario to start from, the flow in user steps, what each step should change (page, DB rows, email, Polar), and which parts are simulated. "None" when the phase has no user flow.>
