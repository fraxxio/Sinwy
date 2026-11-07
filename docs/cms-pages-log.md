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
