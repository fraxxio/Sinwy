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
