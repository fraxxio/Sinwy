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
| 7 | Usability rerun: tasks 5 and 6 (research) | 6 | todo | |
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
- `hasUnpublishedChanges` (`service.ts` `toDetailDto`) compares the pinned row's version with the latest; the pinned row is never edited in place, so it stays correct.
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
- Seeding for agent runs: `bun run dev:seed-scenario pro-org`, then `dev:login-as --state` (the e2e-test skill). Its orgs are also named `seed-*`.
- Usability rerun method: `git show c9d93c2^:docs/page-editor-log.md`, lines 304–353 (phase 8): a cold agent with the owner's wording and no UI hints, and task pages seeded by a scratch script through the real API. Task wording: `git show origin/pagebuilder-tryout:docs/puck-usability-tasks.md` (tasks 5 and 6, lines 78–94).

---

## Phase 7: Usability rerun: tasks 5 and 6 (research)

**Goal:** a cold agent reruns usability tasks 5 and 6 and loses no work, including after leaving the editor (the issue's Done when).

**Files:**
- Rerun method, task wording and seeding: Standing notes. Plant the "stylign" page with a scratch script that creates, saves and publishes it through the API (`POST .../pages`, save, `publish` with `{ baseVersion }`), and delete the script afterwards.
- Where findings usually land: `page-editor/SaveControls.tsx` (save status, conflict banner, leave prompt), `page-editor/PublishControls.tsx` (state badge, Publish, Discard), `page-editor/PublishIssuesDialog.tsx` and `publish-checks.ts` (the pre-publish warning; a sample-text Hero won't trigger it), `components/pages/PagePublishing.tsx` (detail-page Discard and Publish changes), and the labels in `lib/pages.ts`.
- Any fix that changes the editor's copy: the matching assertions in `e2e/editor.e2e.ts`.

**Steps:**
- Run the tasks with the `e2e-test` skill, in the owner's words and with no UI hints. Seed the task pages with a scratch script through the real API. Before task 5, plant the "stylign" typo in the welcome banner and publish.
- Task 6 includes "…and what if I'd already saved and closed the editor?": the agent should find Discard.
- Record steps, ease (1–5) and dead ends. Fix small findings here. Ask before filing larger ones as issues.

**Tests that matter:**
- Any fix keeps `bun run test:editor` green.

**Done when:**
- Both tasks score 4 or 5, and no edit is lost in either.

**Verify:** Task 5: seed `pro-org` with a published Hero whose text has "stylign", and ask the agent to fix it so customers see the right word. The storefront shows "styling" and the edit was never lost. Task 6: a published page with a Photos section. "I deleted the photos part by accident. Get it back": Undo in the session, then delete, leave and reopen, and Discard. The `page_content` rows and `published_version_id` match what the agent did. Nothing is simulated except login.

---

## Phase 8: Code review, docs and cleanup

**Goal:** the checkpoint overwrite, discard and conflict paths are reviewed for data loss, and the docs describe what shipped.

**Files:** Every file changed in phases 1–7. `docs/org-rules-map.md` (content versioning), `README.md` (Page editor spec), and this plan and its log.

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
