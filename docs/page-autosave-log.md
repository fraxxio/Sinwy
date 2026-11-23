# Page autosave, drafts and publishing log

Finished phases of [page-autosave-plan.md](page-autosave-plan.md), each with its spec and log entry.


## Phase 1: Backend: checkpoint saves, guarded publish, discard

**Goal:** saves write checkpoints, publish refuses a stale base, and a draft can be discarded back to the published content, all under the page lock.

**Files:**
- `Sinwy.Backend/db/schema/pageSchema.ts`: `pageContent` gains `updatedAt`. Write a new migration in `Sinwy.Backend/drizzle/` that backfills it from `created_at`.
- `Sinwy.Backend/modules/pages/repository.ts`: `versionColumns` (:22), `latestVersionOf` (:90), `insertNextVersion` (:159), `publishPage` (:203), and a new `discardDraft`.
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck`, `savePageContent`, `changeStatus`/`publishPage`, `toDetailDto`, and a new `discardDraft`. Add `"not-published"` to `PageError`.
- `Sinwy.Backend/modules/pages/controller.ts`: the error map (~:40–60), the publish handler body, and a new discard handler. `routes.ts`: `POST pages/:pageId/discard` (write).
- `Sinwy.Shared/types/page/Page.ts`: `PageVersionDto` gains `savedAt`. `Sinwy.Shared/types/page/PageSchema.ts`: `savePageContentSchema` (:51); add a `{ baseVersion }` schema for publish and discard. `Sinwy.Shared/types/api/ApiResponse.ts` (:34): add `PAGE_NOT_PUBLISHED`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/page-queries.ts`: `publishPage` (:91) sends `baseVersion`. `components/pages/PagePublishing.tsx` passes `page.latestVersion.version`.
- Tests: `Sinwy.Backend/modules/pages/tests/pages.test.ts` (content :285, conflict :321, publish :676).
- `docs/org-rules-map.md:209-211`: content versioning rules.

**Steps:**
- Read `published_version_id` from the locked page row inside `insertNextVersion`. Update in place only when all three checkpoint conditions hold (Decisions), with the window checked in SQL. In place sets content, `version + 1` and `updated_at`. Otherwise insert. Never touch the pinned row.
- Publish checks `baseVersion` against the latest under the lock before pinning.
- Discard, under the lock: no pin → `not-published`; stale base → `version-conflict`; latest already pinned → return the detail unchanged; otherwise insert a new row and re-pin (Defaults 6). Skip the plan gating check.
- `savedAt` comes from `updated_at`. `createdAt` keeps meaning "checkpoint started".
- Update `org-rules-map.md`: checkpoints, guarded publish, discard.

**Tests that matter:**
- Each checkpoint condition alone forces a new row: pinned latest, another user, and a row older than the window (back-date `created_at` in the test).
- An in-place save still bumps `version`, so a tab holding the old base gets a 409. Two concurrent saves still can't both win.
- The published content served by the public endpoint never changes through saves.
- Discard: the public content is unchanged, `hasUnpublishedChanges` is false, the version is higher than before, the old base gets a 409, and an unpublished page gets 409 `PAGE_NOT_PUBLISHED`. Discard after a downgrade restores a Booking block.
- Publish with a stale base gets a 409 and the pin doesn't move.

**Done when:**
- Several quick saves by one user leave one draft row with a rising version, and the API contract for saves is unchanged.
- `bun run verify` passes.

**Verify:** None (API only; covered by the backend tests).

### Log (2026-11-22, `feat(backend, web, shared): save page drafts as checkpoints, guard publish and add discard`)
- Shipped: `page_content.updated_at` (migration `0034_page_content_updated_at.sql`, backfilled from `created_at`). `insertNextVersion` updates the latest row in place (one `UPDATE … WHERE id, created_by_user_id = user, created_at > now() - make_interval(mins => 10)`; skipped when the latest is pinned) and inserts when nothing was updated. `publishPage` takes `{ baseVersion }` and answers 409 `PAGE_VERSION_CONFLICT` on a stale base. `POST pages/:pageId/discard` (`{ baseVersion }`) copies the pinned content into a new pinned row; `PAGE_NOT_PUBLISHED` (40927). `PageVersionDto.savedAt`. Shared `pageBaseVersionSchema` / `PageBaseVersionInput`; `savePageContentSchema` extends it. The detail page's Publish sends `latestVersion.version`.
- Differs from plan: the version 1 row that page creation writes is a checkpoint too, so the first save by the creator within 10 minutes updates it in place (a fresh page has one row until it's published or another member edits it). Existing tests that counted rows were changed to check version numbers. `changeStatus` was split into `publishPage` and `unpublishPage` because only publish takes a body. Publishing an already-pinned latest still moves `published_at`, as before.
- Checked in the running app: nothing (Verify was None); the migration was applied to the dev database and the backfill checked (`updated_at = created_at` on every row). Backend tests cover the API.

## Phase 2: Autosave engine (plain module)

**Goal:** a DOM-free module owns debouncing, one-save-at-a-time queuing, retries and save state, and is unit-tested with a fake clock.

**Files:**
- New: `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/autosave.ts`, `Sinwy.WebFrontend/src/modules/org-dashboard/tests/page-editor-autosave.test.ts`.
- Read: `page-editor/save.ts` (`hasUnsavedChanges`, `saveErrorMessage`, `SaveResult`), `lib/page-queries.ts` `savePageContent` (:82; its answer's `latestVersion.version` is the next base), and the shared `api()` helper (`grep -rn "export const api"` in `src/shared/`), to see how 5xx surfaces.

**Steps:**
- States: `saved`, `pending`, `saving`, `failed` (retryable, with a next-attempt time), `blocked` (400/402/413, with the message) and `conflict` (409).
- Inputs: `change(data)`, `flush()` (resolves when everything pending is saved or has failed), `retryNow()`, `resolveConflict(newBase)`, `reset(data, base)` and `dispose()`, plus a subscribe/get-state pair for React.
- Only one save is in flight. Changes made during a save run one follow-up save, with the base the first save returned.
- A `blocked` state ends only when the document differs from the one that was refused. `conflict` ends only through `resolveConflict` or `reset`.
- Inject the clock and the save function. The engine knows nothing about Puck or React.

**Tests that matter:**
- Changes made during an in-flight save never start a second concurrent save, and the follow-up uses the new base.
- A 409 never retries. A 402 doesn't retry, and the next real change tries once.
- A network error or 5xx backs off, then success returns to `saved`.
- `flush` waits for the in-flight save and the pending one, and reports a failure.
- The debounce and the maximum wait during continuous changes.

**Done when:**
- The engine's unit tests cover the behaviours above and `bun run verify` passes.

**Verify:** None.


### Log (2026-11-22, `feat(web): add the page autosave engine`)
- Shipped: `createAutosave({ data, base, save, clock? })` in `page-editor/autosave.ts`, with `change`, `flush`, `retryNow`, `resolveConflict`, `reset`, `dispose`, `getState`, `subscribe` and `getBase`. `save(data, base)` returns `{ ok: true, base }` or `{ ok: false, code, message }`; the message is shown as is, so the caller maps it with `saveErrorMessage`. A save that throws counts as a network error. 25 unit tests with a fake clock.
- Differs from plan: added `getBase()` (phase 5 publishes and discards with it). Failures are classified by the HTTP status the app code starts with (4021 is a 402): the version conflict is `conflict`; `0`, 5xx, 408 and 429 retry; everything else, including 401/403/404, is `blocked`. Changes made while `failed` wait for the next retry rather than starting a debounce. `flush()` resolves with the final `AutosaveState`, saves only what changed before the call, and stops after one failed attempt. `reset` ignores the result of a save still in flight; it can't cancel the request. A `blocked` or `failed` document that the user reverts to the saved one goes back to `saved`.
- Checked in the running app: nothing (Verify was None).

## Phase 3: Autosave in the editor

**Goal:** edits save on their own, the header status is trustworthy, Ctrl/⌘+S saves straight away, and the e2e spec runs on autosave.

**Files:**
- `page-editor/autosave.ts` (`createAutosave`, `AutosaveState`, `SaveOutcome`): create it once per `EditorScreen` mount, `dispose` on unmount.
- `page-editor/EditorLayout.tsx`: `SaveControls` (:185–233, holds the `saved`/`dirty` state and the Save button) is replaced by a status driven by the engine's `subscribe`/`getState`; header (:290–319). `usePuck` data feeds `change`.
- `routes/_shell.pages.$id.edit.tsx` (`EditorScreen`, :117–152): `save` becomes the engine's `SaveFn`. It sends `baseVersion: base` from the engine instead of the `latest` ref, maps failures with `saveErrorMessage` and returns `{ ok: true, base: res.data.latestVersion.version }`. `storePage` runs after each success. Keep `latest.current.content` for `saveErrorMessage`'s `saved`.
- `page-editor/PageEditor.tsx` (:41–63): `onSave` gives way to the engine.
- `Sinwy.WebFrontend/e2e/editor-fixtures.ts` (`status`, `open`, `save`) and `e2e/editor.e2e.ts` (the save and status assertions at :56, :81, :94, :107–150, :156–185, :190–208, :242, :258). `e2e/global-setup.ts`: seed a second `pro-org` (Defaults 12).
- `README.md:133-146`: the spec's coverage list.

**Steps:**
- Feed the engine from Puck's data, gated on the dirty flag. The status reads "Saved", "Saving…", "Not saved, retrying" with "Retry now", or the blocked message. It is `aria-live`.
- Ctrl/⌘+S calls `flush`. Remove the Save button and the success toast.
- Leave the 409 message as it is for now; phase 4 replaces it.
- The fixtures wait for "Saved" and read the result through the API. `editor.save()` becomes "press Ctrl+S and wait".

**Tests that matter:**
- e2e: an edit is saved with no click and survives a reload.
- e2e: Ctrl+S straight after typing saves that text.
- The existing spec stays green.

**Done when:**
- `bun run test:editor` passes and `bun run verify` passes.

**Verify:** Seed `pro-org` and create a page with a Heading through the API. Open the editor and change the heading text in three bursts within a minute, without pressing anything. The status goes "Saving…" and then "Saved". In `page_content` the page has one draft row whose version rose with each burst, with the same id. Reload, and the editor shows the last text. Press Ctrl+S straight after typing: one more save, with no toast. Nothing is simulated except login.

### Log (2026-11-22, `feat(web): autosave page edits in the editor`)
- Shipped: `EditorScreen` creates the engine (its `save` sends the engine's base, maps failures with `saveErrorMessage` and calls `storePage` without awaiting it) and passes it through `PageEditor` to `EditorLayout`. `SaveStatus` replaces `SaveControls`: a header `role="status"` reading "Saved", "Saving…" (pending and in flight), "Not saved, retrying" with "Retry now", or the blocked/conflict message in red. Ctrl/⌘+S feeds Puck's current data and calls `flush`. An error toast shows on the first failed attempt and once per distinct blocked/conflict message. The Save button, the success toast and `SaveResult` are gone. e2e: a `seed` option (`pro`, `secondPro`, `starter`) replaces `plan`, global setup seeds a second `pro-org`, `editor.status` is a locator, `editor.save()` presses Ctrl+S and waits for "Saved", and a new test covers autosave, reload and Ctrl+S straight after typing.
- Differs from plan: the app runs under React StrictMode (TanStack Start's default client entry), so an engine made in `useState` and disposed in an effect cleanup was dead after the simulated remount; it's created in an effect and `EditorScreen` shows the loading skeleton until it exists. Puck fills in props a stored block lacks (a Photos block saved with only an `id`), which made opening such a page save on its own; `SaveStatus` now `reset`s the engine to Puck's first data instead of feeding it as a change. The drag test now waits for the canvas to show the move before Ctrl+S, because a drop lands 250 ms after release and a flush before that saved the old order (autosave then saved the move a second later). The intermediate "Unsaved changes" assertions were dropped, since the status now moves on by itself.
- Checked in the running app (subagent, e2e-test): opening sends no PUT; three typing bursts each sent one PUT about 0.92 s after the last key, with "Saving…" then "Saved" and no toast; one `page_content` row kept its id while its version went 3, 4, 5; reload showed the last text; Ctrl+S sent its PUT 2 ms after the last key, exactly one save, no toast. A throwaway spec confirmed opening a page with an incomplete Photos block sends no PUT and an edit then saves once. Not checked: the retrying and error states in the browser, the 10 s cap, and whether Ctrl+S suppresses the browser's own save dialog in headed Chrome.

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

### Log (2026-11-22, `feat(web): pause autosave on conflicts and guard leaving the editor`)
- Shipped: a 409 stops autosave. The header reads "Not saved" and a `role="alert"` banner under the header names what happened and offers "Keep mine" (re-GETs the page and calls `resolveConflict` with its version, no confirm) and "Load latest" (confirm, then `pageQuery` refetch and a remount through a new `opened` key). A leave guard (`useBlocker`) flushes on in-app navigation and browser back, and asks "Leave without saving?" only when the flush ends failed, blocked or conflicted; `beforeunload` fires while anything is unsaved. The 409 text in `saveErrorMessage` now points at the two actions. e2e: the refused-save test now checks the banner, that no PUT goes out after a conflict and that Ctrl+S does nothing; new `autosave` tests cover two tabs (Keep mine, then Load latest), Back straight after typing, and Back with the PUT aborted (prompt, Cancel, then Retry now saves).
- Differs from plan: the save UI moved from `EditorLayout.tsx` into a new `SaveControls.tsx`, which would otherwise have passed 500 lines. A conflict no longer toasts, because the banner says it and stays up. The engine needed no change, since `conflict`, `resolveConflict` and `flush` came in phase 2. Toasts covered the header's "Retry now" button in the editor, so they now open below the header (`--toast-top`). The `e2e-test` app map still described manual Save and was updated.
- Checked in the running app (subagent, e2e-test, with a real second member as admin): B's save was its own `page_content` row. A got a 409, the banner and "Not saved", and sent no more PUTs on typing or Ctrl+S. "Keep mine" added A's row and left B's alone, and the API's latest was A's. "Load latest" confirmed, then showed B's text. Back straight after typing left with no prompt and the edit was in the DB. Offline and with the PUT aborted, Back showed the prompt; Cancel stayed and "Retry now" saved; "Leave without saving" left and nothing was saved. Browser back got the in-app prompt, or the native one when it left the app's history. A conflict on Back got its own prompt text. With the same user in two tabs, "Keep mine" updated the checkpoint in place (Defaults 8). Not checked: the native prompt on closing or reloading the tab. Cosmetic, left for phase 7: the "Not saved" toast and the leave prompt show together and say the same thing, and during browser back the address bar shows the detail URL until Cancel.

## Phase 5: Draft vs published in the editor, and discard

**Goal:** the editor says whether changes are live, publishes from the header after a flush and links to the live page, and a draft can be discarded back to the published version.

**Files:**
- `page-editor/EditorLayout.tsx`: the header (title, path, viewport switch, history, `SaveStatus`); add the page state and the Publish and Discard controls here, with their props drilled like `conflict`. `page-editor/SaveControls.tsx`: `useAutosaveState` (not exported yet) for reading the engine state in new controls.
- `routes/_shell.pages.$id.edit.tsx`: `EditorScreen` has the page (`page.status`, `publishedVersion` via `PageDetailDto`), the engine and `latest`. Publish: `autosave.flush()`, then `publishPage(..., { baseVersion: autosave.getBase() })` and `storePage`. Discard: `autosave.reset(...)` first, then the call, then `storePage` and the remount through `PageEditPage`'s `opened` counter (generalise `loadLatest` into a remount callback).
- `lib/page-queries.ts`: `publishPage` (:92, already sends `{ baseVersion }`) and a new `discardDraft` (`POST .../discard`, `{ baseVersion }`). `lib/pages.ts`: `pageState`, `PAGE_STATE_LABELS` (:36–45), `publicPagePath` (:50).
- `components/pages/PagePublishing.tsx`: Discard on the detail page, and the version copy (:119).
- `components/pages/PageContentSummary.tsx:65-75` and `routes/_shell.pages.$id.preview.tsx:74-80`: version numbers become times (Defaults 11).
- `e2e/global-setup.ts` and `e2e/stack.ts`: seed another `pro-org` for the new tests (no free slots left). `e2e/editor.e2e.ts`: reuse `welcome()`, `titleSaved`, `editTitle`.

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

### Log (2026-11-22, `feat(web): show whether page changes are live, and publish and discard from the editor`)
- Shipped: a page-state badge next to the editor's title ("Draft, not public", "Live", "Changes not live yet", or "Published, not live", which links to the detail page's `#publishing`). The page counts as changed while autosave isn't "saved", so the badge moves as soon as the owner types. When the page is live, the path under the title links to it. The header has "Discard changes" (only when published and changed; confirm says undo history goes) and "Publish" / "Publish changes" (`PublishActions` in the new `page-editor/PublishControls.tsx`). The ordering lives in the plain `page-editor/publishing.ts`: `publishAfterSave` flushes, refuses with `unsavedReason` when the flush didn't save, publishes with `getBase()`, and publishes once more when a 409 comes back and the engine's own base moved meanwhile (its own save landed first). `discardAfterSave` flushes, then discards with `getBase()`. In `EditorScreen` a discard success calls `storePage` and remounts. A discard 409 (version conflict or not published) toasts and remounts on refetched data. `PageEditPage`'s `loadLatest` became `reopen({ refetch })`. On the detail page, "Discard changes" with a confirm sits next to "Publish changes". Owner-facing version numbers are gone: the detail page says "Published 3 days ago.", the content summary says "N blocks" and its "Last saved" uses `savedAt`, and the preview says "saved … ago". Unit: `page-editor-publishing.test.ts` (in-flight save before publish and before discard, a failed save blocks publish, own-save retry, someone else's 409, discard of a plan-blocked draft) and `editorPageState` in `pages.test.ts`. e2e, `publishing` on a new `thirdPro` org: Publish straight after typing reaches the storefront and the header link, editor Discard restores the content and keeps the storefront unchanged with a newer `publishedVersion`, and detail-page Discard works.
- Differs from plan: discard flushes instead of calling `reset` first. Once the flush is done none of this editor's saves is pending or in flight, so a reset would add nothing. Flushing also prevents the self-inflicted 409 that reset-then-discard got when a save was in flight. When the flush can't save (failed or conflict), the engine keeps its state, and the server's base check makes whichever of a retry and the discard lands second a 409. A plan-blocked draft still discards, which is the way out of it. The confirm dialog stays open while discarding, so the owner can't edit meanwhile. `leaveReason` moved out of `SaveControls.tsx` into `publishing.ts` as `unsavedReason`, so the publish refusal and the leave prompt say the same thing. The detail page's existing labels (`PAGE_STATE_LABELS`) stay. The editor has its own (`EDITOR_PAGE_STATE_LABELS`, `editorPageState`).
- Checked in the running app (subagent, e2e-test, pro-org with a published Photos page): "Live" on open. Deleting Photos gave "Changes not live yet", a new row, an unchanged pin, and a storefront that still had the photos (public API and SSR). Back and reopen kept the deletion. Editor Discard brought Photos back and showed "Live", with a new row pinned and the storefront unchanged. Editing the heading and pressing Publish 50 ms later published it (DB and storefront), and the header path link opened the live page. Detail-page Discard made a new pinned row and kept the storefront unchanged. No console errors. Not checked: server logs (started outside this session), and a publish 409 caused by another editor in the running app (unit-tested only).

## Phase 6: Pre-publish checks

**Goal:** publishing warns about empty images and unfilled placeholder text, and can jump to the block.

**Files:**
- New: `page-editor/publish-checks.ts` and `tests/page-editor-publish-checks.test.ts`.
- `Sinwy.Shared/types/page/blocks/fields.ts` (field options) and `blocks.ts`: Heading `text` default (:82), RichText default (:103), Image `src` (:113), Button `label`/`href` (:132–133), Photos' default Images (~:212).
- `Sinwy.Shared/types/page/PageDocument.ts` `blocksIn` (:281), as the slot-walk reference.
- Editor entry point: `PublishActions` in `page-editor/PublishControls.tsx`. Run the checks on `getPuck().appState.data` in its `run("publish", …)` before calling `publish`, and put the dialog there (it's inside Puck, so "Show" can select). Detail page: `PagePublishing.tsx`, the Switch's `publish` and the "Publish changes" `update` both go through `write.mutate`; check `page.latestVersion.content` first.
- Block names: `blockTitle` and `canvasLabel` in `page-editor/`. Selecting a block: Puck's selection helpers used in `use-block-actions.ts`.
- e2e: the `publishing` describe in `e2e/editor.e2e.ts` (`thirdPro`, 2 free page slots); existing publish tests use filled Headings, so they shouldn't hit the dialog.

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

### Log (2026-11-22, `feat(web, shared): warn about unfilled blocks before publishing a page`)
- Shipped: field definitions take `placeholder` (the default is sample text) and `required` (warn while empty) flags. Heading `text` and Text `content` are placeholders. Image `src` and Button `label`/`href` are required. Hero's background, Services and Booking text, and "Book now" aren't flagged. `publishIssues` (`page-editor/publish-checks.ts`) walks every shown slot in reading order and treats a missing prop as its default. It compares rich text after `normalizeRichText` on both sides, so server-normalised sample text still counts. Problems read "Has no photo", "Has no label", "Has no link" and "Still has its sample text". `PublishIssuesDialog.tsx` lists them ("Something looks unfilled" / "Some things look unfilled") with Cancel and "Publish anyway", and it never blocks. In the editor, `PublishActions` checks Puck's current data before both Publish and Publish changes, and each row's "Show" closes the dialog, selects the block and scrolls to it (new `show(id)` in `use-block-actions.ts`). On the detail page, the Published switch and "Publish changes" check `page.latestVersion.content`, and the dialog has an "Open the editor" link instead of "Show". Unit: `page-editor-publish-checks.test.ts` covers nested slots with hidden columns skipped, the names, a filled page, normalised rich text and missing props. A `blockTitle` case was added to `page-editor-actions.test.ts`. e2e, `publishing`: the editor dialog lists the sample Heading and both Photos images, Cancel is focused, Show selects the first image, and Publish anyway publishes. Then the detail page's Publish changes shows the dialog without Show, with the link, and publishes.
- Differs from plan: rows aren't named with `canvasLabel`. A sample Heading made its Section "Heading in Heading", and Photos' two images were both plain "Image". So `blockTitle` now skips a Heading still on its sample text, which also affects the canvas labels. The issue names add the parent and, among same-type siblings, a position ("Image 2 in Photos"). Required fields are marked with a flag like placeholders, instead of the Image and Button rules being hard-coded. Columns' hidden columns aren't checked, because the storefront doesn't render them. The dialog focuses Cancel first, so Enter doesn't jump to an issue or publish. An e2e first attempt clicked the editor's own "Publish changes" while Back was still flushing (standing note).
- Checked in the running app (subagent, e2e-test, pro-org): Photos and a Heading added from the drawer. Publish listed two empty images and the sample Heading. Show selected the first image (settings heading "Image"). Publish anyway published, and `published_version_id` was the latest row. The detail-page switch showed the dialog without Show and with a working editor link, and Cancel left the page a draft. A filled page published with no dialog, both first time and as Publish changes. A Text left on its sample got the singular dialog. A default Button wasn't flagged. No console errors. Fixed after that run: identical "Image" rows, an "Open the editor" link that only underlined on hover, and first focus on the first Show. The fixes were rechecked by e2e only. Left alone, as outside this phase: an a11y gap where the rich-text field has no accessible name and each drawer card's "Add" button is announced twice (Puck's drag copy).

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

### Log (2026-11-23, `fix(backend): don't report unpublished changes when the draft matches what's live`)
- Shipped: `hasUnpublishedChanges` is false when the latest row's content equals the pinned row's (`findPinnedVersion` in `repository.ts` compares the `jsonb` in SQL), so an undo back to what's live shows "Live" again in the editor and on the detail page, without a save. Backend test "a draft saved back to the published content has no unpublished changes". The e2e Discard test now edits, waits for the save, undoes, and expects "Live"; it failed on the old server and passes on the new one.
- Scores (cold agent, owner wording, no UI hints; `pro-org` `seed-b73a28ad`, page "Home" planted by a scratch script through the API, since deleted):

  | Task | Run 1 | Rerun | Dead end |
  | --- | --- | --- | --- |
  | 5, fix "stylign" so customers see it | 4 | – | none: text in the side panel, Publish changes, storefront showed "styling" |
  | 6, photos back in the session | 4 | 4 | "Changes not live yet" stayed after Undo (fixed here; the rerun still ran on the old backend) |
  | 6, photos back after saving and leaving | 3 | 3 | Undo is empty after reopening (by design); both runs found Discard, whose dialog they understood |

  The second task 6 score misses the plan's 4. Accepted by the product owner: the real fix is a feature (restore an earlier version), not a tweak.
- No edit was lost in any run. `page_content` matched each step: the typo fix made a new row (v3) because v2 was pinned, and Publish pinned it. The first delete started a checkpoint that Undo and the second delete updated in place (v4 → v6). Discard inserted v7 with v3's content and pinned it. The rerun repeated this (v10 checkpoint, v11 pinned copy).
- Filed: #84 safe delete (confirm or a "Deleted · Undo" toast), #85 unpublished changes on the detail page and in the list (the "Published" badge read as "all fine").
- Not fixed (small or not reproduced): Undo once seemed to enable after only selecting a block. Not reproduced on a fresh open (Text, Heading, photo and its parent), and our e2e checks it for Heading. After Undo, the selection jumps to the block Puck had selected in that history entry (Puck). dnd-kit announces "Draggable item RichText-… was dropped" after a double-click (already logged in the page-editor plan). The "Changes published" toast covers the settings' Move buttons for a few seconds. Text edits only in the side panel, not inline on the canvas. Layers names sections "Section" (#82). "Edit content" and "Back" are buttons, not links.
- Differs from plan: both tasks ran on one "Home" page (Hero with the typo, a "Inside the salon" Section with Photos, a "Find us" Section), in one agent, task 6 then rerun alone after the fix. The backend runs without watch, so the rerun agent and the first e2e attempt used the old code; the first e2e version also undid inside the 1 s autosave delay and never reached the server (standing note).
- Checked in the running app: the storefront showed "styling" and the photos after Discard, and `published_version_id` was the discard's new row. No console errors, no new backend or web log warnings. Not checked by a cold agent: the fixed badge (e2e only).

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

### Log (2026-11-23, `fix(backend, web): answer a page save with the version it wrote, and refetch a page whose publish was refused`)
- Reviewed `e852ca1^..HEAD` (the plan's `e10b275^` missed phase 1, which is `e852ca1`).
- Fixed, a save answering with someone else's version: `savePageContent` committed, then read the answer with `getPage`. A save from another tab landing in between put that tab's version in this tab's answer; the engine takes its next base from it, so this tab's next save overwrote the other tab's edits with no 409, and Publish could pin content nobody here had seen. `insertNextVersion` now returns the page row and the version it wrote (from inside the transaction), and `toDetailDto` takes it; `findPinnedVersion` compares the pinned content against that version by id. Test: `content: a save answers with the version it wrote, not the one a queued save writes next` (two saves queued behind a held page lock). It passes on the old code too: through HTTP the first save's read always beat the queued save, so it documents the contract rather than reproducing the race.
- Fixed, a detail-page publish or discard that kept failing: on 409 (`PAGE_VERSION_CONFLICT` or `PAGE_NOT_PUBLISHED`) `PagePublishing.tsx` kept the stale `latestVersion`, so every retry 409'd until something refetched. It now refetches the page and says "This page changed somewhere else. It now shows the latest version; check it and try again." The next click publishes the version now shown. e2e: `Publish on the detail page after a save elsewhere refuses once, then publishes the newer draft`.
- Fixed, a latent edit loss: the engine's `reset(data, base)` marked everything saved and ignored an in-flight save; its only caller was `SaveStatus` on mount, so a remount after edits would have taken them as saved. Replaced by `opened(data)`, which takes Puck's filled-in first data as saved only before any change and is an ordinary `change` afterwards. Unit tests for both cases.
- Checked, no change: the pinned row is never updated in place (save checks `publishedVersionId` under the lock); discard flushes first and writes with the engine's base, so a later own save 409s instead of landing on the restored content; a conflict pauses autosave and every leave path (Back, `beforeunload`) asks; permanent errors (4xx other than 408, 429 and the version conflict) are "blocked" and never retried; publish retries once only when this editor's own save moved the version.
- Filed, not fixed: after Unpublish the version that was pinned is an ordinary checkpoint, so its author's next save within 10 minutes updates it in place and the content that was live leaves the history. It follows Decision 1 (only the published row is protected) and there's no history UI; raise it if version history ships.
- Docs: `org-rules-map.md` (unpublished changes by content, unpublish frees the pinned version), README's Page editor spec (three `pro-org`s; conflicts, leave guard, publish and discard, pre-publish checks). Plan shrunk: all phases are in this log.
- Cleanup: stopped the backend, web app and database (`bun run db:down`, volume kept); deleted `/tmp/sinwy-p7/` and the `.playwright-cli/` page and console files. `.playwright-cli/auth/` and `editor-e2e/` stay (the spec's logins and results). Seed org `seed-b73a28ad` stays in the database.
- Differs from plan: the e2e spec's `thirdPro` org now has no free page slot; a new publishing test needs another seeded org in `e2e/global-setup.ts`.
- Checked in the running app: `bun run test:editor` 15 passed on the restarted backend, before the database was stopped. `bun run verify` exit 0 (1047 server, 356 web, 19 script tests).
