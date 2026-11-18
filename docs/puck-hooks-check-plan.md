# Puck hooks check plan

A one-day check (issue #74) that the Puck 0.24 extension points our editor UX fixes depend on work without patching Puck. It is condition 1 of the spike's verdict ([puck-evaluation.md](puck-evaluation.md#verdict)). Each item ends as "works", "works with a small `bun patch`" or "doesn't work". The result is a comment on #74. The code is throwaway: it only has to produce that answer.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-hooks-check-log.md](puck-hooks-check-log.md). Spike background: [puck-spike-log.md](puck-spike-log.md) (phase 7 found the drag problems) and [puck-usability-tasks.md](puck-usability-tasks.md) (tasks 2, 6, 7 and 8).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Custom drawer with `Drawer` / `Drawer.Item` and a locked tile | – | done | `feat(web): puck hooks check phase 1, custom drawer and locked tile` |
| 2 | Undo and redo keep the viewport; selecting records no history | – | done | `feat(web): puck hooks check phase 2, undo keeps viewport and no spurious history` |
| 3 | Action-bar drag handle and `componentOverlay` | – | done | `feat(web): puck hooks check phase 3, action-bar drag handle and own overlay` |
| 4 | Auto-scroll and outline drag in the scaled canvas | – | todo | |
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

- **Puck is 0.24.0**, installed at `Sinwy.WebFrontend/node_modules/@puckeditor/core/dist/`. `package.json` says `^0.24.0`, so don't run `bun update`. `DndConfig` is in `actions-Dgllwd-W.d.ts` (L812–825: `disableAutoScroll`, `disableOutlineDrag`, `enableDragHandle`, `behavior`), and `<Puck dnd>` in `index.d.ts` L214.
- **Results so far (all works, no patch):** drawer (phase 1), undo and history (phase 2), drag handle and `componentOverlay` (phase 3). Detail and caveats are in the log, one entry per phase. Phase 5 quotes them.
- **Open undo gap for phase 5 (found in phase 3):** with a RichText block selected, Redo is followed by a non-recording `replace` that only sets `ui.field` focus/selection metadata. Puck records it as a data-identical entry, so getting back after a Redo takes two Undo clicks. It's not fixed or diagnosed yet (see the log, phase 3), and the user decides whether it is in scope.
- **History recording.** `storeInterceptor` (`chunk-Z2MS6UIF.mjs` ~L529) records every dispatched action except `registerZone`, `unregisterZone`, `setData`, `setUi` and `set`, unless the action sets `recordHistory` itself. `back`/`forward` show up in `onAction` as `set`. `history.back()` and `forward()` don't update `history.index` synchronously: never loop on the index in one eval, because it hangs the tab.
- **Debug hooks** (throwaway, phase 5 removes them): `window.__getPuck()` is Puck's API (history, `appState`, `dispatch`, `getSelectorForId`, `selectedItem`), set by `useHistoryProbe` (`EditorChrome.tsx`). `window.__puckLog` holds `{ type, recordHistory, action }` per dispatch and `{ history }` per history change (`onAction` in `PageEditor.tsx`). Select programmatically with `dispatch({ type: "setUi", ui: { itemSelector: getSelectorForId(id) } })`; clicking a Section selects its first child.
- **Drag in our editor (phase 3).**
  - `dnd={{ enableDragHandle: true }}` is on (`PageEditor.tsx` L62). Body drags still work.
  - A handle drag is a "static" drag: a 2 px line placeholder, and siblings stay put.
  - Every move is `setUi, move, setUi!`, then one history entry; RichText adds a `replace`.
  - Escape does not cancel a drag; mouse up drops.
- **Auto-scroll and outline drag are on by default.** `disableAutoScroll` removes dnd-kit's `AutoScroller` plugin (`chunk-DQXMVPVM.mjs` ~L5053), and `disableOutlineDrag` swaps in no sensors (~L8552, L8675). Even so, spike phase 7 saw no auto-scroll and "Layers can't drag". Puck's line placeholder also tracks scroll (`startLinePlaceholderScrollTracking`, ~L5109).
- **Our canvas.** `EditorCanvas` (`EditorChrome.tsx` ~L276) wraps `<Puck.Preview />` in a `transform: scale(zoom)` box with `overflow-hidden`. The outer wrapper is `pointer-events-none` and the inner one is `pointer-events-auto`. At a 1100 px window the desktop viewport scales to 0.335 (canvas about 430 px wide). At 1440×900 it is 0.601. Zoom is 1 only when the viewport fits (Phone at 1100 px). `CanvasZoom` passes the zoom to the action bar and overlay.
- **Fixtures:** pro org `seed-861ca6a6` (owner `webdevrokas+seed-861ca6a6-owner@gmail.com`).
  - Page `large` has 252 blocks in 52 sections.
  - Page `small` is id `d2c8cab4-a90e-42e2-8bd5-8736cc65a764`, last saved as version 16 in its original order.
  - Editor URL: `http://localhost:3000/dashboard/<org slug>/pages/<page id>/edit`.
- **Browser checks.**
  - Use the dev server (web :3000, backend :3001, logs in `/tmp/hooks-check/{web,server}.log`), not the production preview, which Better Auth refuses.
  - Log in with `dev:login-as --state`, then `playwright-cli open`, `resize`, `state-load` and `goto`.
  - Switch the viewport by clicking its `label` (`hasText: "Phone"`); the radio inputs are sr-only.
  - Playwright's locator drag doesn't map through the scale. Use `page.mouse` with screen = iframe box + rect × (box width / iframe `clientWidth`).
  - Probes target the selected bar with `[data-puck-overlay][class*=isSelected]`. Puck also renders an invisible bar in the hover overlay.
- **Scratch scripts** (phase 5 deletes `/tmp/hooks-check/`):
  - `p2/eval.sh` and `p2/click.sh`
  - `tree.sh` (zones and their blocks)
  - `drag.sh` (drawer card to a selector)
  - `p3/hdrag.sh` (handle drag of the selected block to a selector)
  - `p3/slow.sh` (stepwise held drag that logs the placeholder zone and index each step, a start for the auto-scroll hold)

---

## Phase 4: Auto-scroll and outline drag in the scaled canvas

**Goal:** we know whether a drag near the canvas edge scrolls a long page, and whether Layers rows can be dragged, in our composed and scaled canvas.

**Files:**
- `EditorChrome.tsx`:
  - `EditorCanvas` L276, with the `overflow-hidden` box and the `pointer-events-none` / `-auto` wrappers
  - `LeftPanel` L637, whose Layers tab renders `<Puck.Outline />` at L680
- `PageEditor.tsx`: `<Puck dnd={{ enableDragHandle: true }}>` at L62
- Puck's `chunk-DQXMVPVM.mjs`: `AutoScroller` ~L5053 and the outline sensors ~L8552 and L8675
- Scratch: `/tmp/hooks-check/p3/slow.sh`, a held drag in steps that can hold at the canvas edge

**Steps:**
- Reproduce on `seed-861ca6a6/large`: hold a section drag at the bottom edge of the canvas. Then isolate the cause:
  - at zoom 1 versus scaled
  - without `overflow-hidden`
  - without the `pointer-events-none` wrapper
  - by checking which element dnd-kit's `AutoScroller` treats as scrollable (the iframe's document or our box)
- Fix it in `EditorCanvas` if the cause is ours. If dnd-kit can't scroll the iframe in our layout, try our own fallback: while `ui.isDragging` is set, scroll the iframe's document when the pointer is near its top or bottom edge. Record which one worked.
- In the Layers tab:
  - drag rows within a slot, into another slot, and across a long list
  - check whether the outline list auto-scrolls
  - find why phase 7 saw "Layers can't drag", whether that's the Tabs container, the outline's scroll box, or real

**Tests that matter:**
- None (throwaway). The browser checks below are the evidence.

**Done when:**
- The log records the result and the cause for both auto-scroll and outline drag.

**Verify:**
- **Pro org `seed-861ca6a6`, page `large`, in the editor at the desktop viewport (scaled).**
  - Drag Section 1 and hold it near the canvas's bottom edge. The canvas scrolls to the end without the wheel. Drop it after the last section: it is last at the root, not nested.
  - In Layers, drag Section 2 below Section 3. The order changes in the canvas, and it's one Undo step.
  - Leave without saving.
- Nothing is simulated.

---

## Phase 5: Result on #74, evaluation update, cleanup

**Goal:** #74 has the answer and the evaluation reflects it.

**Files:** [puck-evaluation.md](puck-evaluation.md) (Verdict condition 1, the Customisability table's "not tried" notes, and the "What we'd build ourselves" efforts if any changed), this plan, [puck-hooks-check-log.md](puck-hooks-check-log.md), and any `patches/` from phases 1–4.

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
