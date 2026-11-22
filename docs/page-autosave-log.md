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
