# CMS pages plan

Builds the management surface for an organization's public pages: a `pages` backend module with versioned content, publishing and a public read endpoint, plan limits, and the dashboard screens to list, create, edit and publish pages. The page builder itself is a separate project and later replaces the content placeholder built here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [cms-pages-log.md](cms-pages-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shared page contracts and the page tables | – | done | `feat(backend, shared): add page contracts and the page tables` |
| 2 | Pages API: list, create, edit, content, delete | 1 | done | `feat(backend, shared): add the pages API` |
| 3 | Publish, unpublish and the public page endpoint | 2 | done | `feat(backend): add publishing and the public page endpoint` |
| 4 | Pages list, create flow and limit UI (web) | 2 | done | `feat(web): add the pages list and create flow` |
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
- **Public page endpoint (phase 3):** `GET /api/public/organizations/:slug/pages/:pageSlug`, no auth → `PublicPageDto` (SEO already resolved: page title, then the org tagline), or 404 "This page isn't available" with the same body for every miss (unknown or inactive org, draft, over the limit). The org and its public plan come from `findPublicOrganizationPlan(slug)` in organizations.
- **Publish routes (phase 3):** `POST pages/:pageId/publish` and `.../unpublish` (`pages:write`) answer `PageDetailDto`. Publish pins the latest version and sets `publishedAt` to now (republishing moves it) but doesn't bump `updatedAt`; it never checks the limit.
- **Migrations** come from `bun run db:generate` (last one is `0024_pages.sql`; rename the generated file and its journal tag to match).
- **JSONB:** use the custom `jsonb<T>()` from `@db/jsonb`, not Drizzle's own, which double-encodes with Bun SQL.
- **TanStack Start SSR inheritance:** a child route can only be more restrictive than its parent. `src/modules/storefront/routes/route.tsx` (the `/$organizationSlug` layout) sets `ssr: false`, so a child page route can't render on the server until that flag moves off the layout. `api()` in `src/shared/lib/api.ts` already works on the server (forwards cookies to `BACKEND_URL`).
- **Plan UI helpers:** `PlanGate` and `UpgradePrompt` in `src/shared/components/` are feature-based; `UpgradeAction` (same file) is the owner/non-owner action alone (`/account/billing?change=plan` for `billing:manage`, else "Ask an owner to upgrade."). `useEntitlements()` gives `has(feature)`; `minimumPlanFor(feature)`, `minimumPlanForPages(count)` and `getPlanName` are in `src/shared/lib/plans.ts`.
- **Seed and plan changes:** `bun run dev:seed-scenario` (`Sinwy.Backend/scripts/dev/seedScenario.ts`; `pro-org` is the Professional owner). Plan changes are simulated with `bun run dev:simulate-polar-webhook` (`subscription.updated` is supported).
- **Shared page contracts (phase 1):** `createPageSchema`, `updatePageSchema` (partial `pageDetailsSchema`; the API stores empty SEO strings as null), `pageSlugSchema`, DTOs `PageListDto`/`PageDetailDto`/`PublicPageDto`, `PAGE_TEMPLATES` / `PAGE_TEMPLATE_IDS` with `requires`, `limitsFor(plan).pages`. Tables `page` / `page_content` in `db/schema/pageSchema.ts`.
- **Pages API (phase 2)**, `Sinwy.Backend/modules/pages/`: routes under `/api/organizations/:organizationId/pages`. Writes answer the full `PageDetailDto` (DELETE answers `null`). Error codes: 409 `ORGANIZATION_INACTIVE`, 409 `PAGE_LIMIT_REACHED`, 402 `PLAN_UPGRADE_REQUIRED`, 409 `PAGE_SLUG_TAKEN` (map it to the slug field with `showFieldError` from `src/shared/lib/form.ts`), 409 `PAGE_VERSION_CONFLICT`, 413 for content over 256 KB, 400 with the first Zod message (e.g. a reserved slug). `respondError` in `controller.ts` maps the service's `PageError`.
- **Served set:** `findServedPageIds(organizationId, limit)` in `modules/pages/repository.ts` (oldest published by `createdAt`, `id`; empty set for limit 0). The dashboard passes `limitsFor(membership.plan)`, the public endpoint the public plan. `isSlugClash(error)` detects the slug unique violation (Drizzle puts the Postgres error fields on `cause`).
- **Shared has no tests of its own:** `@sinwy/shared` contract tests run from the backend (`modules/pages/tests/pageContracts.test.ts`).
- **Backend HTTP tests** build an app with only the routes they need and use the helpers in `Sinwy.Backend/test/helpers.ts`. `modules/pages/tests/pages.test.ts` has `seedOrg(name, plan)`, `create`, `save`, `setPlan` (`givePlan` on the owner, `null` ends the plan), `publish` (the route) and `readPublic(pageSlug, orgSlug)`; a test org's slug is its id. Inactive: clear `organization.slotHeldAt`.
- **Dashboard pages UI (phase 4):** `lib/page-queries.ts` has `pageKeys` (`all`/`list`/`detail`), `pagesQuery`, `createPage`; a create seeds `pageKeys.detail` with the returned `PageDetailDto` and navigates to `pages/$id`. `lib/pages.ts` has `slugFromTitle`, `pageState` / `PAGE_STATE_LABELS` (live, "Published, not live", draft), `isAtPageLimit`, `publicPagePath`. Components in `components/pages/`: `PagesTable`, `TemplatePicker`, `PageUsageMeter`, `PageLimitNotice`, `NewPageForm` (API error handling pattern: inactive → `handleOrganizationInactive`, `PAGE_SLUG_TAKEN` → `showFieldError`). The table's public link is a plain `<a href>`, since the `$pageSlug` route doesn't exist until phase 6. The dashboard shell is `ssr: false`, so relative times need no hydration care.
- **E2E:** the template radios are `sr-only`; click the card text (`getByText('About', { exact: true })`), not `getByRole('radio')`. Seed output prints `organization.plan: null` even for paid scenarios; the limits are still right.
- **Dev DB leftovers:** `pro-org` `seed-079f9ae5` (draft `welcome`), Starter `seed-1adfd7aa` (draft `about-us`), and from phase 4's Verify `seed-0f754101` (Starter), `seed-e9895eba` (Pro, `welcome-home` from `landing`), `seed-af256e02` (staff org). Seed fresh orgs rather than reusing them.
- **Dev servers (phase 4):** backend and web were started with logs in `/tmp/sinwy-logs/server.log` and `web.log`; phase 7 stops them.

---

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
