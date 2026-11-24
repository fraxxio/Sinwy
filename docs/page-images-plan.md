# Page images plan

Owners upload photos from their device into the Image block (and so Photos and Hero's background) instead of pasting an image address (issue #80). Files go through the existing local storage driver, are capped per plan, and are swept once no saved page version uses them. Done when a cold agent completes usability task 3 with local files.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-images-log.md](page-images-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Upload endpoint, tracking table and plan quota | – | done | `feat(backend, shared): upload page images within a per-plan storage quota` |
| 2 | Orphan sweep and org purge | 1 | todo | |
| 3 | Image field with upload in the editor | 1 | todo | |
| 4 | Pending uploads in save status, Publish and leaving | 3 | todo | |
| 5 | Usability rerun: task 3 (research) | 4 | todo | |
| 6 | Code review, docs and cleanup | 5 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Local storage only.** Reuse `STORAGE_DRIVER=local` (`Sinwy.Backend/infrastructure/storage/`). No S3 or other provider in this plan; anything added to `StorageClient` must be implementable by a future remote driver.
- **Big photos are shrunk in the browser.** The editor scales and re-encodes before upload so phone photos fit; the server keeps the shared 2 MB `IMAGE_UPLOAD_LIMITS` check unchanged.
- **Storage quota per plan.** Page images count against a per-organization byte quota in `PLAN_LIMITS`; an upload over it is refused with a clear message. Documented in `docs/org-rules-map.md`.
- **Pending uploads: wait or ask.** Save status shows "Uploading…". Publish waits for uploads to finish. Leaving in the app asks before dropping an upload; closing the tab warns.
- **Unused files are swept after 24 h.** A periodic job deletes page images that no `page_content` row of the organization references and that are older than 24 h. Org purge deletes all of an org's page images. Never delete on replace (unlike logos).

### Defaults (not yet confirmed; change only if asked)

1. Quota: Starter 100 MB, Professional 500 MB, Enterprise 2 GB, no plan 0. It counts bytes of tracked files not yet swept, so removed photos free their space within about a day. After a downgrade, existing images stay; only new uploads are refused.
2. Images belong to the organization, not a page: key `pages/<orgId>/<uuid>.<ext>`, route `POST organizationPath("page-images")` with `pages:write`. No activity entry per upload.
3. Browser shrink: longest side at most 2400 px, always re-encoded (this also strips EXIF/GPS). PNG stays PNG unless it is still over 2 MB, then JPEG; everything else becomes JPEG at quality 0.85, then 0.7 if still over 2 MB, then an error. Any image the browser can decode is accepted (GIF, AVIF, …) because the output is PNG or JPEG.
4. Shape from proportions (width/height): ≥ 1.3 → `wide`, < 0.8 → `auto` ("Original"), otherwise `square`.
5. Labels: "Image URL" → "Photo", "Background image URL" → "Background image". Pasting a web address is a secondary "Use a web address instead" control in the same field.
6. Description prompt: once a photo is set and `alt` is empty, the Description field shows a hint ("Describe the photo for people who can't see it"). No focus stealing and no new publish warning.
7. Discard and "Load latest" abort pending uploads without asking; their files are swept later.
8. The sweep doesn't guard against a save that re-adds a long-unused URL in the same instant it checks. That race is accepted.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Storage.** `StorageClient` (`infrastructure/storage/storageClientTypes.ts`) has only `put`, `delete` and `serve`, with no list operation. The local client (`localStorageClient.ts`) writes under `STORAGE_LOCAL_DIR` (default `.storage`, gitignored) and rejects keys that escape the root. `fileUrl(key)` is `<BETTER_AUTH_URL origin>/api/files/<key>`; `keyFromFileUrl` returns null for any other origin. Files are served by `modules/files` with an immutable cache header.
- **Tests on storage.** `modules/user/tests/avatar.test.ts` builds a `createLocalStorageClient(tmpRoot)`; route tests use the real `storageClient` and delete what they wrote (`avatarRoute.test.ts`, `organizations/tests/general.test.ts`).
- **Page image tracking (Phase 1).** `page_image` (`db/schema/pageSchema.ts`): id, organization_id (cascade), unique `key`, `bytes`, `created_at`, index (organization_id, created_at). `insertPageImageWithinLimit` (`modules/pages/repository.ts`) sums bytes and inserts under `lockOrganization`, which now serializes page creates and uploads. The upload answers 201 `{ src, usage }`; quota refusal is 409 `PAGE_IMAGE_QUOTA_EXCEEDED` (40928); a non-member gets 404, not 403.
- **Test helpers.** `modules/pages/tests/pageImages.test.ts` has `fillQuota` (a row with no file) and `storedFiles(orgId)` (lists `<STORAGE_LOCAL_DIR>/pages/<orgId>`). Tests get a temp `STORAGE_LOCAL_DIR` from `test/setup.ts`.
- **Running app.** Postgres may be down: `bun run db:up`. Seed with `bun run dev:seed-scenario pro-org` (no staff; `org-with-staff` has them) and log in with `dev:login-as`. `src` uses the `BETTER_AUTH_URL` origin (the web app, :3000), so it resolves only while the web app runs. Phase 1 left one upload in pro-org `86154843-…` (row and file); Phase 6 cleanup covers it.
- **Module direction.** `pages` imports `@organizationsModule`, never the reverse. The purge reaches other modules through `PurgeHooks` wired in `Sinwy.Backend/jobs.ts` (see `onScheduled`). `scripts/purgeOrganizations.ts` runs that same wired job. Org rows are hard-deleted in `purgeExpired` (`modules/organizations/purge.ts` L52), which only deletes the logo today.
- **History rows.** `page_content` (`db/schema/pageSchema.ts`) keeps every checkpoint, discarded drafts included; saves within the 10-minute window update the latest row in place. Deleting a page cascades its rows. "Referenced" therefore means: any `page_content` row of any page of the org contains the key. Use `strpos(content::text, key) > 0`, not `LIKE`.
- **Document rules.** `src` must pass `isSafeImageSrc` (http(s) or root-relative). Documents are capped at 256 KB (`PAGE_DOCUMENT_LIMITS.maxBytes`). Never put a `data:` or `blob:` URL in props: autosave sends every change after 1 s and would fail with an unfixable error. Keep the preview in the field's own state.
- **Editor fields.** `puckField` (`WebFrontend/src/shared/components/page-builder/puck-config.ts`) maps the `image` kind to a plain text field and looks up `customFields` only for kinds with `custom: true`. `editorConfig` (`page-editor/editor-config.tsx`) passes `customFields: { serviceIds }`; `serviceIdsField` in `editor-fields.tsx` is the model for a custom field UI. `src` keeps `required: true`, which the pre-publish check (`publish-checks.ts` L29) uses to warn about empty images.
- **Shapes.** Image renders `square` as `aspect-square` and `wide` as `aspect-video` with `object-cover` (`shared/components/page-builder/blocks.tsx` L113, L209). Photos' default items are `square`; a standalone Image defaults to `wide`.
- **Editor lifecycle.** The edit route (`org-dashboard/routes/_shell.pages.$id.edit.tsx`) remounts the editor with `key={`${page.data.id}:${opened}`}` on Discard and "Load latest", and creates the autosave engine in a mount effect (L170), disposing it on unmount; StrictMode mounts twice. `LeaveGuard` (`SaveControls.tsx` L181) blocks through `shouldBlockFn` while autosave isn't `saved`. `publishAfterSave` and `discardAfterSave` live in `publishing.ts`.
- **Client upload.** `apiUpload(path, form)` in `WebFrontend/src/shared/lib/api.ts` takes no `AbortSignal` yet. `shared/components/ImageUpload.tsx` (avatars and logos) has the client type and size check and the hidden `<input type="file">` pattern.
- **Unit tests have no DOM.** Keep shrink planning, shape choice and the upload tracker in plain modules; DOM-only parts (canvas, `createImageBitmap`) stay thin.
- **e2e.** `bun run test:editor` (Playwright) needs `bun run start:server` and `bun run start:web`. `e2e/global-setup.ts` seeds `pro`, `secondPro`, `thirdPro` (1 free page slot) and `starter`; add an org there if a test needs more. Helpers are in `e2e/editor-fixtures.ts`.
- **Usability method.** The #77 rerun (log removed in `3e2e220`; read it with `git show 3e2e220^:docs/page-autosave-log.md`, Phase 7). A cold agent works through the `e2e-test` skill in the owner's words with no UI hints, task pages are seeded through the real API by a scratch script that is deleted afterwards, and ease is scored 1–5. Task wording: `git show 6ee46ef:docs/puck-usability-tasks.md`.

---

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

---

## Phase 3: Image field with upload in the editor

**Goal:** in the Image settings (and Hero's background), an owner picks a photo from the device and sees a preview. It is shrunk, uploaded, and written into the block with a fitting shape in one undo step, with clear errors and a secondary web-address option.

**Files:**
- `Sinwy.Shared/types/page/blocks/blocks.ts` (labels on Image `src` and Hero `image`).
- `WebFrontend/src/shared/components/page-builder/puck-config.ts` (`puckField`: let `customFields` override built-in kinds too, or key the override by kind).
- `WebFrontend/src/modules/org-dashboard/components/page-editor/editor-config.tsx`, `editor-fields.tsx` (new image field UI, or a new `image-field.tsx` if it grows).
- New plain modules in `page-editor/`: shrink planning (`planImageResize`) and shape choice (`shapeFor`), with a thin DOM wrapper for `createImageBitmap` and canvas `toBlob`.
- `WebFrontend/src/shared/lib/api.ts` (`apiUpload` takes an optional `signal`).
- `WebFrontend/src/shared/components/ImageUpload.tsx` (reuse or extract the client checks).
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

---

## Phase 4: Pending uploads in save status, Publish and leaving

**Goal:** an upload in progress is never silently lost: the status says "Uploading…", Publish waits for it, leaving asks, and a remounted editor ignores late results.

**Files:**
- New plain module `page-editor/uploads.ts`: an upload tracker (pending count, subscribe, `settled()`, `dispose()` that aborts pending uploads and silences results).
- `WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx` (create the tracker in the same mount effect as autosave; pass it down).
- `page-editor/SaveControls.tsx` (`SaveStatus`, `LeaveGuard`, `shouldBlockFn`, beforeunload), `page-editor/publishing.ts` (`publishAfterSave`), `PageEditor.tsx`, `EditorLayout.tsx`, and the Phase 3 image field (register its upload with the tracker).
- Tests: `modules/org-dashboard/tests/page-editor-publishing.test.ts`, new tracker tests, `e2e/editor.e2e.ts`.

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

---

## Phase 5: Usability rerun: task 3 (research)

**Goal:** a cold agent completes usability task 3, "Put two photos of the salon side by side", with local image files and no web addresses (the issue's Done when).

**Files:**
- Method and wording: Standing notes, "Usability method".
- Where findings usually land: the Phase 3 image field, `publish-checks.ts`, `BlockDrawer.tsx` (finding Photos), `blocks.ts` labels.

**Steps:**
- Run with the `e2e-test` skill: a cold agent, the owner's wording, no UI hints. Seed the page through the API with a scratch script, and give the agent a folder of 2–3 local salon-like photos (landscape and portrait, at least one over 2 MB).
- Record steps, ease (1–5) and dead ends. Fix small findings here; ask before filing larger ones as issues.

**Tests that matter:**
- Any fix keeps `bun run test:editor` green.

**Done when:**
- Task 3 scores 4 or 5, no web address is used, and the published page shows both photos uncropped in a sensible shape.

**Verify:** Seed `pro-org` with a published "Home" page without photos. The agent is told: "Put two photos of the salon side by side. The photos are in <folder>." Afterwards the storefront shows two photos in one row on desktop, the published `page_content` holds two `/api/files/pages/<orgId>/` URLs, and `page_image` has matching rows. Nothing is simulated except login.

---

## Phase 6: Code review, docs and cleanup

**Goal:** the quota, sweep and purge are reviewed for data loss and bypasses, docs are current, and nothing temporary is left.

**Files:** every file changed in phases 1–5; `docs/org-rules-map.md`; this plan and its log.

**Steps:**
- Review with a focus on: files deleted while still referenced (sweep query, history rows, other orgs), `deletePrefix` path safety, quota races and bypasses (concurrent uploads, a wrong org id in the path), uploads by roles without `pages:write`, and late upload results writing into a remounted editor.
- Fix findings, then update `docs/org-rules-map.md` and close out the plan and log.
- Last step: stop every dev server started during this plan's work unless the user asked to keep it running, and delete temporary files (scratch seed scripts, screenshots, console logs, test photos outside the repo's fixtures, leftover `.storage/pages/` test data).

**Tests that matter:**
- Any test added for a review finding; `bun run verify` passes.

**Done when:**
- The review findings are fixed or recorded as accepted, the docs match the behaviour, and `bun run verify` passes.

**Verify:** None
