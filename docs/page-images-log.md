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
