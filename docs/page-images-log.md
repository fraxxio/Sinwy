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

## Phase 3: Image field with upload in the editor

**Goal:** in the Image settings (and Hero's background), an owner picks a photo from the device and sees a preview. It is shrunk, uploaded, and written into the block with a fitting shape in one undo step, with clear errors and a secondary web-address option.

**Files:**
- `Sinwy.Shared/types/page/blocks/blocks.ts` (labels on Image `src` and Hero `image`).
- `WebFrontend/src/shared/components/page-builder/puck-config.ts` (`puckField`: let `customFields` override built-in kinds too, or key the override by kind).
- `WebFrontend/src/modules/org-dashboard/components/page-editor/editor-config.tsx`, `editor-fields.tsx` (new image field UI, or a new `image-field.tsx` if it grows).
- New plain modules in `page-editor/`: shrink planning (`planImageResize`) and shape choice (`shapeFor`), with a thin DOM wrapper for `createImageBitmap` and canvas `toBlob`.
- `WebFrontend/src/shared/lib/api.ts` (`apiUpload` takes an optional `signal`).
- `WebFrontend/src/shared/components/ImageUpload.tsx` (reuse or extract the client checks).
- The upload answers `PageImageDto` (`Sinwy.Shared/types/page/Page.ts`); quota errors come as `PAGE_IMAGE_QUOTA_EXCEEDED` with the server's message. No backend change is expected.
- Tests: `modules/org-dashboard/tests/` (new `page-editor-images.test.ts`), `e2e/editor.e2e.ts`.

**Steps:**
- The field shows the current image (or an empty drop area) and a real `<input type="file">` behind an "Upload photo" button, with drag-and-drop as an extra. It also has "Use a web address instead", which reveals the old text input, and Remove.
- On pick: decode and shrink (Default 3), show the local preview from the field's own state (object URL, revoked on unmount), then upload to `page-images`. Errors in plain words: not an image or can't be read, still too big after shrinking, quota full (server message), network failure with Retry.
- On success, write `src` and (only for blocks that have an `aspect` field) `aspect` from `shapeFor(width, height)` in one Puck dispatch. Address the block by the id it had when the upload started, not the current selection. If that block no longer exists, drop the result.
- Description hint per Default 6. `src` keeps `required: true`.
- Use context7 for the Puck API that replaces one item's props in a single dispatch (`getSelectorForId`, `replace`).

**Tests that matter:**
- `planImageResize`: keeps small images' size, caps the longest side, and picks the output type and quality steps per Default 3.
- `shapeFor` boundaries (1.3, 0.8, portrait, square, extreme panorama).
- e2e: upload a fixture JPEG through the file input, then Image shows it, `aspect` matches, and a single Undo removes both `src` and `aspect`. The saved `page_content` holds an `/api/files/pages/<orgId>/` URL, never `blob:` or `data:`. A text file shows the not-an-image error and changes nothing.

**Done when:**
- An owner can fill both images of a Photos block from local files, wide photos get `wide`, and the page saves and publishes with stored URLs.

**Verify:** Seed `pro-org` with a page holding a Photos block. Open the editor, select the first image, upload a landscape JPEG (4000×3000, over 2 MB) with the file input: the preview appears at once, then the saved URL. The block's shape is Wide and the latest `page_content` row has the `/api/files/pages/<orgId>/…` URL. `page_image` has one row under 2 MB. Upload a portrait photo into the second: Original. Upload a `.txt`: an error and no change. Publish, and the storefront page shows both photos. Nothing is simulated except login.

### Log (2026-11-25, `feat(web, shared): upload photos from the device into Image and Hero in the page editor`)
- Shipped: labels "Photo" / "Background image". `puckField` looks up `customFields[kind]` for every kind, so `image` gets `imageField` (`image-field.tsx`): preview box with drag and drop, hidden file input behind "Upload photo"/"Change photo", Remove, "Use a web address instead" (open from the start when the value is a non-uploaded URL), "Preparing photo…"/"Uploading…", errors for unreadable, still over 2 MB, server message (quota) and network (Retry, also on 5xx). `images.ts`: `planImageResize`, `shapeFor`, `shrinkImage` (createImageBitmap, canvas, white fill under JPEG). On success one `replace` dispatch writes the field and, if the block type has `aspect`, the shape; a deleted block drops the result. Description hint on the `alt` text field when the selected block has a `src`. `apiUpload` takes a signal; `uploadPageImage` in `page-queries.ts`. Tests: `page-editor-images.test.ts` (7) and an e2e upload/undo/redo/`.txt` test on a new `photos` e2e org.
- Differs from plan: `usePuck` moved to `editor-fields.tsx` to break an `editor-config` ↔ `image-field` import cycle. A new e2e org was needed because `pro` is at its page limit. After the verify, the empty-slot placeholder is hidden while busy and a failed state clears when the value changes; an error after a failed pick otherwise stays until the next pick or selection change (accepted). `ImageUpload.tsx` is unchanged: its checks (type allowlist, 2 MB) don't apply before shrinking.
- Checked in the running app (subagent, e2e-test): a 4000×3000 6.3 MB JPEG showed "Preparing photo…" at 15 ms, the `blob:` preview at 172 ms and the stored URL at 222 ms, with Shape Wide. `page_content` had the `/api/files/pages/<orgId>/` URL and `aspect: wide`, and `page_image` had one row of 748 KB. A 3000×4000 portrait got "Original" (`auto`) and 747 KB. A `.txt` showed the error, with no new version and no new row. Publish went through and the storefront showed both photos at 2400×1800 and 1800×2400, with no console errors. Not checked: quota refusal in the UI, drag and drop, Retry after a network failure, the web address input, and Hero's background. The agent noticed autosave updates one draft row in place (`created_at` fixed, `updated_at` moving); this is the existing autosave design, not this phase.
