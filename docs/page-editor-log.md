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
