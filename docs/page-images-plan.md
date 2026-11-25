# Page images plan

Owners upload photos from their device into the Image block (and so Photos and Hero's background) instead of pasting an image address (issue #80). Files go through the existing local storage driver, are capped per plan, and are swept once no saved page version uses them. Done when a cold agent completes usability task 3 with local files.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-images-log.md](page-images-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Upload endpoint, tracking table and plan quota | – | done | `feat(backend, shared): upload page images within a per-plan storage quota` |
| 2 | Orphan sweep and org purge | 1 | done | `feat(backend): sweep unused page images and delete them with a purged organization` |
| 3 | Image field with upload in the editor | 1 | done | `feat(web, shared): upload photos from the device into Image and Hero in the page editor` |
| 4 | Pending uploads in save status, Publish and leaving | 3 | done | `feat(web): track photo uploads in save status, Publish and leaving the page editor` |
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

- **Storage.** `StorageClient` (`infrastructure/storage/storageClientTypes.ts`) has `put`, `delete`, `deletePrefix` (a folder prefix ending in `/`) and `serve`, with no list operation. The local client writes under `STORAGE_LOCAL_DIR` (default `.storage`, resolved against `Sinwy.Backend/`, gitignored) and rejects keys that escape the root. `fileUrl(key)` is `<BETTER_AUTH_URL origin>/api/files/<key>`; `keyFromFileUrl` returns null for any other origin. Files are served by `modules/files` with an immutable cache header.
- **Tests on storage.** `modules/user/tests/avatar.test.ts` builds a `createLocalStorageClient(tmpRoot)`; route tests use the real `storageClient` and delete what they wrote (`avatarRoute.test.ts`, `organizations/tests/general.test.ts`).
- **Page image tracking (Phase 1).** `page_image` (`db/schema/pageSchema.ts`): id, organization_id (cascade), unique `key`, `bytes`, `created_at`, index (organization_id, created_at). `insertPageImageWithinLimit` (`modules/pages/repository.ts`) sums bytes and inserts under `lockOrganization`, which now serializes page creates and uploads. The upload answers 201 `{ src, usage }`; quota refusal is 409 `PAGE_IMAGE_QUOTA_EXCEEDED` (40928); a non-member gets 404, not 403.
- **Test helpers.** `modules/pages/tests/pageImages.test.ts` has `fillQuota` (a row with no file) and `storedFiles(orgId)`; `pageImageSweep.test.ts` has `storeImage` (file and row, backdated) and `seedPage` (content rows straight into the table). Tests get a temp `STORAGE_LOCAL_DIR` from `test/setup.ts`.
- **Sweep and purge (Phase 2).** `sweep-page-images` (`modules/pages/sweep.ts`) runs at server start and hourly. It deletes rows older than 24 h whose key no `page_content` row of a page in the same org contains, file first; it logs only when it deletes or fails something. `purgeHooks.onPurged` (`Sinwy.Backend/jobs.ts`) removes `pages/<orgId>/` after the org rows are gone.
- **Running app.** Postgres may be down: `bun run db:up`. Seed with `bun run dev:seed-scenario pro-org` (no staff; `org-with-staff` has them) and log in with `dev:login-as`. `src` uses the `BETTER_AUTH_URL` origin (the web app, :3000), so it resolves only while the web app runs. The header Back control is an `<a role="button">`: locate it by button role or text. Left by verifies (Phase 6 cleanup covers them): Phase 1's upload in pro-org `86154843-…`; Phase 2's owner user without an org; Phase 3's pro-org `0857ecc7-…` (slug `seed-01379b03`, published "Gallery", two images); Phase 4's pro-org `a76b6922-…` (slug `seed-a1cc86a9`, published "Upload test", one used and one dropped image).
- **Document rules.** `src` must pass `isSafeImageSrc` (http(s) or root-relative). Documents are capped at 256 KB (`PAGE_DOCUMENT_LIMITS.maxBytes`). Never put a `data:` or `blob:` URL in props: autosave sends every change after 1 s and would fail with an unfixable error. Image blocks can't be top-level; seed them inside a Section.
- **Uploads (Phases 3–4).** `uploads.ts` (`createUploads`) owns each field's upload view under key `<blockId>:<field>`, the failure messages and preview URLs; `image-field.tsx` only renders it (via `EditorUploadsContext`) and writes the result with one `replace` dispatch. The edit route creates the tracker beside autosave and disposes it on remount; Discard and "Load latest" call `abort()` first. Publish waits for `settled()`, then runs the pre-publish check, so another empty Image still asks "Publish anyway". After dispose or abort, results are ignored by `signal.aborted` checks; whether the request itself is cancelled doesn't matter (Phase 4 log).
- **Shapes.** Image renders `square` as `aspect-square` and `wide` as `aspect-video` with `object-cover` (`shared/components/page-builder/blocks.tsx` L113, L209), so a 4:3 photo set to Wide is cropped to 16:9 (seen in Phase 3's verify). Photos' default items are `square`; a standalone Image defaults to `wide`.
- **e2e.** `bun run test:editor` (Playwright) needs `bun run start:server` (:3001) and `bun run start:web` (:3000). `e2e/global-setup.ts` seeds `pro` (full), `secondPro` (1 free page slot), `thirdPro` (1 free), `photos` (4 free, 3 used by its tests) and `starter`; add an org there if a test needs more. Helpers are in `e2e/editor-fixtures.ts`; the `photos` describe draws its JPEG in the page (`jpeg(page, w, h)`), uploads with `getByLabel("Upload photo").setInputFiles`, and holds uploads with `holdUploads(page)`. The Shape select's text includes its arrow, so assert with `toContainText`.
- **Usability method.** The #77 rerun (log removed in `3e2e220`; read it with `git show 3e2e220^:docs/page-autosave-log.md`, Phase 7). A cold agent works through the `e2e-test` skill in the owner's words with no UI hints, task pages are seeded through the real API by a scratch script that is deleted afterwards, and ease is scored 1–5. Task wording: `git show 6ee46ef:docs/puck-usability-tasks.md`. With `playwright-cli run-code`, state kept between calls must live on `page`, not `globalThis`.

---

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
