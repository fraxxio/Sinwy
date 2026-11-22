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
