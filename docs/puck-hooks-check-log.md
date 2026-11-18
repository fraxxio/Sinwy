# Puck hooks check log

Finished phases of [puck-hooks-check-plan.md](puck-hooks-check-plan.md), each with its spec and log entry.


---

## Phase 1: Custom drawer with `Drawer` / `Drawer.Item` and a locked tile

**Goal:** we know whether the Add panel can be entirely our own layout (preview cards in our own grid, groups and order, plus a non-draggable upgrade tile) while dragging into the canvas still works.

**Files:** `EditorChrome.tsx` (`LeftPanel`, `DrawerItem`, `chromeOverrides`), `editor-config.tsx` (`categories`, `editorConfigFor`), `use-block-actions.ts` (`add`), `PageEditor.tsx`, and the route `_shell.pages.$id.edit.tsx` (where the plan's features reach the config).

**Steps:**
- Replace `<Puck.Components />` with our own component built from `Drawer` and `Drawer.Item`. The group list and order are our own constant, not `config.categories`, with ready-made sections first. Cards sit in a 2-column grid. Each card shows a simple preview (a static sketch per block is enough) plus a label and a one-line description.
- Try one `Drawer` per group, each with its own `droppableId`, and one `Drawer` around a CSS grid. Record which of the two works.
- Use `Drawer.Item`'s `children` render function to draw the card, and check how it interacts with the `drawerItem` override (one of them may need to go). Keep the "+" click-to-add.
- Locked tile: for each type the plan lacks, render a plain card (not a `Drawer.Item`) with a lock, "Upgrade to use", and a click that opens an upgrade prompt or the billing link. It must not start a drag, and the canvas must not accept it.
- Check:
  - drag from each group into the root, into a Section slot and into a FreeGrid
  - the drag preview and its position while dragging out of a grid card
  - that dragging a card into another drawer group doesn't reorder the drawer
  - that drawer items are announced once to screen readers (the spike saw them twice)

**Tests that matter:**
- None (throwaway). The browser checks below are the evidence.

**Done when:**
- The log records the result for the custom drawer, which approach was used, and any caveat (internal DOM, a patch).

**Verify:**
- **Pro org `seed-861ca6a6`, page `small`, in the editor.**
  - The Add tab shows our grid, with groups in our order.
  - Drag Hero into the root, Heading into a Section, and Button into a FreeGrid. Each lands where it was dropped, adds one Undo step, and is still there after a save.
  - "+" on a card adds the block after the selection.
- **A Starter org page.**
  - Booking widget shows as a locked tile.
  - Dragging it does nothing.
  - Clicking it shows the upgrade prompt.
- Nothing is simulated.

### Log (2026-11-18, `feat(web): puck hooks check phase 1, custom drawer and locked tile`)
- Shipped: `BlockDrawer` in `EditorChrome.tsx` replaces `<Puck.Components />` in the Add tab. Our own group constant (Ready-made sections, Content, Layout) renders as one `Drawer` per group around a 2-column CSS grid of `Drawer.Item` cards. Each card has a sketch, a label, a one-line description and a "+" that shows on hover. Types the plan lacks (those `editorConfigFor` drops from the categories) render as a plain `<button>` card with a lock and "Upgrade to use", which opens an alert dialog linking to `/account/billing`. The `drawerItem` override and the old `DrawerItem` are gone.
- **Result: works, no patch.** It uses only `Drawer` and `Drawer.Item`, which Puck exports. One caveat: hiding the duplicate card from screen readers relies on Puck's internal `Drawer-draggableBg` class name.
- Differs from plan:
  - **Per-group `Drawer` vs one `Drawer` around a grid.** They are the same thing in 0.24: `Drawer` is only a "void" droppable that never accepts drops, and `Drawer.Item` is a `useDraggable` that doesn't need its parent `Drawer`. `droppableId` and `direction` are deprecated, and each logs a `console.error` (`chunk-DQXMVPVM.mjs` ~L5536). I used one `Drawer` per group, without `droppableId`, around a grid `div`. A single `Drawer` around everything would behave the same (read from the source, not tried).
  - **`children` vs `drawerItem`.** `Drawer.Item`'s `children` render function has the same shape as the `drawerItem` override, and only `Puck.Components` passes the override. Using `Drawer.Item` directly makes the override dead, so it was removed. The render function must be stable (a module-level const), because Puck memoizes the inner component on it.
  - **Double announcement found and fixed.** `Drawer.Item` renders its contents twice: a `draggableBg` copy (absolute, `z-index:-1`, pointer-events none, not `aria-hidden`) behind the draggable `draggableFg` copy. That is the "announced twice" from the spike. The card's ref callback sets `inert` on the closest `[class*="Drawer-draggableBg"]`. Chrome's accessibility tree then has one button per card and one "Add …" button (11 each). The DOM and Playwright's `getByRole` still count 22, because Playwright doesn't treat `inert` as hidden.
  - **Stacking context.** The background copy's `z-index:-1` slid behind the aside's background, so the card's spot went blank while dragging. `isolate` on the grid keeps the copy visible.
  - The fg element is dnd-kit's `role="button"` and contains our "+" `<button>`, so interactive elements are nested. That is accepted for throwaway code.
- Checked in the running app (my own check, then an e2e subagent; nothing simulated, real `page.mouse` drags, canvas zoom 0.601 at 1440×900):
  - **Pro `seed-861ca6a6/small`.**
    - The groups show in our order in a 2-column grid.
    - Hero dropped on the bottom edge of the last root Section lands at the root, after it.
    - Heading dropped on a block inside a Section lands in that Section's slot.
    - Button dropped on a FreeGrid lands in the FreeGrid. The FreeGrid places it in its first free cell and stores no placement, which is FreeGrid's own behaviour.
    - Each drop dispatches `setUi, insert, setUi, setUi` and is exactly one Undo step; Redo restores it.
    - Saved versions 9 and 10 contain every dropped block where it was dropped.
    - "+" with a Heading selected inserts after it (`insert, replace`, one Undo step).
    - The drag preview is the card itself and follows the pointer at the grab offset over the scaled canvas.
    - Releasing a card over another drawer group dispatches no insert and doesn't reorder the drawer.
  - **Starter `seed-8a603a43/p4-e2e`.** Booking widget is a locked tile, not a `drawer-item`. Dragging it gives no preview, no action and no new version. A click opens "Upgrade to use this block".
  - Console and web/server logs were clean.
  - Not checked: where "See plans" leads (it opens `/account/billing` in a new tab), and a real screen reader (only Chrome's accessibility tree).
