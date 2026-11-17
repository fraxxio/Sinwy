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

## Phase 3: Component set, rich text, theme tokens, Tailwind

**Goal:** a realistic block set exists, with inline rich text, theme tokens with live preview, and a working rule for user-chosen styles under Tailwind 4.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/render-config.tsx`: `BuilderComponents`, fields (every prop needs one) and the storefront renders. New blocks go here.
- `page-builder/editor-config.tsx`: labels, `defaultProps`, categories and editor-only renders. The BookingWidget's custom field UI (shadcn service picker) goes here, so the storefront never imports it.
- `page-builder/free-grid-layout.ts`: `gridStyle` has a hard-coded 16 px gap. Switch it to the spacing token if tokens should reach the grid.
- `page-builder/PuckPage.tsx` (storefront `<Render>`) and `page-builder/PageEditor.tsx` (`<Puck>`, where the iframe's page background gets set).
- `Sinwy.WebFrontend/src/shared/tests/page-renderer.test.ts`: SSR render tests, including the rich-text sanitizing test.
- `Sinwy.WebFrontend/src/shared/lib/branding.ts`: `brandAttributes`, `BRAND_FONT_FAMILIES`.
- `Sinwy.WebFrontend/src/styles.css`: brand variables around line 791.
- `Sinwy.WebFrontend/src/modules/storefront/components/ServiceList.tsx`: can serve as the real data for the booking widget. `shared/` must not import from `modules/`, so pass the data or render through a prop, or move what's needed into `shared/`.

**Steps:**
- Components:
  - Columns (2–4 slots), Container, RichText (Puck `richtext` field, `contentEditable`), Image, Button.
  - A BookingWidget that renders the org's services, with a custom field UI (a service picker built with shadcn).
  - Two prebuilt "good-looking" sections (hero, services) whose slots are pre-filled through `defaultProps`.
- Theme tokens: brand color and font come from org branding. Radius and spacing are root fields, written as CSS variables at the root render. Check the live preview inside the iframe.
- Tailwind rule: blocks use static classes that reference CSS variables. User choices are enums mapped to fixed class strings, and free values go through inline CSS variables. Don't use the Tailwind CDN in the iframe.
- Rich text on SSR: check what `<Render>` pulls into the server and client bundles for `richtext` (the happy-dom lead). If it's heavy, sketch a small renderer of our own and note the cost.

**Tests that matter:**
- Rich text output is sanitized: a stored `<script>` or `javascript:` link doesn't reach the public HTML.

**Done when:**
- A salon-style homepage can be built from these blocks and looks the same in the editor and on the storefront.
- Changing a root token updates the preview live.

**Verify:**
- Seed: `pro-org`.
- Build a page with a hero, columns, rich text with a bold word, a link and a list, and a booking widget. Change the radius token: every block's corners update in the preview.
- Publish. The public HTML has the formatted text and the services list, styled the same as in the editor.

### Log (2026-11-16, `feat(web): puck spike phase 3, component set, rich text and tokens`)
- Shipped:
  - Blocks in `render-config.tsx`: Section (Plain / Muted / Brand), Hero (slot, optional background image passed as an inline `--pb-hero-image` variable, alignment), ServicesSection, Columns (2–4 fixed slots; `resolveFields` hides the unused ones), Container (width, alignment), Heading (plus alignment), RichText (Puck `richtext`, inline editing, `textAlign`/code off, headings 2–3), Image (safe `src` only, shape, placeholder), Button (link resolved like v1 widgets, filled/outline) and BookingWidget.
  - BookingWidget renders the org's services from Puck `metadata`, in the order picked, with a "Book" link to `/<org>/book?service=<id>`. Its editor field is a shadcn `Combobox` chips picker (`ServicePicker.tsx`, empty means all services), fed by `BuilderServicesContext`.
  - Prebuilt "Hero" and "Services" sections under a "Ready-made sections" category, with slots pre-filled through `defaultProps` (Puck generates the child ids on insert).
  - Theme tokens (`theme-tokens.ts`): root fields "Corner roundness" and "Spacing" become `--pb-radius` / `--pb-space` at the root render, which also applies org branding (color, font) from `metadata.branding` in the editor. The root render centres the page at `max-w-5xl`, and the storefront article drops `max-w-3xl` for v2 pages.
  - Data flow: the editor route loads active services and branding. The storefront route also loads `storefrontQuery` (services) in its loader. `PageRenderer` takes `services`, and the dashboard preview passes them too (`activeServicesQuery`). The URL helpers moved from `PageRenderer` to `shared/lib/page-urls.ts`.
  - Storefront rich text: `renderRichText` (`rich-text.tsx`, about 130 lines, no dependencies) through `<Render fieldTransforms={{ richtext }}>`. It keeps only allowlisted tags, a safe `href` and `target="_blank"`. Unknown tags are unwrapped, `script`/`style`/`iframe` and the like are dropped with their content, and an open `p`/`li` is closed the way HTML does.
  - `.ProseMirror { white-space: pre-wrap }` in `styles.css` for the canvas's inline editors.
  - Tests (`page-renderer.test.ts`): rich text keeps bold, list and https link and drops `<script>`, `onerror` and `javascript:`; malformed and odd HTML (entities, unknown tags, unclosed tags, mixed-case `javascript:`); the booking widget order and links; tokens to CSS variables with a fallback for unknown values.
- Differs from plan:
  - **Rich text renderer of our own instead of Puck's.** Puck's `<Render>` wraps each richtext prop in `Suspense` + `lazy(import("Render-*"))`, which runs `@tiptap/html` (`generateJSON` → `generateHTML`). It sanitizes well (schema-based), but:
    - In a production build the lazy chunk pulls about 117 KB gzip into the storefront client (Tiptap/ProseMirror core 90 KB, Puck's extension set 25 KB), just to hydrate HTML the server already sent.
    - In the streamed SSR, each block goes out twice: once as the `Suspense` fallback and once as the resolved boundary, swapped by React's inline `$RC` script.

    Puck skips its own renderer for any field type that has a user `fieldTransforms` entry, so a small allowlist renderer plugs in cleanly. Cost: about 1 h with tests. Risk: a hand-written HTML tokenizer; the server should still validate or normalize rich text on save (phase 5).
  - **happy-dom lead: not true for us.** Neither `dist/client` nor `dist/server` contains happy-dom: Vite resolves `@tiptap/html`'s non-server entry. Static `renderToStaticMarkup` of Puck's lazy rich text also worked in Bun tests.
  - **#1848 (paste ignores `textAlign: false`): not reproduced.** The e2e pasted `<p style="text-align:center">` as a synthetic `ClipboardEvent` into both the inline and the panel editor; it stored plain `<p>`. A real OS paste from Google Docs or Word wasn't tried.
  - **No iframe page background.** The storefront also sits on the app's body gradient, so the canvas keeping it matches the public page.
  - **Alignment through `text-align`, not `justify-items`.** The editor wraps each slot child in Puck's `[data-puck-component]` div and `<Render>` doesn't. With `justify-items-center` the wrapper shrinks to fit in the editor, while the storefront's `w-full` child stretched, so the hero button was centred in the editor and left-aligned on the storefront. Inherited `text-align` behaves the same in both.
  - FreeGrid's gap wasn't moved to `--pb-space`: the editor's RGL overlay needs pixel margins, so the CSS gap and RGL would drift apart.
- Checked in the running app:
  - Inline (org `seed-8cb1127f`, page `home`):
    - Hero and Services insert from the drawer with their pre-filled children, and the save stores generated ids for them.
    - The service picker filters the canvas live.
    - Radius "Rounded" → "Very rounded" changed the hero, list and Book buttons from 12 px to 24 px live.
    - Published SSR HTML holds the text, the services and the token variables. The storefront loads no Tiptap/ProseMirror resource, and there's no hydration warning.
    - After the `.ProseMirror` fix, typing "We are ", Ctrl+B "open", Ctrl+B " late" in the canvas stores `We are <strong>open</strong> late`.
  - E2E subagent (same org, new page `salon`):
    - Built Hero, Columns with Text and Booking widget, and another Text, all by drag and drop.
    - Typed bold, a list and an auto-linked URL inline.
    - Changed the radius token: every `rounded-(--pb-radius)` element went from 12 to 24 px.
    - Saved v2 and v3, and published v3.
    - Computed styles on the public page matched the editor canvas (text, list, link, services list, buttons, hero).
    - It found two mismatches, both fixed afterwards and covered by the inline check and the tests: `target="_blank"` was dropped on the storefront, and the canvas's inline editor lacked `pre-wrap`, which stored `is<strong> bold</strong>&nbsp;after`.
  - Not checked: production-build network for the storefront after the switch to `renderRichText` (the dev-server check is clean; phase 7 measures bundles); a real OS clipboard paste; dark mode.

**Findings**
- **Verdict for the go/no-go:** a realistic block set with presets, a custom shadcn field, real org data, theme tokens and rich text took about 2.5 h, and the editor and storefront look the same. The friction is in rich text and in the editor's extra DOM: Puck's rich-text render path is too heavy for a public storefront and needed replacing, and the editor's wrapper DOM made one layout rule behave differently from the storefront.
- What worked natively:
  - Slot `defaultProps` with nested components: presets insert with fresh ids, no glue.
  - `metadata` on both `<Puck>` and `<Render>` reaches every render as `puck.metadata`, including the root.
  - Root fields plus a root render make page-level tokens trivial. The canvas updates live, and Tailwind 4 classes like `rounded-(--pb-radius)` and `bg-(image:--pb-hero-image)` work in the iframe through the synced host styles.
  - `resolveFields` hides the unused column slots.
  - Puck's `richtext`: inline editing, Ctrl+B, markdown-style lists, URL auto-linking, and paste that drops `javascript:` links and `text-align` styles.
  - `fieldTransforms` on `<Render>` is a clean override point for a field type.
- Friction and workarounds:
  - Custom fields don't get `metadata`, so editor data has to go through a React context.
  - The rich-text toolbar has no "add link" button (only typing or pasting a URL). A link UI would be custom work through `renderMenu` / Tiptap extensions (not tried).
  - Puck's canvas inline editor lacks ProseMirror's `white-space` CSS (a console warning, plus wrong spaces around marks) until we add `.ProseMirror { white-space: pre-wrap }`.
  - Typing: `Fields<Props>` doesn't accept a spread of `renderConfig` fields with one override (again, as in phase 2), and slot `defaultProps` arrays need `as never` because `Slot` is typed as resolved content. Data typing needs `Config<{ components, root }>` and a cast at `<Render data>`.
  - Puck stores rich text as HTML, so the server can't validate it with a schema alone. Phase 5 needs an HTML allowlist check, or a conversion to Tiptap JSON on save.
  - The editor's `select` field renders JSON option values; harmless, but odd for testing.
  - The storefront's org-name link above a wide v2 page looks out of place (layout, not Puck).
- Bugs hit: none in Puck. ProseMirror's missing CSS in inline mode is arguably a Puck omission.
- Rough time: about 2.5 h (blocks and wiring 1 h, the rich-text investigation and renderer 1 h, browser checks 0.5 h).

**Scores**
- Block set with slots and presets: ✅ native (`defaultProps` slots, categories, `resolveFields`).
- Custom field with our own UI (shadcn picker): 🟡 S (works; needs a context for data).
- Org data in blocks on both editor and storefront: ✅ native (`metadata`).
- Theme tokens with live preview: ✅ native (root fields plus CSS variables).
- Tailwind 4 in the canvas: ✅ native (synced host styles; static classes with CSS variables).
- Inline rich text editing: 🟡 S (works; we added the ProseMirror CSS, and there's no link UI).
- Rich text on the storefront (SSR, light JS, safe): 🟡 M (Puck's path is safe but ships about 117 KB gzip and duplicate SSR; replaced by our own renderer).
- Editor and storefront look the same: 🟡 S (true once layout rules avoid the editor's extra wrapper).

## Phase 4: Per-breakpoint styles

**Goal:** spacing, visibility, layout and FreeGrid positions can be set separately for desktop, tablet and mobile, and the storefront honours them.

**Files:**
- `page-builder/render-config.tsx`: block renders and fields. Alignment, columns (`COLUMNS`), widths and the Section/Hero padding (`p-(--pb-space)`) are the props to make responsive. Fields are plain data here; `editor-config.tsx` adds labels, `defaultProps` and the editor-only FreeGrid render.
- `page-builder/theme-tokens.ts`: `tokenStyle()` writes the root CSS variables; per-breakpoint values follow the same pattern.
- `page-builder/free-grid-layout.ts` (`resolveCells`, `gridStyle`, `cellPlacement`), `FreeGridEditor.tsx` (generated `<style>` per child id, RGL `layout.desktop` write-back) and `FreeGridCells` in `render-config.tsx`: both placement paths read only `desktop` today.
- `page-builder/PageEditor.tsx`: `<Puck>` props, where `viewports` and a viewport-aware field would hook in.
- `Sinwy.WebFrontend/src/styles.css`: the static stylesheet for the responsive variables (the `.ProseMirror` rule from phase 3 is at the end).
- `Sinwy.WebFrontend/src/shared/tests/page-renderer.test.ts` (`renderPuck` helper streams with `renderToReadableStream`) and `src/shared/tests/free-grid-layout.test.ts`.

**Steps:**
- Add a `responsive<T>` custom field storing `{ base, tablet?, mobile? }`. Components turn it into CSS variables, which a small static stylesheet reads inside media or container queries.
- Tie the field to Puck's viewport switcher if possible: editing in the mobile viewport writes the mobile value. Record how much glue this needed.
- FreeGrid reads its per-breakpoint layout. A breakpoint without its own layout falls back to stacking its children in order.
- Try visibility per breakpoint (hide on mobile).

**Tests that matter:**
- The responsive-value-to-CSS-variable mapping, including the fallback when a breakpoint isn't set.

**Done when:**
- Rearranging a FreeGrid and changing padding in the mobile viewport leaves desktop unchanged, and a narrow browser window on the storefront shows the mobile layout.

**Verify:**
- Seed: `subscribed-org` with the phase 2 page.
- Switch to the mobile viewport, move a FreeGrid child, hide one block and change a Section's padding.
- Back on desktop, nothing has changed.
- Publish, then load the public page at 375 px and at 1280 px widths: each matches its own editor view.

### Log (2026-11-17, `feat(web): puck spike phase 4, per-breakpoint styles`)
- Shipped:
  - `responsive.ts` (storefront-safe): values are `{ base, tablet?, mobile? }`, resolved desktop-first (unset tablet follows base, unset phone follows tablet). A plain value from before a prop became responsive reads as `base`. Unknown values count as unset. `responsiveVars(name, resolved)` always writes all three of `--pb-<name>`, `-t` and `-m`, so a nested block never inherits a parent's override. Block classes read them inside Tailwind's `max-lg` / `max-sm` (for example `p-(--pb-pad) max-lg:p-(--pb-pad-t) max-sm:p-(--pb-pad-m)`). Breakpoints: phone < 640 px, tablet 640–1023 px, desktop ≥ 1024 px.
  - Responsive props: Section/Services `padding` (None/Small/Medium/Large, multiples of `--pb-space`), alignment on Hero, Container, Heading and Button, Container `width`, and Columns `count` (1–4; the number of slots follows `base`, and narrower breakpoints only change columns per row).
  - Fields stay plain data in `render-config.tsx`: `responsiveField()` is a `custom` field carrying its options in Puck's field `metadata`. `editor-config.tsx` swaps every field with `metadata.responsive` for `ResponsiveField.tsx`. That control reads Puck's viewport (`appState.ui.viewports.current.width` through `createUsePuck`), shows the breakpoint next to the label, edits only that breakpoint's value, and on tablet/phone shows "Same as …" or "Only on phone · Reset". It reuses Puck's own radio/select through the exported `AutoField` and `FieldLabel`.
  - `<Puck viewports>`: Desktop 1280, Tablet 768, Phone 375 (the full-width option is gone).
  - Visibility: `withVisibility` adds a responsive Show/Hide field to every block. When a block is hidden somewhere, its render is wrapped in `<div data-pb-hide="mobile …">` (`display: contents`). A static rule in `styles.css` hides it per media query on the storefront (FreeGrid cells through `:has()`). In the editor (`data-pb-editing`) it fades to 35% opacity, so it stays selectable.
  - FreeGrid: `cellsByBreakpoint` gives tablet desktop's layout until it has its own, and phone a full-width stack (in the wider layout's visual order, keeping heights) until it has its own. The storefront cells get `--pb-col` / `--pb-row` variables per breakpoint. The editor's generated `<style>` writes the same placements inside `@media` rules, and the RGL overlay edits and writes back `layout[desktop|tablet|mobile]` for the viewport being edited. "Reset layout" resets only the current breakpoint.
  - Tests: `responsive.test.ts` covers the value-to-variable mapping with fallbacks, plain and unknown values, `hiddenOn`, and FreeGrid fallbacks (tablet inherits, phone stacks, partial own layouts). `page-renderer.test.ts` covers SSR output for padding, visibility and legacy Columns variables, plus the FreeGrid test updated for the per-breakpoint variables.
- Differs from plan:
  - **Tablet FreeGrid inherits desktop instead of stacking.** A 12-column layout reads fine at 768 px, and this matches how every other responsive value cascades. Only phone falls back to stacking.
  - **CSS variables read by Tailwind arbitrary-value classes, not a hand-written stylesheet.** Only visibility needed static CSS (`styles.css`).
  - **Hero padding isn't responsive.** Its `py-16 sm:py-24` is already responsive, and a single responsive value would have changed the look of existing heroes. Section/Services padding is.
  - **Alignment semantics.** Blocks set text alignment only when some breakpoint is centred; "Left" otherwise follows the parent, so headings in a centred Hero still centre. Before this, Container "Left" forced `text-left`.
  - **Legacy Columns.** A plain `count` keeps its old look (phone 1, tablet at most 2) through `columnCount()`. The first edit in the responsive control turns it into `{ base }` and drops that implied phone/tablet value. Phase 5's migration decides how to handle this.
- Checked in the running app:
  - Inline (org `seed-8cb1127f`, pages `home` and `salon`): the viewport switcher drives the fields. Padding set on phone shows 48 px on phone and 24 px on desktop. A block hidden on phone fades on phone and stays opaque on desktop. A FreeGrid move on phone dispatched one `replace`, and the save stored a new `layout.mobile` with `desktop` unchanged. The storefront at 375 / 800 / 1280 px matched: stacked grid, left title, one column on phone; desktop grid and centred title above.
  - E2E subagent (starter org `seed-8a603a43`, page `p4-e2e`): every Verify step passed. Phone FreeGrid move, hide and padding through the real UI. Desktop and tablet measurements matched the baseline exactly. Version 3 stored only phone-level changes. Published, then the storefront at 375 px (title hidden, grid order Beta/Gamma/Alpha at the editor's offsets, 48 px padding) and 1280 px matched the editor. Consoles and server logs were clean.
  - Not checked: real touch devices, landscape phones, and window widths at exactly 640 / 1024 px.

**Findings**
- **Verdict for the go/no-go:** responsive editing works and the storefront matches. But Puck has no concept of per-viewport props, so every responsive prop is a custom field of ours. The glue is small (the viewport is readable state, `AutoField`/`FieldLabel` are exported, field `metadata` carries options), and media queries just work in the canvas because the iframe is the viewport width. About 2 h.
- What worked natively:
  - `viewports` on `<Puck>`, and the current width readable from `usePuck` in any custom field or block: tying a field to the viewport took about 5 lines (`useEditedBreakpoint`).
  - The canvas iframe has the viewport's real width, so the same media-query CSS drives the editor and the storefront. No container queries and no editor-only layout code were needed (except FreeGrid's generated rules, which already existed).
  - `AutoField` and `FieldLabel` let a custom field reuse Puck's native radio and select UI.
  - Field `metadata` lets the storefront config stay plain data while the editor swaps in the real control.
- Friction and workarounds:
  - **Switching viewport deselects the block.** Puck's canvas wrapper dispatches `itemSelector: null` on any click whose target isn't a component, and the viewport buttons sit inside it. So "select block → switch to phone → edit" needs a reselect every time. Our own viewport switcher in the phase 6 header can avoid this.
  - No responsive-field concept: each responsive prop is a custom field, and Puck's undo history, field types and validation don't know about breakpoints.
  - Typing: generic config wrappers (`withVisibility`, `withResponsiveFields`) need `as unknown as` casts, because `ComponentConfig<P>` doesn't compose across a component map.
  - A block hidden inside a FreeGrid leaves its rows empty, because explicit grid placement keeps the tracks. Rows also don't close up after a phone move (the e2e saw a 112 px band). Both are consistent with free placement, but a novice may read them as bugs.
  - The editor canvas has no storefront side padding (`main.page-wrap` adds 16 px), so at 375 px a FreeGrid cell is 360 px in the editor and 328 px on the storefront. This is our layout, not Puck.
  - Responsive values change prop shapes, so stored documents now mix plain and `{ base }` values. The backend accepted both unvalidated (phase 5).
- Bugs hit: none in Puck. The deselect-on-viewport-switch behaviour is arguably a Puck UX bug.
- Rough time: about 2 h (model and fields 1 h, FreeGrid 0.5 h, browser checks 0.5 h).

**Scores**
- Responsive values per breakpoint (spacing, layout, alignment): 🟡 M (custom field and CSS-variable mapping; Puck supplies viewports and state).
- Editing tied to the viewport switcher: 🟡 S (about 5 lines of glue; reselect friction).
- Per-breakpoint FreeGrid layout: 🟡 S (built on phase 2's structure).
- Visibility per breakpoint: 🟡 S (wrapper plus a static stylesheet).
- Editor preview matches the storefront per breakpoint: ✅ native (the iframe has the viewport width; media queries apply).

## Phase 5: Server validation, plan gating, migrations

**Goal:** the backend refuses invalid or plan-locked v2 documents, and a stored document survives a component prop change.

**Files:**
- `Sinwy.Shared/types/page/PageContent.ts`: `pageContentV2Schema` (around line 136) only checks `type` and `props.id` today; `countPuckComponents` already walks slots.
- `Sinwy.Shared/types/plan/PlanFeatures.ts`.
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck` (around line 196).
- `Sinwy.Backend/modules/pages/tests/`: `pages.test.ts`, `pageContracts.test.ts`.
- `Sinwy.WebFrontend/src/shared/components/page-builder/`:
  - `render-config.tsx`: `BuilderComponents` (prop types), the field definitions per block, and `blocks` / `withVisibilityAll`.
  - `responsive.ts`: `Responsive<T>`, `asResponsive` (accepts plain values), `responsiveField` options and `VISIBILITY`. Responsive props need a schema that accepts both shapes.
  - `free-grid-layout.ts`: `FreeGridLayout`.
  - `editor-config.tsx`: where a starter-plan config would filter components and categories.
  - `PuckPage.tsx` (`<Render>`) and `PageEditor.tsx` (`<Puck data>`): where `transformProps` goes.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`: the editor route (it would pass the org's plan to the config).

**Steps:**
- In `Sinwy.Shared`, add one Zod schema per component's props, keyed by component type, along with which props are slots. Walk the tree ourselves; Puck's `walkTree` needs the React config.
- Reject:
  - unknown types
  - bad props
  - duplicate ids
  - over-deep or oversized trees (reuse the `PAGE_CONTENT_LIMITS` idea)
  - unsafe URLs
- Record how much of this duplicates the Puck config, and whether one source can drive both.
- Gating:
  - Mark BookingWidget (or a gallery) as `requires: "advanced-widgets"`.
  - The editor config built for a starter plan doesn't offer it.
  - `contentSaveCheck` applies the existing rule to v2: a newly added gated component is refused, one already on the page stays.
- Migration: rename one prop on a component that pages already use. Apply `transformProps` before `<Puck>` and `<Render>`, and decide whether stored documents are also migrated on save. Record the friction.

**Tests that matter:**
- A starter plan can't save a newly added gated component; a page that already had it stays saveable.
- Unknown type, bad prop, `javascript:` URL and an over-deep tree are each refused.
- An old-shape document renders correctly after the migration.

**Done when:**
- A forged save with a gated component on a starter org returns 402 with `PLAN_UPGRADE_REQUIRED`.
- Pages saved before the prop rename still render.

**Verify:**
- Seed: `subscribed-org` and `pro-org`.
- As the pro owner, add a BookingWidget and save: it saves.
- As the starter owner, the widget isn't in the drawer. A save replayed with it (copied request body) gets 402, and no new `page_content` row appears.
- Open a page saved before the rename: it renders unchanged.

### Log (2026-11-17, `feat(backend, web, shared): puck spike phase 5, validation, plan gating and migrations`)
- Shipped:
  - `Sinwy.Shared/types/page/PuckContent.ts` holds the whole contract:
    - `BLOCK_VALUES`: every enum a field offers.
    - `BLOCKS`: per block type, a strict Zod object for its props (without `id`, slots and `visibility`), its slot names, and `requires`.
    - `ROOT_PROPS`, `PUCK_LIMITS` (depth 6, 400 blocks, ids ≤ 64, text and URL lengths, ≤ 50 service ids).
    - `BLOCK_MIGRATIONS`, and `checkBlocks` (our own tree walker).
  - `pageContentV2Schema` runs `migrateBlocks` first (`z.preprocess`), then checks a strict `{ root: { props }, content, zones? }`. Non-empty drop zones are refused. `content` goes through `checkBlocks`, which reports with paths:
    - unknown types
    - bad or unknown props, and bad `visibility`
    - slots that aren't lists
    - duplicate ids across slots
    - more than 6 levels or 400 blocks
    - unsafe URLs: Button `href` must be what `resolveHref` keeps; Image `src` and Hero `image` must be http(s) or root; every `href` in rich text must be absolute or root.
  - `PageUrls.ts` (`resolveHref`, `imageSrc`, the `isSafe*` checks) moved from the web app to Shared, so the server check and the storefront use the same regexes.
  - Gating:
    - BookingWidget is `requires: "advanced-widgets"`.
    - `gatedTypesIn(content)` (v1 widgets and v2 blocks) replaces `widgetTypesIn`. `contentSaveCheck` refuses a gated type the latest version doesn't have; types already on the page stay.
    - `editorConfigFor(features)` drops locked blocks from the drawer categories, hides Puck's "Other" category (`other: { visible: false }`), and strips them from ready-made sections' `defaultProps`, so starter's "Services" inserts without its booking widget. The blocks stay in the config, so an existing one still renders and edits. The edit route passes `entitlements.features` from route context.
  - Migration: Heading `level` → `size`.
    - Read: `migrateDocument()` in `PuckPage.tsx` runs Puck's `transformProps(data, BLOCK_MIGRATIONS, renderConfig)` before both `<Render>` and `<Puck data>`.
    - Save: the server applies the same functions, so every new version row has the current shape.
    - Old rows are never rewritten (versions are immutable).
  - The frontend reads `BLOCK_VALUES` for its types (`BlockValue<"tone">` …), the `PADDINGS`/`WIDTHS`/`ASPECTS`/`RADIUS`/`SPACING` maps (bound with `Record<…>` / `satisfies`) and the responsive option lists.
  - Tests:
    - `pageContracts.test.ts`: every block accepted, round-trip, unknown type (nested), bad and unknown props, 7 unsafe-URL cases, duplicate ids, depth and count limits, drop zones, migration on parse, `gatedTypesIn`.
    - `pages.test.ts`: starter 402 `PLAN_UPGRADE_REQUIRED` with no new version, pro saves, the downgraded page stays saveable, then a re-add is 402; 400 for unknown type, bad prop, `javascript:` and depth 20; an old-shape save stored with `size`.
    - `page-builder-contract.test.ts`: the drift test (below) and the starter config.
    - `page-renderer.test.ts`: old `level` renders the same as `size`.
- Differs from plan:
  - **Server migrates on save** (the plan left it open). It costs nothing, because the transforms are plain functions in Shared and the server already walks the tree, and a tab opened before a deploy can still save. Read-side `transformProps` is still needed, because stored versions are immutable.
  - **Separate v2 limits** (`PUCK_LIMITS`: depth 6, 400 blocks) instead of reusing v1's 5 / 200. Section > Columns > Container > FreeGrid > block is already 5, and phase 7 targets about 200 blocks across 50+ sections.
  - **Strict root and drop zones.** Only `radius`/`spacing` are accepted on root, and `zones` must be empty. The 12 v2 documents in the dev DB all passed.
- Checked in the running app:
  - E2E subagent:
    - Seeded pro org `seed-ec82fe5b` (page `pro-booking`) and starter org `seed-c2b0a828` (page `starter-page`, which uses its one-page limit).
    - Pro: dragged a Booking widget in and saved; the 200 stored a v2 with it.
    - Starter: the drawer has no Booking widget. "Services" inserts only its heading and text, and saves with `size: "2"`.
    - Starter replay: a save with the pro page's document returned 402 with code 4021 (`PLAN_UPGRADE_REQUIRED`), and the `page_content` count stayed at 2.
    - Pages from before the rename (`seed-8cb1127f/home` and `salon`, `seed-8a603a43/p4-e2e`): the raw SSR HTML has each Heading at the tag of its stored `level`. The editor's Size select shows Large or Medium to match, and opening the editor writes no row.
    - Consoles and server logs were clean.
  - Not checked:
    - A downgrade through a real Polar checkout (covered by `pages.test.ts`).
    - Paste or duplicate of a gated block in the editor (phase 6/7).

**Findings**
- **Verdict for the go/no-go:** server validation and gating need no Puck support, and none exists. Puck has no data validation, no server-side tree walker without the React config, and no plan or permission concept for inserting. Building them ourselves was quick (about 2 h), because Puck's data format is simple JSON (`{ type, props: { id, …, <slot>: [...] } }`).
- Duplication between the Puck config and the server schema:
  - Duplicated: field names per block, slot names, and prop TypeScript types (`BuilderComponents` is still hand-written next to the Zod shapes).
  - Single-sourced: enum values (`BLOCK_VALUES`), URL rules, migrations and `requires`.
  - Labels, field kinds and editor-only behaviour live only in the Puck config.
  - A drift test (`page-builder-contract.test.ts`) checks that both sides have the same block types, the same slots and props per block, and that every option value a field can write (including the responsive object form) is accepted by the server. Removing one shared enum value turns it red.
- Could one source drive both? Yes, with a plain-data block manifest in Shared (name, label, kind, values, slot, `requires`) that generates both the Zod schema and the Puck `fields`, with the editor attaching custom renders by name. That's M effort for production. The drift test was enough for the spike.
- What worked natively:
  - `transformProps` with the config walks slots and composes cleanly before `<Puck>` and `<Render>`.
  - `categories.other.visible: false` hides uncategorised blocks.
  - The `@puckeditor/core/rsc` entry also exports `transformProps`, so the storefront stays editor-free.
- Friction and workarounds:
  - **Puck's typing.** `transformProps`'s `PropTransform` is typed per component but can't take a `Record<string, fn>`, so it needed `as never`. `editorConfigFor` needed an `as unknown as ComponentConfig` cast again (same generic-map issue as phase 4).
  - **Migrations are props-only and on every read.** Each must be idempotent. Puck's `migrate()` is for its own data-format upgrades, not ours.
  - **A gated block is hidden, not explained.** A starter user doesn't see Booking widget at all; there's no "upgrade to use this" tile. Showing a locked tile needs a custom drawer item (phase 6 override).
  - **Paste and duplicate aren't gated in the editor.** Pasting a gated block into a page without one shows the generic save error (402 message) only on save.
  - Gating BookingWidget is a product question for a booking SaaS. It was picked as the demo block only.
- Bugs hit: none in Puck.
- Rough time: about 2.5 h (schemas and walker 1 h, gating and editor config 0.5 h, migration 0.5 h, tests 0.5 h).

**Scores**
- Server-side validation of stored documents: 🟡 M (all ours; Puck offers nothing server-side without React).
- Plan gating of blocks (save refusal and the editor drawer): 🟡 S (category filtering is native, the rule is ours).
- Prop migrations of stored documents: ✅ native for read (`transformProps`), 🟡 S for one shared source with the server.
- One source of truth for config and schema: 🟡 M (enum values shared now, fields still duplicated and guarded by a drift test).

## Phase 6: Editor chrome with shadcn, and guardrails

**Goal:** we know how far Puck's UI can be replaced with our own shadcn components, and which guardrails for non-technical users come built in versus need building.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/`:
  - `PageEditor.tsx`: `<Puck>` with `overrides.headerActions` and `SaveAction` (save through `getPuck()`), `VIEWPORTS`, the `onAction` hook.
  - `editor-config.tsx`: `categories`, `defaultProps` (the Hero and Services presets), `editorConfigFor(features)`. Templates, locked props and required children go here (Puck `permissions`, `resolvePermissions`).
  - `ResponsiveField.tsx`: already reuses Puck's `AutoField` / `FieldLabel`; a shadcn fields panel replaces these.
  - `render-config.tsx`: field definitions (plain data shared with the storefront).
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`: the editor route (the Back button, save and `baseVersion`, the publish link target).
- `Sinwy.WebFrontend/src/shared/components/ui/`: the shadcn components.
- `docs/design-rules.md`, and `Sinwy.WebFrontend/src/styles.css` for theming Puck's CSS variables.

**Steps:**
- Recompose the editor with `<Puck>` children and overrides:
  - our own header (save, publish, undo/redo, viewport switch)
  - component drawer
  - outline
  - a fields panel that uses shadcn inputs for the common field types
- Record which parts couldn't be replaced, and how the result looks against our design rules (`docs/design-rules.md`).
- Guardrails to try:
  - undo and redo with the keyboard
  - copy/paste and duplicate
  - templates (start a page from a preset)
  - locked props (a preset section whose layout can't be changed)
  - required children that can't be deleted
  - sensible defaults on insert
  - keyboard-only navigation
- Theme the leftover Puck chrome through its CSS custom properties to match ours.

**Tests that matter:**
- None beyond keeping verify green; this phase is UI exploration.

**Done when:**
- The editor reads as part of Sinwy, and Findings list every guardrail as native, custom (with effort), or not possible.

**Verify:**
- Seed: `pro-org`.
- Start a new page from a template, duplicate a section, try to delete a locked child (refused), undo twice with the keyboard, and save from the custom header. A new version row appears.

### Log (2026-11-17, `feat(web): puck spike phase 6, editor chrome and guardrails`)
- Shipped:
  - The editor is composed from `<Puck>` children (`EditorChrome.tsx`), which replace Puck's whole layout:
    - Our header: Back, title and path, a viewport switch, Undo/Redo, a save status ("Unsaved changes" / "All changes saved", from the history index), Save and Publish. Both show toasts. Publish saves first if needed, then calls `POST …/publish`.
    - Left panel tabs: **Add** (`Puck.Components` with a `drawerItem` override that adds a + button), **Layers** (`Puck.Outline`) and **Templates**. An empty page opens on Templates.
    - The canvas is ours (`EditorCanvas`): the iframe at the viewport's exact width, scaled to fit, and a click on the backdrop deselects.
    - Right panel: a block toolbar (select parent, move up/down, duplicate, copy, paste, delete; each disabled by Puck permissions), then `Puck.Fields`. With nothing selected it reads "Page settings".
  - Fields: `editor-fields.tsx` overrides `fieldTypes` text, textarea, select and radio, plus `fieldLabel`, with shadcn `Input`, `Textarea` and `Select` and a segmented control of native radios. `ResponsiveField` uses the same controls, not Puck's `AutoField`/`FieldLabel`. Rich text, slot and custom fields stay Puck's.
  - `actionBar` override (`CanvasActionBar`): Puck's `ActionBar` primitives with our duplicate and delete, counter-scaled by the canvas zoom.
  - Block commands (`use-block-actions.ts`) and pure helpers (`editor-actions.ts`):
    - `cloneBlock` gives new ids to a block and its children, and rewrites references to the old ids (FreeGrid layout keys).
    - `placementFor` decides where Add/paste put a block: into the selected block's first slot, else after the selected block, else at the end of the page. Slot `allow` lists are respected.
    - Blocks are placed with `insert` + `replace` (one history step).
  - Hotkeys (`useEditorHotkeys`, on the host document and the iframe): Ctrl/⌘+C/V copy and paste through a localStorage clipboard, refusing types the drawer doesn't offer (plan-locked); Ctrl/⌘+D duplicate; Alt+↑/↓ move; Escape deselects. Undo, redo and Delete stay Puck's.
  - Templates (`templates.ts`): "Salon homepage" and "Simple page", built from the config's `defaultProps`, so starter gets them without a booking widget. Applying one is `setData` plus `resolveDataById` for every block, asks to confirm on a non-empty page, and is undoable.
  - Guardrails (`editor-config.tsx`, `withGuardrails`):
    - Required children: the first Heading and Button in a Hero can't be deleted, duplicated or dragged out (`resolvePermissions` with `parent`).
    - Locked layout: Services' children are pinned the same way. Its slot is `allow: []`, and `resolveData` marks `tone` and `padding` `readOnly`; the fields show a lock and are disabled.
  - Theme: `styles.css` maps Puck's azure scale and its surface, border, text, font and radius tokens to ours at `:root`. They sit outside `@layer puck-tokens`, so they win, and the iframe picks them up through the host-style sync.
  - Tests: `page-builder-editor-actions.test.ts`: the clone keeps FreeGrid cells on the new ids; placement into a slot, after a leaf, or at the end; a locked slot is skipped; both templates parse with `pageContentSchema` and have no BookingWidget on starter.
- Differs from plan:
  - `docs/design-rules.md` is the backend architecture guide, and there are no written UI rules. The chrome was judged against the dashboard's existing look (shadcn on Base UI, `--line-soft` borders, card surfaces, Manrope).
  - Publish lives in the editor header (the plan listed it; before this phase it was only on the page detail screen).
- Checked in the running app:
  - Inline (`seed-8cb1127f/salon`, not saved):
    - Ctrl+D on a FreeGrid copies its 3-column arrangement, and one Ctrl+Z removes the copy.
    - The + button adds after the selection; Alt+↑ moves it; Copy then Ctrl+V pastes after.
    - Switching to Phone keeps the selection, and the iframe is 375 px.
    - Dragging "Text" from our drawer item onto the scaled canvas inserts it.
    - Layers items select with Enter or Space.
    - Theme applied in the canvas overlays and the outline.
  - E2E subagent (pro org `seed-76cc4ae3`, page `phase-six-test`, id `8eb5b26e-7032-4ba8-9531-52966f1b4309`):
    - The new page opened on Templates; Salon homepage applied: Hero, Services, Section, Section.
    - Duplicate on a Section gave 3 Sections.
    - On the Services BookingWidget and heading, delete was disabled ("This block can't be removed"), and Delete/Backspace dispatched nothing.
    - A text edit, then Ctrl+Z twice: undo 1 reverted the text, undo 2 removed the duplicate.
    - Header Save wrote `page_content` version 2 (`schemaVersion` 2) with the same four root ids as the canvas. The "Changes saved" toast was seen on an extra save (version 3).
    - The console had no errors; web and backend logs were clean.
  - Not checked:
    - Starter-plan paste refusal in the browser (the rule is unit-level: drawer types).
    - Touch (phase 7).
    - Dark mode.

**Findings**
- **How far Puck's UI can be replaced:**
  - Native and clean:
    - Header and panels: `<Puck>` children replace the entire layout.
    - Drawer items (`drawerItem`), the action bar (`actionBar` plus exported `ActionBar` primitives), field inputs (`fieldTypes`) and labels (`fieldLabel`).
    - Every editing command is reachable through `useGetPuck().dispatch` and `getPermissions`.
  - Rebuilt by us: the canvas. `Canvas` isn't exported, so composing loses:
    - viewport sizing and auto-zoom (`EditorCanvas`, about 60 lines)
    - the starting viewport (Puck's canvas picks it, so it stayed at 360 px until we passed `ui.viewports`)
    - deselect on a backdrop click
    - the action bar's zoom compensation (it reads a store zoom only `Canvas` sets, hence our `CanvasZoom` context)
  - Only themable, not replaceable:
    - drawer category headings, outline rows and their "Outline" title
    - slot placeholders, drop indicators, the hover and selection overlay, and the drag preview
    - the rich text field and toolbar
  - The theme tokens make these read as ours.
- **Result against the app's look:** reads as part of Sinwy (screens in the session). What's still off: Puck's dark action bar, uppercase category headings, and the outline's typography. The app toaster (top right) briefly covers Publish.
- **Guardrails:**

  | Guardrail | Puck | Effort / notes |
  | --- | --- | --- |
  | Undo/redo with the keyboard | ✅ native (Ctrl/⌘+Z, Shift+Z, Y, also in the iframe) | Header buttons from `usePuck` history. Ctrl+Z inside a field input runs Puck's undo, not the input's. |
  | Copy/paste | ❌ none | 🟡 S: localStorage clipboard, fresh ids, plan check, placement |
  | Duplicate | ✅ native, but wrong for FreeGrid | 🟡 S: Puck renews child ids but not references, so a duplicated grid lost its arrangement. Our `cloneBlock` is used in the action bar, the panel and Ctrl+D. |
  | Templates | ❌ none | 🟡 S: `setData` plus `resolveDataById` |
  | Locked props | ✅ native (`resolveData` → `readOnly`, stored in the document; the server schema already allows it) | Our field overrides must honour `readOnly` themselves. Needs an explicit resolve after `setData`. |
  | Required children | ✅ native (`resolvePermissions` with `parent`; Delete honours it) | The "first child of each type" rule is ours (S). A locked layout also needs slot `allow: []`. |
  | Sensible defaults on insert | ✅ native (`defaultProps`) | Click-to-add reuses them. |
  | Keyboard-only navigation | 🟡 partly | 🟡 M: Puck has no keyboard insert or move, canvas blocks aren't focusable, and each layer has a dead extra tab stop. Ours: + buttons, Alt+↑/↓, the toolbar, Escape. Not possible without much more work: moving a block into another slot by keyboard. |

- **Puck behaviour hit:**
  - `setData` isn't recorded in history unless `recordHistory: true`.
  - `setData` doesn't run `resolveData`, and logs a dev warning that it's expensive. Single blocks therefore use `insert` + `replace`, which the 300 ms history debounce merges into one undo step.
  - The `componentItem` override logs a deprecation warning (renamed `drawerItem`), though the types still offer it.
  - Each drawer item renders twice (a draggable copy over a background copy), and the wrapper is a `role=button` whose name contains the item's text, so locators and screen readers see duplicates.
  - `usePuck` selectors must return primitives or stable references (a fresh object would loop the store).
  - Puck's CSS still `@import`s Inter from `rsms.me`: an external request from the editor.
  - The action bar of a block at the very top of the page is clipped by the iframe's top edge.
- Rough time: about 3.5 h (composition and canvas 1 h, fields 0.5 h, block actions and hotkeys 1 h, guardrails and templates 0.5 h, theming and browser checks 0.5 h).

**Scores**
- Replace the editor UI with our own components: 🟡 M (layout, fields, drawer items and action bar native; canvas rebuilt; overlays and outline only themable).
- Theme the remaining Puck chrome: ✅ native tokens (S).
- Undo/redo with the keyboard: ✅ native.
- Copy/paste: 🟡 S.
- Duplicate: ✅ native, 🟡 S to keep FreeGrid layouts.
- Templates: 🟡 S.
- Locked props: ✅ native.
- Required children: ✅ native.
- Defaults on insert: ✅ native.
- Keyboard-only editing: 🟡 M.

## Phase 7: Stress tests and performance

**Goal:** there are numbers and observations for large pages, bundle sizes, SSR cost, deep nesting, touch editing, and breaking the page on purpose.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/`:
  - `PageEditor.tsx` (the `<Puck>` props) and `EditorChrome.tsx` (layout, `EditorCanvas` scaling, header save and publish).
  - `use-block-actions.ts`: insert, duplicate, paste and move. Use it to build the large page in the browser, or generate the JSON directly.
  - `editor-config.tsx`, `render-config.tsx`, `rich-text.tsx` (the storefront rich text renderer), `FreeGridEditor.tsx` (RGL, editor only).
  - `PuckPage.tsx`: `<Render>` from `@puckeditor/core/rsc`, used by `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx`.
- `Sinwy.WebFrontend/src/modules/storefront/routes/$pageSlug.tsx`: the SSR storefront page.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`: save with `baseVersion`, which is the version-conflict path for the two-tab test.
- `Sinwy.Shared/types/page/PuckContent.ts` (`PUCK_LIMITS`: depth 6, 400 blocks) and `Sinwy.Backend/modules/pages/controller.ts` (`MAX_PAGE_CONTENT_BYTES`, 256 KB).
- The build output from `bun run build` in `Sinwy.WebFrontend`.

**Steps:**
- Bundle sizes, gzipped:
  - editor route chunk(s)
  - storefront page route JS with and without the Puck renderer
  - whether Puck, Tiptap, RGL or happy-dom leak into the storefront
  - whether a lighter Render-only entry exists
- Large page: generate a document with 50+ sections and around 200 components through the API.
  - Measure editor load time, drag and typing responsiveness, and save time.
  - Measure SSR render time and HTML size.
  - Check whether the document hits the 256 KB cap.
  - Use a Chrome DevTools performance trace for editor interactions; ask the user to enable that MCP if it's off.
- Deep nesting: Section > Columns > Container > FreeGrid > block. Drag between nested slots and in and out of containers.
- Touch: an emulated tablet with touch, covering drag, select, resize in FreeGrid and rich text editing.
- Break it like a novice would:
  - drop blocks in odd places
  - delete required children
  - paste junk HTML into rich text
  - undo far back
  - open the same page in two tabs and save both (the existing `version-conflict` path)

**Tests that matter:**
- None new. Record measurements in Findings as numbers, with the machine and build mode stated.

**Done when:**
- Findings hold a table of bundle sizes and timings, and a list of what broke.

**Verify:**
- Seed: `pro-org` plus the generated large page.
- Open the large page in the editor, drag a section to the end, and type in a rich text block. Save and publish. The public page renders server-side.
- The second tab's save shows the "saved somewhere else" error and doesn't overwrite.

### Log (2026-11-17, `docs: puck spike phase 7, stress tests and performance`)
- Shipped: measurements only, no code changes. Scratch scripts (bundle closure, Playwright probes, page generator) lived in `/tmp/sinwy-p7` and aren't committed.
- Differs from plan:
  - Editor timings were taken on the production build (`vite preview` on :4173). Better Auth refuses that origin (`set-active` → 403 `INVALID_ORIGIN`), so the Playwright probes proxied `/api` through `route.fetch` with `Origin: http://localhost:3000`; save timings include that hop. Moving the preview to :3000 would have meant stopping the user's dev server, which wasn't allowed.
  - The Chrome DevTools MCP trace ran against the dev server (the only origin its browser could log in to), so its absolute numbers are dev-mode React. It was used for attribution; the numbers in the table come from Playwright on the production build.
  - Seed: pro org `seed-861ca6a6` (id `56364cfe-7e0b-45fb-82bd-f84c489e6333`) with pages `large` (252 blocks, published), `small` (18 blocks), `nesting` and `shallow-grid`.
- Checked in the running app: everything below, plus the e2e subagent run (org `seed-861ca6a6`, page `large`; all items passed):
  - A real mouse drag (wheel-scrolling while held) moved Section 1 to the end. Typed text in its Text block, saved (v9: Hero, Section 2 … 52, Section 1, with the typed text) and published (`published_version_id` → v9).
  - `curl` of the public page: 200, the 52 headings in the new order, and the typed text inside the rendered `<p>`, not only in a script.
  - Two tabs on v9: tab A saved v10; tab B got the "saved somewhere else" toast, one 409, stayed "Unsaved changes", and no version holds its text.
  - Console: only the expected 409. Web and backend logs clean.
  - Left behind: v8 (Section 1 accidentally nested, see Findings) and v10 (an unpublished draft ahead of published v9).

**Findings**

Machine: AMD Ryzen 5 7600X (6 cores / 12 threads), 30 GB RAM, Linux 6.18, system Chromium headless through Playwright 1.64, viewport 1440×900. Production build (`vite build`, served by `vite preview`); backend `bun run index.ts` without watch, local Postgres. "4× CPU" is Chrome's CPU throttling, a stand-in for a mid-range phone or tablet. Event Timing durations are rounded to 8 ms by the browser.

- **Bundle sizes** (gzip of each built chunk, summed over the static import graph; "transferred" is what the browser fetched):

  | What | Size |
  | --- | --- |
  | App baseline (main entry and its static imports, every page) | 274.5 KB |
  | Storefront `$pageSlug` route, static | 293.5 KB |
  | … of which the Puck render path | 14.5 KB: `PuckPage` 7.7 (our block renders + `renderRichText`), `@puckeditor/core/rsc` 6.3, misc 0.4 |
  | Storefront without the Puck renderer | 279.0 KB |
  | Storefront transferred at runtime (`/large` and `/salon`) | 321.6 KB JS (74 files, incl. headers) + 28.9 KB CSS |
  | Puck's lazy rich-text `Render` (Tiptap 89.3 + ProseMirror/Puck 24.8) | 119.6 KB, referenced by `PuckPage` but never fetched: `fieldTransforms.richtext` replaces it |
  | Editor route, static | 531.4 KB (+257 KB over baseline; route chunk 157.0 holds Puck core, dnd-kit, RGL and our editor) |
  | Editor transferred at runtime | 721.8 KB JS (adds the lazy Tiptap editor, about 120 KB, loaded on open because Text blocks edit inline) |

  - No leaks: the storefront's static graph contains none of Tiptap, ProseMirror, react-grid-layout, react-draggable, react-resizable, happy-dom, dnd-kit or Puck's store.
  - A lighter render-only entry isn't needed: `@puckeditor/core/rsc` already is one, about 6 KB gzip.

- **Large page** (52 Sections + Hero = 252 blocks: 71 Text, 17 Columns, one Section > Columns > Container > FreeGrid nest, ~500-character paragraphs):

  | Measurement | 252 blocks | Small page (18 blocks, or `salon` for SSR) |
  | --- | --- | --- |
  | Document size | 69.8 KB JSON | 5.0 KB |
  | API save (curl) / publish | 14 ms / 8 ms | – |
  | Editor save: click → response / → "All changes saved" (68 KB body) | 56–61 / 75–83 ms | 42–56 / 51–65 ms |
  | SSR TTFB, warm, 5 runs (388 blocks: 23 ms) | 15 ms | 4 ms |
  | SSR HTML raw / gzip (388 blocks: 274 / 30.3 KB) | 250 / 25.4 KB (169 KB markup + 81 KB inline hydration data, i.e. the document again) | 32.5 KB raw |
  | Storefront hydration, unthrottled: DCL / load / long tasks | 134–214 / 307–420 ms / none (1014 DOM nodes) | 110–118 / 172–187 ms / none |
  | Storefront hydration, 4× CPU: TBT / longest task | 171–193 / 152–158 ms | 86–91 / 136–141 ms |
  | Editor load: navigation → all blocks in the canvas | 935–1052 ms; long tasks 3–4, longest 216–228 ms, 478–541 ms in total | 440–550 ms; one 77–83 ms task |
  | Typing, side-panel rich text field: p50 / max per event | 32 / 56 ms | 16 / 48 ms |
  | Typing, inline in the canvas: p50 / max | 24 / 32 ms | 16 / 24 ms |
  | Typing, panel, 4× CPU: p50 / max (long tasks) | 104 / 144 ms (40) | 32 / 80 ms (1) |
  | Typing, inline, 4× CPU: p50 / max (long tasks) | 96 / 120 ms (every keystroke) | 32 / 40 ms (0) |
  | Panel edit → canvas updated | 2 ms after the last key | 2 ms |
  | Drag a section, 15 s held: average frame / frames > 50 ms / worst | 17.2 ms / 6 / 100 ms | – |
  | Move the first section to the end with Alt+↓ ×51 | 1.6 s (≈31 ms per move) | – |

  - Caps: a 400-block page with short text is only about 65 KB, so `PUCK_LIMITS.maxComponents` binds long before the 256 KB byte cap. The byte cap only bites with about 4 KB of text per section (242 blocks → 308 KB → 413 "This page is too large to save"). 430 blocks → 400 "A page holds at most 400 blocks". Both only show at save time.
  - Where typing time goes (DevTools MCP trace, dev build, 252 blocks; one keystroke INP 388 ms, 568 ms of it processing; 633 ms for a burst): React re-renders only about 8 components per keystroke (`EditorInner` twice, then the one `DraggableComponent`, `DropZoneProvider`, `RenderComponent`, `InlineEditorWrapper` and `Editor`), so memoisation holds. The CPU goes to React's event dispatch and Puck's state code (`step`, `__spreadValues`/`__spreadProps`, `compareEntries`), i.e. Puck rebuilds its whole-tree index on every change. That is O(blocks) per keystroke, which matches the 3× slowdown from 18 to 252 blocks under throttling.
  - Every Text block mounts its own inline Tiptap editor in the canvas (71 on the large page), which is most of the load-time long tasks.
- **What broke or got in the way:**
  - **No auto-scroll while dragging.** Held at the bottom edge of the canvas for 15 s, the iframe's scroll stayed at 0 and the section dropped near the top. Moving a section to the end of a long page only works by wheel-scrolling during the drag (it then landed last, after about 8 s) or with Alt+↓. Layers can't drag.
  - **"Drop after the last section" nests it instead.** The canvas ends flush with the last root section, so a drop on its lower part goes into that Section's slot; the e2e run saved such a nested state by accident (v8). The only root target was the page margin beside the last section, and once nested as the last child the move-down button is disabled. Root needs bottom padding or an end drop area.
  - **Text blocks can't be dragged in the canvas.** The whole block is the inline editor, so a press-and-drag selects text. A Heading or Button can only be grabbed beside its text, and a Section only in its padding: a press near its top grabs its first child instead. The action bar has no drag handle (Select parent, Duplicate, Delete). Workarounds: Alt+↑/↓, copy/paste, the panel toolbar.
  - **FreeGrid children:** the cell's edges are RGL resize handles (e, s, se), so a drag that starts near an edge resizes the cell (`replace`) instead of moving the block out. From the cell's centre, Puck's drag works: out to the page root, and out of a nested grid into another Section. Drawer → FreeGrid works.
  - A Container whose only child is a FreeGrid has no drop area of its own: a drop aimed at it lands inside the grid.
  - **Nonsense nesting is allowed and saves:** Hero, Services and Booking widget inside a Section; Columns inside a Hero; a whole Section inside a FreeGrid. Section and Hero slots have no `allow` lists.
  - **Depth over 6 can be built in the editor** (Section in a FreeGrid > Columns > Heading = 7). Save then fails with a 400 toast "Blocks nest at most 6 levels deep", without saying which block. The editor doesn't enforce `PUCK_LIMITS` at all.
  - Required children held: Delete and Backspace on the Hero's required Heading or Button do nothing. Deleting the whole Hero is allowed.
  - Junk HTML pasted into rich text was cleaned by Tiptap's schema: script, style, iframe, `img onerror`, SVG script and the `javascript:` link (text kept) were gone. `h1` and a table became paragraphs, `font` and Word's `o:p` became plain text, the safe link kept `rel="noopener noreferrer nofollow"`. It saved (200) and the stored version has no `javascript`, `onerror` or `<script`.
  - Undo far back: 24 edits (12 duplicates, 6 deletes, 6 moves; 30 → 120 blocks), then 40× Ctrl+Z returned exactly to the start with Undo disabled, and 40× redo returned to the edited state.
  - Two tabs: tab B's save got 409 and the toast "This page was saved somewhere else. Reload to get the latest version.". B stays "Unsaved changes", and the stored version holds only tab A's edit. There's no merge, and reloading discards B's work.
- **Touch** (emulated landscape tablet 1194×834, touch events through CDP, production build):
  - Tap selects a block. Tap twice in a Text block and type: works (the on-screen keyboard isn't emulated).
  - Drawer → canvas needs a press-and-hold: no hold did nothing, 400 ms inserted the block. Moving a block in the canvas needs at least a 300 ms hold on a non-text area (an Image dragged out of a FreeGrid worked). A Heading pressed on its text didn't move.
  - FreeGrid by touch: resize from the se handle and move by the ⠿ handle both work. The move handle is 10×10 CSS px on screen at the canvas zoom, and the resize handles 20–28 px, all below a comfortable touch target.
  - At 1194 px the side panels take about a third of the width; the canvas is still usable.
- Rough time: about 4 h (bundle analysis 0.5 h, large page and SSR 0.5 h, editor timings and trace 1 h, nesting and drag debugging 1 h, break-it and touch 1 h).

**Scores**
- Storefront weight of the renderer: ✅ native (`@puckeditor/core/rsc` ≈ 6 KB; Tiptap avoided with a 🟡 S rich-text transform from phase 3).
- SSR cost on large pages: ✅ native (15–23 ms, HTML ≈ 25–30 KB gzip).
- Editor bundle: 🟡 (≈ 450 KB gzip over the app baseline including the lazy Tiptap editor; acceptable for a dashboard route, no work needed).
- Editor responsiveness on 250+ blocks: 🟡 M (fine on desktop; ≈ 100 ms per keystroke at 4× CPU, because Puck's per-change work is O(blocks), which we can't fix from outside).
- Drag on long pages: 🟡 M (no auto-scroll in our scaled iframe canvas; needs a fix in `EditorCanvas` or Puck, or keyboard/outline moves).
- Draggability of text blocks: 🟡 S–M (add a drag handle to the action bar or the toolbar).
- Nesting rules and the depth limit in the editor: 🟡 S (slot `allow` lists plus a depth check in `resolvePermissions`).
- Touch editing: 🟡 M (works with press-and-hold; FreeGrid handles need larger touch targets).
- Sanitising pasted HTML: ✅ native (Tiptap schema) plus our server URL checks.
- Version conflicts: ✅ (409 path works; no merge).
## Phase 8: Editor usability review (agent + user)

**Goal:** a judgement, from both a scripted run and the user's own hands-on session, of how easy the editor is for a non-technical business owner.

**Files:**
- New: `docs/puck-usability-tasks.md`, the task script.
- What the tasks touch (read, don't change):
  - `Sinwy.WebFrontend/src/shared/components/page-builder/`: `EditorChrome.tsx` (header, Add/Layers/Templates, toolbar), `editor-config.tsx` (drawer labels and categories, guardrails, `editorConfigFor` plan gating), `templates.ts` ("Salon homepage", "Simple page"), `render-config.tsx` (field labels).
  - `Sinwy.WebFrontend/src/modules/org-dashboard/routes/`: `_shell.pages.new.tsx` (new page), `_shell.pages.$id.edit.tsx` (editor), `_shell.settings.branding.tsx` (brand colour and font live here, not in the editor).
- There's no "premium gallery" block. The only plan-gated block is Booking widget (`advanced-widgets`, professional and up); use it for the starter-plan task.
- Known friction from phase 7 (log): no auto-scroll while dragging, Text blocks can't be dragged in the canvas, nonsense nesting is allowed, depth errors only at save.

**Steps:**
- Write 6–8 tasks in a salon owner's words, for example:
  - "make a homepage with your services and a booking button"
  - "change your brand color"
  - "put two photos side by side"
  - "make it look right on a phone"
  - "fix a typo"
  - "undo a mistake"
  - "add the premium gallery on a starter plan"
- Agent run: drive each task with `playwright-cli`, cold, from the task wording alone. Record:
  - steps taken
  - dead ends
  - unclear labels
  - moments a broken design was possible
  - a 1–5 ease score per task
  - screenshots of friction points only
- Hand the same script to the user. Wait for their notes, and add them next to the agent's.

**Tests that matter:**
- None.

**Done when:**
- `docs/puck-usability-tasks.md` holds the tasks, the agent's results and the user's notes.

**Verify:** None; the review is the flow.


### Log (2026-11-17, `docs: puck spike phase 8, editor usability review`)
- Shipped: [puck-usability-tasks.md](puck-usability-tasks.md) holds 8 tasks in a salon owner's words, the agent's run (steps, dead ends, unclear labels, 1–5 ease) with 6 friction screenshots in `docs/puck-usability/`, and the product owner's hand run with notes and scores. No code changes.
- Differs from plan:
  - "Add the premium gallery on a starter plan" became "add an online booking form", because Booking widget is the only gated block.
  - "Put two photos side by side" was split in two. The Salon homepage template already has a photo row, so the second half builds one from scratch under "Find us".
  - The agent used a pro org (`seed-5b981653`, page `home`, three services added through the API) for tasks 1–6 and 8 and a starter `bookable-org` (`seed-aa372f19`) for task 7. The task 5 typo was planted through the content API. The user ran everything on a fresh `bookable-org`.
- Checked in the running app: everything in the task file, driven with `playwright-cli` on the dev server at 1440×900. Live pages were checked with `curl` and a second tab. Not checked: a real phone browser, and dragging a whole section (phase 7 covered it).

**Findings**
- **Ease scores (agent / user):**
  1. Homepage 4 / 3
  2. Brand colour 3 / 1
  3. Two photos 2 / 2
  4. Phone 4 / 4
  5. Typo 4 / 4
  6. Undo 4 (1 after leaving) / 4
  7. Booking on starter 3 / 1
  8. Move a section 4 / 4

  The user rated the discovery tasks (colour, gated block) lowest, and the agent rated work loss lowest.
- **Bugs:**
  - Selecting the Hero, or an Image right after load, dispatches two `setUi` actions that enter history: "Unsaved changes" and an active Undo with no edit.
  - Undo also restores the preview size: the user saw it jump from desktop to phone. Puck's history records `ui`, viewport included.
  - Back discards unsaved edits with no prompt.
  - The Hero's Heading shows Alignment "Left" while rendering centred.
  - The rich-text panel once showed an older value than the canvas (not reproduced).
  - In phone view, two Columns of images have overlapping placeholder backgrounds. Columns has no gap setting, so images touch the screen edges (user).
- **Gaps:**
  - No image upload or media library: Image is a URL field.
  - No version history or "revert to published" after leaving the editor.
  - The new-page wizard still offers v1 templates (made "0 widgets"), so the user picks a template twice.
  - Placeholder images and template instruction text publish without a warning.
  - No "View page" link after publishing.
  - Ctrl/⌘+S doesn't save (user expected it). The user wants autosave instead of a Save button.
- **Discoverability (the user's main theme):**
  - Brand colour lives only in Settings → Branding. The user wants branding (colours, tokens) in a panel inside the editor as well as in settings.
  - Gated blocks vanish on lower plans with no lock or upgrade prompt.
  - Drawer and template cards are text-only. The user wants visual previews and bigger cards.
  - Section, Container, Columns and Free grid read as developer words.
  - + inserts after the selected block (or at the bottom with nothing selected) without scrolling there, which the user found unclear.
  - Building a photo row means Columns, then dragging into each cell, which is finicky. The user wants ready-made, less flexible blocks first and low-level blocks further down.
  - Panel action icons need text labels. Button's Link is free text (`book`).
- **What worked:**
  - The Salon homepage template: one click to a credible page with services and booking buttons.
  - Inline text editing in the canvas.
  - The phone and tablet preview with automatic stacking, and clear per-breakpoint labels.
  - Undo and Redo, Ctrl/⌘+Z, Move up and down, and dragging.
  - The branding page and its live preview.
  - The user's overall view: the UI looks good and is a good foundation. Viability depends on how far Puck's UI and behaviour can be customised or injected into. Forking it is the fallback, but a costly one.
- Rough time: about 2 h for the agent run and write-up.

**Scores**
- Editor ease of use for a non-technical owner: 🟡 L. Most fixes are our chrome and blocks, not Puck:
  - S: templates, previews, labels, the leave guard, Ctrl+S or autosave, and an upgrade hint.
  - M: media upload and version history.
- Undo that doesn't touch the viewport and a clean dirty state: 🟡 S–M (filter `ui` out of Puck's history, or track dirty state by data).
- Customisability of Puck's own UI (drawer cards, insert behaviour, action bar): open question for phase 9. Answer it from the phase 6 overrides work.
