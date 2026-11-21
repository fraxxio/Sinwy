# Page editor log

Finished phases of [page-editor-plan.md](page-editor-plan.md), each with its spec and log entry.

---

## Phase 1: Editor route, layout and save

**Goal:** an owner opens a page from the page detail screen into a full-window editor with our header, an Add/Layers panel, a scaled canvas with phone, tablet and desktop views, and a settings panel, and can save their changes.

**Files:**
- New: `src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`; `src/modules/org-dashboard/components/page-editor/` (`PageEditor.tsx`, `EditorLayout.tsx`, `EditorCanvas.tsx`, `editor-config.tsx` or similar; split only where it helps).
- `src/root.tsx` L59 and `src/router.tsx` L29 (`staticData.appShell`): how the editor route drops the shell chrome.
- `src/modules/org-dashboard/lib/page-queries.ts`: add `savePageContent` next to `updatePage`.
- `src/modules/org-dashboard/components/pages/PageContentSummary.tsx`: "Edit content" button and new description text.
- `src/shared/components/page-builder/puck-config.ts` (`puckConfigFrom`), `blocks.tsx` (`BLOCK_RENDERS`, `pageMetadata`), `PageDocumentView.tsx` (how the read-only config and metadata are built).
- `src/styles.css` around L667: the `overflow-x` rule.
- Spike: `EditorChrome.tsx` (`EditorHeader`, `EditorCanvas`, `ViewportSwitch`, `LeftPanel`, `RightPanel`), `PageEditor.tsx`, and route `_shell.pages.$id.edit.tsx`.

**Steps:**
- The route checks `pages:write`. Without it, or when the page fails to load, it shows the message and a Back link, and doesn't mount Puck. The editor is loaded lazily so Puck stays out of other dashboard routes.
- Pick the cleanest way to drop the shell chrome for this route: a static flag the root reads, or a route outside `_shell` that reuses its `beforeLoad`. Use the spike's `fixed inset-0` layer only if neither works, and record why.
- Header: Back (to page detail), page title and its public path, the viewport switch with text labels, the save status, and Save. Undo and Redo come in phase 5.
- Left panel: tabs "Add" (Puck's default `Puck.Components` for now) and "Layers" (`Puck.Outline`). Right panel: `Puck.Fields`, with a short hint when nothing is selected.
- `EditorCanvas`: sizes the iframe to the current viewport and scales it to fit, and a click on the empty canvas around the page deselects.
- Root render: `renderDropZone` for `root:default-zone` with `allow: ROOT_ALLOW`, with a visible drop area at the end of the page (a padded, dashed "Drop blocks here" region). If `renderDropZone` with `allow` doesn't hold in the browser, record what happens and keep the server check as the guard.
- Empty page: a first-run message in the canvas ("Add your first block from the Add panel"). Phase 4 turns it into clickable cards.
- Dirty state: compare `appState.data` with the last saved document. Use a cheap check such as a reference check first and a deep compare only when the reference changed. Selecting a block, switching viewport or opening a panel must never mark it dirty.
- Save sends `baseVersion` and keeps the new version from the answer. 409 says the page was saved somewhere else and to reload, and stays dirty. 402 names the block that needs a higher plan. 400 shows the server's message. A failed save never clears the dirty state.
- Move `overflow-x: hidden` from `body` to `html { overflow-x: clip }` and check that the dashboard and storefront still don't scroll sideways.
- Rename `PageContentSummary`'s "Editing it comes with the page builder" text and add the "Edit content" button for members with `pages:write`.

**Tests that matter:**
- The dirty-state compare: an equal document isn't dirty; a changed prop deep in a slot is.
- The save error mapping: 409 and 402 give their messages and leave the editor dirty.

**Done when:**
- From the page detail screen, "Edit content" opens the editor without the dashboard sidebar.
- A Hero can be dragged onto an empty page, saved, and is on the preview screen.
- Selecting blocks and switching viewports never shows "Unsaved changes".
- `bun run check:storefront-bundle` passes.

**Verify:** Seed `pro-org`, log in as the owner, create a page "Home". Page detail → Edit content: the editor fills the window, the canvas shows the first-run message. Drag Hero from Add onto the canvas: it appears, Save turns on. Switch Phone → Tablet → Desktop: the canvas resizes and the status doesn't change. Select the Hero's heading, edit the text in the settings panel, Save: `page_versions` gets a new row for the page with the edited heading, and Preview shows it. Try dragging a Heading onto the root: it's refused in the canvas (or, if `renderDropZone` didn't hold, the save is refused with a 400 and a clear message). Open the same page in a second tab, save there, then save in the first tab: the first tab says the page was saved somewhere else and stays unsaved. Back returns to the page detail. Nothing is simulated except login.

### Log (2026-11-20, `feat(web): add page editor route, layout and save`)
- Shipped: the route `/dashboard/$organizationSlug/pages/$id/edit` (lazy-loaded `PageEditor`, `pages:write` check with message and Back), full window via `staticData.fullWindow` read in `_shell.tsx`. Header with Back, title and public path, Desktop/Tablet/Phone switch with text labels, save status and Save. Add (`Puck.Components`) and Layers tabs, settings panel with a hint when nothing is selected, our `EditorCanvas`. Root render with `renderDropZone` + `ROOT_ALLOW`, a dashed "Drop blocks here" area at the end and a first-run message on an empty page. `PageFrame` extracted into `blocks.tsx` so the editor and `PageDocumentView` share the page wrapper. `savePageContent`, the dirty compare and the save error mapping in `save.ts` with tests. `overflow-x` moved to `html { overflow-x: clip }`; Puck tokens and the ProseMirror rule from the spike added to `styles.css`. "Edit content" on the page detail for `pages:write`.
- Differs from plan: the shell is dropped with a static flag that `_shell.tsx` reads (it renders the sidebar, not `root.tsx`), so the route stays under `_shell` and keeps its `beforeLoad`. The 402 message is built on the client with `lockedBlocksIn`, because the server's says only "Your plan doesn't include this". The dirty baseline after a save is the data sent, not the server's answer. Puck's own empty-zone outline is turned off on the root zone (`empty:…!`) so only our dashed area shows. The plan calls the versions table `page_versions`; it's `page_content`.
- Checked in the running app: the full Verify brief passed in a subagent on a fresh `pro-org`: the editor fills the window with the first-run message; a Hero dragged in turns Save on; viewport switches keep the status; a heading edit saves as a new `page_content` row and shows in Preview; a Heading dragged to the root is refused while a Section is accepted (the server also answers 400 to a root Heading); a save from a second tab makes the first tab's save show the conflict message and stay unsaved; Back returns to the page detail. Inline: selecting and deselecting blocks never marks unsaved; a reload of a saved page stays "All changes saved"; no sideways scroll at 375 px on the dashboard, Pages, `/book` and home; `check:storefront-bundle` passes. Not checked: a 400 from the editor, since the canvas prevents invalid documents (the mapping is unit-tested). Back doesn't warn about unsaved changes; that is #77's leave guard.

## Phase 2: Fields, action bar and block toolbar

**Goal:** every block's settings can be edited in our own field UI, locked fields are read-only, and every block has an action bar with a drag handle and a toolbar whose actions have text labels.

**Files:**
- `src/modules/org-dashboard/components/page-editor/`: `PageEditor.tsx` (add `overrides` and `dnd={{ enableDragHandle: true }}` to `<Puck>`), `EditorLayout.tsx` (`RightPanel` gets the block toolbar), `editor-config.tsx` (`editorConfig` takes `customFields`).
- `src/shared/components/page-builder/puck-config.ts` (`CustomFields`, `CustomFieldUi`, `metadata.locked`).
- `Sinwy.Shared/types/page/blocks/fields.ts` (`field.serviceIds`, `locked`).
- `src/modules/org-dashboard/lib/service-queries.ts` (`servicesQuery`; the editor route already loads it and passes active services as `metadata.services`).
- Spike: `ServicePicker.tsx`, `editor-fields.tsx` (`fieldOverrides`, `EditorFieldLabel`, controls), `EditorChrome.tsx` (`BlockToolbar`, `CanvasActionBar`, `CanvasOverlay`), `use-block-actions.ts`, `editor-actions.ts`.

**Steps:**
- `customFields.serviceIds`: a checklist of the org's active services, in their order, with "All services" meaning an empty list.
- Locked fields: wrap any field with `metadata.locked` in a custom field that renders `AutoField` read-only with a lock icon and a one-line reason. No `resolveData`.
- Field overrides use shadcn controls and plain labels, matching the dashboard's forms.
- `actionBar` override: drag handle, the block's label, Duplicate and Delete. `dnd.enableDragHandle` is on. The bar shifts itself down when Puck would clip it at the iframe top.
- `componentOverlay`: our ring for hover and selected, with the block's label on hover.
- Block toolbar at the top of the settings panel, with text labels, not only icons: "Move up", "Move down", "Duplicate", "Delete", "Select parent block". Each dispatches through `useGetPuck().dispatch` and is one history entry.
- Duplicate gives every copied block, nested ones included, a fresh id.

**Tests that matter:**
- Duplicate re-ids every nested block, and the copy passes `pageDocumentSchema`.
- Move up and down stay within the slot and do nothing at its ends.

**Done when:**
- A Services block's picker saves the chosen ids, and the storefront shows only those.
- A Text block can be moved by its handle.
- Selecting any block adds no history entry.

**Verify:** Seed `bookable-org` (two services), log in, create a page and open the editor. Add Services, then in its settings untick "Colouring" and Save: the latest `page_content` row's Services props hold only Haircut's id, and Preview lists only Haircut. Add a Section with a Text inside. Drag the Text by its handle to below another block: it moves. With the Text selected, "Select parent block" selects the Section, "Duplicate" adds a copy below, "Move up" moves it, and "Delete" removes it. Each of these is one Undo step (checked with Ctrl+Z after phase 5; for now check that the history length grows by one). Nothing is simulated except login.

### Log (2026-11-21, `feat(web): add editor fields, block toolbar and action bar`)
- Shipped: field overrides for text, select and radio (shadcn `Input`, `Select`, a native-radio segmented control) and the field label; a "Services" checklist (`serviceIdsField`) with "All services" meaning `[]`, ids stored in the org's order, all-ticked stored as `[]`, and the last ticked service can't be unticked; `lockedField` wrapping `AutoField` read-only with a lock and a reason, applied by `withLockedFields` to every field with `metadata.locked`. The settings panel's block toolbar with text labels: "Select parent block" (nested blocks only), "Move up", "Move down", "Duplicate", "Delete". The canvas action bar (drag handle, label, Duplicate, Delete) with `enableDragHandle`, scaled back up by the canvas zoom and shifted down when clipped, and our hover/selection overlay with the block's label on hover. `cloneBlock` re-ids every nested block from the manifest's slots; tests cover clone ids, schema validity and moves at slot ends and in nested slots. The shadcn `Checkbox` was added.
- Differs from plan: the zoom for the canvas chrome is a module store (`setCanvasZoom`), not the spike's context, which doesn't reach Puck's `actionBar`/`componentOverlay`. Services come through `EditorServicesContext` because Puck passes no `metadata` to fields. The action bar has no "select parent" arrow; the toolbar has it. No manifest field is locked, so the locked UI was checked with a temporary `locked: true` on Services' title (reverted). Verify's "drag the Text below another block" can only mean within the Section, since the root refuses Text.
- Checked in the running app: inline on `bookable-org` with a temporary `window.__getPuck` probe (removed): clicking Services, a Section and a Text and "Select parent block" kept history at 5 entries; Duplicate, Move up, Delete and a handle drag of the Text into another Section each added exactly one; Move up is disabled at the top; Delete clears the selection; with Title locked, the input is read-only with the lock and reason, and loading and selecting add no history entry and keep "All changes saved". The full Verify brief passed in a subagent on a fresh `bookable-org` with the page created in the UI: unticking Colouring saved only Haircut's id, and Preview and the published page list only Haircut; the Text moved by its handle below a Heading in its Section; "Select parent block" selected the Section; Duplicate, Move up and Delete (panel and action bar) each undid as one step with Puck's built-in Ctrl+Z and redid with Ctrl+Shift+Z; selecting never showed "Unsaved changes"; no console, backend or web log errors. Found: during a handle drag the ghost sits near the iframe's left edge instead of under the pointer (drops land correctly); not investigated, left for phase 8. Not checked: a drag with a real mouse.

---

## Phase 3: Photos and Booking blocks, drawer metadata

**Goal:** the manifest has a ready-made Photos block and a Booking block gated by `premium-blocks`, every block has a plain-language description and a drawer group, and the server refuses a new Booking block on Starter.

**Files:**
- `Sinwy.Shared/types/page/blocks/blocks.ts` (`BLOCKS`, `ROOT_ALLOW`, `CONTENT`), `fields.ts` (`defineBlock`, `BlockDefinition`).
- `src/shared/components/page-builder/blocks.tsx` (`BLOCK_RENDERS`, `ServiceList`, `Placeholder`), `urls.ts`.
- `src/modules/storefront/routes/book.tsx` (search param `service`).
- `Sinwy.Backend/modules/pages/service.ts` (`savePageContent`, the gated-type check) and `tests/pageDocument.test.ts`.
- `src/shared/tests/puck-config.test.ts`, `page-document-view.test.ts`.
- `docs/org-rules-map.md` around L203.
- Editor: Booking's `serviceIds` uses `field.serviceIds`, so `serviceIdsField` in `page-editor/editor-fields.tsx` renders it with no editor change; `cloneBlock` and `zoneContent` read slots from the manifest, so Photos' `items` needs nothing there either.

**Steps:**
- `defineBlock` requires `description` (one plain sentence) and `group` (`"ready" | "content" | "layout"`). Write descriptions for every block in a salon owner's words; for example, Section: "A band across the page that holds text, photos and buttons."
- Photos and Booking follow Defaults 8 and 9. Add Photos to `ROOT_ALLOW` and to Section's `allow`, and Booking to `ROOT_ALLOW`.
- Photos on the storefront: a grid with as many columns as photos (up to 4, then it wraps), the chosen gap, and on a phone either side by side or stacked. Empty Image placeholders keep their own size and don't overlap on a phone (the spike's task 4 bug).
- Booking on the storefront: a panel with title, intro, the chosen services as buttons into `/book?service=<id>`, and a main "Book now" button to `/book`. Reuse the Services list markup where it fits.
- Don't touch the server's gating logic. Check that it already refuses a new Booking block on Starter and allows one that the latest version already has.
- Update `docs/org-rules-map.md`: `premium-blocks` now gates Booking.

**Tests that matter:**
- Server: saving a document with a new Booking block on a Starter org returns 402 `PLAN_UPGRADE_REQUIRED`; on Professional it saves; on Starter, a page whose latest version already has Booking (downgrade case) saves.
- Photos accepts only Image children, and a Photos block nested deeper than allowed is refused.
- `puckConfigFrom` keeps working for the new blocks: fields and defaults come from the manifest.

**Done when:**
- Both blocks render on the storefront and pass the document schema.
- `bun run check:storefront-bundle` passes.

**Verify:** Seed `pro-org`. Through the editor from phase 1, add Photos and Booking (Puck's default drawer lists them), fill two image URLs (`https://picsum.photos/id/1062/800/800`, `https://picsum.photos/id/1027/800/800`), Save and publish from page detail. The public page shows two photos side by side on desktop and stacked at 375 px wide, and Booking's buttons lead to `/<org>/book?service=…` and `/<org>/book`. Seed `subscribed-org` (Starter). Saving a document with a Booking block through the API (`PUT …/content`, as the owner) returns 402 with `PLAN_UPGRADE_REQUIRED`, and no new `page_content` row exists. Nothing is simulated except login.

### Log (2026-11-21, `feat(backend, web, shared): add Photos and Booking blocks with drawer metadata`)
- Shipped: `defineBlock` requires `description` and `group`; every block has a plain sentence, and `BLOCKS` is reordered to drawer order (Hero, Services, Photos, Booking, Heading, Text, Image, Button, Section, Columns). Photos: an Image-only `items` slot with two square Image placeholders, `gap` (none/small/medium/large) and `phoneLayout` (side by side / stacked, default stacked), allowed at the root and in Section. Booking: `title`, `intro`, `serviceIds`, `requires: "premium-blocks"`, root only; it renders a muted panel reusing `ServiceList` (Book links to `/book?service=<id>`) and a main "Book now" to `/book`. Tests: schema (Photos only takes Image; refused in Columns, in Photos; Booking refused in Section), `lockedBlocksIn` on the real Booking, API 402 on Starter with no new version, Professional saves, downgrade keeps saving, public page serves services for Booking, storefront renders of both blocks, the storefront Puck config leaves out Booking's `serviceIds`.
- Differs from plan: the public page loaded services only for a Services block, so Booking would have shown none; the pages service now also loads them for Booking (`listsServices`). The gating logic itself is untouched. `saveErrorMessage` lost its test-only `blocks` parameter now that Booking is real. Photos uses a CSS `auto-fit` grid rather than counting children (a slot render can't see its child count). The book route already took `?service=`, so it didn't change.
- Checked in the running app: inline on `pro-org` with a Photos (three empty Images) and Booking page saved through the API: Desktop shows the placeholders in a row, Phone stacks them at their own size with no overlap. The full Verify brief passed in a subagent on fresh `pro-org` and `subscribed-org` seeds: Photos and Booking dragged in from Puck's drawer, two picsum URLs filled, saved (version 2 holds both blocks) and published; the public page shows the photos side by side at 1440 (504×504 each) and stacked at 375 (328×328, no horizontal overflow); Booking's links are `/<org>/book?service=<id>` (opens the flow with Haircut preselected) and `/<org>/book`; on Starter, `PUT …/content` with a Booking block returned 402 code 4021 and `page_content` kept only version 1. No console, backend or web log errors. Noted, not changed: the selected Booking block's Puck toolbar overlaps the photo above it on Desktop (cosmetic, phase 8); the storefront header's org-name link points to `/book` (existing code in `$pageSlug.tsx`).

## Phase 4: Block drawer, locked tiles and insert-and-scroll

**Goal:** the Add panel is our own drawer of large preview cards in plain language, ready-made blocks first, with locked tiles for blocks the plan lacks, and a click adds the block where the user expects and scrolls to it.

**Files:**
- `src/modules/org-dashboard/components/page-editor/`: `EditorLayout.tsx` (`LeftPanel`'s Add tab renders `Puck.Components` today), `EditorCanvas.tsx` (first-run state), `PageEditor.tsx` (`EditorServicesContext`; add an entitlements value next to it if fields or overlays need it), `block-actions.ts` (`ROOT_ZONE`, `cloneBlock`, `zoneContent`; add `placementFor`/`slotAccepts` here), `use-block-actions.ts` (add insert).
- `Sinwy.Shared/types/page/blocks/fields.ts` (`BlockGroup`, `description`, `group`, `requires` on `BlockDefinition`), `blocks.ts` (`BLOCKS` is already in drawer order within each group; `ROOT_ALLOW`, slot `allow` lists).
- `src/shared/lib/auth/entitlements.ts` (`useEntitlements`), `src/shared/lib/plans.ts` (`minimumPlanFor`, `getPlanName`), `src/shared/components/UpgradePrompt.tsx` (`UpgradeAction`).
- Tests: `src/modules/org-dashboard/tests/` (next to `page-editor-save.test.ts`).
- Spike: `EditorChrome.tsx` (`DRAWER_GROUPS`, `BLOCK_INFO` sketches, `BlockCard`, `BlockDrawer`), `editor-actions.ts` (`placementFor`, `slotAccepts`), `use-block-actions.ts` (insert).

**Steps:**
- Replace `Puck.Components` with our drawer: one `Drawer` per group, a 2-column grid of `Drawer.Item` cards, each with a sketch, label, description and a visible "Add" button. Groups and order follow Default 3, built from the manifest's `group`.
- Locked tile per Default 10, for blocks whose `requires` isn't in `useEntitlements()`. It sits in its normal group, looks disabled with a lock and "Upgrade to use", and is never a `Drawer.Item`.
- Click-to-add per Default 5, as one history entry. After the insert, select the new block and scroll the iframe to `[data-puck-component="<id>"]`. Wait for it to exist rather than using a fixed delay.
- Drops still go where Puck puts them. Check that a card dropped on the end-of-page drop area lands last at the root.
- First-run state per Default 11, using the same click-to-add.
- Search isn't in scope. Keep the drawer short enough that it isn't needed.

**Tests that matter:**
- Placement: after a selected Image inside Section → that Section's slot after the Image; Hero with an Image selected → root after the Image's Section; nothing selected → root end; a type no slot accepts → root end.
- Locked: a type whose `requires` isn't in the features renders as a locked tile, not a `Drawer.Item`.

**Done when:**
- On Starter, Booking is a locked tile with an upgrade dialog; on Professional it can be added.
- Clicking a card on a long page adds the block after the selection and scrolls it into view.

**Verify:** Seed `subscribed-org` (Starter), log in, open a new page's editor. The canvas shows the first-run cards; clicking Hero adds it. In Add, the groups are Ready-made, Content, Layout, in that order, each card with a sketch and a sentence. Booking shows a lock; dragging it does nothing and clicking it opens a dialog naming Professional with "Upgrade plan" (owner) leading to `/account/billing?change=plan`. Add four Sections by clicking, select the first Section's Text and click Image: the Image appears right after the Text, inside that Section, selected, and scrolled into view. With nothing selected, click Photos: it goes to the end of the page and the canvas scrolls there. Save: the `page_content` row has the blocks in that order. Seed `pro-org`: Booking is a normal card and can be added and saved. Nothing is simulated except login.

### Log (2026-11-21, `feat(web): add block drawer, locked tiles and click-to-add`)
- Shipped: `BlockDrawer.tsx` replaces `Puck.Components`: Ready-made, Content and Layout groups built from the manifest (`drawerGroups` in `block-actions.ts`), 2-column `Drawer.Item` cards with a Tailwind sketch per block (`SKETCHES: Record<BlockType, …>`, so a new block needs one), label, sentence and a visible "Add" button. Blocks whose `requires` the plan lacks are plain-button locked tiles ("Upgrade to use"); `BlockAccessProvider` (around `<Puck>` in `PageEditor`) holds the groups and the upgrade dialog (title "<Block> comes with the <plan> plan", `UpgradeAction`). `useEntitlements()` now also returns `features`. `useBlockActions().add(type)` dispatches `insert` (one history entry), selects the block and scrolls the iframe to it once `[data-puck-component=<id>]` exists (MutationObserver, 3 s cap; no scroll if already in view). The empty page shows `FirstRunBlocks` (ready-made cards, larger text for the scaled canvas) in the root render. Tests: placement (own slot, after selection, walking up, root end, unknown type, wrap) and drawer grouping and locking.
- Differs from plan: Default 5 is extended in two ways, both needed for the Verify brief and for empty Sections. First, the selected block's own slot is filled first when it accepts the type (so a selected Section, Photos or Hero takes the new block at its end). Second, a type the top level refuses (Text, Image, Heading, Button, Columns), with nothing suitable selected, is wrapped in a new Section, placed after the selected top-level block or at the end. Root-end for those types would have been refused by the server on save. The locked-tile test checks `drawerGroups` (which decides the tile kind) rather than rendering, since rendering a `Drawer.Item` needs Puck's store. The end-of-page drop works and needed no fix (see the Drops standing note).
- Checked in the running app: inline on `subscribed-org` (`seed-eb3674ca`), covering the first-run add, the locked dialog from both the drawer and the iframe card, placement on a long page with scrolling, and drops of the Services card at 5, 20, 40 and 70 px above the root zone's bottom (all landed last). The save gave version 2 in that order, with no console errors. The full Verify brief then passed in a subagent on fresh `subscribed-org` (`seed-67e6ac5f`) and `pro-org` (`seed-4e186ae8`) seeds:
  - first-run Hero; groups in order;
  - the locked Booking can't be dragged (a Hero drag to the same point landed), and its dialog's "Upgrade plan" leads to `/account/billing?change=plan`;
  - the Image went after the Text inside the first Section, selected and scrolled into view;
  - Photos went to the end with the canvas scrolled to the bottom;
  - `page_content` matched; on pro-org, Booking was added by click and by drag and saved.
- Noted, not changed: on a long page the iframe's background gradient ends partway down (it's sized to the iframe viewport; it predates this phase; phase 8). A drop on the canvas's empty space below the root zone adds nothing (Puck: the pointer isn't over the zone).

## Phase 5: History, viewport and keyboard

**Goal:** undo and redo never change the viewport and take one step each, selecting never records history, and the editor can be driven by keyboard per Default 6.

**Files:**
- `src/modules/org-dashboard/components/page-editor/`: `EditorLayout.tsx` (header: `ViewportSwitch`, `SaveControls`; undo/redo go here), `PageEditor.tsx` (where a hotkeys hook mounts inside `<Puck>`), `use-block-actions.ts` (`remove`, `move`, `selectParent`, `scrollToBlock` for ↑/↓), `block-actions.ts` (`selectorFor`, `zoneContent`, `moveTarget`; add the reading-order walk here), `BlockChrome.tsx` (toolbar and action bar call the same actions), `EditorCanvas.tsx`.
- Tests: `src/modules/org-dashboard/tests/page-editor-actions.test.ts`.
- Spike: `EditorChrome.tsx` (`useKeepViewportOnHistory`, the header's undo and redo), `use-block-actions.ts` (`useEditorHotkeys`).

**Steps:**
- Header: Undo and Redo buttons with text labels and their shortcuts in the tooltip.
- Keep the viewport per the standing note. Clear the selection if it points at a block that no longer exists after undo.
- Fix the RichText Redo duplicate entry. First find where the `replace` with only `ui.field` comes from. If it can't be stopped at the source, drop an entry whose `data` equals the previous entry's with `history.setHistories`. Record which way worked.
- Hotkeys per Default 6, on the host and inside the iframe, never while typing in an input, a select or the inline rich-text editor. Check which of these Puck 0.24 already handles, so it doesn't run twice.
- ↑ and ↓ follow the reading order of the whole tree (depth-first), and the canvas scrolls the newly selected block into view.
- Delete keeps Undo as the safety net. No confirmation dialog.

**Tests that matter:**
- Reading-order navigation over a nested tree: next and previous, first and last, Esc to the parent.
- Each keyboard edit (delete, move) is exactly one history entry.

**Done when:**
- Edit on desktop, switch to phone, undo and redo by button, Ctrl+Z and Ctrl+Shift+Z: the view stays on phone.
- Edit a Text block, Redo after Undo: getting back takes one Undo.

**Verify:** Seed `pro-org`, open a page with a Hero and two Sections (built in the editor and saved). Edit the Hero heading on desktop, switch to Phone, press Undo, Ctrl+Z (focus in the canvas) and Ctrl+Shift+Z: the text reverts and returns, and the view stays on Phone. Select blocks one by one: Undo stays disabled and the status stays "Saved". Edit a Text block's words, Undo, Redo, Undo: the text is back after one Undo. With a Section selected: ↓ selects its first child, Esc selects the Section again, Alt+↓ moves it below the next Section, Delete removes it, Ctrl+Z brings it back. Save: the `page_content` row matches the canvas. Nothing is simulated except login.

### Log (2026-11-21, `feat(web): add undo and redo, keyboard shortcuts and keep the view on history`)
- Shipped: header Undo and Redo buttons with text labels and their shortcut in a tooltip (`HistoryButtons`). `KeepUiOnHistory` puts the user's whole `ui` back after undo or redo: the viewport, and the selection by block id while that block exists (else the restored selection if it's valid, else none). It also clears `field.focus`. `useEditorHotkeys`: Delete/Backspace (taken over from Puck, which left the next block selected), ↑/↓ in depth-first reading order with scroll into view (skipping Columns' hidden columns), Esc to parent then deselect, Alt+↑/↓ move. `SaveControls` handles Ctrl/⌘+S. All of them listen in the capture phase on the host and the canvas document; the canvas document comes from an `iframe` override (`useCanvasDocument`), not polling. `blockActions(getPuck)` is now a plain function behind `useBlockActions`. Tests: reading order (next, previous, ends, hidden columns, parent), and delete, move and Esc each making exactly one recorded dispatch (or none for Esc) with the selection set first.
- Differs from plan:
  - **RichText duplicate entry.** It was stopped at the source, so `setHistories` wasn't needed. Puck recreates the rich-text editor on every time travel. If the restored `ui.field.focus` still names that field, the new editor's debounced `onChange` dispatches a data-identical `replace`. Puck records it, which also truncates the redo stack. Clearing `field.focus` after travel stops it. I traced it with a temporary `onAction` logger; Tiptap's `update` never fired.
  - **Selection and UI restore.** Keeping only the viewport, as the spike did, wasn't enough. Ctrl+Z after typing deselected the block, because history entries carry their old selection. Then typing after an undo was silently dropped, because the restored `field.focus` was null. So the whole `ui` is kept now.
  - **Undo and redo are Puck's own.** Puck 0.24 binds Ctrl/⌘+Z, Shift+Z and Y on both documents, even inside inputs; that wasn't changed.
  - **Ctrl/⌘+S works while typing,** because Default 6 lists it with the other keys, but saving from a field is what users expect. The other keys are ignored in text entry, and the arrows are also ignored in tab lists, menus and radio groups.
  - **↑/↓ with nothing selected** start at the first or last block, but only when focus is in the canvas.
  - **Text blocks have no inline editor in the canvas;** they're edited in the settings panel.
- Checked in the running app:
  - Inline on `pro-org` (`seed-320a92a9`), reading Puck's history through a temporary debug handle:
    - typing and then Undo/Redo/Undo, by button and by keys with focus in the Tiptap editor, each step one entry;
    - the viewport stays 375 through the buttons, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y from the canvas;
    - selecting never records;
    - ↑/↓/Esc walk the tree;
    - Alt+↓, Alt+↑ and Delete each add one entry, and Ctrl+Z restores the block;
    - Backspace in a settings input only edits the text, and from the host page it deletes the block;
    - Ctrl+S from the canvas saved version 3.
  - The full Verify brief then passed in a subagent on a fresh `pro-org` (`seed-a06af397`): the view stayed on Phone through every undo/redo, Undo stayed disabled while selecting, and the Text was back after one Undo. ↓, Esc, Alt+↓, Delete and Ctrl+Z worked as briefed, and `page_content` version 3 matched the canvas. No console errors. Server logs weren't checked (servers started by the user).
- Noted, not changed: after undoing a delete nothing is selected, because the deleted block was deselected first. After undo the rich-text editor loses DOM focus (Puck remounts it), so the user clicks back in to keep typing.

## Phase 6: Editor e2e spec for Puck upgrades

**Goal:** `bun run test:editor` runs a committed Playwright spec against the running stack that covers the editor's core flows, and the README says to run it before any Puck upgrade.

**Files:**
- New: `Sinwy.WebFrontend/e2e/` (or the place Playwright's config points), `playwright.config.ts`, a `test:editor` script in the root `package.json`.
- `.playwright/cli.config.json` (system Chromium path), `Sinwy.Backend/scripts/dev/seedScenario.ts`, `loginAs.ts` (`--state` writes a storage-state file).
- What the spec drives, in `src/modules/org-dashboard/components/page-editor/`: `EditorLayout.tsx` (buttons "Undo", "Redo", "Save"; status "All changes saved" / "Unsaved changes" / "Saving…"; viewport buttons named from "Desktop", "Tablet", "Phone"), `BlockDrawer.tsx` (`drawer-item:<Type>` test ids, "Add <Block>" buttons, locked tiles), `BlockChrome.tsx` (toolbar "Move up", "Move down", "Duplicate", "Delete", "Select parent block"), `use-block-actions.ts` (the shortcuts).
- API for setup and assertions: `POST /api/organizations/:orgId/pages` (`{ title, slug }`), `GET /api/organizations/:orgId/pages/:pageId` (`latestVersion.content`), both in `Sinwy.Backend/modules/pages/routes.ts`; send the session cookie and `origin: http://localhost:3000`.
- `README.md` (AI Agents and dev sections).

**Steps:**
- Add `@playwright/test` to the web workspace as a dev dependency, using the system Chromium the CLI config already uses.
- A global setup seeds a fresh `pro-org` and a `subscribed-org` through the dev scripts and logs in with stored state. The spec needs the backend and web dev servers running and fails early with a clear message if they aren't.
- Cover: open the editor; add by click (placement and scroll); drag a card onto the end drop area and a block by its handle (with the 2 px settle move); edit a field; undo and redo keep the viewport; the keyboard shortcuts; Save and reload; the locked Booking tile on Starter. Assert on the saved document through the API, not on Puck's internal class names, where possible.
- Keep it out of `bun run verify` and make sure Biome and `tsc` still cover the spec files.
- README: what the spec covers, how to run it, and the rule that it must pass before any `@puckeditor/core` upgrade.

**Tests that matter:**
- The spec itself, run three times in a row without flakes.

**Done when:**
- `bun run test:editor` passes three times in a row on a fresh seed.

**Verify:** None (the spec is the user flow).

### Log (2026-11-21, `test(web): add the page editor Playwright spec for Puck upgrades`)
- Shipped: `bun run test:editor` (`cd Sinwy.WebFrontend && bunx playwright test`) with `@playwright/test` 1.64.1 and `playwright.config.ts`, which uses the system Chromium from `.playwright/cli.config.json`, 1 worker, no retries, 1440×900, and traces on failure under `.playwright-cli/editor-e2e/results/`. In `Sinwy.WebFrontend/e2e/`:
  - `global-setup.ts` checks that both servers answer, then runs `dev:seed-scenario pro-org` and `subscribed-org` and `dev:login-as --state`, and writes `.playwright-cli/editor-e2e/stack.json`.
  - `editor-fixtures.ts`: `test` with `plan` ("pro"/"starter"), `org`, `pages` (`create(blocks)` via POST and PUT content, `saved(id)`) and `editor` (canvas, panels, `select`, `save`); also `drag`, `outline`, `heading` and `section`.
  - `editor.e2e.ts`, five tests: click-to-add (after the selected Heading, then Booking at the end of a long page, in view); a Services card dropped 20 px above the root zone's bottom lands last, and a Section moves by its handle; a field edit with Undo/Redo buttons and Ctrl+Z/Ctrl+Shift+Z on Phone, then Save and reload; selecting records no history; Esc, ↓, Delete, Ctrl+Z, Alt+↓ and Ctrl+S; on Starter, the locked Booking tile can't be dragged in, its dialog shows the Business plan and the billing link, and a first-run Hero saves.
  - It asserts on the saved document through the API.
  - `EditorLayout`'s side panels are now named landmarks ("Blocks", "Block settings").
  - README: an AI Agents subsection and a Common Scripts row.
- Differs from plan:
  - Spec files are `*.e2e.ts`, because `bun test` would run `*.spec.ts`.
  - The seed and login scripts are spawned (`bun run --silent …`), not imported, because Playwright runs under Node and they need Bun. `seedScenario.ts` and `loginAs.ts` didn't change.
  - Plan limits shape the suite: 4 Pro tests use 4 of the 5 pages, and Starter allows 1 page, so it gets 1 test.
  - `bun install` re-resolved every `latest` TanStack dependency, which left two `query-core` copies and a `tsc` error in `router.tsx`. So the lockfile change was trimmed by hand to the `@playwright/test` entries and installed with `--frozen-lockfile`.
- Found:
  - An undo within 250 ms of an edit does nothing, because Puck hasn't recorded the entry yet. The first run pressed Ctrl+Z right after Delete and the Section stayed deleted. The spec now waits for Undo to be enabled. Not changed in the editor; phase 8 should judge whether a person can hit it.
  - `locator.boundingBox()` on canvas elements already returns page coordinates through the iframe's scale, so the drags need no zoom maths.
- Checked in the running app: `bun run test:editor` passed 3 runs in a row on fresh seeds (5/5, about 21 s each), against the dev servers on :3000 and :3001. With `BACKEND_URL` pointed at a dead port, it stops in the global setup with "The editor spec needs the backend at … Start it with `bun run start:server`". Not checked: a real mouse, and a run on macOS (⌘ through `ControlOrMeta`).

## Phase 7: Typing performance on large pages

**Goal:** typing on a 250-block page at 4× CPU throttling is no slower than the spike (about 100 ms per key), measured on a production build.

**Files:**
- A 250-block page: `Sinwy.WebFrontend/e2e/editor-fixtures.ts` (`pages.create(blocks)`, the `heading`/`section` builders) and the org and storage state in `.playwright-cli/editor-e2e/stack.json` after a `bun run test:editor`. A measuring script can reuse them, or a scratch one in `/tmp` can call the same API.
- Per-key paths in `src/modules/org-dashboard/components/page-editor/`:
  - `EditorLayout.tsx`: `SaveControls` runs `hasUnsavedChanges` (`save.ts`), a whole-document `sameJson`, on every data change, which is O(blocks) per key and the first suspect. Also `KeepUiOnHistory` and `HistoryButtons`.
  - `editor-fields.tsx`: the text and rich-text field overrides. The settings-panel text field is a Heading's "Text"; a Text block is typed into through `aside [contenteditable="true"]`.
  - `BlockChrome.tsx` (`BlockToolbar` selectors, `BlockOverlay`), `editor-config.tsx` (the root render, `FirstRunBlocks`), `BlockDrawer.tsx` (`BlockAccessProvider`).
- Renders: `src/shared/components/page-builder/blocks.tsx` (`BLOCK_RENDERS`), `puck-config.ts`.
- Spike method: `docs/puck-spike-log.md` phase 7 on `pagebuilder-tryout`.
- Any fix must keep `bun run test:editor` green.

**Steps:**
- Generate a 250-block page through the save API (a scratch script in `/tmp`, or a Playwright helper next to the e2e spec if it's worth keeping).
- Measure per-key Event Timing in a Text block and in a settings-panel text field, unthrottled and at 4× CPU, on `vite build` + `vite preview`. Use the spike's `/api` proxy workaround for the origin.
- If it's worse than the baseline, profile (DevTools MCP trace) and fix what's ours: memoise renders, keep heavy computations out of per-change paths. Puck's O(blocks) index rebuild isn't ours; record it if it's the whole cost.
- Record the numbers and the machine in the log.

**Tests that matter:**
- None beyond the measurement, unless a fix changes behaviour.

**Done when:**
- The log shows typing at 4× CPU at or under about 100 ms per key on the 250-block page, or explains with a trace why Puck's own cost exceeds it and what was ruled out.

**Verify:** None.

### Log (2026-11-21, `fix(web): preload the rich-text editor and measure typing on large pages`)
- Shipped: `PreloadRichText` (`editor-fields.tsx`), a hidden read-only richtext `AutoField` that `EditorLayout` mounts, so Puck's lazy Tiptap chunks load with the editor. Measurements only otherwise.
- Found: until Puck's lazy rich-text `Editor` arrives, its Suspense fallback is a plain `contentEditable` div showing the HTML. Keys typed into it are dropped, and the swap to the real editor takes focus to `<body>`. On a fresh load this hit every first Text block selected and clicked straight away: the keys never reached the document, and "Unsaved changes" didn't show (about 300 ms window locally, the chunks being about 120 KB gzip, so longer on a real network). With the preload, the first keys land and focus stays.
- Measured (production build `vite build` + `vite preview` on :4173; AMD Ryzen 5 7600X, 30 GB, Linux 6.18, system Chromium headless through Playwright 1.64, 1440×900; 4× is Chrome CPU throttling). Page: Hero + 52 Sections = 255 blocks (71 Text with about 500-character paragraphs, 18 Columns), 60 KB JSON. Event Timing per key (the longest event of the interaction), 30 keys at 200 ms intervals into the Text and Heading of Section 40, 3 runs each:

  | Field | 1× p50 / max | 4× p50 / p90 / max | 4× long tasks per 30 keys |
  | --- | --- | --- | --- |
  | Text block (settings panel Tiptap) | 24 / 24–32 ms | 72–80 / 88 / 88–104 ms | 3–6, 50–81 ms |
  | Heading "Text" field | 16 / 16–24 ms | 40–48 / 48 / 72–80 ms | 0 |
  | Spike, panel rich text / inline | 32 / 56, 24 / 32 ms | 104 / 144, 96 / 120 ms | 40 / every key |

  Editor ready (navigation → the root zone, "All changes saved" and Section 40 in the canvas): 1.15–1.32 s. Every run checked that the typed text reached the canvas and "Unsaved changes" showed, and that Undo stayed disabled and the status "All changes saved" 1.5 s after load (the preload records nothing).
- Ruled out: `hasUnsavedChanges` on this document takes 0.13 ms worst case (no shared references, edit in the last block; under 1 ms at 4×). No trace was needed since every number is under the spike baseline; the remaining per-key time is Puck's (spike phase 7 trace). Rich text costs about twice the Heading field because Tiptap runs on top.
- Differs from plan:
  - The probes ran under Node (`node probe.mts`), not Bun: under Bun, Playwright's `route.fetch` throws `"/api/…" cannot be parsed as a URL` on any response with `Set-Cookie`, because Bun's HTTP client reports a relative `response.url`. They proxied `/api` from :4173 straight to the backend on :3001 with `Origin: http://localhost:3000` and `maxRedirects: 0`.
  - The first 1× Text run in the probe was invalid until the fix (the dropped keys above). The numbers in the table are from after the fix; 4× numbers before it were the same within noise.
  - No Playwright helper was committed: the probe is scratch in `/tmp/sinwy-p7`.
- Checked in the running app: the above on the production build, against the `pro-org` seed `seed-ef4a0c14` (page `92af5647-…`); `bun run test:editor` 5/5 afterwards on the dev servers. Not checked: a real network or a mid-range device (CPU throttling only), and the dev build.

## Phase 8: Usability rerun (tasks 3, 7, 8)

**Goal:** an agent driving the browser cold reruns usability tasks 3 (drawer part), 7 and 8 from the spike and hits no dead end, and what it finds is fixed or filed.

**Files:**
- Task wording: `docs/puck-usability-tasks.md` on `pagebuilder-tryout` (tasks 3, 7, 8, with the user's notes); the spike's scores are in `docs/puck-spike-log.md` phase 8 there.
- Seeding the task pages: `Sinwy.WebFrontend/e2e/editor-fixtures.ts` shows the POST plus PUT content calls and the `heading`/`section` builders. Photos, Hero and Services shapes are in `Sinwy.Shared/types/page/blocks/blocks.ts`. Each `pro-org` seed allows 5 pages.
- Where findings usually land, in `src/modules/org-dashboard/components/page-editor/`:
  - Task 3 (drawer, Photos): `BlockDrawer.tsx` (cards, sketches, first-run cards), `block-actions.ts` (`placementFor`, which decides where a clicked card goes), `editor-fields.tsx`.
  - Task 7 (locked Booking): `BlockDrawer.tsx` (locked tile, upgrade dialog), `src/shared/components/UpgradePrompt.tsx`, and the manifest's `description` texts.
  - Task 8 (moving a Section): `BlockChrome.tsx` (action bar, drag handle, toolbar move buttons), `use-block-actions.ts` (Alt+↑/↓), the Layers tab in `EditorLayout.tsx`.
- Open questions for this phase in the standing notes: the drag ghost offset during handle drags, and an undo within 250 ms of an edit doing nothing.

**Steps:**
- Run the tasks with the `e2e-test` skill, worded as the owner would say them, with no hints about the UI. Record steps, ease (1–5) and dead ends per task, as the spike did.
- Fix small findings in this phase. File larger ones as GitHub issues (ask before creating them) and list them in the log.

**Tests that matter:**
- Any fix keeps the e2e spec green.

**Done when:**
- Tasks 3 (drawer part), 7 and 8 score 4 or 5 with no dead end.

**Verify:** Task 3: seed `pro-org`, "Put two photos of the salon side by side", then "Under 'Find us', add two photos of the street next to each other" (seed a "Find us" Section with a Heading first). Task 7: seed `subscribed-org` (Starter), "Add an online booking form to my page": the agent finds the locked Booking tile and its upgrade path, or the Services/Button workaround. Task 8: a page with Hero, Services and a "Find us" Section, "Move the 'Find us' part up, right under the welcome banner". Each task ends with a Save, and the `page_content` row matches. Nothing is simulated except login.

### Log (2026-11-21, `fix(web): name sections in the canvas, explain refused drops and wait for history before undo`)
- Shipped:
  - Undo and redo wait for Puck to record the latest edit (`historyPending`, `travelWhenRecorded` in `use-block-actions.ts`), from the keys and the header buttons. Unit tests with a fake history; the e2e keyboard test now presses Ctrl+Z straight after Delete.
  - Canvas names from headings (`blockTitle`, `canvasLabel`): hover tag, action bar label, and the title under the block type in the settings header. Puck's `parentAction` (⮤) is rendered in our action bar. The block around a hovered block gets a dashed outline (`styles.css`, `:has`).
  - `useRefusedDropNotice` with `refusedDropNotice`: a toast when a dragged block is released over a zone that refuses it.
  - `modalOpen` ignores non-modal dialogs: Base UI toasts are `role="dialog"`, so Delete, arrows and Esc did nothing for 3–10 s after every save.
  - Booking's upgrade dialog says online booking already works through the Book buttons (`LOCKED_ALTERNATIVES`); the Business plan card names Booking ("Premium page blocks, like online Booking").
- Scores (cold agent, owner wording, no UI hints):

  | Task | First run | After fixes | Dead end |
  | --- | --- | --- | --- |
  | 3, two photos side by side, then under "Find us" | 4 | – | Images only by URL (#80) |
  | 7, booking form on Starter | 4 | – | none: locked tile → upgrade dialog → billing, or the Button workaround |
  | 8, move "Find us" under the banner | 3 | 4 | first run: dragging the heading moved nothing and said nothing; rerun: the toast named the way out |

  Task 3's URL-only images is a dead end for a real owner but out of this phase's scope; the agent was given addresses as the spike's tasks file says.
- Open questions answered: the drag ghost keeps its grab offset (Puck, left as is); an undo within 250 ms of an edit did nothing on fresh history and went one step too far otherwise, which a person notices (Redo greys out), so fixed.
- Filed: #80 image upload, #81 link picker for buttons, #82 section names in Layers (sub-issues of #73).
- Not fixed (small, for later): the toast sits top-right, away from the drop and over the settings header; no "not allowed" cue during a refused drag; dnd-kit's screen-reader announcements read internal ids ("Draggable item Heading-… was dropped"); the "Drop blocks here" box at the page end may look like page content; the action bar covers the top-right of the selected block (e.g. a Book button); Photos' Images default to Square and crop wide photos; the Layers drag ghost overlaps rows; the action bar's ⮤ is titled "Select parent", the settings button "Select parent block".
- Differs from plan:
  - Task 7 used `bookable-org` (Starter with services) instead of `subscribed-org`, so the Services workaround showed real services.
  - Task pages were seeded by a scratch script through the real API (`/tmp/sinwy-p8/seed.ts`), with three services added to the `pro-org`, so the agent never read the e2e fixtures. Hero, Services and a "Find us" Section (Heading + Text) on each page.
  - The refused-drop check first required unchanged page data. Puck can reorder the refused block inside its own slot, so it now checks that the block is still in the zone it started in.
- Checked in the running app: all three tasks saved, and each `page_content` row matched (pro `seed-b4cedec8`: Home v3 with two Photos, About us v3 and Contact v3 in the order Hero, Find us, Services; starter `seed-6b433bb1`: Home v3 with a Button in a new Section). The upgrade button opens the Change plan dialog (cancelled). No console errors; the only new log line is the expected `Polar subscription read failed` for the seeded subscription on Billing. `bun run test:editor` 5/5. Not checked: a real upgrade through Polar unlocking Booking, and the final toast wording (changed after the rerun, unit-tested only).

## Phase 9: Code review, docs and cleanup

**Goal:** the editor's plan gating and save paths have been reviewed, the docs describe the editor, and nothing temporary is left behind.

**Files:**
- Every file the earlier phases changed: `git diff master --stat`. The editor is `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/` plus the route `_shell.pages.$id.edit.tsx`; shared pieces are `src/shared/components/page-builder/puck-config.ts`, `Sinwy.Shared/types/page/blocks/` and the backend pages module (`listsServices`, `lockedBlocksIn`).
- Plan gating: `BlockDrawer.tsx` (locked tiles, `BlockAccessProvider`, `LOCKED_ALTERNATIVES`), `use-block-actions.ts` (`add` is the only keyboard/click insert path), `save.ts` (`saveErrorMessage`, `hasUnsavedChanges`), `EditorLayout.tsx` (`SaveControls`), the backend content save that returns 402.
- Delete paths: `blockActions.remove`, `useEditorHotkeys` (Delete/Backspace), `BlockChrome.tsx` (toolbar and action bar Delete).
- Docs: `CONTEXT.md` (Page Builder, Block), `docs/org-rules-map.md`, `.agents/skills/e2e-test/references/app-map.md`, `README.md`.
- Cleanup: the scratch list and running servers in the standing notes, `.playwright-cli/page-*.yml`, `console-*.log` and `editor-e2e/` output.

**Steps:**
- Review with the plan gating in focus: a locked tile can't be dragged or inserted by keyboard; a downgraded org keeps its existing Booking blocks and can still save; a 402 or 409 never clears the dirty state or loses the user's edits.
- Review the delete paths: block delete is undoable, and nothing in the editor deletes pages or versions.
- Add the editor route and its flows to the e2e skill's `app-map.md`. Add Photos and Booking to the Block entry in `CONTEXT.md`.
- Close out the plan: Status, log, and prune the standing notes.
- Stop every dev server started during the plan's work, unless the user asked to keep it running. Delete probe scripts, screenshots, console logs and scratch data in `/tmp` and the repo that the plan created.

**Tests that matter:**
- Whatever the review finds missing on the gating and save paths.

**Done when:**
- Review findings are fixed or filed, `bun run verify` and `bun run test:editor` pass, and `git status` shows no stray files.

**Verify:** None.

### Log (2026-11-21, `test(web): cover a refused save in the editor spec and document the page editor`)
- Shipped:
  - Review of plan gating: locked tiles render as plain buttons, not `Drawer.Item`s, so they can't be dragged; no keyboard path inserts blocks; `add` is only reached from unlocked cards. The server's 402 check (`lockedBlocksIn`, by type against the latest version) is the real guard, and its downgrade case is covered by `pages.test.ts`. No finding.
  - Review of save: `api()` never throws, so every failure comes back as a result; a 402, 409 or 400 leaves `saved` untouched and the editor dirty. `SaveControls` now resets "Saving…" in a `finally`, so a throwing `onSave` can't leave Save disabled for good.
  - Review of delete paths: `remove` is one recorded Puck dispatch, so it is undoable (unit and e2e tested). Nothing in the editor deletes pages or versions.
  - New e2e test: a save refused for a newer version (409) shows the reload message, keeps "Unsaved changes", Save enabled and the edit in the canvas, and doesn't overwrite the other save. Fixture `pages.saveElsewhere`.
  - Docs: Photos and Booking in `CONTEXT.md`'s Block entry; a Pages and page editor section and the `page`/`page_content` tables in the e2e skill's `app-map.md`; the README spec list names the refused-save test. `org-rules-map.md` already named Booking as the premium block.
  - Cleanup: dev servers on :3000/:3001 stopped; this plan's `/tmp/sinwy-*` scratch, `.playwright-cli` snapshots, console logs, `editor-e2e/` output, its `auth/` storage states and `Sinwy.WebFrontend/dist/` deleted.
- Differs from plan: no 402 e2e test. A 402 can't be reached through the UI (locked tiles can't be added, and a downgrade mid-session needs a plan change between load and save); it shares the dirty-state path with the 409 test and is covered by `saveErrorMessage` unit tests and the backend tests. Standing notes were cut to what #77 and Puck upgrades need.
- Checked in the running app: `bun run test:editor` 6/6 before the servers were stopped. Left alone: `/tmp/sinwy-build*.log`, `/tmp/sinwy-e2e`, `/tmp/sinwy-issue`, `/tmp/sinwy-phase4` and five `.playwright-cli/auth` files, all older than this branch.
