# CMS pages log

Finished phases of the [CMS pages plan](cms-pages-plan.md), each with its spec and log entry.

## Phase 1: Shared page contracts and the page tables

**Goal:** the page DTOs, schemas, limits, block and template registries exist in `@sinwy/shared`, and the `page` and `page_content` tables are migrated.

**Files:**
- `Sinwy.Shared/types/plan/` — new `PlanLimits.ts` (`PLAN_LIMITS`, `limitsFor(plan)`), re-exported from `plan/index.ts`.
- `Sinwy.Shared/types/page/` (new, re-exported from `types/index.ts`): `PageStatus`, page Zod schemas (create, update metadata/SEO, content save), DTOs, the content tree schema, `BLOCK_TYPES`, `PAGE_TEMPLATES`, `RESERVED_PAGE_SLUGS`.
- `Sinwy.Shared/types/api/ApiResponse.ts` — add `PAGE_LIMIT_REACHED`.
- `Sinwy.Backend/db/schema/pageSchema.ts` (new), `db/schema/index.ts`; migration via `bun run db:generate`.

**Steps:**
- `page`: `id`, `organizationId` (FK cascade), `slug`, `title`, `status` (`draft` | `published`, check constraint like `oneOf` in other schemas), `seoTitle`, `seoDescription`, `publishedVersionId` (nullable FK to `page_content`, `on delete set null`), `publishedAt`, `createdAt`, `updatedAt`. Unique `(organizationId, slug)`; index on `(organizationId, createdAt)` for the served set.
- `page_content`: `id`, `pageId` (FK cascade), `version` (int), `content` (`jsonb<PageContent>`), `createdByUserId` (nullable, set null), `createdAt`. Unique `(pageId, version)`.
- The circular FK between the two tables needs Drizzle's `AnyPgColumn` callback; check that the generated SQL adds the constraint after both tables exist.
- Templates are pure functions of a profile input, so the backend and tests can call them without the DB.
- The content schema enforces the depth and block caps (Default 7) and rejects unknown block types.

**Tests that matter:**
- `PLAN_LIMITS` is 1 / 5 / 25 and never decreases with the tier (pin it like `planFeatures.test.ts`).
- The content schema rejects unknown types, too-deep trees and too many blocks.
- Every template produces content that passes the schema, with and without a profile.
- Every reserved page slug fails the slug schema.

**Done when:** `bun run verify` passes and the migration applies cleanly on a fresh database.

**Verify:** None.

### Log (2026-11-06, `feat(backend, shared): add page contracts and the page tables`)
- Shipped: `PLAN_LIMITS` / `limitsFor` (`Sinwy.Shared/types/plan/PlanLimits.ts`); `Sinwy.Shared/types/page/` with `Page.ts` (statuses, field limits, `RESERVED_PAGE_SLUGS`, DTOs incl. `PublicPageDto`), `PageContent.ts` (`BLOCK_TYPES`, `pageContentSchema`, `blockTypesIn`), `PageTemplates.ts` (`PAGE_TEMPLATES`, `PAGE_TEMPLATE_IDS`) and `PageSchema.ts` (`pageSlugSchema`, `createPageSchema`, `pageDetailsSchema`, `updatePageSchema`, `savePageContentSchema`); `API_ERROR_CODES.PAGE_LIMIT_REACHED = 40924`; `db/schema/pageSchema.ts` and migration `0024_pages.sql`. Tests: limits pinned in `modules/billing/tests/planFeatures.test.ts`, contracts in `modules/pages/tests/pageContracts.test.ts`.
- Differs from plan: `@sinwy/shared` has no test runner, so the contract tests live in the backend (`modules/pages/tests/`, ahead of the module itself). Slugs also refuse leading, trailing and double hyphens. Block ids must be unique within a tree. The content schema is built one level at a time (no recursion), so an over-deep tree fails at depth 6 without being walked. Templates take the whole `OrganizationProfileDto` (`EMPTY_ORGANIZATION_PROFILE` when there is none) and give blocks deterministic ids (`heading-1`, …); their buttons link to the relative `book`. Page title is capped at 100 characters. `pageDetailsSchema` takes strings for the SEO fields; the API stores an empty one as null.
- Checked in the running app: nothing (no UI). `bun run db:migrate` applied `0024_pages` to the dev DB, and all migrations applied cleanly to a scratch database that was then dropped; the circular FK is added by `ALTER TABLE` after both tables exist.

## Phase 2: Pages API: list, create, edit, content, delete

**Goal:** members can list pages with usage, and writers can create a page from a template within the limit, edit its metadata and SEO, save content versions and delete it.

**Files:**
- New module `Sinwy.Backend/modules/pages/`: `index.ts`, `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `tests/` (already holds `pageContracts.test.ts`; add the HTTP tests beside it). Pattern: `modules/services/`.
- `modules/organizations/service.ts` + `index.ts` — export a profile reader over `findProfile` (see Standing notes), returning an `OrganizationProfileDto`.
- `Sinwy.Backend/import_map.json`, `tsconfig.json`, `index.ts` — `@pagesModule` alias and route registration.
- `Sinwy.Backend/scripts/dev/seedScenario.ts` — `pro-org` scenario (Default 17): let `activate` take the plan.
- Contracts to import, not redefine: `Sinwy.Shared/types/page/` and `db/schema/pageSchema.ts` (from phase 1).

**Steps:**
- Routes under `organizationPath("pages…")`: `GET pages`, `POST pages`, `GET pages/:pageId`, `PATCH pages/:pageId`, `PUT pages/:pageId/content`, `DELETE pages/:pageId`. Reads need `pages:read`, writes `pages:write`.
- Every write refuses an inactive organization first (409 `ORGANIZATION_INACTIVE`).
- Create: a premium template the plan lacks → 402. In one transaction under the per-org lock: count pages, refuse at the limit (409 `PAGE_LIMIT_REACHED`), insert the page and version 1 from the template filled with the profile.
- A slug clash (unique violation) → 409 with a field error on `slug`, so the form can show it.
- Content save: check `baseVersion` (Default 10) and premium blocks (Default 9), insert version n+1 and bump `page.updatedAt`. Metadata edits bump `updatedAt` too.
- List items: `id`, `title`, `slug`, `status`, `updatedAt`, `publishedAt`, and `live` (published and inside the served set; the served-set query is shared with phase 3, so build it here). Order by `updatedAt` desc.
- Detail: the page, its latest version (number + content), the published version number and `hasUnpublishedChanges`.
- An id from another organization → 404.
- Map DB rows to DTOs; no `$inferSelect` types in responses.

**Tests that matter:**
- At the limit, create → 409; two concurrent creates at limit − 1 → exactly one succeeds.
- Starter creating a premium template → 402; Professional succeeds.
- Saving a new premium block on Starter → 402; saving a page that already contains it → 200.
- Stale `baseVersion` → 409.
- Staff writes → 403; an inactive organization's writes → 409 while reads still answer.
- Another organization's page id → 404 for every route.

**Done when:** all routes answer per the tests, `bun run dev:seed-scenario pro-org` works and `bun run verify` passes.

**Verify:** None (no UI yet; phase 4 covers the flow).

### Log (2026-11-07, `feat(backend, shared): add the pages API`)
- Shipped: `Sinwy.Backend/modules/pages/` (`routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `index.ts` exporting `registerPageRoutes`) with the six routes, registered in `index.ts` behind the `@pagesModule` alias; `getOrganizationProfile(organizationId)` exported from organizations; `API_ERROR_CODES.PAGE_SLUG_TAKEN = 40925` and `PAGE_VERSION_CONFLICT = 40926`; a `pro-org` seed scenario (`activate` takes the plan), with its seed test and a row in the `e2e-test` skill's `seed-scenario.md`. HTTP tests in `modules/pages/tests/pages.test.ts` (17 tests): limit and race, template and block gates, stale and racing `baseVersion`, slug clash on create and rename, staff 403, inactive 409 with reads still answering, foreign id 404 on every route, delete cascade, the served set after a downgrade.
- Differs from plan: the slug clash is a 409 with code `PAGE_SLUG_TAKEN` (the API has no per-field error shape; the web maps the code to the slug field with `showFieldError`). A stale `baseVersion` gets its own code, `PAGE_VERSION_CONFLICT`. Content saves lock the page row (`select … for update`), so two saves on the same `baseVersion` can't both land. The content body cap is 256 KB (`MAX_PAGE_CONTENT_BYTES` in the controller) → 413; the server-wide cap stays 4 MB. Every write (create, PATCH, PUT content) answers with the full `PageDetailDto`; DELETE answers `null`. `hasUnpublishedChanges` is true only for a published page whose pinned version isn't the latest. A PATCH with an empty body still bumps `updatedAt`.
- Checked in the running app: started the backend (`bun run start:server`, log `/tmp/sinwy-logs/backend.log`), `bun run dev:seed-scenario pro-org` exited 0 (org `27feeb7b-…`, slug `seed-079f9ae5`); as its owner, `POST pages` with `landing` → 201, content prefilled from the seeded tagline; `GET pages` → usage 1 of 5. No UI yet.

## Phase 3: Publish, unpublish and the public page endpoint

**Goal:** writers can publish and unpublish a page, and anyone can read a live published page by organization slug and page slug.

**Files:**
- `Sinwy.Backend/modules/pages/routes.ts` — the two `POST` routes (`write`) and a `registerPublicPageRoutes` under the `STOREFRONT` prefix (`/api/public/organizations/:slug/pages/:pageSlug`), exported from `index.ts` and registered in `Sinwy.Backend/index.ts`.
- `modules/pages/controller.ts` — handlers; extend `respondError` if a new `PageError` appears.
- `modules/pages/service.ts` — `publishPage`, `unpublishPage` (return `toDetailDto`), `getPublicPage` (resolves SEO with `getOrganizationProfile` for the tagline).
- `modules/pages/repository.ts` — pin the latest version (reuse `latestVersionOf`), clear it on unpublish, and a by-slug lookup joined to the published `page_content` row; `findServedPageIds` decides "in the served set".
- `modules/organizations/service.ts` + `index.ts` — a public-plan lookup by slug: `isOrganizationPublic` + `organizationPlanOf` over `findOrganizationBySlug` (see Standing notes; don't touch `PublicOrganization`).
- `modules/pages/tests/pages.test.ts` — swap `publishRow` for the route; new public-endpoint tests (public app also needs the public route registered).

**Steps:**
- `POST pages/:pageId/publish` pins the latest version, sets `status = published` and `publishedAt` (Default 2: no limit check). `POST pages/:pageId/unpublish` follows Default 4. Both refuse an inactive organization.
- `GET /api/public/organizations/:slug/pages/:pageSlug`, no auth: 404 unless the organization is public, the page is published, and it's in the served set (the oldest `limitsFor(plan).pages` published pages by `createdAt`, `id`).
- The public DTO carries the organization's name and slug, the page title, the resolved SEO title and description (Default 6) and the published content. Never the draft.
- Unknown org, inactive org, draft page and over-limit page all give the same 404, so nothing leaks.

**Tests that matter:**
- Saving after publishing doesn't change the public content until the next publish.
- An org whose owner's plan ended (or that is scheduled for deletion) → 404 for a published page; restoring the plan → served again with no page change.
- Professional with 3 published pages downgraded to Starter → only the oldest by `createdAt` is served; republishing a newer one doesn't swap it in.
- Unpublish → 404, and the dashboard list shows `live: false`.

**Done when:** the endpoints answer per the tests and `bun run verify` passes.

**Verify:** None (phase 6 covers it end to end).

### Log (2026-11-07, `feat(backend): add publishing and the public page endpoint`)
- Shipped: `POST pages/:pageId/publish` and `POST pages/:pageId/unpublish` (`pages:write`, 409 while inactive, 404 for another org's id) and `GET /api/public/organizations/:slug/pages/:pageSlug` via `registerPublicPageRoutes`, registered in `Sinwy.Backend/index.ts`. Repository: `publishPage` (locks the page row, pins `latestVersionOf`), `unpublishPage`, `findPublishedPageBySlug` (inner join on the pinned `page_content` row, so the draft can't leak). Organizations: `findPublicOrganizationPlan(slug)` → `{ id, name, slug, tagline, plan }` or null. Tests: `publishRow` swapped for the route; five new tests (pin vs. later saves and SEO fallback, unpublish, ended plan and scheduled deletion with the `page` row unchanged, downgrade served set with publish order reversed and a republish, identical 404 bodies for every miss); staff, inactive and foreign-id tests cover the two new routes.
- Differs from plan: the tagline comes from the `findOrganizationBySlug` row through `findPublicOrganizationPlan`, not a second `getOrganizationProfile` call. An empty tagline falls back to `null`. Publishing doesn't bump `updatedAt`, since it isn't a content or metadata edit. The public route path is spelled out in `pages/routes.ts` instead of importing `STOREFRONT` from bookings (not exported, and a cross-module internal import).
- Checked in the running app: nothing (Verify: None; no dev servers running). `bun run verify` exit 0, 740 server tests.

## Phase 4: Pages list, create flow and limit UI (web)

**Goal:** members see their pages with status, last edited and public link, and writers create a page from a template picker that respects plan gates and the page limit.

**Files:**
- `src/modules/org-dashboard/lib/page-queries.ts` (new; pattern: `service-queries.ts`): the list query (`PageListDto` from `GET pages`) and the create mutation (`POST pages`, answers `PageDetailDto`). Phase 5 adds detail, PATCH, publish/unpublish and delete here.
- `src/modules/org-dashboard/routes/_shell.pages.index.tsx` (replace the empty state), new `_shell.pages.new.tsx`.
- `src/modules/org-dashboard/components/pages/` (new): list table, template picker (`PAGE_TEMPLATES` / `PAGE_TEMPLATE_IDS` and their `requires` from `@sinwy/shared`), usage meter (`usage` from the list).
- `src/shared/lib/plans.ts`: a `minimumPlanForPages(count)` helper beside `minimumPlanFor`, built on `PLAN_LIMITS`.
- Form validation reuses `createPageSchema` / `pageSlugSchema` from `@sinwy/shared`; the slug derivation helper lives beside the form (or in `src/shared/lib/` if phase 5's slug field reuses it).
- `src/shared/components/UpgradePrompt.tsx`: reuse its owner/non-owner action for a limit variant rather than copying it.

**Steps:**
- List columns: title, slug, status badge ("Published", "Draft", "Published, not live" for over-limit), last edited (relative), and the public link for live pages.
- Header shows "3 of 5 pages used". At the cap, "New page" is disabled and an upgrade prompt names the next plan with a higher limit. Over the cap, the prompt also explains which pages are offline.
- Create page: template cards; premium ones show a lock and the plan name when `has("page-builder")` is false, and can't be picked. Then title, with the slug derived from it and editable. On success, go to the page detail.
- Field errors from the API (slug clash, reserved slug) show on the field; 409 `PAGE_LIMIT_REACHED` shows the upgrade prompt.
- Staff see the list without "New page" or write actions.

**Tests that matter:**
- Slug derivation from a title (accents, spaces, reserved words).
- `minimumPlanForPages` picks the cheapest plan whose limit fits.

**Done when:** the list and create flow work for owner, admin and staff, and `bun run verify` passes.

**Verify:** Seed `subscribed-org` (Starter) and log in as the owner. Pages shows "0 of 1 pages used". New page: `landing` and `services-showcase` are locked with "Business"; pick `about`, title "About us" → lands on the page detail; a `page` row and one `page_content` row (version 1) exist, the content holds the seeded tagline. Back on the list: "1 of 1 pages used", "New page" disabled, upgrade prompt links to `/account/billing?change=plan`. Then seed `pro-org`: a premium template can be picked, and creating two pages with the same slug shows the slug error on the second. Log in as a staff member (`org-with-staff`): the list shows, with no create or edit actions. No Polar or email involved.

### Log (2026-11-07, `feat(web): add the pages list and create flow`)
- Shipped: `lib/page-queries.ts` (list query, create), `lib/pages.ts` (`slugFromTitle`, page state labels, limit and public path helpers), `components/pages/` (`PagesTable`, `TemplatePicker`, `PageUsageMeter`, `PageLimitNotice`, `NewPageForm`), `_shell.pages.index.tsx` (usage meter, table or empty state, limit notice) and `_shell.pages.new.tsx` (`pages:write`; shows the limit notice instead of the form at the cap). `minimumPlanForPages` in `src/shared/lib/plans.ts`; `UpgradeAction` split out of `UpgradePrompt`. Tests: slug derivation (accents, folded letters like ß/Æ/Ł, reserved words, length) and `minimumPlanForPages`.
- Differs from plan: the slug helper lives in `lib/pages.ts`, since phase 5's slug field is edited by hand and doesn't derive. The limit notice is an inline alert (the list stays visible) rather than an `UpgradePrompt` variant; it reuses the extracted `UpgradeAction`. At the cap it names the cheapest plan for `used + 1` pages, over the cap the plan for `used` pages, and lists the offline pages by title. Staff see only the over-the-cap notice, not the at-cap one. `PAGE_LIMIT_REACHED` on create refetches the list, so the form swaps to the limit notice. The address is derived from the title until someone types their own (clearing it resumes the derivation); reserved results get `-page` (`book` → `book-page`).
- Checked in the running app: the full Verify brief passed in a subagent (Starter: locked premium templates with "Business", about → detail, one `page` + version-1 `page_content` with the seeded tagline, list at "1 of 1" with "New page" disabled and the upgrade link; Pro: premium template creates, duplicate slug shows "Another page already uses this address" on Address; staff: list without create or edit actions, and `/pages/new` redirects with an access-denied notice). No server or console errors except the expected 409. Not checked: the over-the-cap notice in the browser (phase 6's downgrade covers it) and the plan change behind "Upgrade plan". `bun run verify` exit 0 (740 server, 238 web tests).

## Phase 5: Page detail, publish toggle and preview (web)

**Goal:** writers edit a page's title, slug and SEO, publish and unpublish it, and preview the draft; the content area is a placeholder the builder drops into.

**Files:**
- `src/modules/org-dashboard/routes/_shell.pages.$id.tsx` (replace the empty state; the create flow already lands here), new `_shell.pages.$id.preview.tsx`.
- `src/modules/org-dashboard/lib/page-queries.ts`: add `pageQuery` (key `pageKeys.detail`, which create already seeds), `updatePage` (PATCH, `UpdatePageInput`), `publishPage` / `unpublishPage` (answer `PageDetailDto`), `deletePage` (answers `null`); update both the detail and list caches after writes.
- `src/modules/org-dashboard/components/pages/` — details/SEO form (pattern: `NewPageForm.tsx`, with `pageDetailsSchema` and `PAGE_LIMITS`; empty SEO strings are stored as null), publish card (`pageState`, `PAGE_STATE_LABELS`, `publicPagePath` from `lib/pages.ts`), content placeholder; the delete confirm uses `src/shared/components/ui/alert-dialog.tsx`.
- `src/shared/components/page-content/PageRenderer.tsx` (new, Default 14). Web tests are plain `bun:test` `.test.ts` files with no DOM; render it with `react-dom/server` in `src/shared/tests/`.

**Steps:**
- Sections: Details (title, slug), SEO (title and description with counters and the fallback shown as placeholder), Publishing (status, the toggle, "Publish changes" when `hasUnpublishedChanges`, the public link when live, the over-limit notice from Default 2), Content (placeholder with the version number, last saved time and a "Preview" link).
- Changing the slug of a published page warns that the old link stops working.
- Delete with a confirm dialog that says published pages go offline.
- Staff see everything read-only, with no toggle or delete.
- Preview renders the latest version with `PageRenderer` inside a "Preview — not published" banner.

**Tests that matter:**
- `PageRenderer` renders each MVP block type and skips an unknown one without crashing.

**Done when:** a page can be edited, published, unpublished, previewed and deleted from the dashboard, and `bun run verify` passes.

**Verify:** Seed `pro-org`, log in as the owner, create a page from `landing`. On its detail page: edit the SEO title → `page.seo_title` updates and "last edited" moves. Publish → `status = published`, `published_version_id` = version 1, the public link appears. Preview opens and renders the blocks. Unpublish → `status = draft`, `published_at` and `published_version_id` null. Delete → the `page` and `page_content` rows are gone and the list count drops. No Polar or email involved.

### Log (2026-11-07, `feat(web): add the page detail, publishing and preview`)
- Shipped: `_shell.pages.$id.tsx` turned into a layout with `$id.index.tsx` (detail: Publishing, Content, Details and SEO) and `$id.preview.tsx` (banner and `PageRenderer`). Components `PageDetailsForm`, `PagePublishing` (switch, "Publish changes", public link, over-limit alert with `UpgradeAction`), `PageContentSummary` (version, block count, last saved, Preview) and `DeletePageButton` (alert dialog). Page queries and mutations in `lib/page-queries.ts`. `PageRenderer` in `src/shared/components/page-content/`. An opt-in `counter` on the shared `TextField`. Tests: `src/shared/tests/page-renderer.test.ts` (every MVP block, unknown type skipped, nested children, unsafe links and malformed props dropped).
- Differs from plan: preview is a child of a new `$id` layout route, so the breadcrumb reads Pages › Page › Preview. The SEO description placeholder shows the real tagline, read from the onboarding endpoint (no profile GET exists). The details form sends only changed fields and answers "No changes to save" without a request, because the API always bumps `updatedAt`. When the latest version is the published one, the preview banner says "Preview — the published version" instead of "not published". Staff see the forms disabled, the status badge and the public link, with no switch, "Publish changes" or Delete.
- Checked in the running app: the full Verify brief passed in a subagent (`seed-4f8a880f`): the SEO title saved and `updated_at` moved, publish pinned version 1 and showed the public link (the public endpoint answered 200), the preview rendered all 6 blocks, unpublish cleared `published_at` and `published_version_id` (the endpoint answered 404), and delete removed the `page` and `page_content` rows and dropped the count to "0 of 5". It found two issues, both fixed and rechecked inline: the preview banner was hardcoded, and a save with no changes moved "last edited". No console or server errors. Not checked in the browser: staff read-only view, the over-limit alert (phase 6's downgrade covers it), the slug-change warning and the inactive-org path. `bun run verify` exit 0 (740 server, 242 web tests).
