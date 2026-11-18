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

### Log (2026-11-18, `feat(web): puck hooks check phase 3, action-bar drag handle and own overlay`)
- Shipped:
  - **Drag handle: works, no patch.** `dnd={{ enableDragHandle: true }}` on `<Puck>` in `PageEditor.tsx`. Puck passes `ActionBar.DragHandle` as `dragHandle`, and `CanvasActionBar` renders it in its own group inside the `scale(1 / zoom)` wrapper. Body drags still work for blocks that aren't being edited. A selected Text block's body press goes to its inline editor (text selection), so the handle is how you move Text. That is the fix for spike phase 7's "Text can't be dragged".
  - **Placeholder:** with `behavior: "auto"`, a handle drag is "static" (`resolveDndMode`, `chunk-DQXMVPVM.mjs` ~L4501). Puck draws a 2 px `DropZone-linePlaceholder` line in `--puck-color-line-placeholder`, siblings don't move until the drop, and the dragged block stays faded in place.
  - **Drag preview under zoom:** the preview's top-left stays at pointer minus grab offset at both zoom 0.335 and zoom 1, for example offset [323,−21] with the preview at 203/580 and the pointer at 526/559. Because the handle is at the block's right end, a wide block's preview hangs off the canvas's left edge.
  - **`componentOverlay`: works, no patch.** `CanvasOverlay` in `EditorChrome.tsx` renders a Tailwind ring: `ring-fuchsia-600` when selected, `ring-fuchsia-400` with a faint background on hover. On hover it adds a label with the block's `label` from the config, counter-scaled by `1 / zoom`. It renders inside Puck's `overlayWrapper` in the iframe, and Tailwind classes apply there. `children` is Puck's default overlay div (`DraggableComponent-overlay`); we drop it, and none of Puck's own ring remains. Puck renders the overlay only on hover or selection, and not during a handle drag.
  - **Action bar off the top edge: works, no patch, our code.** Puck's `actionsOverlay` is `position: sticky`, but the bar still sat above the iframe for the first block on the page or a tall block scrolled past its top. `CanvasActionBar` measures its own top on mount and on iframe scroll and adds `translateY(shift)`, so the bar sticks to the iframe top (top 0 for the first block; 0 at scrollY 700, 1400 and 1471 for a 1212 px Section). The bar's placement otherwise stays Puck's.
  - Caveats (Puck DOM): the action-bar shift reads its own element's rect, not Puck's DOM. Scripts and tests depend on Puck class names (`ActionBarAction--grab`, `DraggableComponent--isSelected`), but the app code doesn't.
- **Result: both items work without a patch.**
- Differs from plan:
  - The bar placement was fixed in the action-bar override, not in `componentOverlay`. The overlay sits inside the block's box and can't move the bar.
  - Hovering over inline-editable text (Puck's `[data-puck-overlay-portal]`, for example a Text block's paragraphs or a Button's label) gives `hover: false`, so our hover ring doesn't show there. Puck draws its own dashed portal outline instead. Hovering a block's padding or a non-text area shows our hover ring.
  - Puck also renders an action bar inside the hover overlay, kept invisible by `opacity: 0; pointer-events: none`. A probe that picked the first `ActionBarAction--grab` in the DOM grabbed that bar and started a body drag of the block under it. Probes must target `[data-puck-overlay][class*=isSelected]`.
- Checked in the running app (my own check, then an e2e subagent on the Verify brief; nothing simulated except `dev:login-as`):
  - Handle drags on `seed-861ca6a6/small`, each one Undo step (`setUi, move, setUi!` plus a `replace` for RichText, then one history entry). At zoom 0.335 (desktop viewport, 1100 px window) and at zoom 1 (Phone viewport, iframe 375 px):
    - RichText in the root, below the next Section
    - RichText into a Section's slot
    - Heading out of a Section to the root
    - a whole Section into another Section's slot
    - Heading into the FreeGrid, and a Button out of it

    No text was selected mid-drag or after.
  - Overlay: the hover ring and label show on Sections at both zooms. Typing in a selected Text block reaches the canvas, Puck data and the side-panel field, as one Undo step. The action bar's Duplicate and Delete take clicks (Duplicate gives one entry). FreeGrid move (y changed) and resize (w 6→8) by RGL handles work with the overlay present, one entry each.
  - e2e: the same drag at both zooms, Undo, Redo, Save and reload all keep the new order (versions 13 and 15). The fixture was restored to its original order and saved as version 16, byte-identical in data to version 12. Console and server logs were clean.
  - **Side finding, not phase 3 (affects phase 2's undo result):** with a RichText block selected, Redo (`set`) is followed by a `replace` carrying only `ui.field = { focus: null, metadata: { from, to } }`. It has no `recordHistory`, so Puck records it as an entry whose data is identical to the previous one, and going back after a Redo takes two Undo clicks. I reproduced it inline. Likely source: a rich-text field resyncing its selection after the value is restored. Not fixed here.
  - Not checked: a drag with a real mouse or trackpad (Playwright's Chromium only), and touch.

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

### Log (2026-11-18, `feat(web): puck hooks check phase 4, auto-scroll and outline drag`)
- Shipped:
  - **Auto-scroll: works, no patch, and the cause was ours.** The app's global `body { overflow-x: hidden }` in `styles.css` also loads in Puck's iframe. `overflow-x: hidden` makes `overflow-y` compute to `auto`, so dnd-kit's `Scroller` (`@dnd-kit/dom` 0.4.0) took the iframe's `<body>` as the scroller. The body is viewport-high and the page overflows it, and its overflow propagates to the viewport, so `body.scrollTop += n` does nothing. dnd-kit counted that as a scroll and never tried `<html>`.
    - The fix moves the rule to `html { overflow-x: clip }`. With nothing on body, dnd-kit picks `<html>` with the right frame transform (scale 0.335, offset 312/80).
    - Held 10 px above the canvas bottom edge at the desktop viewport, `large` scrolls about 1300 iframe px/s and reaches the end (15273) in about 12 s. It behaves the same at zoom 1.
    - A second effect of the same rule: dnd-kit's `getVisibleBoundingRectangle` clips every droppable by ancestors whose overflow isn't `visible`. With `hidden` or `clip` on the 2375 px body, blocks below the body's box counted as invisible, got no shape, and the drop target became `void`. `clip` on body still had that problem; on `html` it doesn't, because dnd-kit skips `<html>` in that walk.
    - Production needs this CSS fix (or no overflow on the iframe body) in #76.
  - **Outline drag: works, no patch.** Layers rows are dnd-kit draggables.
    - Within the root (Section 2 below Section 3) and into another slot (Section 1's Heading into Section 2's `items@1`), each move is `setUi, move, setUi!` and one Undo step.
    - The Layers panel (our `TabsContent`, `overflow-y-auto`) auto-scrolls on its own: held at its bottom it went 30 → 970 of 970.
    - Phase 7's "Layers can't drag" doesn't reproduce, and the spike log doesn't say how it was tried. The most likely cause is the scripted drag: a release without a further pointer move counts as a cancel (see the caveats).
  - Caveats:
    - **Release without a move cancels.** Puck enables only the droppables of the zone under the pointer, and dnd-kit measures their shapes asynchronously. Collisions are only recomputed on the next pointer move, so a release right after reaching the target, with no further move, drops on Puck's `Drawer` `void` droppable, which Puck treats as a cancel. This happens with or without scrolling. Real hands keep moving, and every probe since phase 3 adds a 2 px settle move before release.
    - **After the last root section in the canvas** means the last section's own 24 px bottom padding, which is 8 screen px at 0.335. Lower in the block is its nested `items` zone. That target is also inside dnd-kit's bottom auto-scroll band (20 % of the canvas), so mid-page targets near the bottom keep scrolling while you aim.
    - **After the last root section in Layers isn't reachable.** Hovering a container row expands it. Its row's lower part gives "before it", and below it nests into its children. You can move the last section up instead.
    - After a drop at the end, the view scrolls back by the source's height (250 iframe px), so the dropped block is only partly visible (e2e).
- **Result: both items work without a patch.** Auto-scroll needed a one-rule CSS fix in our own stylesheet.
- Differs from plan:
  - The cause was in `styles.css`, not in `EditorCanvas`. The `overflow-hidden` box and the `pointer-events` wrappers aren't involved: dnd-kit's scrollable list was the iframe's `BODY`, then `HTML`, at both zooms, and never our box. The own-fallback scroller wasn't needed.
  - I found it by temporarily instrumenting the prebundled `node_modules/.vite/deps/@puckeditor_core.js`. Vite keeps prebundled deps in memory, so changes there need a dev-server restart. The original was restored afterwards and the results were rechecked on clean code.
- Checked in the running app (my own check, then an e2e subagent on the Verify brief; nothing simulated except `dev:login-as` and a `setUi` selection before canvas drags):
  - Before the fix, on `seed-861ca6a6/large`: no scroll in 3 s at zoom 0.335 or zoom 1, and drops near or below the fold cancelled.
  - After the fix: Section 1 (`Section-c0107cbf`) held at the bottom edge scrolls to the end with no wheel input. Dropped on the last section's bottom padding, it becomes root@52 (last, not nested), one history entry. The e2e ran this 3 times with the same result, sampling scrollTop at about 1300 px/s up to 15273.
  - Layers: Section 2's row below Section 3's changes the canvas DOM order the same way, and one Undo restores both. The long-list drag and the cross-slot drag are described above.
  - Left without saving: `page_content` is still at version 10 and `page.updated_at` is unchanged. Console and server logs were clean.
  - e2e side note: on `large`, block titles are off by one from their position (`Section-c0107cbf` reads "TabA heading edit", the last block reads "Section 1") because of earlier saved edits. The ids are what the checks used.
  - Not checked: a real mouse or trackpad, touch, and auto-scroll toward the top edge (dnd-kit handles it the same way as the bottom edge).

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

### Log (2026-11-18, `docs: puck hooks check phase 5, result on #74, evaluation update and cleanup`)
- Shipped:
  - **Comment on #74.** All five items work without a Puck patch, so the failure rule doesn't apply and the verdict stands. Each item lists its how and caveats. It links this log and the evaluation on `pagebuilder-tryout`.
  - **Evaluation updated:**
    - condition 1 is marked met, with the two causes that were ours and the main caveats
    - the Customisability rows for drawer, action bar, undo, outline and canvas give the check's results
    - the quirks list and ease-of-use table mark what was fixed
    - "What we'd build" has the proven items and a long-page drag row (the CSS rule plus an end-of-page drop area)
    - Risks names the `Drawer-draggableBg` class name
  - The spike log's phase 7 friction lines and scores (auto-scroll, Layers drag, Text drag) point to this check.
  - Cleanup:
    - `useHistoryProbe` removed from `EditorChrome.tsx`
    - `onAction` in `PageEditor.tsx` back to the spike's `__puckActions` logger
    - the web (:3000) and backend (:3001) dev servers and the `playwright-cli` session stopped
    - `/tmp/hooks-check/` deleted
    - the phase 1–4 code and the `styles.css` fix kept
- Differs from plan:
  - The Redo duplicate entry (phase 3) is recorded as an open caveat for #76, not investigated. The user chose that.
  - The plan's "phase 7 friction lines (~L729, L752, L768)" are in `puck-spike-log.md`, not the evaluation, and they were annotated there.
  - The evaluation had no "Drag on long pages" row. That score is in the spike log, and the evaluation got a new row in "What we'd build".
  - Phases 1–4 weren't pushed, so the branch had to be pushed before posting for the log link to resolve.
- Checked in the running app: nothing (Verify was None). `bun run verify` exited 0.
