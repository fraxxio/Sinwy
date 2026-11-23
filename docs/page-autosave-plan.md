# Page autosave, drafts and publishing plan

Issue #77. The editor saves on its own and the owner can always tell whether what they see is saved and whether it's live. Drafts are stored as checkpoints rather than one row per save. Two editors can't silently overwrite each other, leaving the editor never loses work, and a draft can be discarded back to the published version. Publishing warns about unfilled placeholders first.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-autosave-log.md](page-autosave-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Backend: checkpoint saves, guarded publish, discard | – | done | `feat(backend, web, shared): save page drafts as checkpoints, guard publish and add discard` |
| 2 | Autosave engine (plain module) | – | done | `feat(web): add the page autosave engine` |
| 3 | Autosave in the editor | 1, 2 | done | `feat(web): autosave page edits in the editor` |
| 4 | Conflicts and the leave guard | 3 | done | `feat(web): pause autosave on conflicts and guard leaving the editor` |
| 5 | Draft vs published in the editor, and discard | 1, 4 | done | `feat(web): show whether page changes are live, and publish and discard from the editor` |
| 6 | Pre-publish checks | 5 | done | `feat(web, shared): warn about unfilled blocks before publishing a page` |
| 7 | Usability rerun: tasks 5 and 6 (research) | 6 | done | `fix(backend): don't report unpublished changes when the draft matches what's live` |
| 8 | Code review, docs and cleanup | 7 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Drafts are checkpoints.** A save updates the latest `page_content` row in place, bumping its `version`, when that row is not the published one, was created by the same user, and was created less than 10 minutes ago. Otherwise the save inserts a new row. Every save still bumps `version`, so the `baseVersion` conflict check and the API stay as they are. Version numbers skip.
- **A conflict asks: mine or theirs.** On a 409 autosave pauses and a banner offers "Load latest", which drops the edits made here after a confirm, and "Keep mine", which saves this document over the newer one on purpose. Nothing is overwritten without a click.

### Defaults (not yet confirmed; change only if asked)

1. The checkpoint window is 10 minutes, compared in SQL (`created_at > now() - interval`), so app and DB clocks can't disagree.
2. Autosave waits 1 s after the last change (Puck records history after 250 ms) and at most 10 s during continuous typing. Network errors and 5xx retry after 1, 2, 5, 10 and 30 s, then every 30 s, with a "Retry now" button.
3. The Save button goes; Ctrl/⌘+S saves straight away. There's no success toast, and the error toast shows once when a save first fails, not on every retry.
4. Publish is also in the editor header. Unpublish stays on the page detail screen.
5. Publish takes `{ baseVersion }` and answers 409 if it isn't the latest, so nobody publishes content they haven't seen.
6. Discard (`POST .../discard`, `{ baseVersion }`) always inserts a new row holding the pinned content and re-pins `published_version_id` to it, leaving `published_at` alone. The discarded draft stays as a history row and versions never go backwards. A never-published page has nothing to discard (409 `PAGE_NOT_PUBLISHED`). Restoring blocks the plan no longer covers is allowed. No activity entry is recorded.
7. Discard remounts the editor with the published content, which clears undo history; the confirm dialog says so. It's offered in the editor and on the detail page.
8. "Keep mine" between two tabs of the same user can land in place within the window, overwriting the other tab's checkpoint. That's accepted because the user chose it.
9. Leaving the editor in-app while a save is pending flushes it, then navigates. A failed, blocked or conflicted save asks "Leave without saving?". Closing or reloading the tab with anything unsaved triggers `beforeunload`. No `keepalive` fetch: its 64 KB cap is below the 256 KB document limit.
10. Pre-publish checks warn and never block ("Publish anyway"). Template instruction text is left until templates exist; the placeholder marker from phase 6 is what they'll use.
11. Owner-facing copy stops showing version numbers, because they skip. It shows times instead ("Saved 2 minutes ago", "Published 3 days ago").
12. New e2e tests run against a second seeded `pro-org`, because the spec already uses all 5 Professional pages and the 1 Starter page.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- Save, publish and discard all run under the page row lock (`lockPage` in `Sinwy.Backend/modules/pages/repository.ts`). Publish and discard take `{ baseVersion }` and answer 409 `PAGE_VERSION_CONFLICT` when it isn't the latest; discard on an unpublished page answers 409 `PAGE_NOT_PUBLISHED`. Every successful save and every discard that changes something raises `latestVersion.version`; take the new base from the answer.
- A fresh page's version 1 row is a checkpoint: the creator's first save within 10 minutes updates it in place. `latestVersion.savedAt` is the last save time, `createdAt` the checkpoint start. Use `savedAt` for "Saved … ago".
- `hasUnpublishedChanges` (`service.ts` `toDetailDto`) is true only when the latest row's content differs from the pinned row's (`findPinnedVersion`, a `jsonb` comparison in SQL); the pinned row is never edited in place. A draft undone back to what's live reads as no changes, though its version is higher (log, phase 7).
- Publish and discard in the editor go through `page-editor/publishing.ts` (`publishAfterSave`, `discardAfterSave`: flush first, then write with `getBase()`), called from `EditorScreen`'s `publish`/`discard`. The header buttons are `PublishActions` in `page-editor/PublishControls.tsx`, which passes Puck's current data. The detail page publishes from `PagePublishing.tsx`'s `write` mutation (`publish`/`update`), using `page.latestVersion.version` (log, phase 5).
- The server stores a normalised document (canonical rich-text HTML, NUL stripped, `zones` and `readOnly` dropped); the engine compares against the data it *sent*, never the server's answer.
- Base UI toasts are `role="dialog"`. `modalOpen` in the editor ignores non-modal dialogs, so editor keys keep working while a toast shows. Modal dialogs (confirms) do disable editor keys.
- Unit tests have no DOM. Keep queue, retry and check logic in plain modules.
- The engine (`page-editor/autosave.ts`) compares documents itself with `hasUnsavedChanges`, so pass it every Puck data change. `getState()` returns the same object until the state changes (fit for `useSyncExternalStore`). `failed` carries `attempt` (toast on 1) and `retryAt`. `flush()` resolves with the final state. `reset` ignores the result of an in-flight save but can't cancel it, so a discard right after it can still get a 409. Error classes: log, phase 2.
- e2e: `bun run test:editor` runs against the running stack. The `seed` option picks the org: `pro`, `starter` and `secondPro` have no free page slots; `thirdPro` (the `publishing` describe) has 1 left, and a further org goes in `e2e/global-setup.ts`. `editor.status` is the header's `role="status"` locator ("Saved", "Saving…", "Not saved" or the error), `editor.open` waits for "Saved", `editor.save()` presses Ctrl+S and waits for "Saved", `editor.back` is the header's Back (a button, not a link), and `editor.page` is the tab. `editorFor(page, org)` drives a second tab. `editor.pageState` is the header's state badge. `pages.create/saved/saveElsewhere/publish/detail` go through the API, and `storefront()` in the `publishing` describe reads the live page's first heading. In `editor.e2e.ts`, `welcome()`, `titleSaved`, `editTitle` and `conflictBanner` are shared helpers. A Heading can't be top level; wrap it in `section(...)`.
- After a drag, wait for the canvas to show the drop before Ctrl+S: Puck lands it 250 ms after release (log, phase 3).
- Save UI lives in `page-editor/SaveControls.tsx`: `SaveStatus`, `ConflictBanner` and `LeaveGuard`. `LeaveGuard` uses `useBlocker` with an async `shouldBlockFn` (feeds Puck's data, awaits `flush()`, blocks unless "saved"), `enableBeforeUnload` as a function, and `withResolver` for its dialog. Any in-app navigation goes through it; actions that don't navigate don't. `ConflictActions` and `Publishing` (page, `publish`, `discard`) go from `EditorScreen` through `PageEditor` to `EditorLayout` (log, phases 4 and 5).
- `PageEditPage` keys `EditorScreen` by `` `${id}:${opened}` ``; `reopen({ refetch })` bumps `opened`, refetching `pageQuery` first when asked, so a remount on fresh server data is one call. `EditorScreen` keeps `latest` (a ref to the last saved `latestVersion`, used for 402 messages); update it after any write.
- In the editor, toasts open below the header (`--toast-top`, set by `:root:has([data-slot="page-editor"])` in `styles.css`), so they don't cover the save status.
- The app runs under StrictMode, so `EditorScreen` creates the engine in an effect and renders the loading skeleton until it exists; a remount (new `key`) makes a fresh engine. `SaveStatus` in `EditorLayout.tsx` resets the engine to Puck's first data, because Puck fills in missing block props (log, phase 3).
- Pre-publish checks: `publishIssues` in `page-editor/publish-checks.ts` reads the `placeholder` and `required` flags on field definitions (`Sinwy.Shared/types/page/blocks/fields.ts`), skips Columns' hidden columns, and names rows like "Image 2 in Photos". The dialog is `PublishIssuesDialog.tsx` (Cancel gets first focus), used by `PublishActions` (with "Show", which calls `blockActions().show(id)`) and `PagePublishing.tsx` (with an "Open the editor" link). `blockTitle` ignores a Heading still on its sample text (log, phase 6).
- e2e: after `editor.back`, wait for the detail page (e.g. the "Publishing" heading) before clicking a button both screens have, such as "Publish changes"; the editor stays rendered until the flush finishes (log, phase 6).
- `bun run start:server` has no watch mode: restart the backend after a backend change before `test:editor` or a browser check. An e2e edit undone within the 1 s autosave delay never reaches the server; wait for the save (e.g. `expect.poll` on `titleSaved`) to test a server path (log, phase 7).
- Running from phase 7: database, backend (`bun run start:server`, log `/tmp/sinwy-p7/server.log`) and web app (`bun run start:web`, log `/tmp/sinwy-p7/web.log`), started by the agent; stop them in phase 8. Seeded org `seed-b73a28ad` (page "Home") can stay.

---

## Phase 8: Code review, docs and cleanup

**Goal:** the checkpoint overwrite, discard and conflict paths are reviewed for data loss, and the docs describe what shipped.

**Files:**
- Review: the diff of phases 1–7 (`git diff e10b275^..HEAD`). Backend: `Sinwy.Backend/modules/pages/repository.ts` (`insertNextVersion` checkpoint update, `publishPage`, `discardDraft`, `findPinnedVersion`) and `service.ts`. Web, in `src/modules/org-dashboard/components/page-editor/`: `autosave.ts` (queue, retry, `reset`), `publishing.ts` (flush then write), `SaveControls.tsx` (`LeaveGuard`, `ConflictBanner`), `PublishControls.tsx`, and `routes/_shell.pages.$id.edit.tsx` (`EditorScreen`, `latest`, `storePage`); `components/pages/PagePublishing.tsx`.
- Tests: `Sinwy.Backend/modules/pages/tests/pages.test.ts`, the web unit tests for the engine and publish checks, `Sinwy.WebFrontend/e2e/editor.e2e.ts`.
- Docs: `docs/org-rules-map.md` (content versioning: checkpoints, discard, `hasUnpublishedChanges` by content), `README.md` (Page editor spec), this plan and its log.
- Cleanup: the servers in the standing notes, `/tmp/sinwy-p7/`, `.playwright-cli/` page and console files.

**Steps:**
- Review for data loss and races: in-place updates of a pinned row, the order of discard and autosave, conflicts that never surface, leaving with a save in flight, and retries of permanent errors.
- Fix what the review finds and record each finding in the log.
- Update the docs. Move the finished phases to the log and shrink this plan.
- Stop every dev server started during the plan's work, unless the user asked to keep it running. Delete scratch scripts, screenshots, console logs and seed data that are no longer needed.

**Tests that matter:**
- Every fix comes with a test of the path it fixes.

**Done when:**
- The review findings are fixed or filed, and `bun run verify` and `bun run test:editor` pass.

**Verify:** None.
