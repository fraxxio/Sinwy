# Page editor plan

The page editor from #76: a Puck-based editor with our own shadcn chrome that a non-technical salon owner can use without help. It covers finding the right block, seeing what it will look like, adding it where they expect, and trusting undo. It builds on the page document model from #75. Saving stays manual until #77 brings autosave.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-editor-log.md](page-editor-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Editor route, layout and save | – | done | `feat(web): add page editor route, layout and save` |
| 2 | Fields, action bar and block toolbar | 1 | done | `feat(web): add editor fields, block toolbar and action bar` |
| 3 | Photos and Booking blocks, drawer metadata | 1 | done | `feat(backend, web, shared): add Photos and Booking blocks with drawer metadata` |
| 4 | Block drawer, locked tiles and insert-and-scroll | 2, 3 | todo | |
| 5 | History, viewport and keyboard | 2 | todo | |
| 6 | Editor e2e spec for Puck upgrades | 4, 5 | todo | |
| 7 | Typing performance on large pages | 5 | todo | |
| 8 | Usability rerun (tasks 3, 7, 8) | 6, 7 | todo | |
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

- **Spike reference, not code to merge.** Phase 1 ported the header, canvas and panels; phase 2 the fields, toolbar, action bar and overlay. The spike's editor is on branch `pagebuilder-tryout` under `Sinwy.WebFrontend/src/shared/components/page-builder/`: `EditorChrome.tsx` (949 lines: header, `EditorCanvas`, `BlockDrawer`, `BlockToolbar`, `CanvasActionBar`, `CanvasOverlay`, `useKeepViewportOnHistory`), `PageEditor.tsx`, `use-block-actions.ts` (`useBlockActions`, `useEditorHotkeys`), `editor-actions.ts` (`placementFor`, `slotAccepts`, `cloneBlock`, `ROOT_ZONE`), `editor-fields.tsx` (field overrides), `ServicePicker.tsx` and the route `_shell.pages.$id.edit.tsx`. Read them with `git show pagebuilder-tryout:<path>`. They target the old `PuckDocument` types, FreeGrid and templates, all of which are gone on master.
- **Puck** is `@puckeditor/core` 0.24.0, pinned exactly in `Sinwy.WebFrontend/package.json`. Don't import `puck.css`; 0.22+ injects its own, unlayered, so overriding it from Tailwind needs the `!` modifier. Under StrictMode, the children of `<Puck>` remount once (#1884).
- **Editor code:** `org-dashboard/components/page-editor/`: `PageEditor.tsx` (mounts `<Puck>` with `overrides` and `dnd`, inside `EditorServicesContext`), `EditorLayout.tsx` (header, `ViewportSwitch`, `SaveControls`, `LeftPanel`, `RightPanel`), `EditorCanvas.tsx`, `editor-config.tsx` (`usePuck`, `VIEWPORTS`, `editorConfig`, the root render, `withLockedFields`), `editor-fields.tsx` (`fieldOverrides`, `serviceIdsField` checklist, `lockedField`), `BlockChrome.tsx` (`BlockToolbar`, action bar, overlay, `setCanvasZoom`), `use-block-actions.ts` (`useBlockActions`: duplicate, move, remove, selectParent), `block-actions.ts` (pure: `ROOT_ZONE`, `cloneBlock`, `zoneContent`, `moveTarget`), `save.ts`. The route `_shell.pages.$id.edit.tsx` loads `PageEditor` with `lazy()`, holds the base version in a ref and saves through `savePageContent`. It drops the shell with `staticData.fullWindow`, which `_shell.tsx` reads.
- **Dirty state** compares Puck's `appState.data` with the data last sent in a successful save (`hasUnsavedChanges`, memoised on the data reference), not with the server's answer, whose normalised rich text could differ.
- **Config:** `puckConfigFrom(BLOCKS, BLOCK_RENDERS, { customFields, root })` in `src/shared/components/page-builder/puck-config.ts` builds `fields` and `defaultProps` from the manifest and trims Tiptap to the rich-text allowlist. Custom kinds without a UI in `customFields` are left out. Locked fields get `metadata: { locked: true }`.
- **Locked fields** go through `lockedField` (Puck's `AutoField` with `readOnly`). Never return `readOnly` from `resolveData`: Puck then records a `replace` about 0.75 s after load, which turns on Undo and shows "unsaved". No manifest field is locked yet.
- **Root drops:** the root render uses `puck.renderDropZone({ zone: "root:default-zone", allow: ROOT_ALLOW })` (Puck special-cases that zone id). Verified in the browser: a Heading dragged to the root is refused, a Section is accepted. The server refuses it too (400 "Heading can't go at the top level of a page").
- **History recording:** Puck records 250 ms after the last recorded dispatch (debounced), so consecutive recorded dispatches fold into one entry; `setUi` and `setData` aren't recorded unless `recordHistory: true`. Insert-with-data is `insert` (with our `id`) then `replace` (`replace` can't change an id). Dispatch `setUi` before `reorder`/`remove` so the recorded state's selection is right. `remove` doesn't clear the selection. Puck's built-in Ctrl+Z / Ctrl+Shift+Z already work on the host and in the iframe (phase 5 must not double them). See log phase 2.
- **History:** every history entry stores the whole app state, `ui` included, so undo and redo also restore the viewport. A dispatched `setUi` is never recorded. The spike's fix is a layout effect on `history.index` that dispatches `setUi({ viewports })` with the user's viewport after undo or redo, which covers the buttons and Puck's own hotkeys on the host and in the iframe. Still open: with a RichText block selected, Redo is followed by a `replace` that only carries `ui.field`. Puck records it as a data-identical entry, so getting back takes two Undo clicks.
- **Drawer:** `Drawer` and `Drawer.Item` are exported. `Drawer.Item`'s `children` render function must be a stable module-level const. Don't pass `droppableId` or `direction` to `Drawer`; both are deprecated and log `console.error`. `Drawer.Item` renders its content twice; set `inert` on the closest `[class*="Drawer-draggableBg"]` from the card's ref so screen readers announce it once, and put `isolate` on the grid so the copy stays visible while dragging. A locked tile is a plain button, not a `Drawer.Item`.
- **Action bar:** `dnd={{ enableDragHandle: true }}` makes Puck pass `dragHandle` to the `actionBar` override. A selected Text block's body press goes to the inline editor, so the handle is how you move Text. `actionBar` and `componentOverlay` render inside the iframe (Tailwind applies) but outside `Puck.Preview`'s React tree: a context from `EditorCanvas` doesn't reach them, so the zoom goes through `setCanvasZoom`'s module store. During a handle drag the drag ghost sits near the iframe's left edge, not under the pointer (drops still land); unchecked whether our scaled bar causes it (phase 8).
- **Puck API:** `usePuck`/`getPuck` have no `metadata`, and fields don't get it either; editor-only data goes through React context around `<Puck>`. `getParentById` returns the root for a top-level block, so "has a parent" is `itemSelector.zone !== ROOT_ZONE`. Puck pads each settings field itself; our field components add no padding.
- **Scripted drags:** a release with no pointer move after reaching the target cancels the drop. Probes and the e2e spec add a 2 px settle move before releasing. On a page with blocks, a drop on the dashed "Drop blocks here" area at the end of the root zone doesn't land (5, 20 and 40 px above the zone's bottom all failed); ~8 px below the last block does. Phase 4 must fix or explain this. Inside a slot, aim at the lower half of the last child; 8 px below it hits the Section's padding and is ignored.
- **Manifest (phase 3):** every block has `description` and `group` (`BlockGroup`); `BLOCKS` is in drawer order within each group. Booking is the only gated block (`requires: "premium-blocks"`); `saveErrorMessage` reads `BLOCKS` directly. The public page loads services when it has a Services or a Booking block (`listsServices` in the pages service). See log phase 3.
- **Photos layout** is CSS only (`auto-fit` grid of up to 4 columns, `--gap` var, `max-sm:grid-cols-1` when stacked), so it never counts its children. Page detail's block count includes the Images inside Photos, like Hero's children.
- **Hero's default `items` have no ids;** Puck 0.24 adds them on insert. `BlockTemplate` in `blocks/fields.ts` documents this.
- **Save API:** `PUT /organizations/:orgId/pages/:pageId/content` (`savePageContent` in `page-queries.ts`). Errors: 409 `PAGE_VERSION_CONFLICT`; 402 `PLAN_UPGRADE_REQUIRED`, whose message doesn't name the block, so `saveErrorMessage` names it with `lockedBlocksIn` (shared, the same check the server runs); 400 with the server's message. Versions are stored in the `page_content` table (`page_id`, `version`, `content`), not `page_content`.
- **Empty documents:** new pages start with `emptyPageDocument()`, and every existing page was reset to an empty document. There are no templates for now.
- **shadcn CLI:** `shadcn add` installed a stray `cn` package and imported `cn` from `"cn"`; revert `package.json`/`bun.lock` and import from `@/shared/lib/utils`.
- **Plan names:** `PLAN_NAMES.professional` is "Business", so `minimumPlanFor("premium-blocks")` shows as "Business" (phase 4's Verify says "Professional").
- **Plans on the client:** `useEntitlements().has(feature)` (`src/shared/lib/auth/entitlements.ts`), fed by the org shell's route context. `minimumPlanFor` and `FEATURE_NAMES` are in `src/shared/lib/plans.ts`. `UpgradeAction` is in `src/shared/components/UpgradePrompt.tsx`. `featuresFor`, `PLAN_FEATURES` and `hasFeature` are in `Sinwy.Shared/types/plan/PlanFeatures.ts`. Starter has no `premium-blocks`; Professional and Enterprise do.
- **Route context:** the editor route is under `_shell`, whose `beforeLoad` provides `organization`, `member` and `entitlements`.
- **Storefront bundle:** `bun run check:storefront-bundle` (`scripts/storefrontBundleCheck.ts`) fails if Tiptap, ProseMirror, dnd-kit, react-grid-layout or happy-dom reach the storefront route. Editor code must never be imported from `src/shared/components/page-builder/` or the storefront.
- **Browser driving:** Base UI renders our link buttons with role `button` (`getByRole('button', { name: 'Edit content' })`), including the header's Desktop/Tablet/Phone switch. The canvas iframe is scaled (zoom ≈ 0.6 at Desktop in 1440×900); page coords = iframe rect + inner coords × zoom. The root zone is `[data-puck-dropzone="root:default-zone"]`. The first Vite dev load of the editor compiles Puck and takes a few seconds.
- **Seeds:** `bun run dev:seed-scenario subscribed-org` (Starter), `pro-org` (Professional, `premium-blocks`) and `bookable-org` (Starter with services and hours). `bun run dev:login-as` logs in. Both are described in `.agents/skills/e2e-test/references/`.
- **Spike performance baseline** (production build, Ryzen 5 7600X, headless Chromium, 1440×900): typing on a 252-block page took 24–32 ms per key unthrottled and 96–104 ms per key at 4× CPU, with a long task on every key. The cost is Puck rebuilding its whole-tree index on every change (O(blocks)); only about 8 components re-render per key. Better Auth refuses the `vite preview` origin (:4173, `set-active` → 403 `INVALID_ORIGIN`). The spike's probes proxied `/api` through Playwright's `route.fetch` with `Origin: http://localhost:3000`.

---

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

---

## Phase 5: History, viewport and keyboard

**Goal:** undo and redo never change the viewport and take one step each, selecting never records history, and the editor can be driven by keyboard per Default 6.

**Files:**
- `src/modules/org-dashboard/components/page-editor/` (header, layout, block toolbar).
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

---

## Phase 6: Editor e2e spec for Puck upgrades

**Goal:** `bun run test:editor` runs a committed Playwright spec against the running stack that covers the editor's core flows, and the README says to run it before any Puck upgrade.

**Files:**
- New: `Sinwy.WebFrontend/e2e/` (or the place Playwright's config points), `playwright.config.ts`, a `test:editor` script in the root `package.json`.
- `.playwright/cli.config.json` (system Chromium path), `Sinwy.Backend/scripts/dev/seedScenario.ts`, `loginAs.ts`.
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

---

## Phase 7: Typing performance on large pages

**Goal:** typing on a 250-block page at 4× CPU throttling is no slower than the spike (about 100 ms per key), measured on a production build.

**Files:**
- `src/modules/org-dashboard/components/page-editor/` (field overrides, renders that run per key).
- `src/shared/components/page-builder/blocks.tsx` (`BLOCK_RENDERS`).
- Spike method: `docs/puck-spike-log.md` phase 7 on `pagebuilder-tryout`.

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

---

## Phase 8: Usability rerun (tasks 3, 7, 8)

**Goal:** an agent driving the browser cold reruns usability tasks 3 (drawer part), 7 and 8 from the spike and hits no dead end, and what it finds is fixed or filed.

**Files:**
- Task wording: `docs/puck-usability-tasks.md` on `pagebuilder-tryout` (tasks 3, 7, 8, with the user's notes).
- Whatever files the findings point at.

**Steps:**
- Run the tasks with the `e2e-test` skill, worded as the owner would say them, with no hints about the UI. Record steps, ease (1–5) and dead ends per task, as the spike did.
- Fix small findings in this phase. File larger ones as GitHub issues (ask before creating them) and list them in the log.

**Tests that matter:**
- Any fix keeps the e2e spec green.

**Done when:**
- Tasks 3 (drawer part), 7 and 8 score 4 or 5 with no dead end.

**Verify:** Task 3: seed `pro-org`, "Put two photos of the salon side by side", then "Under 'Find us', add two photos of the street next to each other" (seed a "Find us" Section with a Heading first). Task 7: seed `subscribed-org` (Starter), "Add an online booking form to my page": the agent finds the locked Booking tile and its upgrade path, or the Services/Button workaround. Task 8: a page with Hero, Services and a "Find us" Section, "Move the 'Find us' part up, right under the welcome banner". Each task ends with a Save, and the `page_content` row matches. Nothing is simulated except login.

---

## Phase 9: Code review, docs and cleanup

**Goal:** the editor's plan gating and save paths have been reviewed, the docs describe the editor, and nothing temporary is left behind.

**Files:**
- Every file the earlier phases changed (`git diff` from the plan's first commit).
- `CONTEXT.md` (Page Builder, Block), `docs/org-rules-map.md`, `.agents/skills/e2e-test/references/app-map.md`, `README.md`.

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
