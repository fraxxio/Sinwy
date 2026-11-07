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
| 5 | Page detail, publish toggle and preview (web) | 3, 4 | done | `feat(web): add the page detail, publishing and preview` |
| 6 | Public page route with SSR and SEO (web) | 3, 5 | done | `feat(web): add the public page route with SSR and SEO` |
| 7 | Docs and code review | 1–6 | done | `docs, fix(web): document the page rules and fix the pages review findings` |

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

Every phase is done. These are kept for the page builder project, which replaces the content placeholder.

- **Rules:** `docs/org-rules-map.md` §1 (public page URL), §5 (limits, `page-builder` scope, over-limit served set), §9 (inactive organizations' pages), §11 (cascades). Change it with any rule change.
- **Contracts** in `Sinwy.Shared/types/page/`: content tree (`pageContentSchema`, depth 5, 200 blocks), `BLOCK_TYPES` and `PAGE_TEMPLATES` with `requires`, DTOs, `RESERVED_PAGE_SLUGS` (add any new static child route of `storefront/routes/`). Limits in `types/plan/PlanLimits.ts` (`limitsFor`).
- **API** in `Sinwy.Backend/modules/pages/`: content saves are `PUT pages/:pageId/content` with `baseVersion` (409 `PAGE_VERSION_CONFLICT`), 256 KB cap (413); a premium block is refused only when the latest version lacks it. Served set: `findServedPageIds` (oldest published by `createdAt`, `id`). Tests in `modules/pages/tests/` (helpers in `pages.test.ts`).
- **Web:** `PageRenderer` (`src/shared/components/page-content/`) renders the MVP blocks for the dashboard preview and the SSR public route (`storefront/routes/$pageSlug.tsx`); it skips unknown types and unsafe URLs. Dashboard screens are `org-dashboard/routes/_shell.pages*.tsx` with `lib/page-queries.ts` and `lib/pages.ts`.
- **JSONB:** use `jsonb<T>()` from `@db/jsonb`, not Drizzle's own (double-encodes with Bun SQL).
- **Dev servers still running:** backend (`:3001`) and web (`:3000`) from phase 4, logs in `/tmp/sinwy-logs/`; phase 7 wasn't allowed to stop them. `.playwright-cli/auth/` still holds saved e2e logins.
