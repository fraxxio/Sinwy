# Page editor plan

The page editor from #76: a Puck-based editor with our own shadcn chrome that a non-technical salon owner can use without help. It covers finding the right block, seeing what it will look like, adding it where they expect, and trusting undo. It builds on the page document model from #75. Saving stays manual until #77 brings autosave.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-editor-log.md](page-editor-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Editor route, layout and save | – | done | `feat(web): add page editor route, layout and save` |
| 2 | Fields, action bar and block toolbar | 1 | done | `feat(web): add editor fields, block toolbar and action bar` |
| 3 | Photos and Booking blocks, drawer metadata | 1 | done | `feat(backend, web, shared): add Photos and Booking blocks with drawer metadata` |
| 4 | Block drawer, locked tiles and insert-and-scroll | 2, 3 | done | `feat(web): add block drawer, locked tiles and click-to-add` |
| 5 | History, viewport and keyboard | 2 | done | `feat(web): add undo and redo, keyboard shortcuts and keep the view on history` |
| 6 | Editor e2e spec for Puck upgrades | 4, 5 | done | `test(web): add the page editor Playwright spec for Puck upgrades` |
| 7 | Typing performance on large pages | 5 | done | `fix(web): preload the rich-text editor and measure typing on large pages` |
| 8 | Usability rerun (tasks 3, 7, 8) | 6, 7 | done | `fix(web): name sections in the canvas, explain refused drops and wait for history before undo` |
| 9 | Code review, docs and cleanup | 8 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Gated Booking block.** A new "Booking" block requires `premium-blocks`. On the storefront it's a "Book online" panel that links into the existing `/<org>/book` flow. A Starter org sees it in the drawer as a locked tile that explains why and links to upgrading.
- **Photos block.** A new ready-made block puts photos side by side, with a gap setting, so owners don't have to build Columns and then drag Images into the cells. Columns stays in the drawer, lower down.
- **Manual Save until #77.** A Save button. Dirty state compares the document with the last saved one, never the history index, so selecting a block never shows "unsaved". Save shows clear messages for 402 and 409. Publishing stays on the page detail screen. #77 replaces Save with autosave and adds the leave guard.
- **Committed Playwright spec.** The editor's upgrade gate is an `@playwright/test` spec run with `bun run test:editor` against a running stack. It isn't part of `bun run verify`, and it must pass before any Puck upgrade.

### Defaults (not yet confirmed; change only if asked)

1. Editor code lives in `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/`, because only the dashboard uses it. The config adapter, block renders and `PageDocumentView` stay in `src/shared/components/page-builder/`.
2. The route is `/dashboard/$organizationSlug/pages/$id/edit`. It fills the window, without the sidebar and the header of the app shell. The page detail's Content section gets an "Edit content" button that leads to it.
3. Drawer cards show a static Tailwind sketch per block, not a live render. Groups, top to bottom: Ready-made (Hero, Services, Photos, Booking), Content (Heading, Text, Image, Button), Layout (Section, Columns).
4. Each block's plain-language `description` and its drawer `group` live in the shared manifest, required by `defineBlock`, so a new block can't ship without them. The sketches live in the web editor.
5. Clicking a card adds the block after the selected block, in the closest slot that accepts the type, walking up through the ancestors. With nothing selected, or no slot that accepts the type, the block goes to the end of the page. The new block is then selected and scrolled into view.
6. Keyboard, when focus isn't in a text input or the inline rich-text editor: Ctrl/⌘+Z undo; Ctrl/⌘+Shift+Z and Ctrl+Y redo; Delete and Backspace delete the selected block; ↑ and ↓ select the previous or next block in reading order; Esc selects the parent, then deselects; Alt+↑ and Alt+↓ move the selected block within its slot. Ctrl/⌘+S saves; #77 keeps that shortcut.
7. Viewports: Desktop 1280, Tablet 768, Phone 375, as in the spike. The editor opens on Desktop.
8. Photos: an `items` slot that allows only Image, with two Image placeholders by default. Settings: gap (none, small, medium, large) and phone layout (side by side or stacked; default stacked). It's allowed at the top level and inside Section. There's no item cap beyond the page limits; past 4 photos the row wraps.
9. Booking: title, intro and `serviceIds` (empty means all active services). Each service links to `/<org>/book?service=<id>`, and a main "Book now" button links to `/<org>/book`. It's allowed at the top level only.
10. Clicking a locked tile opens a dialog that names the lowest plan with the feature (`minimumPlanFor`) and shows `UpgradeAction` (an owner gets the billing link; anyone else is told to ask an owner). A locked tile can't be dragged.
11. An empty page shows a first-run state in the canvas: a short line and the Ready-made cards, which add a block when clicked. It goes away as soon as the page has a block.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Spike branch** `pagebuilder-tryout` is reference only (read with `git show pagebuilder-tryout:<path>`); everything from its editor is ported.
- **Puck** is `@puckeditor/core` 0.24.0, pinned exactly in `Sinwy.WebFrontend/package.json`. Don't import `puck.css`; 0.22+ injects its own, unlayered, so overriding it from Tailwind needs the `!` modifier. Under StrictMode, the children of `<Puck>` remount once (#1884).
- **Editor code:** `org-dashboard/components/page-editor/`: `PageEditor.tsx` (mounts `<Puck>` with `overrides` and `dnd`, inside `EditorServicesContext` and `BlockAccessProvider`), `EditorLayout.tsx` (header, `ViewportSwitch`, `KeepUiOnHistory`, `HistoryButtons`, `SaveControls` with Ctrl/⌘+S, `LeftPanel`, `RightPanel`), `EditorCanvas.tsx` (also the `iframe` override and `useCanvasDocument`), `editor-config.tsx` (`usePuck`, `VIEWPORTS`, `editorConfig`, the root render with `FirstRunBlocks`, `withLockedFields`), `editor-fields.tsx`, `BlockChrome.tsx` (`BlockToolbar`, action bar, overlay, `setCanvasZoom`), `BlockDrawer.tsx` (drawer, locked tiles, upgrade dialog, first-run cards), `use-block-actions.ts` (`blockActions(getPuck)` behind `useBlockActions`: add, duplicate, move, remove, selectParent, step, escape, undo, redo, historyPending; `scrollToBlock`; `useEditorKeys`, `useEditorHotkeys`, `useRefusedDropNotice`), `block-actions.ts` (pure: `ROOT_ZONE`, `cloneBlock`, `zoneContent`, `selectorFor`, `slotAccepts`, `blockTitle`, `canvasLabel`, `refusedDropNotice`, `placementFor`, `moveTarget`, `readingOrder`, `stepInReadingOrder`, `parentSelector`, `drawerGroups`), `save.ts`. The route `_shell.pages.$id.edit.tsx` loads `PageEditor` with `lazy()`, holds the base version in a ref and saves through `savePageContent`. It drops the shell with `staticData.fullWindow`, which `_shell.tsx` reads.
- **Dirty state** compares Puck's `appState.data` with the data last sent in a successful save (`hasUnsavedChanges`, memoised on the data reference), not with the server's answer, whose normalised rich text could differ.
- **Config:** `puckConfigFrom(BLOCKS, BLOCK_RENDERS, { customFields, root })` in `src/shared/components/page-builder/puck-config.ts` builds `fields` and `defaultProps` from the manifest and trims Tiptap to the rich-text allowlist. Custom kinds without a UI in `customFields` are left out. Locked fields get `metadata: { locked: true }`.
- **Locked fields** go through `lockedField` (Puck's `AutoField` with `readOnly`). Never return `readOnly` from `resolveData`: Puck then records a `replace` about 0.75 s after load, which turns on Undo and shows "unsaved". No manifest field is locked yet.
- **Root drops:** the root render uses `puck.renderDropZone({ zone: "root:default-zone", allow: ROOT_ALLOW })` (Puck special-cases that zone id). Verified in the browser: a Heading dragged to the root is refused, a Section is accepted. The server refuses it too (400 "Heading can't go at the top level of a page").
- **History recording:** Puck records 250 ms after the last recorded dispatch (debounced), so consecutive recorded dispatches fold into one entry; `setUi` and `setData` aren't recorded unless `recordHistory: true`. Insert-with-data is `insert` (with our `id`) then `replace` (`replace` can't change an id). Dispatch `setUi` before `reorder`/`remove` so the recorded state's selection is right. `remove` doesn't clear the selection. See log phase 2.
- **History travel:** every entry stores the whole app state, `ui` included. `KeepUiOnHistory` puts the user's `ui` back after undo/redo (viewport, selection by id while the block exists) and clears `field.focus`. Puck remounts the fields on travel, so the rich-text editor loses DOM focus either way. A kept rich-text focus makes the new editor dispatch a data-identical `replace` that truncates the redo stack. See log phase 5.
- **Hotkeys:** Puck 0.24 owns Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl/⌘+Y (host and iframe, also inside inputs) and Ctrl/⌘+I (interactive preview). We own Delete/Backspace, ↑/↓, Alt+↑/↓, Esc and Ctrl/⌘+S through capture-phase listeners on both documents (`useEditorKeys`). Puck's own Delete skips any event that's `defaultPrevented`, which is how ours replaces it. Ctrl/⌘+S works while typing; the rest don't (see `TEXT_ENTRY`, `ARROW_WIDGETS`). Base UI toasts are `role="dialog"` with `aria-modal="false"`, so `modalOpen` skips those, or every toast would block the keys.
- **Text blocks** have no inline editor in the canvas (the richtext field has no `contentEditable`). Their words are edited in the settings panel's Tiptap editor, `aside [contenteditable="true"]` (still unique: the preload copy is outside `aside` and read-only).
- **Unit tests** have no DOM: web tests can't mount Puck. Editor behaviour is tested through pure functions and `blockActions` with a fake `PuckApi` that records dispatches (see `page-editor-actions.test.ts`). To trace Puck's actions in the browser, temporarily pass `onAction` to `<Puck>`.
- **Drawer:** `Drawer.Item` renders its card twice (an inert copy behind), so role locators inside it match two elements; use `getByRole('button', { name: 'Add Image', exact: true }).last()` or `getByTestId('drawer-item:<Type>')`. The drawer panel scrolls: scroll a card into view before a scripted drag, or the drag never starts. Locked tiles are buttons named "<Block>: upgrade to use". Never pass `droppableId` or `direction` to `Drawer` (deprecated, logs `console.error`).
- **Action bar:** `dnd={{ enableDragHandle: true }}` makes Puck pass `dragHandle` to the `actionBar` override. `actionBar` and `componentOverlay` render inside the iframe (Tailwind applies) but outside `Puck.Preview`'s React tree: a context from `EditorCanvas` doesn't reach them, so the zoom goes through `setCanvasZoom`'s module store. The drag ghost keeps its offset from the grab point; from the handle (above the block's top-right) it sits far left of the pointer and is clipped at the iframe edge. Puck's behaviour, left as is (log phase 8).
- **Puck API:** `usePuck`/`getPuck` have no `metadata`, and fields don't get it either; editor-only data goes through React context around `<Puck>`. `getParentById` returns the root for a top-level block, so "has a parent" is `itemSelector.zone !== ROOT_ZONE`. Puck pads each settings field itself; our field components add no padding.
- **Scripted drags:** a release with no pointer move after reaching the target cancels the drop. Probes and the e2e spec add a 2 px settle move before releasing. A drop on the dashed "Drop blocks here" area at the end of a non-empty root zone lands last (checked at 5–70 px above the zone's bottom). Puck disables a non-empty zone's own droppable and resolves drops against blocks, with a closest-corners fallback; the area below the zone, outside the frame, takes nothing. Inside a slot, aim at the lower half of the last child; 8 px below it hits the Section's padding and is ignored. See log phase 4.
- **Manifest:** every block has `description` and `group` (`BlockGroup`); `BLOCKS` is in drawer order within each group. Booking is the only gated block (`requires: "premium-blocks"`). The public page loads services when it has a Services or a Booking block (`listsServices` in the pages service).
- **Photos layout** is CSS only (`auto-fit` grid of up to 4 columns, `--gap` var, `max-sm:grid-cols-1` when stacked), so it never counts its children. Page detail's block count includes the Images inside Photos, like Hero's children.
- **Save API:** `PUT /organizations/:orgId/pages/:pageId/content` (`savePageContent` in `page-queries.ts`). Errors: 409 `PAGE_VERSION_CONFLICT`; 402 `PLAN_UPGRADE_REQUIRED`, whose message doesn't name the block, so `saveErrorMessage` names it with `lockedBlocksIn` (shared, the same check the server runs); 400 with the server's message. Versions are stored in the `page_content` table (`page_id`, `version`, `content`), not `page_content`.
- **Empty documents:** new pages start with `emptyPageDocument()`, and every existing page was reset to an empty document. There are no templates for now.
- **shadcn CLI:** `shadcn add` installed a stray `cn` package and imported `cn` from `"cn"`; revert `package.json`/`bun.lock` and import from `@/shared/lib/utils`.
- **Plan names:** `PLAN_NAMES.professional` is "Business", so Booking's upgrade dialog says "Booking comes with the Business plan".
- **Plans on the client:** `useEntitlements()` (`has`, `features`) in `src/shared/lib/auth/entitlements.ts`, fed by `_shell`'s route context; `minimumPlanFor` in `src/shared/lib/plans.ts`; `UpgradeAction` in `src/shared/components/UpgradePrompt.tsx`. Starter has no `premium-blocks`; Professional and Enterprise do.
- **Storefront bundle:** `bun run check:storefront-bundle` (`scripts/storefrontBundleCheck.ts`) fails if Tiptap, ProseMirror, dnd-kit, react-grid-layout or happy-dom reach the storefront route. Editor code must never be imported from `src/shared/components/page-builder/` or the storefront.
- **Browser driving:** Base UI renders our link buttons with role `button` (`getByRole('button', { name: 'Edit content' })`), including the header's Desktop/Tablet/Phone switch. The canvas iframe is scaled (zoom ≈ 0.6 at Desktop in 1440×900); page coords = iframe rect + inner coords × zoom. The root zone is `[data-puck-dropzone="root:default-zone"]`. The first Vite dev load of the editor compiles Puck and takes a few seconds.
- **Seeds:** `bun run dev:seed-scenario subscribed-org` (Starter), `pro-org` (Professional, `premium-blocks`) and `bookable-org` (Starter with services and hours). `bun run dev:login-as` logs in. Both are described in `.agents/skills/e2e-test/references/`.
- **Click-to-add placement** (`placementFor`): end of the selected block's own slot if it takes the type; else after the selected block in the closest ancestor zone that takes it; nothing selected → page end; a type the root refuses is wrapped in a new Section (`WRAPPER`). Default 5 as extended in log phase 4.
- **Clicks inside the canvas iframe** bubble to Puck's root handler, which deselects. A button there that selects something must `stopPropagation` (see `FirstRunBlocks`).
- **Scrolling the canvas:** `scrollToBlock(id)` in `use-block-actions.ts` waits for `[data-puck-component=<id>]` in `iframe#preview-frame` and scrolls the iframe window (not `scrollIntoView`, which can scroll the host's overflow-hidden ancestors). ↑/↓ use it too.
- **Typing performance** on a 255-block page at 4× CPU, production build: 72–80 ms per key in a Text block, 40–48 ms in a Heading field, under the spike's ~100 ms; the rest is Puck's O(blocks) per-change work. Probes that proxy `/api` must run under Node, not Bun (`route.fetch` breaks on `Set-Cookie`). See log phase 7.
- **Rich-text preload:** until Puck's lazy Tiptap editor loads, its richtext field is a fake `contentEditable` that drops keys and loses focus on swap. `PreloadRichText` (hidden, read-only, outside the panels) mounted by `EditorLayout` loads it up front; keep it, or the first Text block typed into after load loses its keys.
- **Editor e2e spec:** `bun run test:editor` (`Sinwy.WebFrontend/e2e/`, files `*.e2e.ts`, since `bun test` runs `*.spec.ts`). It needs both dev servers and takes about 21 s; every run seeds a fresh `pro-org` and `subscribed-org`. `.playwright-cli/editor-e2e/stack.json` then holds their org ids, slugs and storage-state files, which are reusable for probes. Pro allows 5 pages and the suite uses 4; Starter allows 1, which its single test uses. A new test needs another org or must reuse a page. `editor-fixtures.ts` has `pages.create(blocks)` (POST plus PUT content, with `heading`/`section` builders), `drag` and `outline`. See log phase 6.
- **Undo right after an edit:** Puck records 250 ms after an edit; travelling before that skipped the edit and the late record cut the redo stack. `blockActions.undo/redo` (keys and header buttons) wait while `historyPending` (`history.histories[index].state.data !== appState.data`); otherwise Puck's own hotkeys run. Scripts may press Ctrl+Z at once (log phase 8).
- **Canvas names:** `canvasLabel` names a block after the first Heading in its slots ("Section · Find us", "Heading in Find us") in the hover tag and action bar; the settings header shows the title under the type. The Layers outline can't: Puck takes its labels from the static config (#82).
- **Refused drops:** a block released over a zone that doesn't take it stays in its own zone, sometimes reordered there, and Puck says nothing. `useRefusedDropNotice` (pointer listeners on the canvas document, zone from `elementFromPoint`, checked 400 ms after release) shows a toast pointing to the ⮤ parent action, which the action bar now renders.
- **Canvas coordinates:** Playwright's `locator.boundingBox()` on elements inside the scaled iframe returns page coordinates, so drags need no zoom maths.
- **Side panels** are the landmarks `complementary` "Blocks" (drawer, layers) and "Block settings" (toolbar heading = selected block's label, fields).
- **Scratch to delete in phase 9:** `/tmp/sinwy-p7` (probe scripts, a document dump), `/tmp/sinwy-p7-build.log`, `/tmp/sinwy-p7-preview.log`, `/tmp/sinwy-p8` (seed scripts, screenshots, issue drafts), and `Sinwy.WebFrontend/dist/` (git-ignored, from `vite build`). Check the older `/tmp/sinwy-*.log` files before deleting.
- **Running servers:** the dev servers on :3000 and :3001 log to `/tmp/sinwy-p4/web.log` and `/tmp/sinwy-p4/server.log`; `/tmp/sinwy-web.log` and `/tmp/sinwy-server.log` are stale. Phase 9 stops them.
- **Lockfile:** `bun install` re-resolves every `latest` dependency (TanStack), and a mixed `query-core` breaks `tsc` in `router.tsx`. When adding a package, keep `bun.lock`'s change to that package (log phase 6).

---

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
