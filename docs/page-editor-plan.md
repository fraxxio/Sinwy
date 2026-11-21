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
| 9 | Code review, docs and cleanup | 8 | done | `test(web): cover a refused save in the editor spec and document the page editor` |

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

Verified facts and gotchas for follow-up work (#77 autosave, Puck upgrades). The log has the detail.

- **Puck** is `@puckeditor/core` 0.24.0, pinned exactly. Don't import `puck.css`; it injects its own, unlayered, so Tailwind overrides need `!`. Under StrictMode the children of `<Puck>` remount once (#1884). Run `bun run test:editor` before any upgrade.
- **Editor code** is `org-dashboard/components/page-editor/`: `PageEditor.tsx` (mounts `<Puck>`), `EditorLayout.tsx` (header, `SaveControls`, `KeepUiOnHistory`, panels), `use-block-actions.ts` (every block command, the hotkeys, `scrollToBlock`), `block-actions.ts` (pure helpers, unit-tested), `BlockDrawer.tsx` (drawer, locked tiles, upgrade dialog), `save.ts`. The route `_shell.pages.$id.edit.tsx` holds the base version in a ref and saves through `savePageContent`.
- **Dirty state** compares Puck's `appState.data` with the data last sent in a successful save, not the server's answer. A refused save (409, 402, 400, network) keeps it dirty; the e2e spec checks the 409 case.
- **Plan gating:** locked tiles aren't `Drawer.Item`s, so they can't be dragged, and `add` is only called for unlocked tiles. The server's `lockedBlocksIn` is by type: a page whose latest version has Booking can keep, duplicate and save Booking blocks after a downgrade. Removing them all and saving loses that.
- **Never return `readOnly` from `resolveData`:** Puck records a `replace` about 0.75 s after load, which turns on Undo and shows "unsaved". Locked fields go through `lockedField`.
- **History:** Puck records 250 ms after the last recorded dispatch; `setUi`/`setData` aren't recorded. Every entry stores the whole app state, so `KeepUiOnHistory` restores the user's `ui` after travel. Undo/redo wait while `historyPending`. See log phases 2, 5 and 8.
- **Hotkeys:** Puck owns Ctrl/⌘+Z, Shift+Z, Y and I; we own Delete/Backspace, ↑/↓, Alt+↑/↓, Esc and Ctrl/⌘+S (capture-phase listeners on the host and canvas documents). #77 keeps Ctrl/⌘+S.
- **Puck API:** `usePuck`/`getPuck` and fields have no `metadata`; editor-only data goes through React context. `actionBar` and `componentOverlay` render outside `Puck.Preview`'s React tree, so a context from the canvas doesn't reach them.
- **Rich-text preload:** keep `PreloadRichText`, or the first Text block typed into after load loses its keys.
- **Unit tests** have no DOM: editor behaviour is tested through pure functions and `blockActions` with a fake `PuckApi`.
- **Editor e2e spec:** `bun run test:editor` needs both dev servers, takes about 20 s and seeds a fresh `pro-org` and `subscribed-org` each run. Pro now uses all 5 of its pages and Starter its 1, so a new test needs another org or must reuse a page. Driving tips are in the e2e skill's `app-map.md`.
- **Storefront bundle:** `bun run check:storefront-bundle` fails if editor dependencies reach the storefront; never import editor code from `src/shared/components/page-builder/` or the storefront.
- **Lockfile:** `bun install` re-resolves every `latest` dependency (TanStack), and a mixed `query-core` breaks `tsc`. When adding a package, keep only that package's `bun.lock` change.
