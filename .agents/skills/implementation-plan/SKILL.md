---
name: implementation-plan
description: Write a phased implementation plan for a feature in docs/, in the shape the implementation-phase skill works through.
disable-model-invocation: true
---

# Implementation Plan

A plan is two files:

- `docs/<topic>-plan.md`: what is still ahead. Status, decisions, standing notes and the phases not yet done. Every phase reads it in full, so keep it short; it shrinks as phases finish.
- `docs/<topic>-log.md`: finished phases, each with its spec and log entry. Append-only; agents read it only when a standing note points to an entry.

## Steps

1. Settle open product decisions with the user before writing (the `grilling` skill helps). What they settle goes under **Decisions**; your own unconfirmed choices go under **Defaults**.
2. Read only the code you need to place the work: find it with `grep -n` and read line ranges. Record what you learn in the phases' **Files** lists so the phase agents don't search again.
3. Copy [assets/plan-template.md](assets/plan-template.md) into `docs/<topic>-plan.md` and fill it in. Create `docs/<topic>-log.md` with only its title and a link back to the plan.
4. Put facts you verified while planning (API behaviour, limits, error codes) under **Standing notes**, so no phase checks them again.

## Rules for phases

- Each phase ships in one commit and fits one session. Order phases by dependency, and mark research-only phases as such.
- Every phase has **Goal**, **Files**, **Steps**, **Tests that matter**, **Done when** and **Verify**.
- **Files** lists the paths to read or change, with function names where they help. A phase whose code doesn't exist yet says so; the phase before it fills the list in.
- **Verify** is the brief for the e2e check, which a subagent runs without having seen the code: the seed scenario to start from, the flow in user steps, what each step should change (page, DB rows, email, Polar), and which parts are simulated. Write "None" when the phase has no user flow.
- Write steps as decisions and constraints, not code. Name files and functions; don't paste their contents.
- **Tests that matter** names the risky behaviour (money, auth, data loss, races), not coverage for its own sake.
- End with a code review phase when the plan touches money, auth or data deletion.
- The last phase's final step, after the review is done and the plan, log and docs are written: stop every dev server started during the plan's work unless the user explicitly asked to keep it running, and delete the temporary files and artifacts the plan's work created (probe scripts, screenshots, browser console logs, scratch data) that are no longer needed.
