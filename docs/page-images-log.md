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

## Phase 4: Pending uploads in save status, Publish and leaving

**Goal:** an upload in progress is never silently lost: the status says "Uploading…", Publish waits for it, leaving asks, and a remounted editor ignores late results.

**Files:**
- New plain module `page-editor/uploads.ts`: an upload tracker (pending count, subscribe, `settled()`, `dispose()` that aborts pending uploads and silences results). Consider keeping per-block pending state there too, so a reselected block shows its upload (see Standing notes, "Image field").
- `WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx` (create the tracker in the same mount effect as autosave; pass it to `PageEditor` next to `organizationId`).
- `page-editor/PageEditor.tsx` (`uploadImage` memo and `EditorImageUploadContext`: wrap the upload with the tracker), `page-editor/image-field.tsx` (`pick`/`send` register with the tracker; don't show an aborted upload as a network error).
- `page-editor/SaveControls.tsx` (`SaveStatus`, `LeaveGuard` L181, `shouldBlockFn`, beforeunload), `page-editor/publishing.ts` (`publishAfterSave`), `EditorLayout.tsx`.
- Tests: `modules/org-dashboard/tests/page-editor-publishing.test.ts`, new `page-editor-uploads.test.ts`, the `photos` describe in `e2e/editor.e2e.ts` (throttle with `page.route("**/page-images", …)`).

**Steps:**
- "Uploading…" takes precedence over "Saved" in `SaveStatus`; failed or blocked save states still show.
- `publishAfterSave` awaits `uploads.settled()` before flushing autosave, so the uploaded `src` is part of the saved version that gets published. An upload that fails does not block Publish; the pre-publish check then warns about the empty image as today.
- `LeaveGuard` blocks while uploads are pending. Its dialog says a photo is still uploading and offers Wait (stay) and Leave anyway. Tab close warns while anything is pending.
- Discard and "Load latest" dispose the tracker (Default 7); a result arriving after dispose never dispatches.

**Tests that matter:**
- Tracker: `settled()` resolves after success and failure alike, and after dispose nothing calls back.
- Publish while an upload is pending publishes a version that includes the uploaded `src`.
- Leaving during an upload asks; "Leave anyway" leaves; the late response doesn't write into the old editor.

**Done when:**
- With network throttled, Publish during an upload publishes the photo, and navigating away during an upload asks first.

**Verify:** Seed `pro-org` with a page holding an Image block. Throttle the network in Playwright (route delay on `page-images`). Start an upload: the status reads "Uploading…". Press Publish: it completes after the upload and the published row's content has the stored URL. Start another upload and click the back link: the dialog appears; Wait keeps you in the editor, Leave anyway leaves. Reopen: the page has no URL from the dropped upload (its `page_image` row exists and will be swept). The throttle is the only simulation.

### Log (2026-11-25, `feat(web): track photo uploads in save status, Publish and leaving the page editor`)
- Shipped: `uploads.ts` (`createUploads({ prepare, upload })`): `pick`, `view`, `dismiss`, `pending`, `settled`, `subscribe`, `abort`, `dispose`. A pick is one tracked task (shrink and upload), so `settled()` can't resolve between them; a busy field ignores a second pick; Retry is tracked again. The edit route creates it in the autosave mount effect and passes it to `PageEditor` instead of `organizationId`. `SaveStatus` shows "Uploading…" over Saved/Saving (not over failed, blocked or conflict). `PublishActions` waits for uploads (button "Publishing…"), then checks, then publishes; `publishAfterSave(autosave, uploads, read, publish)` waits too and reads the document after. `LeaveGuard` flushes autosave, then blocks while uploads are pending with "A photo is still uploading" (Wait / Leave anyway); beforeunload also covers uploads. Tests: `page-editor-uploads.test.ts` (7), two publish-during-upload cases in `page-editor-publishing.test.ts`, two e2e tests in `photos` (Publish waits; Back asks, Wait keeps the upload shown after reselecting, Leave anyway saves no URL).
- Differs from plan: the tracker owns the field's upload view (moved out of `image-field.tsx` component state), so a reselected block shows its upload. `organizationId` left `PageEditor`; the route builds the upload function. Discard and "Load latest" call `abort()` (the tracker stays usable if Discard fails) before the remount disposes it. A failure message is now cleared by the field's own changes (address input, Remove) or a new pick, not by any value change (that would clear another block's failure when the field stays mounted). Publish runs the pre-publish check after the wait, as the plan's "warns about the empty image as today" needs.
- Checked in the running app (subagent, e2e-test, response held with `route.fetch` + `fulfill`): "Uploading…" in header and field; Publish showed "Publishing…" until release, then the empty second Image raised "Publish anyway", and the published version 3 held `/api/files/pages/a76b6922-…/37efb17a-….jpg`. A second upload, then Back: the dialog appeared; Wait stayed with "Uploading…" still shown; Leave anyway went to the page detail. The dropped upload's `page_image` row exists (the server answered 201 before the hold) and no `page_content` row references it; reopening showed the second Image empty. No console errors. After leaving, Playwright still delivered the held response, which the app ignored. Not checked: tab-close warning, a really slow connection, the sweep deleting the dropped row.

## Phase 5: Usability rerun: task 3 (research)

**Goal:** a cold agent completes usability task 3, "Put two photos of the salon side by side", with local image files and no web addresses (the issue's Done when).

**Files:**
- Method and wording: Standing notes, "Usability method".
- Where findings usually land (all under `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/` unless noted): `image-field.tsx` (the field's UI), `uploads.ts` (upload flow and failure messages), `publish-checks.ts`, `BlockDrawer.tsx` (finding Photos), `Sinwy.Shared/types/page/blocks/blocks.ts` (labels and defaults).
- Any fix: keep `e2e/editor.e2e.ts`'s `photos` describe green.

**Steps:**
- Run with the `e2e-test` skill: a cold agent, the owner's wording, no UI hints. Seed the page through the API with a scratch script, and give the agent a folder of 2–3 local salon-like photos (landscape and portrait, at least one over 2 MB).
- Record steps, ease (1–5) and dead ends. Fix small findings here; ask before filing larger ones as issues.

**Tests that matter:**
- Any fix keeps `bun run test:editor` green.

**Done when:**
- Task 3 scores 4 or 5, no web address is used, and the published page shows both photos uncropped in a sensible shape.

**Verify:** Seed `pro-org` with a published "Home" page without photos. The agent is told: "Put two photos of the salon side by side. The photos are in <folder>." Afterwards the storefront shows two photos in one row on desktop, the published `page_content` holds two `/api/files/pages/<orgId>/` URLs, and `page_image` has matching rows. Nothing is simulated except login.

### Log (2026-11-25, `feat(web): keep one shape for every photo in a Photos row after an upload`)
- Scores (cold agent, owner wording, no UI hints; `pro-org` `bc3939de-…` (slug `seed-9acce92c`), "Home" page with Hero, "About the salon" and "Find us" seeded and published by a scratch script through the API, since deleted; photos drawn in Chromium: `salon-interior.jpg` 4032×3024 6.5 MB, `styling-chair.jpg` 3024×4032 3.9 MB, `salon-front.jpg` 1600×1200): **4**. Path: Pages → "Home" (title link) → Edit content → Photos card ("Two or more photos side by side") → Add with the section selected → click each empty slot → Upload photo. Each upload took about 1–1.5 s on localhost (both shrunk to 2400 px: 1.09 MB and 759 KB stored); no size message, no web address. "Publish changes" published at once; the storefront showed both photos side by side, square, at 472 px.
- Dead end that cost the 5: default 4 gave the 4:3 photo Wide and the 3:4 one Original, so the row was a short wide photo next to a tall one (the canvas also showed an empty area under the wide photo, from the still-square empty slot). The agent found Shape and set both to Square. Fixed here with the product owner's choice: inside Photos an upload sets every photo in the row, empty slots included, to one shape, Wide while every photo is landscape and otherwise Square (`rowShape` in `images.ts`; `useWriteImage` replaces the whole Photos block in one history entry). A standalone Image and Hero keep default 4. Tests: `rowShape` unit tests; the `photos` e2e's first test now uploads a landscape (both slots Wide), then a portrait into the second slot (both Square).
- Done when, "uncropped": not met as written. The final page shows both photos square, so about a quarter of each is cropped. The product owner accepted cropped, even rows. Uncropped equal-height rows would need stored photo proportions and a new Photos layout; not filed (raise it if owners ask).
- Filed: #87 empty photo slots are faint and unexplained; #88 Add with a Section selected puts Photos inside it, not after it as the hint says; #89 a click on a block announced "Draggable item Image-… was dropped" and enabled Undo (reproduced this time, after "Select parent block"); #90 the storefront serves the 2400 px files where photos show at 472 px.
- Recorded, not filed: the Pages list has no Edit control (only the title link, which looks like plain text), and the editor is two steps away (detail page → Edit content); the agent noticed no prompt for the description, although the hint "Describe the photo for people who can't see it." was shown (default 6 as designed); the storefront shows the Sinwy marketing header and a "Seed 9acce92c" label above the banner; 3× React warning "Detected a large number of updates inside startTransition" (`src/root.tsx:195`) during the editor session.
- Checked in the running app: published version 7 holds both `http://localhost:3000/api/files/pages/bc3939de-…/` URLs with `aspect` "square", matching the two `page_image` rows and the files under `.storage/pages/bc3939de-…/`. No console errors; no new web log warnings; the backend log has no request lines. Not rerun by a cold agent after the fix (the e2e covers it), and not checked on a phone or a slow network.
- Differs from plan: three photos instead of 2–3 "salon-like" real ones (drawn, with grain to reach phone sizes). The fix changes Decision default 4 for Photos rows (asked first).

## Phase 6: Code review, docs and cleanup

**Goal:** the quota, sweep and purge are reviewed for data loss and bypasses, docs are current, and nothing temporary is left.

**Files:**
- Review: `git diff e838aba..HEAD`. Backend: `Sinwy.Backend/modules/pages/` (`repository.ts` `insertPageImageWithinLimit` and `lockOrganization`, `service.ts`, `controller.ts` upload handler, `sweep.ts`), `db/schema/pageSchema.ts` (`page_image`), `jobs.ts` (`purgeHooks.onPurged`), `organizations/purge.ts`, `infrastructure/storage/` (`deletePrefix`). Shared: `PLAN_LIMITS` quota, `IMAGE_UPLOAD_LIMITS`, `blocks.ts` labels. Web, in `src/modules/org-dashboard/components/page-editor/`: `uploads.ts`, `images.ts` (`shapeFor`, `rowShape`, shrink), `image-field.tsx` (`useWriteImage`), `SaveControls.tsx` (`LeaveGuard`, "Uploading…"), `PublishControls.tsx`, `publishing.ts`; the edit route `routes/_shell.pages.$id.edit.tsx`.
- Tests: `modules/pages/tests/pageImages.test.ts`, `pageImageSweep.test.ts`, `organizations/tests/purge.test.ts`; web `page-editor-uploads.test.ts`, `page-editor-images.test.ts`, `page-editor-publishing.test.ts`; `e2e/editor.e2e.ts` `photos`.
- Docs: `docs/org-rules-map.md` (page image quota per plan, sweep after 24 h, purge), `README.md` if it describes the page editor, this plan and its log.
- Cleanup: the leftovers in the "Running app" note, `.playwright-cli/` page and console files, `.storage/pages/` test data.

**Steps:**
- Review with a focus on: files deleted while still referenced (sweep query, history rows, other orgs), `deletePrefix` path safety, quota races and bypasses (concurrent uploads, a wrong org id in the path), uploads by roles without `pages:write`, and late upload results writing into a remounted editor.
- Fix findings, then update `docs/org-rules-map.md` and close out the plan and log.
- Last step: stop every dev server started during this plan's work unless the user asked to keep it running, and delete temporary files (scratch seed scripts, screenshots, console logs, test photos outside the repo's fixtures, leftover `.storage/pages/` test data).

**Tests that matter:**
- Any test added for a review finding; `bun run verify` passes.

**Done when:**
- The review findings are fixed or recorded as accepted, the docs match the behaviour, and `bun run verify` passes.

**Verify:** None

### Log (2026-11-25, `fix(backend): delete page images with a deleted organization and refuse storage prefixes that aren't a plain folder`)
- Shipped (review findings fixed): deleting an organization at once (Better Auth `afterDeleteOrganization` in `modules/auth/auth.ts`) cascaded its `page_image` rows but left the files, which the sweep could then never find; it now calls `deleteOrganizationPageImages` through a lazy `@pagesModule` import, like bookings (test in `organizationDeletion.test.ts`). `deletePrefix` accepted `pages//`, `pages/./` and `pages/o2/../`, which resolve to `pages/` and would have removed every organization's photos had an empty org id ever reached it; it now refuses any empty, `.` or `..` part (cases added to `avatar.test.ts`).
- Reviewed with no change: the sweep counts every `page_content` row (history included), and a save never rewrites the published row in place, so a published or restorable photo is never swept; keys are matched as substrings of the jsonb text, so they survive an origin change. The quota sums and inserts under the organization lock with the file written inside it, and a failed insert deletes the file; the key always uses the membership's org id, so another org id in the path is a 404; staff are refused by `pages:write` (tested). On the web, every write after an await checks `signal.aborted`, and dispose and abort release the controllers, so a late result can't write into a remounted editor; a moved or deleted block is looked up at write time.
- Accepted and recorded: an image another organization's page uses by its address isn't kept by the sweep (it is per organization, as Decision 5 says; now in `docs/org-rules-map.md`). If deleting the files after a purge or deletion fails, it is logged and the files stay with no row to retry from.
- Docs: `org-rules-map.md` says who can upload, that deletion and the purge remove page images, and the per-organization sweep; `README.md`'s editor spec section lists the photo tests and the fourth seeded `pro-org`.
- Cleanup: deleted the 12 seed organizations that had page images (all from this plan's verifies and e2e runs) with their owners, and Phase 2's owner without an org; removed `.storage/pages/`, `/tmp/sinwy-p5/`, the `.playwright-cli/` page and console files, and the server logs; stopped the backend and web app (started 2026-11-25 18:00, during this plan). Left: about 34 other `webdevrokas+seed-…` users from e2e global setups since 2026-11-24, as every e2e run leaves them.
- Checked in the running app: nothing (Verify was None; the e2e wasn't rerun, as no web code changed).
