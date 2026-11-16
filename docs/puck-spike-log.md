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
