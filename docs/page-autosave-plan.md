# Page autosave, drafts and publishing plan

Issue #77. The editor saves on its own and the owner can always tell whether what they see is saved and whether it's live. Drafts are stored as checkpoints rather than one row per save. Two editors can't silently overwrite each other, leaving the editor never loses work, and a draft can be discarded back to the published version. Publishing warns about unfilled placeholders first.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-autosave-log.md](page-autosave-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Backend: checkpoint saves, guarded publish, discard | – | done | `feat(backend, web, shared): save page drafts as checkpoints, guard publish and add discard` |
| 2 | Autosave engine (plain module) | – | done | `feat(web): add the page autosave engine` |
| 3 | Autosave in the editor | 1, 2 | done | `feat(web): autosave page edits in the editor` |
| 4 | Conflicts and the leave guard | 3 | todo | |
| 5 | Draft vs published in the editor, and discard | 1, 4 | todo | |
| 6 | Pre-publish checks | 5 | todo | |
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
- Frontend `publishPage(orgId, pageId, { baseVersion })` exists in `lib/page-queries.ts`; there's no `discardDraft` query yet (phase 5).
- The server stores a normalised document (canonical rich-text HTML, NUL stripped, `zones` and `readOnly` dropped); the engine compares against the data it *sent*, never the server's answer.
- Owner-facing version numbers: `PageContentSummary.tsx:65-75`, `PagePublishing.tsx:119`, `_shell.pages.$id.preview.tsx:74-80`.
- Base UI toasts are `role="dialog"`. `modalOpen` in the editor ignores non-modal dialogs, so editor keys keep working while a toast shows. Modal dialogs (confirms) do disable editor keys.
- Unit tests have no DOM. Keep queue, retry and check logic in plain modules.
- The engine (`page-editor/autosave.ts`) compares documents itself with `hasUnsavedChanges`, so pass it every Puck data change. `getState()` returns the same object until the state changes (fit for `useSyncExternalStore`). `failed` carries `attempt` (toast on 1) and `retryAt`. `flush()` resolves with the final state. `reset` ignores the result of an in-flight save but can't cancel it, so a discard right after it can still get a 409. Error classes: log, phase 2.
- e2e: `bun run test:editor` runs against the running stack. The `seed` option picks the org: `pro` and `starter` have no free page slots, `secondPro` has 4. `editor.status` is the header's `role="status"` locator ("Saved", "Saving…" or the error), `editor.open` waits for "Saved", `editor.save()` presses Ctrl+S and waits for "Saved". `pages.create/saved/saveElsewhere` go through the API. A Heading can't be top level; wrap it in `section(...)`.
- After a drag, wait for the canvas to show the drop before Ctrl+S: Puck lands it 250 ms after release (log, phase 3).
- The app runs under StrictMode, so `EditorScreen` creates the engine in an effect and renders the loading skeleton until it exists; a remount (new `key`) makes a fresh engine. `SaveStatus` in `EditorLayout.tsx` resets the engine to Puck's first data, because Puck fills in missing block props (log, phase 3).
- Usability rerun method: `git show c9d93c2^:docs/page-editor-log.md`, lines 304–353 (phase 8): a cold agent with the owner's wording and no UI hints, and task pages seeded by a scratch script through the real API. Task wording: `git show origin/pagebuilder-tryout:docs/puck-usability-tasks.md` (tasks 5 and 6, lines 78–94).

---

## Phase 4: Conflicts and the leave guard

**Goal:** a newer save elsewhere stops autosave and offers mine or theirs, and leaving the editor never drops a save silently.

**Files:**
- `page-editor/autosave.ts`: the `conflict` state, `resolveConflict(newBase)` and `flush()`, which returns the final state.
- `page-editor/EditorLayout.tsx`: `SaveStatus` (status text, Ctrl+S handler) and `useSaveErrorToast`, which toasts once per conflict message; the banner goes under the header. Ctrl+S already does nothing useful during a conflict (`flush` returns at once). `page-editor/save.ts`: the 409 text in `saveErrorMessage`.
- `routes/_shell.pages.$id.edit.tsx`: `PageEditPage` builds the `back` link and keys `EditorScreen` by `page.data.id`; "Load latest" refetches `pageQuery` and remounts with a new `key`. `EditorScreen` owns the engine (`autosave` state); "Keep mine" GETs the page and calls `resolveConflict(latestVersion.version)`. `PageEditor.tsx` passes `autosave` down.
- TanStack Router `useBlocker`: check `shouldBlockFn`, `enableBeforeUnload` and `withResolver` in the installed version through context7 before using them.
- `e2e/editor.e2e.ts`: rewrite the refused-save test ("a save refused for a newer version…", on `pro`, which has no free page slots), and put new tests in the `autosave` describe on `secondPro`. `page.route` can abort the `PUT …/content`.

**Steps:**
- The banner names what happened and offers the two actions from Decisions. "Load latest" confirms first. Ctrl+S does nothing during a conflict.
- In-app navigation flushes a pending save, then navigates. Failed, blocked or conflicted saves show the confirm dialog (Defaults 9). `beforeunload` covers tab close and reload.

**Tests that matter:**
- e2e: tab B saves, then tab A edits and gets the banner. "Keep mine" leaves A's document in the API. "Load latest" shows B's document.
- e2e: Back straight after typing saves the edit, with no prompt.
- e2e: Back with the PUT aborted (`page.route`) shows the prompt; Cancel keeps the edits.

**Done when:**
- Neither of two editors can overwrite the other without a click, and `bun run test:editor` and `bun run verify` pass.

**Verify:** Seed `pro-org` and a page. Open it in two tabs. Edit in tab B and wait for "Saved", then edit in tab A. A shows the banner and stops saving. Press "Keep mine": the API's latest document is A's, and B's save is still its own `page_content` row when B was another member (with the same user it's in place, per Defaults 8). Repeat and press "Load latest": A shows B's text. Type, then press Back at once: no prompt, and the edit is in the DB. Go offline (devtools) or block the PUT, type, press Back: the prompt shows. Nothing is simulated except login and the blocked request.

---

## Phase 5: Draft vs published in the editor, and discard

**Goal:** the editor says whether changes are live, publishes from the header after a flush and links to the live page, and a draft can be discarded back to the published version.

**Files:**
- `page-editor/EditorLayout.tsx`: the header state and the Publish and Discard controls. `routes/_shell.pages.$id.edit.tsx`: page status from `pageQuery`, publish and discard calls, and the remount after discard.
- `lib/page-queries.ts`: `publishPage` (:92, already sends `{ baseVersion }`) and a new `discardDraft` (`POST .../discard`, `{ baseVersion }`). `lib/pages.ts`: `pageState`, `PAGE_STATE_LABELS` (:36–45), `publicPagePath` (:50).
- `components/pages/PagePublishing.tsx`: Discard on the detail page, and the version copy (:119).
- `components/pages/PageContentSummary.tsx:65-75` and `routes/_shell.pages.$id.preview.tsx:74-80`: version numbers become times (Defaults 11).

**Steps:**
- The header shows one of: "Draft, not public", "Live", "Changes not live yet", or "Published, not live" (over the limit, linking to the detail section).
- Publish flushes first. If the flush fails, it doesn't publish and says why. It publishes with the engine's base. After publishing, it toasts and the header links to the live page.
- Discard shows when there are unpublished changes and asks for a confirm (Defaults 7). It resets the engine before calling discard, so no pending autosave lands after it.

**Tests that matter:**
- e2e: publishing straight after an edit publishes that edit (the storefront shows it).
- e2e: discard restores the published content in the editor and the API, and the storefront doesn't change.
- A save still in flight when Discard is pressed can't overwrite the discarded state silently: the order is enforced by the engine, or the discard gets a 409.

**Done when:**
- Owners can see from the editor alone whether their changes are live, and `bun run test:editor` and `bun run verify` pass.

**Verify:** Seed `pro-org` and a published page with a Photos section. Open the editor: "Live". Delete the Photos section: "Changes not live yet", and the storefront still has the photos. Press Back and reopen: the deletion is still there (saved). Press Discard and confirm: Photos is back, the state is "Live", the storefront is unchanged and `published_version_id` points to a new row. Edit the heading and press Publish at once: the storefront shows the new heading and the header links to it. On the detail page, Discard works the same way. Nothing is simulated except login.

---

## Phase 6: Pre-publish checks

**Goal:** publishing warns about empty images and unfilled placeholder text, and can jump to the block.

**Files:**
- New: `page-editor/publish-checks.ts` and `tests/page-editor-publish-checks.test.ts`.
- `Sinwy.Shared/types/page/blocks/fields.ts` (field options) and `blocks.ts`: Heading `text` default (:82), RichText default (:103), Image `src` (:113), Button `label`/`href` (:132–133), Photos' default Images (~:212).
- `Sinwy.Shared/types/page/PageDocument.ts` `blocksIn` (:281), as the slot-walk reference.
- The publish entry points from phase 5 (editor header, `PagePublishing.tsx`). Block names: `blockTitle` and `canvasLabel` in `page-editor/`. Selecting a block: Puck's selection helpers used in `use-block-actions.ts`.

**Steps:**
- Mark placeholder defaults on the field definitions, instead of comparing every default: "Our services" and "Book now" are fine content.
- Checks: an Image block with an empty `src`, a marked field still equal to its default, and a Button with an empty label or link. The Hero background image is optional and isn't flagged.
- The editor dialog lists each issue by block name, with "Show" (select and scroll to it), "Publish anyway" and "Cancel". The detail page lists them without "Show" and links to the editor.

**Tests that matter:**
- Unit: issues inside nested slots (Photos in a Section in Columns), and nothing flagged on a filled page.
- Unit: a rich-text default still counts as unfilled after server normalisation.

**Done when:**
- Publishing a page with the Photos preset untouched warns about two empty images, and `bun run verify` passes.

**Verify:** Seed `pro-org` and a page. Add Photos and a Heading from the drawer without filling them, then press Publish. The dialog lists two empty images and the "Heading" placeholder. "Show" selects the first image. "Publish anyway" publishes. On a filled page, Publish shows no dialog. Nothing is simulated except login.

---

## Phase 7: Usability rerun: tasks 5 and 6 (research)

**Goal:** a cold agent reruns usability tasks 5 and 6 and loses no work, including after leaving the editor (the issue's Done when).

**Files:** Rerun method and task wording: Standing notes. Findings usually land in the files of phases 3–6.

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
