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
