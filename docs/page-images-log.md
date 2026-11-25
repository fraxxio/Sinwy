# Page images log

Finished phases of the [page images plan](page-images-plan.md), each with its spec and log entry.

## Phase 1: Upload endpoint, tracking table and plan quota

**Goal:** an editor of the organization can upload a page image, which is stored under `pages/<orgId>/`, tracked in a table, counted against the plan's quota, and answered with its `fileUrl`.

**Files:**
- `Sinwy.Shared/types/plan/PlanLimits.ts` (`PlanLimits`, `PLAN_LIMITS`, `NO_PLAN_LIMITS`); `Sinwy.Shared/types/api/ImageUpload.ts` (add the response DTO and its schema here or beside the page types).
- `Sinwy.Backend/db/schema/pageSchema.ts` (new `pageImage` table); migration via `bun run db:generate`.
- `Sinwy.Backend/modules/pages/{repository,service,controller,routes,index}.ts`.
- `Sinwy.Backend/lib/image.ts`, `infrastructure/storage/*`.
- `Sinwy.Backend/modules/pages/tests/` (new `pageImages.test.ts`).
- `docs/org-rules-map.md`, Pages section (~L199).

**Steps:**
- Add `pageImageBytes` to `PlanLimits` with the Default 1 numbers.
- Add a `page_image` table: id, organization_id (FK, cascade), unique `key`, `bytes`, `created_at`, indexed on (organization_id, created_at). It is internal; the API returns only the DTO.
- Service `uploadPageImage(membership, file)`: `validateImage`, then within one transaction under `lockOrganization`, sum the org's bytes and refuse with `quota-exceeded` when used + new > limit. Then `storageClient.put` and insert the row. If the insert fails after the put, delete the file. Store the file before inserting the row, so a crash leaves a stray file but never a row without a file.
- Response `{ src: fileUrl(key), usage: { used, limit } }`. Quota refusal is a 4xx with a message that names the limit and says removed photos free space within a day.
- Route `POST organizationPath("page-images")`, `pages:write`, using `readImageUpload` and `respondImageError` like the logo handler.
- Update `docs/org-rules-map.md`: quota per plan, what counts, downgrade behaviour.

**Tests that matter:**
- A second upload that would cross the quota is refused, and two concurrent uploads near the limit can't both pass (the lock).
- Staff (read-only pages) and members of another org are refused. A no-plan org is refused.
- Non-image bytes, a wrong type and an oversize file are refused before anything is written; nothing is left in storage or the table.
- The returned `src` passes `isSafeImageSrc` and `keyFromFileUrl` maps it back to a `pages/<orgId>/` key.

**Done when:**
- `curl`-style upload as the owner returns a URL that serves the image, and a row exists with the right byte count.

**Verify:** Seed `pro-org`. As the owner, POST a small PNG to `/api/organizations/<id>/page-images` and GET the returned URL: 200 and the same bytes. `page_image` has one row with the key under `pages/<orgId>/`. As a staff member, the POST returns 403. With the quota temporarily lowered in a test org (or by inserting rows totalling the limit through `sinwy_rw`), the POST is refused with the quota message. Nothing is simulated except login.

### Log (2026-11-24, `feat(backend, shared): upload page images within a per-plan storage quota`)
- Shipped: `pageImageBytes` in `PLAN_LIMITS` (100 MB / 500 MB / 2 GB, none without a plan), the `page_image` table (migration `0035_page_image`), `uploadPageImage` with the quota summed and the row inserted under the organization lock, the file stored before the row and deleted if the insert or commit fails, and `POST organizationPath("page-images")` with `pages:write`. The `PageImageDto` is `{ src, usage }`, with a new error code `PAGE_IMAGE_QUOTA_EXCEEDED`. The Pages section of `org-rules-map.md` now covers the quota. Tests: `pageImages.test.ts` (8 tests) and the pinned limits in `planFeatures.test.ts`.
- Differs from plan: the DTO is a plain type in `types/page/Page.ts` (response DTOs there have no schemas). An inactive or no-plan organization is refused as `ORGANIZATION_INACTIVE` (409), like page creation, not by the quota. A member of another organization gets 404 from the membership middleware, not 403. Upload answers 201.
- Checked in the running app: in pro-org, the owner's upload returned 201 and served the same 96 bytes (sha256 match), with one `page_image` row under `pages/<orgId>/`. Staff of a Starter org got 403, a non-member 404 and no session 401. A filler row at the 500 MB limit gave 409 with code 40928 and the quota message, writing no row or file. The server log was clean. Not checked: the no-plan path (tests cover it), and `src` fetched through the web app's origin, because the web app wasn't running.

## Phase 2: Orphan sweep and org purge

**Goal:** files that no saved version of any page in the org uses are deleted after 24 h, and purging an organization deletes all its page images.

**Files:**
- `Sinwy.Backend/infrastructure/storage/{storageClientTypes,localStorageClient}.ts` (add `deletePrefix`; the local client's `pathFor` holds the root-escape guard).
- `Sinwy.Backend/modules/pages/repository.ts` (`pageImage`, `pageContent`, `page` are already imported there), `service.ts` (has `pagesLogger`), `index.ts`; new `sweep.ts` holding the job, like `organizations/purge.ts`.
- `Sinwy.Backend/modules/organizations/purge.ts` (`PurgeHooks`, `purgeExpired`), `Sinwy.Backend/jobs.ts`, `Sinwy.Backend/lib/jobs.ts` (the `Job` type).
- Tests: `modules/pages/tests/pageImages.test.ts` (extend, or a new `pageImageSweep.test.ts` reusing its helpers), `modules/organizations/tests/purge.test.ts`, `modules/user/tests/avatar.test.ts` (local client tests).

**Steps:**
- `StorageClient.deletePrefix(prefix)`: the local driver removes the directory recursively, missing is fine, and the same root-escape guard applies. The prefix must end with `/` and be non-empty, so nothing can wipe the root.
- Repository: find unreferenced rows older than a cutoff in batches (`strpos` over every `page_content` row of pages in the same org). The sweep deletes the file, then the row; a failed file delete is logged and the row kept, so the next run retries.
- Job `sweep-page-images`, hourly, exported from the pages module and added to `jobs` in `jobs.ts`.
- Add `onPurged(organizationIds)` to `PurgeHooks`, called after `deleteOrganizations` in `purgeExpired`. Wire it in `jobs.ts` to a pages service that runs `deletePrefix("pages/<orgId>/")` per org, best effort and logged. Rows go with the org's cascade.

**Tests that matter:**
- Not deleted: an image referenced only by an old checkpoint, by a discarded draft row, or by the published row; an unreferenced image younger than 24 h.
- Deleted: an unreferenced image older than 24 h, and images of a deleted page. An image referenced by a page of a different org doesn't protect this org's file.
- `deletePrefix` refuses an empty prefix, `/` and `..`, and leaves sibling orgs' files alone.
- Purge removes the org's page image files and the logo; another org's files stay.

**Done when:**
- Running the sweep and the purge in tests leaves exactly the expected files on disk and rows in the table.

**Verify:** Seed `pro-org` with a page. Upload two images through the API and save page content that references one. Backdate both `page_image.created_at` by 25 h through `sinwy_rw`, then run the sweep job once. A scratch script calls `runJob`, as `scripts/purgeOrganizations.ts` does. The unreferenced file's URL returns 404 and its row is gone; the referenced one still serves. Then schedule the org for deletion past retention and run `bun run db:purge-organizations`: `.storage/pages/<orgId>/` no longer exists. Time is simulated by backdating.

### Log (2026-11-25, `feat(backend): sweep unused page images and delete them with a purged organization`)
- Shipped: `StorageClient.deletePrefix` (local: recursive `rm`, prefix must end in `/`, same root guard, so `""`, `/`, `../` and absolute paths throw). `findUnusedPageImages` (cutoff, keyset by `id`, `NOT EXISTS` over `page_content` joined to `page` of the same org with `strpos(content::text, key) > 0`) and `deletePageImages`. `sweepUnusedPageImages` / `sweepPageImagesJob` (hourly, batches of 100, file then row, a failed delete keeps its row). `PurgeHooks.onPurged`, called after `deleteOrganizations` and the logo; wired to `deleteOrganizationPageImages` in `jobs.ts`, which now exports `purgeHooks`. Tests: `pageImageSweep.test.ts` (4), two `deletePrefix` tests in `avatar.test.ts`, and a purge test using the app's `purgeHooks`.
- Differs from plan: the sweep pages by `id` rather than `created_at`, so a row whose file keeps failing can't make a batch loop, and JS dates (ms) can't misplace the cursor against Postgres microseconds. The sweep and purge logic live in `sweep.ts` and `service.ts`; nothing was needed in `lib/jobs.ts`. The failed-delete test makes the key a directory so `unlink` fails.
- Checked in the running app: in a fresh pro-org, uploaded two PNGs through the API (201), saved a page whose Image used one, backdated both rows 25 h, and ran `runJob(sweepPageImagesJob)` from a scratch script (deleted afterwards): `{ deleted: 1, failed: 0 }`, the unused URL 404 and its row gone, the used one still 200 through :3000. Then removed the owner membership (standing in for account deletion), set `deletion_scheduled_at` 31 days back and ran `bun run db:purge-organizations`: `purged: 1`, `.storage/pages/<orgId>/` gone, org, page and image rows 0. Server logs clean. Not checked: the sweep's own startup/hourly run in the live backend (it logs nothing when there's nothing to do), and a real account deletion before the purge.
