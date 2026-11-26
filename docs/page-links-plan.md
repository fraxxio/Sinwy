# Page links plan

Owners choose where a Button goes from plain choices (the booking page, one service's booking, another of the organization's pages, or a web address) instead of typing paths into a free-text Link field (issue #81). The field names the current target in words, existing documents keep working, and links to pages survive a page's address change. Done when an agent adds a Button that opens booking for one service, and another that opens a different page, without typing a path.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-links-log.md](page-links-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Service links pass the link rule; a shared link reader | – | done | `feat(shared): accept one service's booking as a Button link and read link targets` |
| 2 | Link picker: booking, one service, web address | 1 | todo | |
| 3 | Page links by id, resolved on the server | 1 | todo | |
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

- `Sinwy.Shared/types/page/PageUrls.ts` now has `isSafeLink` (accepts `book?service=<[\w-]+>`), `linkTarget(href)` → `{ kind: "booking" } | { kind: "service", serviceId } | { kind: "web", href }`, `bookingLink(serviceId?)` and `webAddress(text)`. `example.com` alone still fails `isSafeLink`; only `webAddress(...)` output passes. `page:x` fails until Phase 3. Their pure tests are in `Sinwy.Backend/modules/pages/tests/pageUrls.test.ts` (Shared has no test runner).
- The Button's `href` is a `field.link` (`Sinwy.Shared/types/page/blocks/fields.ts:155`), validated server-side by `url(isSafeLink, …)` (`fields.ts:88`), which also accepts `""`. Manifest: `blocks.ts:134`, label "Link", default `book`, `required: true` (publish already warns "Has no link" when empty).
- The storefront renders Buttons with `resolveHref` (`Sinwy.WebFrontend/src/shared/components/page-builder/urls.ts`): a safe href passes through, any other `isSafeLink` value is prefixed with `/<orgSlug>/` (tested for `book?service=<id>`). A Button whose href doesn't resolve renders an `<a>` with no `href`.
- A content save within the same checkpoint updates the latest `page_content` row instead of adding one; count rows before and after rather than expecting a fixed number. The saved version is `latestVersion.version` on `PageDetailDto`.
- `getPublicPage` (`Sinwy.Backend/modules/pages/service.ts:339`) already reads data beyond the page's own content: the organization's branding, the plan's served set (`isServed`) and, when `listsServices(content)`, the active services. Page addresses are one more input of that kind.
- The storefront page route `src/modules/storefront/routes/$pageSlug.tsx` is server-rendered (its loader calls `publicPageQuery`). The booking route `routes/book.tsx:48` sets `ssr: false`, with no comment saying why.
- The storefront booking route (`book.tsx:42`, `:128`) reads `service` from the search; an unknown or inactive id falls back to the "Choose a service" step, never an error.
- Service ids are UUIDs (text primary key). Page slugs match `^[a-z0-9]+(-[a-z0-9]+)*$` and can't be `book` or `s` (`RESERVED_PAGE_SLUGS`, `Sinwy.Shared/types/page/Page.ts:17`).
- Puck renders the stored document in the editor canvas, so the canvas can't use server-resolved content: the Button render there has to look `page:<id>` up from Puck `metadata` (`PageMetadata` and `pageMetadata` in `src/shared/components/page-builder/blocks.tsx:18`).
- Puck doesn't pass `metadata` to fields, so data reaches a field through React context: `EditorServicesContext` (`page-editor/editor-fields.tsx`) is provided in `PageEditor.tsx:62` from `metadata.services`, which the edit route already filters to active services.
- Custom field UIs are keyed by field kind in `customFields` in `page-editor/editor-config.tsx` (now `{ serviceIds, image }`). Follow `serviceIdsField` (`editor-fields.tsx`): a `CustomFieldUi` whose `render` wraps `EditorField` and respects `readOnly`. The link field writes one prop, so plain `onChange` is one undo step.
- `pagesQuery` (`src/modules/org-dashboard/lib/page-queries.ts`) returns `PageListItemDto` items with `id`, `title`, `slug`, `status` and `live`. The edit route (`routes/_shell.pages.$id.edit.tsx`) loads `pageQuery` and `servicesQuery` and waits for both before mounting the editor.
- Seeds: `pro-org` (Professional, 5 pages) has no services; create them with `POST /api/organizations/<id>/services` `{ name, durationMinutes, priceMinor }`. `bookable-org` is on Starter and seeds "Haircut" and "Colouring". Image and Button blocks can't be top-level: put them inside a Section.
- Editor e2e: `bun run test:editor` needs `bun run start:server` (:3001) and `bun run start:web` (:3000). `e2e/global-setup.ts` seeds four `pro-org`s and one Starter org into `Stack`; helpers (`editorFor`, the `pages` fixture with `create`/`publish`/`saved`) are in `e2e/editor-fixtures.ts`. A test that needs a second live page should get its own seeded org.
- Known editor issues an agent may hit: #88 (Add with a Section selected nests the block inside it) and #89 (a click on a block announces a drop and enables Undo).

---

## Phase 2: Link picker: booking, one service, web address

**Goal:** an owner sets a Button's Link by choosing "Booking page", "One service's booking" (then a service) or "Web address", and the field names the current target in words.

**Files:**
- New `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/link-field.tsx`: `linkField: CustomFieldUi`.
- `page-editor/editor-config.tsx`: add `link: linkField` to `customFields`.
- `page-editor/editor-fields.tsx`: `EditorField`, `EditorServicesContext`, the `Select` usage in `fieldOverrides.select`, `serviceIdsField` as the pattern.
- `Sinwy.Shared/types/page/PageUrls.ts`: use `linkTarget`, `bookingLink`, `webAddress` and `isSafeLink` as they are; add nothing there for wording.
- New test `src/modules/org-dashboard/tests/page-editor-link-field.test.ts` for `describeLink`.

**Steps:**
- One "Opens" select with the three choices, then a second control for the choice: a service select, or a text input for the web address. Switching choices follows Default 3. Leave room for the "Another page" choice that Phase 4 adds.
- The words come from one pure function (`describeLink(target, services)`) used by the select trigger: "Booking page", "Booking: Haircut", "A service you no longer offer" (Default 2), "Web address".
- The web address input keeps its own text while typing and writes `webAddress(text)` only when the result passes `isSafeLink`; otherwise it shows an inline message and writes nothing, so autosave never sends a value the server refuses. Reset the local text when the selected block changes (key it by block id).
- With no active services, "One service's booking" is disabled with a hint to add services.
- Respect `readOnly` on every control. The manifest label stays "Link".

**Tests that matter:**
- `describeLink` for `book`, `book?service=<active>`, `book?service=<gone>`, `https://x`, `tel:…`, `#prices`, `about-us` and `""`: each shows the expected choice and words, so documents saved before this plan open on the right choice.
- A typed bare domain is stored as `https://…`; typing a value that `isSafeLink` refuses never reaches the document.

**Done when:**
- An owner can point a Button at one service's booking with clicks only, and a reload shows "Booking: <service>".
- `bun run verify` passes.

**Verify:** Seed `pro-org`, log in as its owner with `dev:login-as`, create two services ("Haircut", "Colouring") through the API. Create a page, open it in the editor, add a Section and a Button inside it. In the Button's settings the Link shows "Booking page". Choose "One service's booking", pick "Colouring": the field reads "Booking: Colouring" and the page saves (`page_content` latest row: Button `href` is `book?service=<Colouring id>`). Choose "Web address", type `example.com`: after save the stored `href` is `https://example.com`. Type `javascript:x`: an inline message shows and the stored value doesn't change. Reload: the field shows the last choice in words. Nothing is simulated.

---

## Phase 3: Page links by id, resolved on the server

**Goal:** a document can store `page:<id>`, and the public page read serves it as a real link to the target's current address, or without the Button when the target isn't live.

**Files:**
- `Sinwy.Shared/types/page/PageUrls.ts`: `isSafeLink`, `linkTarget` (add the page kind).
- New shared `resolvePageLinks(content, addresses)` next to it, or beside the document walkers in `Sinwy.Shared/types/page/` (find them with `git grep -n "blocksIn" Sinwy.Shared Sinwy.Backend`).
- `Sinwy.Backend/modules/pages/service.ts`: `getPublicPage` (`:339`), `isServed`, `listsServices` and `blocksIn` (the existing pattern for loading what a page needs); the repository for a query of the organization's served pages by id.
- `Sinwy.Shared/types/page/Page.ts`: `PublicPageDto` (`:58`), expected unchanged.
- `Sinwy.Backend/modules/pages/tests/pages.test.ts` (`readPublic` helper, `:495`) and `tests/pageDocument.test.ts:226`.
- `Sinwy.WebFrontend/src/shared/tests/page-document-view.test.ts`.

**Steps:**
- `isSafeLink` accepts `page:<id>` (Default 1); `linkTarget` reads it as the page kind.
- `resolvePageLinks(content, addresses)` is pure: `addresses` maps page id to slug for the pages that may be linked. Each Button with `page:<id>` found in the map gets the bare slug, which `resolveHref` already prefixes with the org; a Button whose id isn't in the map is removed from its slot. Every other value passes through untouched, and the result still passes `pageDocumentSchema`.
- `getPublicPage` collects the page ids the content references and, only when there are any, loads those of the organization's pages that are live under the same rule `isServed` uses, in one query. Then it serves `resolvePageLinks(content, addresses)`. A page with no page links costs no extra query. An id from another organization is never in the map, so it never becomes a link.
- The storefront needs no change: the served content holds no `page:` values.
- Last step, after the phase is done: remind the product owner and ask whether to look into the storefront booking route (`src/modules/storefront/routes/book.tsx`, `ssr: false`) not being rendered on the server. Find out what needs the browser there and whether its services and first step could be loaded and rendered on the server, like public pages. Report what you found and ask before changing it; it's outside this plan.

**Tests that matter:**
- A published page with a Button to a live page serves `href` as that page's slug, and after the target's slug changes the same read serves the new slug, with no new version of the linking page.
- A Button to a page that is unpublished, deleted, not live after a downgrade, or belongs to another organization is absent from the served content; its siblings and parent stay, and stored versions are unchanged.
- A page with no page links runs no extra query (or at least returns the same content byte for byte).
- The rule refuses `page:`, `page:a b`, `page:<script>` and `page:x?y=1`.

**Done when:**
- The storefront page's server-rendered HTML contains `href="/<org>/<target-slug>"` for a page link, before any script runs.
- `bun run verify` passes.

**Verify:** Seed `pro-org`, log in as its owner. Through the API, create pages "Home" and "About us" (slug `about-us`), save Home with a Section holding two Buttons: one `page:<About us id>`, one `page:<random uuid>`. Publish both. Fetch `/<org>/home` with `curl` (no JavaScript): the HTML has one Button, linking to `/<org>/about-us`. Change About us's slug to `about` on its detail screen and fetch again: the link is `/<org>/about`, and Home's `page_content` rows are unchanged. Unpublish About us and fetch again: the Button is gone. Nothing is simulated.

---

## Phase 4: "Another page" in the picker; editor and preview resolve page links

**Goal:** an owner points a Button at another live page by choosing it from a list, and the editor canvas and the dashboard preview link it the way customers will see it.

**Files:**
- `page-editor/link-field.tsx` and `describeLink` from Phase 2; `tests/page-editor-link-field.test.ts`.
- `page-editor/editor-fields.tsx`: add a pages context next to `EditorServicesContext`; `PageEditor.tsx:62` provides it.
- `routes/_shell.pages.$id.edit.tsx`: load `pagesQuery` alongside `pageQuery` and `servicesQuery`; pass live pages minus the current one.
- `Sinwy.WebFrontend/src/shared/components/page-builder/blocks.tsx`: `PageMetadata`, `pageMetadata` and the Button render (`:226`).
- `routes/_shell.pages.$id.preview.tsx` and `PageDocumentView.tsx`: the preview applies `resolvePageLinks` (Default 5).

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
