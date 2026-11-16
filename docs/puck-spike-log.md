# Puck spike log

Finished phases of the [Puck spike plan](puck-spike-plan.md), each with its spec, Findings and Scores.

## Phase 1: Puck editor and SSR render on the real pages flow

**Goal:** an org owner opens a page in a Puck editor, saves it as a new v2 version, publishes it, and the storefront renders it server-side with `<Render>`.

**Files:**
- `Sinwy.WebFrontend/package.json`: add `@puckeditor/core`.
- `Sinwy.Shared/types/page/PageContent.ts`: `PageContent`, `pageContentSchema`, `widgetTypesIn`.
- `Sinwy.Shared/types/page/PageSchema.ts`: `savePageContentSchema`.
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck`, `savePageContent`.
- `Sinwy.Backend/modules/pages/repository.ts`: `insertNextVersion`.
- `Sinwy.Backend/modules/pages/tests/pageContracts.test.ts`.
- `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx`.
- `Sinwy.WebFrontend/src/modules/storefront/routes/$pageSlug.tsx`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.index.tsx`, `_shell.pages.$id.preview.tsx`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/components/pages/PageContentSummary.tsx`: reads `content.widgets`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/page-queries.ts`: has no content-save helper yet.
- New: `Sinwy.WebFrontend/src/shared/components/page-builder/` (render config, editor config, components) and `_shell.pages.$id.edit.tsx`.

**Steps:**
- Read Puck's LICENSE file in the installed package and the npm `license` field, and record both in Findings.
- Make `PageContent` a union on `schemaVersion`: v1 is unchanged, and v2 is `{ schemaVersion: 2, data: { root, content } }`. This phase only checks the v2 shape loosely (object, `content` array). Full validation comes in phase 5. Keep `widgetTypesIn` and `contentSaveCheck` working for v1, and make them return nothing for v2 for now.
- Split the Puck config into a render config, safe for the storefront, and an editor config that extends it. The storefront must never import the editor config or `<Puck>`.
- Start with one Section component (a slot) and one Heading, which is enough to prove the pipe.
- Editor route: client-only, loads the latest version, saves through a new `savePageContent` helper in `page-queries.ts`, and links from the page detail screen.
- `PageRenderer` and the preview route branch on `schemaVersion`. v2 goes through `<Render>`, inside the existing `brandAttributes` wrapper. `PageContentSummary` shows a component count for v2.
- Run with the React Compiler on and in StrictMode. Note any warnings, hydration mismatches and the #1884 remount.

**Tests that matter:**
- Existing v1 contract and save tests still pass.
- A v2 body round-trips through `savePageContentSchema`.
- A v2 body over 256 KB is refused.

**Done when:**
- A page edited in Puck, saved and published renders on `/$organizationSlug/$pageSlug` in the SSR HTML (view source), with no hydration warning.
- v1 pages still render.

**Verify:**
- Seed: `subscribed-org`, logged in as the owner.
- Create a page, open the editor, add a Section with a Heading, and save. A new `page_content` row appears with `schemaVersion` 2 in `content`.
- Publish. `page.published_version_id` points at that row.
- Open the public URL with JavaScript disabled. The heading is in the server HTML.

### Log (2026-11-16, `feat(backend, web, shared): puck spike phase 1, editor and ssr render`)
- Shipped:
  - `@puckeditor/core` 0.24.0. `PageContent` is a union: v1 unchanged, and v2 `{ schemaVersion: 2, data }` loosely checked (each component has `type` and `props.id`).
  - `widgetTypesIn` returns nothing for v2, so `contentSaveCheck` lets v2 through for now. `pageContentSize` counts widgets or components, slots included.
  - `page-builder/`: render config (Section with a slot, Heading), editor config, `PuckPage` (storefront `Render`) and `PageEditor` (`<Puck>` with Back and Save header actions).
  - Edit route `_shell.pages.$id.edit.tsx`, a fixed full-screen layer that saves through `savePageContent` with `baseVersion` tracking.
  - An "Edit" button on the page detail. `PageRenderer`, the preview and the summary handle v2.
  - Tests: a v2 contract round-trip and refusals, a v2 save that becomes the next version, a v2 body over 256 KB getting 413, and a v2 SSR render with a slot and an unknown type.
- Differs from plan:
  - The storefront uses the `@puckeditor/core/rsc` entry rather than the main one, so it never touches editor code.
  - Field definitions live in the render config, not the editor config, because they are plain data and Render needs the slot ones.
  - No `puck.css` import, because Puck 0.22+ injects its CSS at runtime and warns when the import is present.
- Checked in the running app (subagent e2e, org `seed-7e7c77f0`):
  - A page created in the UI was edited with Section > Heading and saved as v2 version 2. Publishing set `published_version_id` to that row.
  - curl shows `<section>…<h2>` with the heading in the server HTML, and the browser console has no hydration warning.
  - After a v1 save and publish, the page renders `data-widget="heading"` server-side.
  - No new backend or web log errors.
  - Not checked: production bundle contents (phase 7). Dev resource timing overflowed at 250 entries, so whether Puck is absent from the storefront is shown only by its imports.

**Findings**
- License: MIT in both the LICENSE file and the npm `license` field ("Copyright (c) The Puck Contributors"). Install added 184 packages, among them Tiptap (about 20 packages), happy-dom, dnd-kit 0.4, Radix popover and zustand.
- What worked natively:
  - The `<Render>` SSR output is clean server HTML with no hydration warning.
  - Slots render as `<Items className=…/>`.
  - Unknown types are skipped.
  - Tailwind classes resolve inside the iframe with no setup (computed `font-size` 24px for `text-2xl`).
  - `useGetPuck()` reads the current data for a custom Save button, and `overrides.headerActions` places our shadcn buttons in Puck's header.
  - The route sits inside `_shell` (already `ssr: false`) with no problem.
- Friction:
  - `Config<Components>` typing doesn't accept our own `PuckDocument` type for `Render`'s `data` under `exactOptionalPropertyTypes`, so it needs a cast `as Data<BuilderComponents>`.
  - A render config whose components omit `fields` is a type error once a component declares a non-slot prop, which pushed all fields into the render config.
  - The default root shows Puck's own "title" field.
  - Puck's drop alert announces a temporary drag id that differs from the saved id (cosmetic).
- #1884: a `<Puck>` child mounts 4 times under StrictMode (one real remount), with `iframe.enabled` true or false alike. So the iframe isn't what causes it here, and Puck's lazily loaded editor chunk is the likely cause. Children must tolerate one remount (no one-shot effects).
- React Compiler and StrictMode: no warnings from Puck in the editor or the storefront.
- Dev only: the first load after a new Puck entry triggers Vite dep re-optimization and one "Invalid hook call" error, which goes away on reload.
- The e2e agent pointed out that opening a v1 page shows a blank canvas, and saving overwrites the v1 widgets without warning. That is Default 1. Saving gives no visible confirmation, which phase 6's header will fix.
- Playwright drag recipe (dnd-kit needs stepped pointer moves): find the drawer item with `page.locator('[data-testid^="drawer-item"], [class*="DrawerItem"]').filter({ hasText: /^Section$/ })`, then `mouse.down`, 25 `mouse.move` steps of 20 ms to `(iframe.x + w/2, iframe.y + 40)`, wait 300 ms, `mouse.up`. Dropping a Heading at the same spot lands it in the Section slot.
- Rough time: about 1.5 h, mostly typing friction and browser checks.

**Scores**
- Embed the editor in our app and auth: ✅ native.
- Save, version and publish through our API: ✅ native (custom Save button about 20 lines).
- SSR storefront render: ✅ native, from the lighter `/rsc` entry.
- Tailwind in the editor canvas: ✅ native.
- Nested layout (slots): ✅ native.
- Typing the config against our stored document type: 🟡 S (casts).

## Phase 2: FreeGrid: grid-snapped mode in a slot

**Goal:** a FreeGrid component, nested inside a Section, lets the editor drag and resize its children on a snapping grid. It renders as plain CSS Grid on the storefront. This is the riskiest part of the spike.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/render-config.tsx`: component types (`BuilderComponents`), fields and render functions. FreeGrid's public render goes here.
- `page-builder/editor-config.tsx`: labels, `defaultProps`, categories. FreeGrid's editor-only render (RGL) and `resolvePermissions` go here, so RGL never reaches the storefront.
- `page-builder/PageEditor.tsx`: the `<Puck>` wrapper (save through `useGetPuck`, header actions). Add `onAction` logging here.
- `page-builder/PuckPage.tsx`: storefront `<Render>` from `@puckeditor/core/rsc`.
- `Sinwy.WebFrontend/src/shared/tests/page-renderer.test.ts`: SSR render tests. Put the layout-to-CSS-Grid unit test next to it.
- `Sinwy.WebFrontend/package.json`: add `react-grid-layout` v2.

**Steps:**
- `items` is a normal Puck slot, so outline, selection, copy/paste and permissions keep working.
- `layout` is a per-breakpoint map (`desktop`, `tablet`, `mobile`) of RGL items `{ i, x, y, w, h }`, keyed by child id.
- Editor render (`puck.isEditing`): RGL with no compaction. Overlap stays off unless it proves useful. Public render: CSS Grid using `grid-column` and `grid-row`, with no RGL in the storefront bundle.
- Children of a FreeGrid get `drag: false` through `resolvePermissions` when the parent is FreeGrid, so Puck's DnD and RGL don't both grab the gesture.
- Write each RGL `onDragStop` / `onResizeStop` back as one Puck dispatch. Use `onAction` to confirm that one gesture is one history entry.
- Try inserting from the Puck drawer straight into a FreeGrid, and dragging a child out of one. Record what works and what needed a workaround.
- If RGL inside the iframe can't be made to work, try the iframe-disabled mode and record the cost (viewports are lost).

**Tests that matter:**
- The layout-to-CSS-Grid mapping is pure and deterministic, so a unit test pins its output for a sample layout.

**Done when:**
- Inside a FreeGrid, move, resize, select, edit fields, duplicate, delete and undo all work, with one undo step per gesture.
- The storefront shows the same arrangement.
- Phase 9 needs these results to make its go/no-go call, so the Findings must state them plainly.

**Verify:**
- Seed: `subscribed-org`.
- In the editor, add Section > FreeGrid with three Heading children, then drag and resize them.
- Undo once: only the last gesture reverts.
- Save and publish. The public page shows the same positions, and the page's JS has no react-grid-layout chunk (check the network tab).

### Log (2026-11-16, `feat(web): puck spike phase 2, freegrid`)
- Shipped:
  - `free-grid-layout.ts`: the layout types (`{ desktop, tablet?, mobile? }`, each a map of child id to `{ x, y, w, h }`) and the 12-column grid constants. `resolveCells` turns a stored map plus the child order into one cell per child: it clamps bad values, ignores entries for deleted children, and stacks unplaced children below the placed ones. `cellPlacement` and `gridStyle` give the CSS Grid styles.
  - Storefront FreeGrid in `render-config.tsx`: `<Items as={FreeGridCells}>`. Puck's server `SlotRender` keys each child element by its id, so `FreeGridCells` wraps each one in a `grid-column` / `grid-row` div. No ids go into the HTML and there is no RGL.
  - Editor FreeGrid (`FreeGridEditor.tsx`, imported only by `editor-config.tsx`):
    - The slot renders as the same CSS Grid. A generated `<style>` places each `[data-puck-component="<childId>"]` wrapper Puck puts around a slot child.
    - A transparent RGL 2.2.4 layer on top has a ⠿ move handle per child and e/s/se resize handles.
    - Live drag and resize positions drive the content, so the content follows the placeholder. On stop, one `replace` dispatch writes `layout.desktop` and the moved child is selected.
    - Child ids come from `createUsePuck()` → `getItemById(id).props.items`.
  - An "Arrangement" custom field explains the handles and has a "Reset layout" button (one dispatch).
  - `PageEditor` records every action type in `window.__puckActions` (`onAction`).
  - Tests: the layout-to-CSS-Grid unit test (`free-grid-layout.test.ts`), and an SSR test that renders a FreeGrid with one placed and one unplaced child.
- Differs from plan:
  - **Grid children keep Puck drag.** The plan wanted `drag: false` through `resolvePermissions`, and that works natively: `params.parent.type` is right. But it has two side effects:
    - dnd-kit marks every grid child `aria-disabled="true"` on a `role="button"`, so it's announced as disabled. Playwright refuses to click it.
    - Pressing on a child and dragging starts Puck's drag on the nearest draggable ancestor, which moves the whole FreeGrid.
    
    The two gestures don't collide anyway: RGL only listens on its own handle, and the grid layer stops native `pointerdown`. So children stay Puck-draggable, and that is what lets them be dragged out of the grid. The helper was removed.
  - **Compactor:** `getCompactor(null, false, true)` instead of `noCompactor`. On 2.2.4, `noCompactor` let a resize overlap its neighbour (cols 5–10 over 9–12). On 2.3.0 it pushed the resized item itself down 8 rows. With collisions prevented, a move or resize into an occupied cell snaps back and records no history.
  - **RGL pinned to 2.2.4:** #2303 reproduced on 2.3.0. The dragged item stayed at `translate(815px, 6px)` for 5 pointer moves, then jumped.
  - The iframe-disabled fallback wasn't needed.
- Checked in the running app:
  - Inline (org `seed-15d6fba8`, page "Grid test"):
    - Content and the RGL layer line up to the pixel inside the iframe at 57% zoom, and `useContainerWidth` measures across the iframe.
    - Each move or resize adds exactly one `replace` (plus a `setUi`), and one undo reverts exactly one gesture.
    - Editing a field, duplicating (the copy is auto-placed at the bottom), deleting, Ctrl+Z / Ctrl+Shift+Z and Reset layout all work.
    - Drawer → FreeGrid insert works. A child dragged out of the grid lands at the page root, as one `move`. Reordering children by Puck drag inside the grid changes only the slot order, and positions keep.
    - Console and web log are clean.
  - E2E subagent (org `seed-68aff329`, page `fg-verify`): it built Section > Free grid > 3 Headings from the drawer and made 3 gestures. Undo reverted only the resize. The save wrote version 2 with matching `layout.desktop`, and publishing set `published_version_id` to it. The SSR HTML and the browser render match the editor arrangement, with no hydration warning.
  - Of 391 storefront requests, none is RGL, react-draggable or react-resizable. None of the 89 pre-bundled deps the storefront loads contains `DraggableCore` / `ResizableBox` / `GridLayout`. The storefront loads only `PuckPage`, `@puckeditor_core_rsc`, `render-config` and `free-grid-layout`.
  - Not checked: production build chunks (phase 7) and touch (phase 7).

**Findings**
- **Verdict for the go/no-go:** grid-snapped free layout inside Puck works. Move, resize, select, edit fields, duplicate, delete and undo all work inside a FreeGrid, with one undo step per gesture, and the storefront shows the same arrangement as plain CSS Grid with zero RGL in its JS. It needed custom work (about 200 lines across two files) and knowledge of Puck's DOM, but no fork and no patch of Puck.
- What worked natively:
  - Slots stay normal Puck slots, so outline, selection, the action bar, duplicate, delete, field editing and drawer insert need no glue.
  - `dispatch({ type: "replace" })` from inside a component makes one history entry, and `setUi` makes none.
  - `getPuck()` (`getItemById`, `getSelectorForId`, `dispatch`) is usable from a component render inside the iframe.
  - `<Items as={Component}>` forwards extra props to `as`. On the server it receives children keyed by component id, which is a clean hook for a per-child wrapper.
  - RGL works inside Puck's iframe: react-draggable uses `ownerDocument`, and the ResizeObserver measures there.
- Friction and workarounds (Puck internals relied on):
  - In the editor every element inside a component gets `pointer-events: none` (`[data-puck-component] *`). Interactive UI inside a block needs `pointer-events: auto !important`.
  - Puck starts a drag on `pointerdown` on the component wrapper, so the grid layer stops native `pointerdown`.
  - React listens at the iframe portal root, so stopping a native `click` on a container also kills React `onClick` below it. Selection on handle click is done in the native listener.
  - The click that ends a gesture would select the FreeGrid. It's swallowed with a one-shot capture listener, and the moved child is selected instead.
  - Editor placement relies on Puck putting `data-puck-component="<id>"` on a wrapper that is a direct child of the slot element (`<div ref=dragRef>` in `DropZoneChild`). The editor DOM differs from `<Render>` (no wrappers there), so editor and storefront need two placement mechanisms. A Puck change to the wrapper would break the editor (not the storefront).
  - Every prop needs a field: hidden data (`layout`) needs a `custom` field. Reusing `renderConfig.components.X.fields` with an override spread fails `Fields<Props>` typing (props become optional), so the slot field is spelled out again.
  - A shared `resolvePermissions` helper typed as `ComponentConfig["resolvePermissions"]` isn't assignable to specific components under `exactOptionalPropertyTypes` (the `changed` record's `id`). It needs a structurally minimal signature.
  - Rows are a fixed 40 px in both the editor and the storefront, so text taller than its cell overflows. That's a real design limit to solve in phase 4 (auto-height rows would break the editor overlay's pixel match).
  - Inserting from the drawer ignores the drop point: new children stack at the bottom (cols 1–6). Placing at the drop point would need the slot's insert index or pointer position (not tried).
  - During a Puck drag over the grid there's no clear 2D drop indicator: Puck's collision is 1D, and the dragged cell is just tinted.
  - A collision-blocked resize snaps all the way back instead of growing up to the neighbour (RGL `preventCollision`).
- Bugs hit:
  - RGL #2303 (2.3.0, closed upstream but unreleased) reproduced. Pinned 2.2.4.
  - Vite kept serving the old pre-bundled 2.3.0 after the downgrade, until the dev server was restarted with `node_modules/.vite/deps` deleted.
- Rough time: about 2.5 h, roughly half reading Puck's DOM and event model, the rest browser checks.

**Scores**
- Free (grid-snapped) layout inside a slot: 🟡 M (RGL overlay plus per-child CSS, relying on Puck's wrapper DOM).
- One undo step per gesture: ✅ native (one `replace` dispatch).
- Plain CSS Grid on the storefront, no editor JS: ✅ native, through `<Items as>`.
- Select, edit, duplicate, delete inside the grid: ✅ native.
- Drag into and out of the grid: 🟡 S (works; insert position is ignored, and the 2D drop feedback is weak).
- Per-parent permissions (`resolvePermissions` + `parent`): ✅ native, but `drag: false` has the a11y and parent-drag side effects above.
