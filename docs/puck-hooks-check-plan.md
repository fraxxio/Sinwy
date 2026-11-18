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
| 5 | Result on #74, evaluation update, cleanup | 1–4 | done | `docs: puck hooks check phase 5, result on #74, evaluation update and cleanup` |

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

All phases are done; nothing is carried forward. Results and caveats are in the log, and the result is on #74.
