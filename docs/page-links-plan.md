# Page links plan

Owners choose where a Button goes from plain choices (the booking page, one service's booking, another of the organization's pages, or a web address) instead of typing paths into a free-text Link field (issue #81). The field names the current target in words, existing documents keep working, and links to pages survive a page's address change. Done when an agent adds a Button that opens booking for one service, and another that opens a different page, without typing a path.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-links-log.md](page-links-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Service links pass the link rule; a shared link reader | – | done | `feat(shared): accept one service's booking as a Button link and read link targets` |
| 2 | Link picker: booking, one service, web address | 1 | done | `feat(web): choose a Button's link from booking, one service or a web address` |
| 3 | Page links by id, resolved on the server | 1 | done | `feat(backend, shared): serve a Button linked to another page by id as that page's current address` |
| 4 | "Another page" in the picker; editor and preview resolve page links | 2, 3 | todo | |
| 5 | Publish warns about links that go nowhere | 4 | todo | |
| 6 | Editor e2e test, usability check, docs and cleanup | 5 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **`isSafeLink` stays the single rule, widened twice.** The bare-path rule also accepts `book?service=<id>`, and a page link is stored as `page:<pageId>`. Stored values never contain the organization's slug or a page's slug, so they survive either changing.
- **Page links resolve on the server when a public page is read.** `getPublicPage` swaps each `page:<id>` for the target's address with one shared function, so the public response is complete and the storefront renders it with no lookup. Stored versions are never rewritten.
- **A Button whose page is deleted, unpublished or not live is hidden on the storefront.** The server drops it from the served content. The editor still shows it, and the picker names the problem.
- **"Another page" lists only live pages**, minus the page being edited.
- **Old Buttons holding a bare page slug aren't migrated.** The picker shows "Another page: <title>" when the slug matches a live page, and the next pick stores the id; otherwise the value shows as a web address. The storefront keeps resolving them as bare paths.
- **Web address is one free-text field.** It takes anything `isSafeLink` accepts and adds `https://` to a bare domain such as `example.com`. Existing `tel:`, `mailto:`, `#section` and unknown bare-path values show there as stored.
- **Public pages stay cacheable.** Everything a public page shows is computed on the server from organization data during the read, so its HTML is rendered on the server with every link in it, and could be cached and cleared per organization when a page, the organization's address or branding, a service or the plan changes. Don't add anything that resolves a public page's content in the browser, or that depends on data outside that list. Building the cache is not part of this plan.

### Defaults (not yet confirmed; change only if asked)

1. `?service=<id>` is accepted only after `book`, with `<id>` made of `[\w-]+` and no other query parameters. `page:<id>` takes the same id characters.
2. The picker lists active services only (what `EditorServicesContext` already holds). A Button whose service is inactive or deleted shows "A service you no longer offer" and keeps its value until the owner picks another. The storefront still links it: the booking route falls back to choosing a service.
3. Switching to "Web address" clears the link; switching to "One service's booking" picks the first active service; switching to "Another page" picks the first live page; switching to "Booking page" writes `book`.
4. Publish warnings for links are warnings, like the existing ones: Publish still goes ahead.
5. The dashboard preview shows what customers would see: it resolves page links the same way and drops Buttons to pages that aren't live.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- `Sinwy.Shared/types/page/PageUrls.ts` has `isSafeLink` (accepts `book?service=<[\w-]+>` and `page:<[\w-]+>`), `linkTarget(href)` → `{ kind: "booking" } | { kind: "service", serviceId } | { kind: "page", pageId } | { kind: "web", href }`, `bookingLink(serviceId?)`, `pageLink(pageId)` and `webAddress(text)`. `example.com` alone still fails `isSafeLink`; only `webAddress(...)` output passes. Their pure tests are in `Sinwy.Backend/modules/pages/tests/pageUrls.test.ts` (Shared has no test runner).
- `pageLinksIn(content)` and `resolvePageLinks(content, addresses)` (`addresses`: `Map` page id → slug) are in `Sinwy.Shared/types/page/PageDocument.ts`. The resolved `href` is the bare slug, which `resolveHref` prefixes with the org. A block whose link isn't in the map is dropped and its parent stays (an emptied Section renders empty). Tests: `pageDocument.test.ts` "page links".
- `getPublicPage` serves `withPageLinks(...)`, whose one query is `findServedPageSlugs` in the pages repository. The public response holds no `page:` values (checked in SSR HTML and the dehydrated state).
- The Button's `href` is a `field.link` (`Sinwy.Shared/types/page/blocks/fields.ts:155`), validated server-side by `url(isSafeLink, …)` (`fields.ts:88`), which also accepts `""`. Manifest: `blocks.ts:134`, label "Link", default `book`, `required: true` (publish already warns "Has no link" when empty).
- The storefront renders Buttons with `resolveHref` (`Sinwy.WebFrontend/src/shared/components/page-builder/urls.ts`): a safe href passes through, any other `isSafeLink` value is prefixed with `/<orgSlug>/` (tested for `book?service=<id>`). A Button whose href doesn't resolve renders an `<a>` with no `href`.
- A content save within the same checkpoint updates the latest `page_content` row instead of adding one; count rows before and after rather than expecting a fixed number. The saved version is `latestVersion.version` on `PageDetailDto`.
- The storefront booking route (`book.tsx:42`, `:128`) reads `service` from the search; an unknown or inactive id falls back to the "Choose a service" step, never an error.
- Service ids are UUIDs (text primary key). Page slugs match `^[a-z0-9]+(-[a-z0-9]+)*$` and can't be `book` or `s` (`RESERVED_PAGE_SLUGS`, `Sinwy.Shared/types/page/Page.ts:17`).
- Puck renders the stored document in the editor canvas, so the canvas can't use server-resolved content: the Button render there has to look `page:<id>` up from Puck `metadata` (`PageMetadata` and `pageMetadata` in `src/shared/components/page-builder/blocks.tsx:18`).
- Puck doesn't pass `metadata` to fields, so data reaches a field through React context: `EditorServicesContext` (`page-editor/editor-fields.tsx`) is provided in `PageEditor.tsx:62` from `metadata.services`, which the edit route already filters to active services.
- The link picker is `linkField` in `page-editor/link-field.tsx`, registered as `customFields.link` in `editor-config.tsx`. Its pure parts are in `page-editor/links.ts`: `LINK_CHOICES`, `LinkChoice` (= `LinkTarget["kind"]`), `describeLink(target, services)` → `{ choice, words }` and `typedWebLink(text)` (`null` when refused, `""` for empty). Tests: `tests/page-editor-link-field.test.ts`. For now `describeLink` handles the page kind with `case "page": case "web":`, so a `page:` value shows as a web address; Phase 4 replaces that.
- The web address input syncs its text from the stored value only while it isn't focused (as Puck's own inputs do) and is keyed by block id; a refused text stays on screen with an inline message while the stored value is unchanged.
- In the running editor the Link select is `combobox "Link opens"`, the service select `combobox "Service"`, the input is labelled "Web address". Services come ordered by name, so "first active service" (Default 3) is the first alphabetically. Block drawer cards are found with `getByTestId('drawer-item:<Block>')`.
- `pagesQuery` (`src/modules/org-dashboard/lib/page-queries.ts`) returns `PageListItemDto` items with `id`, `title`, `slug`, `status` and `live`. The edit route (`routes/_shell.pages.$id.edit.tsx`) loads `pageQuery` and `servicesQuery` and waits for both before mounting the editor.
- Seeds: `pro-org` (Professional, 5 pages) has no services; create them with `POST /api/organizations/<id>/services` `{ name, durationMinutes, priceMinor }`. `bookable-org` is on Starter and seeds "Haircut" and "Colouring". Image and Button blocks can't be top-level: put them inside a Section.
- Editor e2e: `bun run test:editor` needs `bun run start:server` (:3001) and `bun run start:web` (:3000). `e2e/global-setup.ts` seeds four `pro-org`s and one Starter org into `Stack`; helpers (`editorFor`, the `pages` fixture with `create`/`publish`/`saved`) are in `e2e/editor-fixtures.ts`. A test that needs a second live page should get its own seeded org.
- The backend (`bun run index.ts`, :3001) doesn't reload on changes: restart it after backend edits, asking the user first (stopping it needs their permission). Since Phase 3 it logs to `/tmp/sinwy-phase3/server.log`; the web server (:3000, vite) logs to `/tmp/sinwy-phase2/web.log`. Seeded orgs and scratch files from Phases 2 and 3 are in those folders, for Phase 6's cleanup.
- Known editor issues an agent may hit: #88 (Add with a Section selected nests the block inside it) and #89 (a click on a block announces a drop and enables Undo).

---

## Phase 4: "Another page" in the picker; editor and preview resolve page links

**Goal:** an owner points a Button at another live page by choosing it from a list, and the editor canvas and the dashboard preview link it the way customers will see it.

**Files:**
- `src/modules/org-dashboard/components/page-editor/links.ts`: `LINK_CHOICES`, and `describeLink`, which takes the live pages as a new argument and gives the page kind its own branch (now shared with `web`). Write links with `pageLink(id)` from `@sinwy/shared`. Tests: `src/modules/org-dashboard/tests/page-editor-link-field.test.ts`.
- `page-editor/link-field.tsx`: `LinkPicker`, with `ServicePicker` as the pattern for a page select and for the disabled-choice hint.
- `page-editor/editor-fields.tsx`: a pages context next to `EditorServicesContext`; `PageEditor.tsx:62` provides it.
- `routes/_shell.pages.$id.edit.tsx`: load `pagesQuery` alongside `pageQuery` and `servicesQuery`; pass live pages (`live: true`) minus the current one.
- `Sinwy.WebFrontend/src/shared/components/page-builder/blocks.tsx`: `PageMetadata` (`:18`), `pageMetadata` (`:24`) and the Button render (`:226`).
- `routes/_shell.pages.$id.preview.tsx` (`PageDocumentView` at `:90`, given `latestVersion.content`) and `PageDocumentView.tsx`: apply `resolvePageLinks` from `@sinwy/shared` with a `Map` of live page id → slug (Default 5). `src/shared/tests/page-document-view.test.ts` already renders resolved content; extend it there.

**Steps:**
- The "Another page" choice opens a select of live pages by title. The words read "Another page: About us"; a `page:<id>` that isn't in the list reads "A page that isn't live"; a bare slug that matches a live page reads "Another page: <title>" and the next pick stores `page:<id>` (Decisions).
- In the canvas, the Button render looks `page:<id>` up in the addresses carried by `PageMetadata` (built from the same live pages); an unknown id renders the Button with no link, still visible and selectable. The storefront never takes this path, because its content is already resolved.
- With no other live page, "Another page" is disabled with a hint to publish one.

**Tests that matter:**
- `describeLink` for `page:<live>`, `page:<not live>`, a bare slug that matches a live page and one that doesn't.
- The preview drops a Button to a page that isn't live, and the canvas keeps it.

**Done when:**
- An owner points a Button at another page with clicks only; a reload shows "Another page: <title>".
- `bun run verify` passes.

**Verify:** Seed `pro-org`, log in as its owner. Create and publish "About us"; create "Draft page" and leave it unpublished. Open a third page in the editor, add a Section and a Button inside it. Choose "Another page": the list shows About us but not Draft page or the page being edited. Pick About us: the field reads "Another page: About us", and the saved `href` is `page:<About us id>`. Open the preview: the Button links to `/<org>/about-us`. Unpublish About us and reopen the editor: the field reads "A page that isn't live", the canvas still shows the Button, and the preview doesn't. Nothing is simulated.

---

## Phase 5: Publish warns about links that go nowhere

**Goal:** Publish lists Buttons that open a service no longer offered or a page that isn't live or doesn't exist, as warnings (Default 4).

**Files:**
- `page-editor/publish-checks.ts`: `publishIssues(content, blocks)`, `problemWith`; it needs the active services and live pages passed in.
- Its callers in `PublishControls.tsx` / `PublishIssuesDialog.tsx` (find with `grep -n publishIssues`).
- `src/modules/org-dashboard/tests/page-editor-publish-checks.test.ts`.
- The services and pages contexts and `describeLink` from Phases 2 and 4.

**Steps:**
- Reuse `linkTarget` and the picker's wording; problems read like the existing ones ("Opens booking for a service you no longer offer", "Opens a page that isn't live, so customers won't see it").
- Keep `publishIssues` pure: services and pages come in as arguments.

**Tests that matter:**
- One issue per broken Button, in reading order, through shown slots only; no issue for `book`, an active service, a live page or a web address.

**Done when:**
- Publishing a page with such a Button lists it and still publishes on confirm.
- `bun run verify` passes.

**Verify:** Seed `pro-org`, create two services and a second page, publish that page. In the editor, add a Button to "Colouring" and one to the second page, save. Deactivate "Colouring" (Services screen) and unpublish the second page, reopen the editor, click Publish: the dialog lists both Buttons with their problems; "Publish anyway" publishes (`page` row `status` = `published`). Nothing is simulated.

---

## Phase 6: Editor e2e test, usability check, docs and cleanup

**Goal:** the issue's Done-when is proven by a Playwright test and by a cold agent, and the plan is closed.

**Files:**
- `Sinwy.WebFrontend/e2e/editor.e2e.ts` (new `links` describe), `e2e/global-setup.ts` and `e2e/stack.ts` (an org of its own with services and a second live page), `e2e/editor-fixtures.ts`.
- This plan and its log; the issue (#81) checklist.

**Steps:**
- One test: add two Buttons inside a Section, point one at a service and one at another page by clicks only, save, reload, see both targets in words, publish, then check the storefront page's two `href`s.
- A cold agent runs the Verify flow below without being told the stored formats, and reports where it hesitated.
- Last step: stop every dev server started during the plan's work unless the user asked to keep it running, and delete temporary files (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- The e2e test above; it fails if any step needs typing a path.

**Done when:**
- `bun run test:editor` and `bun run verify` pass; the agent completes the task; the plan's Status is all done.

**Verify:** Seed `pro-org`, create two services and a second page "About us", publish it. Task for the agent: "On the Home page, add a button that opens booking for Colouring, and another that opens About us; publish." Check: the stored targets are `book?service=<Colouring id>` and `page:<About us id>`, the storefront page links to `/<org>/book?service=<Colouring id>` and `/<org>/about-us`, and the agent never typed a path. Nothing is simulated.
