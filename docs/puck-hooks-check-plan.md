# Puck hooks check plan

A one-day check (issue #74) that the Puck 0.24 extension points our editor UX fixes depend on work without patching Puck. It is condition 1 of the spike's verdict ([puck-evaluation.md](puck-evaluation.md#verdict)). Each item ends as "works", "works with a small `bun patch`" or "doesn't work". The result is a comment on #74. The code is throwaway: it only has to produce that answer.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-hooks-check-log.md](puck-hooks-check-log.md). Spike background: [puck-spike-log.md](puck-spike-log.md) (phase 7 found the drag problems) and [puck-usability-tasks.md](puck-usability-tasks.md) (tasks 2, 6, 7 and 8).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Custom drawer with `Drawer` / `Drawer.Item` and a locked tile | – | done | `feat(web): puck hooks check phase 1, custom drawer and locked tile` |
| 2 | Undo and redo keep the viewport; selecting records no history | – | done | `feat(web): puck hooks check phase 2, undo keeps viewport and no spurious history` |
| 3 | Action-bar drag handle and `componentOverlay` | – | done | `feat(web): puck hooks check phase 3, action-bar drag handle and own overlay` |
| 4 | Auto-scroll and outline drag in the scaled canvas | – | done | `feat(web): puck hooks check phase 4, auto-scroll and outline drag` |
| 5 | Result on #74, evaluation update, cleanup | 1–4 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Time-box: one day for the whole check.** The code is throwaway, and its quality doesn't matter.
- **Outcome.** A comment on #74 that gives each item one of three results: works, works with a small `bun patch`, or doesn't work.
- **Failure rule.** If the custom drawer (phase 1) or the undo fix (phase 2) needs a Puck patch, the verdict is reopened. It is compared against the runner-up (assembling the editor ourselves) before the other MVP sub-issues (#75–#77) start.

### Defaults (not yet confirmed; change only if asked)

1. **Branch:** work on `pagebuilder-tryout`, one commit per phase. It's the spike branch, it is never merged, and #73 and #74 link to its docs.
2. **Time per phase:** about 1.5 h each for phases 1–4 and 1 h for phase 5. When the time runs out, the item is recorded as "doesn't work as tried", with what was tried, and the plan moves on.
3. **Grading.** *Works* means Puck's exported API plus our own code; any reliance on Puck's internal DOM or class names is named as a caveat. *Small `bun patch`* means a patch to Puck's `dist` that covers one concern in about 20 changed lines. It is made with `bun patch`, kept in `patches/`, and its diff is quoted in the log. Anything bigger, or a fork, is *doesn't work*.
4. **Patches.** A patch is only tried after the no-patch routes have failed. If the drawer or undo needs one, phase 5 flags the reopened verdict on #74. The runner-up comparison is a separate follow-up and not part of this plan.
5. **Tests.** No unit tests, because the code is throwaway. The evidence is the browser check in each phase's Verify, recorded in the log. `bun run verify` still runs once per phase.
6. **Scope.** Only the five items on #74. Dirty state compared by data, the leave guard, insert-and-scroll and the other fixes are production work for #76.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Puck is 0.24.0** (`package.json` says `^0.24.0`, so don't run `bun update`). No `bun patch` was needed in phases 1–4, so there is no `patches/` directory and no `patchedDependencies`.
- **Results (all work, no Puck patch):**
  - drawer (phase 1)
  - undo and history (phase 2)
  - drag handle and `componentOverlay` (phase 3)
  - auto-scroll and outline drag (phase 4)

  Phase 5 quotes each phase's log entry, results and caveats.
- **Auto-scroll needed a fix in our own CSS (phase 4).** The global `body { overflow-x: hidden }` broke dnd-kit's auto-scroll and drop targets in Puck's iframe. It's now `html { overflow-x: clip }` in `styles.css`. Production (#76) has to carry this; name it on #74. The spike verdict's "Drag on long pages 🟡 M" effort is now smaller (see the log, phase 4).
- **Drag caveats to quote (phase 4):**
  - a release with no pointer move after reaching the target cancels
  - "after the last root section" is an 8 px target at 0.335
  - Layers can't drop after the last root section
- **Open undo gap for phase 5 (found in phase 3):** with a RichText block selected, Redo is followed by a non-recording `replace` that only sets `ui.field` focus/selection metadata. Puck records it as a data-identical entry, so getting back after a Redo takes two Undo clicks. It's not fixed or diagnosed yet (see the log, phase 3), and the user decides whether it is in scope.
- **History recording.** `storeInterceptor` (`chunk-Z2MS6UIF.mjs` ~L529) records every dispatched action except `registerZone`, `unregisterZone`, `setData`, `setUi` and `set`, unless the action sets `recordHistory` itself.
- **Debug hooks to remove in phase 5:**
  - `useHistoryProbe` in `EditorChrome.tsx` (~L899, called ~L947), which sets `window.__getPuck` and history entries in `window.__puckLog`
  - the `onAction` logger in `PageEditor.tsx` (~L62–75)
- **Running things to stop in phase 5:**
  - the web dev server on :3000 (`bun start` in `Sinwy.WebFrontend`, restarted in phase 4, log `/tmp/hooks-check/web.log`)
  - the backend on :3001 (log `/tmp/hooks-check/server.log`)
  - the `playwright-cli` "default" session
- **Scratch to delete in phase 5:** `/tmp/hooks-check/` (scripts p1–p4, screenshots, logs, and the restored `puckeditor_core.js.orig` backup). The log doesn't reference any of it.
- **Fixture state:** `seed-861ca6a6` pages `small` (version 16) and `large` (version 10) are in their saved state. Nothing from phase 4 was saved.

---

## Phase 5: Result on #74, evaluation update, cleanup

**Goal:** #74 has the answer and the evaluation reflects it.

**Files:**
- [puck-evaluation.md](puck-evaluation.md):
  - `## Verdict` (L7), condition 1
  - `## Customisability` (L72), the "not tried" notes, for example the Action bar row at L85
  - `## What we'd build ourselves` (L201), including "Drag on long pages" (now a CSS fix)
  - the phase 7 friction lines (~L729, L752, L768)
- this plan and [puck-hooks-check-log.md](puck-hooks-check-log.md), whose phase 1–4 entries hold the results and caveats
- `Sinwy.WebFrontend/src/shared/components/page-builder/`: remove the debug hooks (`EditorChrome.tsx` `useHistoryProbe`, `PageEditor.tsx` `onAction` logger). Keep the phase 1–4 code and the `styles.css` fix; the branch is never merged.
- No `patches/` to remove (none were made).

**Steps:**
- Post one comment on #74 with `gh issue comment 74`. It has one line per checklist item: the result (works / works with a small `bun patch` / doesn't work), the how, and any caveat. Link the log on `pagebuilder-tryout`.
- If the drawer or undo needed a patch or failed, the comment says the verdict is reopened under the failure rule. It also lists what the runner-up comparison has to answer.
- Update condition 1 and the "not tried" notes in the evaluation. Revise effort figures that changed.
- Remove any Puck patch from `package.json` / `patches/`. Production decides patches from #76 onward, and the patch diffs stay quoted in the log.
- Stop every dev server this plan started, unless the user asked to keep it. Delete probe scripts, screenshots, console logs and scratch data that the log doesn't reference.

**Tests that matter:**
- None.

**Done when:**
- The comment is on #74, the evaluation's condition 1 states the result, and the working tree holds no leftovers.

**Verify:** None.
