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

## Phase 2: Undo and redo keep the viewport; selecting records no history

**Goal:** we know whether undo and redo, from both the header and the hotkeys, keep the current viewport, and whether selecting a block can be kept from ever creating a history entry. Neither may patch Puck.

**Files:** `EditorChrome.tsx` (`ViewportSwitch` L133, `EditorHeader` L170 with the Undo/Redo buttons), `use-block-actions.ts` (`useEditorHotkeys` L195), `PageEditor.tsx` (`onAction` L62, which logs only `action.type`, so add `recordHistory` and the history length there), `ResponsiveField.tsx`, `editor-fields.tsx`, `ServicePicker.tsx`, `render-config.tsx` (any `resolveData` / `resolveFields`).

**Steps:**
- Pin down the spurious entries first. On `seed-8cb1127f/home`, log every action with its `recordHistory` and `history.histories.length` before and after each step: select the Hero, and select an Image right after load. Name the action and where it comes from.
- Stop the entries at the source if it's our code. Otherwise drop them with `history.setHistories` / `setHistoryIndex` when an entry's `data` equals the previous entry's. Record which way worked.
- Keep the viewport: when the history index changes through undo or redo, put back the viewport the user had before it with the store's `setUi({ viewports }, false)`. This must cover the header buttons and Puck's Ctrl/⌘+Z, Shift+Z and Y, both on the host and inside the iframe. Use whichever is simpler and record it: a subscription to the history index, or a capture-phase hotkey wrapper.
- Selection after undo stays Puck's, unless it points at a block that no longer exists.
- Check undo on top of per-breakpoint edits:
  - Move a FreeGrid cell on phone, switch to desktop, then undo. Phone's layout reverts and the viewport stays desktop.
  - Set phone padding, switch to desktop, then undo.
- Check that redo still works after the viewport restore, and that the restore itself adds no entry.

**Tests that matter:**
- None (throwaway). The browser checks below are the evidence.

**Done when:**
- The log names the cause of the spurious entries and gives the result for both parts of the item.

**Verify:**
- **Org `seed-8cb1127f`, page `home`, in the editor.**
  - Right after load, select the Hero, then an Image: Undo stays disabled and no "Unsaved changes" appears.
  - Edit the heading text, switch to phone, then press Undo (button) and Ctrl+Z (once with focus in the canvas, once outside it). The text reverts, the view stays on phone, and Redo brings the text back, still on phone.
  - Leave without saving. No DB rows change.
- Nothing is simulated.


### Log (2026-11-18, `feat(web): puck hooks check phase 2, undo keeps viewport and no spurious history`)
- Shipped:
  - **Spurious entries: the cause was ours.** `ServicesSection.resolveData` in `editor-config.tsx` returned `readOnly: { tone, padding }`. Puck's load-time resolve sees the data change and dispatches a recording `replace` about 0.75 s after load. History goes to 2 entries, Undo turns on and "Unsaved changes" shows before any click, so the spike blamed the first selection. Selecting itself only dispatches `setUi`, which never records. The same resolve also made every Services insert two Undo steps.
  - **Fix at the source:** the `resolveData` is gone. `withLockedFields` (outermost but one, after `withResponsiveFields`) wraps each field named in `LOCKED_FIELDS` in a custom field that renders the original field through Puck's exported `AutoField` with `readOnly`. Puck has no static per-field `readOnly`; the map from `resolveData` is the only built-in way. The panel looks the same: lock icon, disabled fieldset or select. The `setHistories` fallback wasn't needed.
  - **Viewport kept on undo and redo:** `useKeepViewportOnHistory` in `EditorChrome.tsx` (in `EditorLayout`). A layout effect on `history.index` compares the viewport with the last one seen while the index was unchanged. If undo or redo moved it, it dispatches `setUi({ viewports })` with the user's viewport, and a dispatched `setUi` never records. One subscription covers the header buttons and Puck's hotkeys on the host and in the iframe. No hotkey wrapper is needed. Puck's `back`/`forward` show up in `onAction` as a `set` action. The same effect clears `itemSelector` if it no longer resolves (not hit in testing; Puck's restored selection always existed).
  - Debug hooks kept for the next phases: `onAction` in `PageEditor.tsx` also pushes `{ type, recordHistory, action }` to `window.__puckLog`, and `useHistoryProbe` (`EditorChrome.tsx`) sets `window.__getPuck` and logs history length and index changes.
- **Result: works, no patch.** Both parts use only Puck's exported API (`AutoField`, `useGetPuck`, `usePuck`, dispatched `setUi`). No reliance on Puck's DOM.
- Differs from plan:
  - The store helper `setUi(ui, false)` isn't exported. A dispatched `setUi` action does the same thing, because `storeInterceptor` never records it.
  - The verify page `seed-8cb1127f/home` has no Image block. The Image case was checked on `seed-5b981653/home` and `seed-861ca6a6/small`.
- Checked in the running app (my own check on `seed-861ca6a6/small` and three other pages, then an e2e subagent on the Verify brief; nothing simulated except `dev:login-as`):
  - After load, history is 1 entry and Undo is disabled. Selecting every block on `seed-8cb1127f/home`, `salon`, `seed-5b981653/home` (two Images) and `seed-861ca6a6/small` adds no entry and shows no "Unsaved changes".
  - Heading text edited on desktop, then a switch to phone: undo and redo by the header buttons, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, with focus in the iframe and on the host, all revert and restore the text with the view staying on phone. History stays at 2 entries throughout. Every history entry's own `ui` still holds 1280, so the hook is what keeps the phone view.
  - FreeGrid cell moved on phone, then a switch to desktop and Undo: `layout.mobile` is removed, the view stays on desktop, and Redo restores it (phone rows 1, 7). Section padding set to Large on phone, then the same undo from desktop: it reverts to `mobile: "small"` on desktop, and Ctrl+Shift+Z redoes it.
  - Inserting a Services section with "+" dispatches `insert, replace, setUi, setUi`, which is one history entry, and one Undo removes it.
  - Leaving with Back without saving changed no rows (`home` still at version 2, `updated_at` unchanged). Console and server logs were clean.
  - e2e side notes: Back with unsaved changes leaves with no prompt (leave guard, #76). Undo of an edit deselects, because the entry before it has no selection (Puck's behaviour, kept). One canvas click on phone changed the selection without a `setUi` in `__puckLog` (debug log only, not pursued).
  - Not checked: an undo whose restored selection no longer exists. Inline text editing undo (only the panel input).
