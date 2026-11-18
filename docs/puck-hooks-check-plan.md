# Puck hooks check plan

A one-day check (issue #74) that the Puck 0.24 extension points our editor UX fixes depend on work without patching Puck. It is condition 1 of the spike's verdict ([puck-evaluation.md](puck-evaluation.md#verdict)). Each item ends as "works", "works with a small `bun patch`" or "doesn't work". The result is a comment on #74. The code is throwaway: it only has to produce that answer.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-hooks-check-log.md](puck-hooks-check-log.md). Spike background: [puck-spike-log.md](puck-spike-log.md) (phase 7 found the drag problems) and [puck-usability-tasks.md](puck-usability-tasks.md) (tasks 2, 6, 7 and 8).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Custom drawer with `Drawer` / `Drawer.Item` and a locked tile | – | done | `feat(web): puck hooks check phase 1, custom drawer and locked tile` |
| 2 | Undo and redo keep the viewport; selecting records no history | – | done | `feat(web): puck hooks check phase 2, undo keeps viewport and no spurious history` |
| 3 | Action-bar drag handle and `componentOverlay` | – | todo | |
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

- **Puck is 0.24.0**, installed at `Sinwy.WebFrontend/node_modules/@puckeditor/core/dist/`. `package.json` says `^0.24.0`, so don't run `bun update`. Type locations:
  - `actions-Dgllwd-W.d.ts`: `Overrides` (about L718–780, including `actionBar` with `dragHandle` and `dragHandleRef`, and `componentOverlay` with `children`, `hover`, `isSelected`, `componentId` and `componentType`), and `DndConfig` (L812–825: `disableAutoScroll`, `disableOutlineDrag`, `enableDragHandle`, `behavior`).
  - `index.d.ts`: `Drawer` (L141). `Drawer` takes `droppableId` and `direction`. `Drawer.Item` takes `name`, `id`, `label`, `index`, `isDragDisabled` and a `children` render function. `<Puck dnd>` is at L214, and the `PuckApi.history` API at L341–350.
  - `index-dKPCNzR1.d.ts`: `HistorySlice` (L4–19).
- **History recording.** `storeInterceptor` (`chunk-Z2MS6UIF.mjs` ~L529) records every dispatched action except `registerZone`, `unregisterZone`, `setData`, `setUi` and `set`, unless the action sets `recordHistory` itself. A history entry holds the whole app state, `ui` included, so `back`/`forward` also restore the viewport and the selection. A dispatched `setUi` never records (the store's `setUi` helper isn't exported). `back`/`forward` show up in `onAction` as `set`. Puck's own insert dispatches `insert` with `recordHistory: true`, then a `setUi` select. A component with `resolveData` adds a second entry (`chunk-DQXMVPVM.mjs` ~L4580–4610). A `replaceRoot` from root `resolveData` records with `recordHistory: true` (~L8946).
- **Undo (phase 2, works without a patch).** The spurious entries were our `ServicesSection.resolveData` (load-time `replace`); `withLockedFields` in `editor-config.tsx` replaced it, so never use `resolveData` just to set `readOnly`. `useKeepViewportOnHistory` (`EditorChrome.tsx` ~L859) restores the viewport after any history index change. A fresh page load is 1 history entry with Undo disabled. Detail in the log, phase 2.
- **Debug hooks** (throwaway, phase 5 removes them): `window.__getPuck()` is Puck's API (history index and length, `appState`, `dispatch`), set by `useHistoryProbe` (`EditorChrome.tsx` ~L847). `window.__puckLog` holds `{ type, recordHistory, action }` per dispatch and `{ history }` per history change; `window.__puckActions` holds only the types. Selecting programmatically: `dispatch({ type: "setUi", ui: { itemSelector: getSelectorForId(id) } })`.
- **Drag handle.** Only when `dnd.enableDragHandle` and the item's `permissions.drag` are both true does Puck render `ActionBar.DragHandle` and pass it as `dragHandle` / `dragHandleRef` to the `actionBar` override (`chunk-DQXMVPVM.mjs` ~L3527, L3989). `CanvasActionBar` (`EditorChrome.tsx` ~L796) already renders `dragHandle` in its own group, inside a `scale(1 / zoom)` wrapper.
- **Auto-scroll and outline drag are on by default.** `disableAutoScroll` removes dnd-kit's `AutoScroller` plugin (`chunk-DQXMVPVM.mjs` ~L5053), and `disableOutlineDrag` swaps in no sensors (~L8552, L8675). Even so, phase 7 saw no auto-scroll and "Layers can't drag" in our composed editor.
- **Our canvas.** `EditorCanvas` (`EditorChrome.tsx` ~L276) wraps `<Puck.Preview />` in a `transform: scale(zoom)` box with `overflow-hidden`. The outer wrapper is `pointer-events-none` and the inner one is `pointer-events-auto`. `CanvasZoom` passes the zoom to the action bar. Zoom is 1 when the canvas is wider than the viewport width.
- **Drawer (phase 1, works without a patch).** `BlockDrawer` in `EditorChrome.tsx` (~L505) replaced `<Puck.Components />` and the `drawerItem` override. Each `Drawer.Item` renders its card twice (a `draggableBg` copy behind a `draggableFg` copy); we set `inert` on the background copy, which relies on Puck's `Drawer-draggableBg` class. Detail in the log, phase 1.
- **Puck actions per insert.** A drawer drag dispatches `setUi, insert, setUi, setUi`; "+" dispatches `insert, replace` (Services too, now that its `resolveData` is gone). Each is one Undo step.
- **Plan-locked block:** only `BookingWidget`, which requires `advanced-widgets` (`Sinwy.Shared/types/page/PuckContent.ts` ~L139). Starter lacks that feature and Professional has it. Editor route: `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`.
- **Fixtures in the local DB** (checked while planning):
  - pro org `seed-861ca6a6`, with pages `large` (252 blocks, 52 sections), `small` (18), `nesting` and `shallow-grid`
  - org `seed-8cb1127f`, with pages `home` (id `e99f58f4-ef52-4cd9-bda7-7955fd64e7b9`, no Image block) and `salon`
  - org `seed-5b981653`, page `home` (id `10e361e6-d39c-4c4e-8e2b-0e91d4134920`) has two Image blocks
  - Starter org `seed-8a603a43` (owner `webdevrokas+seed-8a603a43-owner@gmail.com`, page `p4-e2e`, id `5e86e0af-…`); `seed-c2b0a828` is Starter too
  - owners are `webdevrokas+<org slug>-owner@gmail.com`; page `small` is id `d2c8cab4-a90e-42e2-8bd5-8736cc65a764`, and phase 1 saved it as versions 9 and 10
  - editor URL: `http://localhost:3000/dashboard/<org slug>/pages/<page id>/edit`
- **Use the dev server for browser checks, not the production preview.** Better Auth refuses the preview origin (phase 7).
- **Browser drags.** The canvas is scaled to 0.601 at a 1440×900 window, and Playwright's locator drag doesn't map through the scale. Use `page.mouse` with screen = iframe box + rect × (box width / iframe `clientWidth`). `/tmp/hooks-check/drag.sh` (drawer card to an iframe selector) and `tree.sh` (zones and their blocks) do this; they are scratch files for phase 5 to delete, with `/tmp/hooks-check/p2/` (select-all, undo and breakpoint scenarios) and `p2-verify/`.
- **FreeGrid handle drags.** RGL uses no compaction and prevents collisions, so dropping a cell onto an occupied one is rejected and commits nothing; drag into empty space. At phone width the `[data-freegrid-handle]` sits at x −12 (half outside the iframe), so grab it about 6 px inside the iframe edge. Handles show when the FreeGrid or one of its children is selected. The servers this plan started log to `/tmp/hooks-check/{server,web}.log`.

---

## Phase 3: Action-bar drag handle and `componentOverlay`

**Goal:** we know whether Text blocks (and any block) can be dragged from a handle in our action bar, and whether the hover and selection overlay can be our own.

**Files:** `PageEditor.tsx` (`<Puck dnd>` L55), `EditorChrome.tsx` (`CanvasZoom` L273, `CanvasActionBar` L796, `chromeOverrides` L843), `FreeGridEditor.tsx` (the RGL handles must still work under the overlay: `bindOverlay` ~L95 stops `pointerdown`, `OVERLAY_CSS` ~L54 sets pointer events), `render-config.tsx` (the RichText block, L488).

**Steps:**
- Turn on `dnd={{ enableDragHandle: true }}`, and keep `CanvasActionBar` rendering `dragHandle`. Check the handle at zoom 1 and at the scaled zoom (desktop viewport in a narrow window), because it sits inside the `scale(1 / zoom)` wrapper.
- Drag RichText, Heading and a whole Section from the handle:
  - within the root
  - into another Section's slot
  - into and out of a FreeGrid
- Note the placeholder style `behavior: "auto"` gives from a handle, and whether the drag preview follows the pointer under zoom.
- Add a `componentOverlay` override: our own ring and colour, plus the block's name on hover, using `hover`, `isSelected` and `componentType`. Check:
  - that it renders inside the iframe with Tailwind classes
  - that it doesn't block inline text editing, FreeGrid move and resize, or clicks on the action bar
  - what `children` holds (Puck's default overlay or nothing)
- Record whether the overlay can also move the action bar off the top edge of the iframe, where the spike saw it clipped. If it can't, say so; the bar's placement is Puck's.

**Tests that matter:**
- None (throwaway). The browser checks below are the evidence.

**Done when:**
- The log has a result for each of the two items, with any caveat.

**Verify:**
- **Pro org `seed-861ca6a6`, page `small`, in the editor.**
  - Select a Text block, then drag it by the action-bar handle below the next section. It moves, no text gets selected, it's one Undo step, and it is still in its new place after a save.
  - Do the same at the desktop viewport in a 1100 px wide window, so the canvas is scaled.
  - Hover a block, then select one. Our overlay style shows, and typing in a selected Text block still works.
- Nothing is simulated.

---

## Phase 4: Auto-scroll and outline drag in the scaled canvas

**Goal:** we know whether a drag near the canvas edge scrolls a long page, and whether Layers rows can be dragged, in our composed and scaled canvas.

**Files:** `EditorChrome.tsx` (`EditorCanvas`, `LeftPanel` Layers tab with `<Puck.Outline />`), `PageEditor.tsx` (`<Puck dnd>`).

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
