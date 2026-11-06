# CMS pages plan

Builds the management surface for an organization's public pages: a `pages` backend module with versioned content, publishing and a public read endpoint, plan limits, and the dashboard screens to list, create, edit and publish pages. The page builder itself is a separate project and later replaces the content placeholder built here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [cms-pages-log.md](cms-pages-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shared page contracts and the page tables | – | done | `feat(backend, shared): add page contracts and the page tables` |
| 2 | Pages API: list, create, edit, content, delete | 1 | todo | |
| 3 | Publish, unpublish and the public page endpoint | 2 | todo | |
| 4 | Pages list, create flow and limit UI (web) | 2 | todo | |
| 5 | Page detail, publish toggle and preview (web) | 3, 4 | todo | |
| 6 | Public page route with SSR and SEO (web) | 3, 5 | todo | |
| 7 | Docs and code review | 1–6 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Every plan has pages, with a page limit.** Starter 1, Professional 5, Enterprise 25. The limit counts every page, drafts included, and lives in a new `PLAN_LIMITS` constant in `Sinwy.Shared/types/plan/`, separate from `FEATURES` (whose comment says numeric limits are a different shape). An inactive organization's limit is 0.
- **`page-builder` gates only premium templates and premium block types**, not the pages module itself.
- **Over the limit after a downgrade, keep every page and take the newest offline.** Nothing is deleted or flipped. Only the oldest N published pages (N = the plan's limit) are served publicly; the dashboard marks the rest "over plan limit". Creating a page at or over the limit is refused.
- **Going inactive changes no page.** The public endpoint serves a page only when `isOrganizationPublic` holds; `page.status` stays as it was, so pages go live again by themselves when the organization reactivates. No hooks on the paths into inactive.
- **Public URL is `/<orgSlug>/<pageSlug>`.** The storefront stays the organization's homepage at `/<orgSlug>`; page slugs that clash with storefront routes are reserved.
- **Versioned content: draft plus published pin.** Every content save inserts a numbered `page_content` row. Publishing pins `page.publishedVersionId`, so later saves don't change the live page until the next publish. Old versions are kept, with no history UI yet.

### Defaults (not yet confirmed; change only if asked)

1. **"Oldest" means `page.createdAt`** (then `id` as tie-break), not `publishedAt`, so republishing a page can't move it in or out of the served set.
2. **Publishing is always allowed.** A page published outside the served set shows "Published, not live: over your plan's page limit" instead of being refused.
3. **Pages can be deleted** (hard delete, versions cascade), so an owner can get back under the limit. The ticket doesn't mention delete, but a limit without it is a dead end.
4. **Unpublish** sets `status = draft` and clears `publishedAt` and `publishedVersionId`.
5. **Page slugs:** lowercase letters, digits and hyphens, 1–60 characters, unique per organization. Reserved: `book`, `s`, and any other static child route of `storefront/routes/`. Changing a published page's slug is allowed, with no redirect.
6. **SEO fields:** nullable `seoTitle` (≤ 70) and `seoDescription` (≤ 160). They fall back to the page title and the organization tagline. No OG image yet.
7. **Content tree shape** (in `@sinwy/shared`, Zod): `{ schemaVersion: 1, blocks: Block[] }`, where a block is `{ id, type, props, children? }`. Props are validated only loosely (a record) because the builder will own them. Unknown block types are rejected, so the plan gate can't be bypassed. Max depth 5, max 200 blocks, and the request body is capped (pick a limit in phase 2 and record it).
8. **Block types and templates are code registries in `@sinwy/shared`**, each with an optional `requires: Feature`. MVP blocks: `heading`, `text`, `image`, `button` (all plans); `gallery`, `testimonials` (`page-builder`). MVP templates: `blank` and `about` (all plans); `landing` and `services-showcase` (`page-builder`). Templates take a profile (tagline, description, city, country, contact) and return the first content tree.
9. **A premium block type is refused on save only if it isn't already in the page's latest version**, so a downgraded organization can still edit pages that contain premium blocks.
10. **Optimistic concurrency on content saves:** the body carries `baseVersion`; if it isn't the latest version, the save gets a 409, so the builder can't silently overwrite another tab.
11. **Limit reached → 409 with a new `API_ERROR_CODES.PAGE_LIMIT_REACHED`**, following `ORGANIZATION_LIMIT_REACHED` (40912). A premium template or block → 402 `PLAN_UPGRADE_REQUIRED`. A write while the organization is inactive → 409 `ORGANIZATION_INACTIVE`, the same as services.
12. **The list endpoint returns usage** (`{ items, usage: { used, limit } }`), so staff, who don't get the plan name, still see "3 of 5 pages used".
13. **Draft preview** is a dashboard route (`pages/$id/preview`, `pages:read`) that renders the latest version. Published pages also link to the public URL.
14. **One minimal `PageRenderer`** in `src/shared/components/page-content/` renders the MVP block types and skips unknown ones. The dashboard preview and the public route both use it; the builder replaces or extends it later.
15. **The storefront doesn't list or link to pages yet.** Pages are reached by their URL; navigation comes with the builder.
16. **No version pruning.** The builder's autosave policy decides that later.
17. **A `pro-org` seed scenario**: `subscribed-org` with a Professional plan. Pages Verify briefs start from it or from `subscribed-org` (Starter).

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Permissions already exist:** `pages:read` and `pages:write` in `Sinwy.Shared/types/access/Permission.ts`. Owner and admin have both, staff only read (`RolePermissions.ts`). The web section is `ORG_SECTIONS.pages` in `src/modules/org-dashboard/lib/sections.ts`.
- **The web routes exist as placeholders:** `src/modules/org-dashboard/routes/_shell.pages.tsx` (layout, `requirePermission(ORG_SECTIONS.pages.permission)`), `_shell.pages.index.tsx` and `_shell.pages.$id.tsx`, both empty states.
- **Inactive is derived, never stored.** `isOrganizationPublic(access)` in `Sinwy.Backend/modules/organizations/service.ts` (slot held, owner plan set, not scheduled for deletion). `requireMember` puts `{ organizationId, roles, status, plan }` on the context (`modules/auth/requirePermission.ts`); `plan` is null while inactive. Services refuse writes with `if (membership.status !== "active") return inactive;` and map that to 409 `ORGANIZATION_INACTIVE` in `respondError` (`modules/services/controller.ts`).
- **`requireFeature(feature)`** (`modules/auth/requireFeature.ts`) is a route middleware that answers 402 `PLAN_UPGRADE_REQUIRED`. Template and block checks depend on the request body, so they use `hasFeature(membership.plan, …)` from `@sinwy/shared` in the service instead.
- **Don't add the plan to `PublicOrganization`.** `getStorefront` in `modules/bookings/service.ts` spreads every field except `id` into the public `StorefrontDto`, so a new field would leak. Add a separate organizations export for the public plan (the row from `findOrganizationBySlug` already carries `ownerPlan`; use `organizationPlanOf`).
- **No profile reader is exported yet.** `findProfile(organizationId)` is in `modules/organizations/repository.ts`; export a service wrapper through `modules/organizations/index.ts` for template prefill.
- **Public routes** use the prefix `/api/public/organizations/:slug` (`STOREFRONT` in `modules/bookings/routes.ts`), resolved through `findPublicOrganization(slug)` → 404 "This booking page isn't available".
- **Module wiring:** add `@pagesModule` to both `Sinwy.Backend/import_map.json` and `tsconfig.json` `paths`, and register the routes in `Sinwy.Backend/index.ts`. Schemas are re-exported from `db/schema/index.ts`; migrations come from `bun run db:generate` (last one is `0024_pages.sql`; rename the generated file and its journal tag to match).
- **JSONB:** use the custom `jsonb<T>()` from `@db/jsonb`, not Drizzle's own, which double-encodes with Bun SQL.
- **Per-organization lock:** `pg_advisory_xact_lock(hashtext(organizationId))` inside a transaction, as `modules/bookings/repository.ts:70` does. Use it for the count-then-insert of page creation.
- **TanStack Start SSR inheritance:** a child route can only be more restrictive than its parent. `src/modules/storefront/routes/route.tsx` (the `/$organizationSlug` layout) sets `ssr: false`, so a child page route can't render on the server until that flag moves off the layout. `api()` in `src/shared/lib/api.ts` already works on the server (forwards cookies to `BACKEND_URL`).
- **Plan UI helpers:** `PlanGate` and `UpgradePrompt` in `src/shared/components/` are feature-based; `useEntitlements()` (`src/shared/lib/auth/entitlements.ts`) gives `has(feature)`; `minimumPlanFor(feature)` and `getPlanName` are in `src/shared/lib/plans.ts`. The upgrade link is `/account/billing?change=plan` for `billing:manage`, else "Ask an owner to upgrade."
- **Seeding:** `bun run dev:seed-scenario` (`Sinwy.Backend/scripts/dev/seedScenario.ts`, `scenarios` list; `activate` hard-codes `plan: "starter"`). Plan changes are simulated with `bun run dev:simulate-polar-webhook` (`subscription.updated` is supported).
- **Shared page contracts (phase 1):** `createPageSchema`, `updatePageSchema` (partial `pageDetailsSchema`; empty SEO strings → store null), `savePageContentSchema`, `pageSlugSchema`, DTOs `PageListDto`/`PageDetailDto`/`PublicPageDto`, `PAGE_TEMPLATES[id].build(profile)` (pass `EMPTY_ORGANIZATION_PROFILE` when there's none), `BLOCK_TYPES[type].requires`, `blockTypesIn(content)` for the premium-block check, `limitsFor(plan).pages`. Tables `page` / `page_content` in `db/schema/pageSchema.ts`; unique index `page_organization_slug_uidx` is the slug clash to map to a field error.
- **Shared has no tests of its own:** `@sinwy/shared` contract tests run from the backend (`modules/pages/tests/pageContracts.test.ts`).
- **Backend HTTP tests** build an app with only the routes they need and use the helpers in `Sinwy.Backend/test/helpers.ts`: `createUserWithSession`, `insertOrganization`, `givePlan`, `holdSlot`, `activateOrganization`, `joinOrganization`. See `modules/services/tests/services.test.ts`.

---

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

## Phase 3: Publish, unpublish and the public page endpoint

**Goal:** writers can publish and unpublish a page, and anyone can read a live published page by organization slug and page slug.

**Files:**
- `Sinwy.Backend/modules/pages/` (from phase 2): `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`.
- `modules/organizations/service.ts` + `index.ts` — a public-plan lookup by slug (see Standing notes; don't touch `PublicOrganization`).

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

## Phase 4: Pages list, create flow and limit UI (web)

**Goal:** members see their pages with status, last edited and public link, and writers create a page from a template picker that respects plan gates and the page limit.

**Files:**
- `src/modules/org-dashboard/lib/page-queries.ts` (new; pattern: `service-queries.ts`).
- `src/modules/org-dashboard/routes/_shell.pages.index.tsx` (replace the empty state), new `_shell.pages.new.tsx`.
- `src/modules/org-dashboard/components/pages/` (new): list table, template picker, usage meter.
- `src/shared/lib/plans.ts` — a `minimumPlanForPages(count)` helper beside `minimumPlanFor`.
- `src/shared/components/UpgradePrompt.tsx` — reuse its owner/non-owner action for a limit variant rather than copying it.

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

## Phase 5: Page detail, publish toggle and preview (web)

**Goal:** writers edit a page's title, slug and SEO, publish and unpublish it, and preview the draft; the content area is a placeholder the builder drops into.

**Files:**
- `src/modules/org-dashboard/routes/_shell.pages.$id.tsx` (replace the empty state), new `_shell.pages.$id.preview.tsx`.
- `src/modules/org-dashboard/lib/page-queries.ts` (from phase 4).
- `src/modules/org-dashboard/components/pages/` — metadata/SEO form, publish card, content placeholder.
- `src/shared/components/page-content/PageRenderer.tsx` (new, Default 14).

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

## Phase 6: Public page route with SSR and SEO (web)

**Goal:** `/<orgSlug>/<pageSlug>` renders a live published page on the server with its SEO title and description in the HTML head.

**Files:**
- `src/modules/storefront/routes/route.tsx` — move `ssr: false` off the layout (see Standing notes); put it on `index.tsx` and `book.tsx` if they still need it, after checking why the layout had it (introduced in `4998ed1`).
- New `src/modules/storefront/routes/$pageSlug.tsx`, `src/modules/storefront/lib/storefront-queries.ts` (a public page query).
- `src/shared/components/page-content/PageRenderer.tsx` (from phase 5).

**Steps:**
- The layout must render on the server without browser-only APIs; check `book.tsx` and the self-booking flow still behave the same.
- The route's `head` sets the resolved SEO title and description. A 404 from the API shows a "This page isn't available" empty state; the storefront's own unavailable state stays for `/<orgSlug>`.
- Static routes (`book`) still win over `$pageSlug`.

**Tests that matter:**
- None beyond phase 3's endpoint tests; the Verify covers SSR.

**Done when:** a live page's HTML from the server contains its content and meta tags, the storefront still works, and `bun run verify` passes.

**Verify:** Seed `pro-org`, log in as the owner, create and publish three pages (A, then B, then C) with SEO titles. `curl` `/<orgSlug>/<slugA>` → the HTML contains the page heading and `<title>` / meta description. Visit it signed out in the browser → renders. `/<orgSlug>/book` still opens the booking flow. Simulate a downgrade to Starter with `bun run dev:simulate-polar-webhook` (`subscription.updated`, plan starter) → A still renders, B and C show "This page isn't available", and the dashboard list marks B and C "Published, not live". Simulate the plan ending (organization inactive) → A also shows the unavailable state, with no change to the `page` rows. Polar is simulated; no email.

## Phase 7: Docs and code review

**Goal:** the rules are documented and the plan's work is reviewed for gating, access and deletion bugs.

**Files:**
- `docs/org-rules-map.md` — §1 Pages (the public page URL), §5 the page limits and `page-builder`'s scope, §9 inactive organizations' pages, plus the over-limit rule and the "Enforced in" paths.
- Everything changed in phases 1–6.

**Steps:**
- Update `org-rules-map.md` first, then review with the `/code-review` command at high effort. Focus: limit bypass (races, template/block gates), cross-organization access by id, draft content leaking through the public endpoint or the storefront DTO, inactive and scheduled-for-deletion organizations, and cascade behaviour on page and organization deletion.
- Fix confirmed findings in this phase's commit.
- Last step: stop every dev server started during the plan's work unless the user asked to keep it, and delete temporary files (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- A regression test for each confirmed finding.

**Done when:** the review's findings are fixed or recorded as accepted, the docs match the code, and `bun run verify` passes.

**Verify:** None.
