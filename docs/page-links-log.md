# Page links log

Finished phases of the [page links plan](page-links-plan.md), with their specs and logs.

## Phase 1: Service links pass the link rule; a shared link reader

**Goal:** a document can store `book?service=<id>`, and one shared function tells which kind of target any stored link is.

**Files:**
- `Sinwy.Shared/types/page/PageUrls.ts`: `BARE_PATH`, `isSafeLink`; the new reader and helpers go here, next to the rule.
- `Sinwy.Shared` barrel that exports `isSafeLink` (find it with `git grep -n PageUrls Sinwy.Shared`).
- `Sinwy.Backend/modules/pages/tests/pageDocument.test.ts:226` ("Button links take safe hrefs and bare paths") and `:366` (refusal message).
- `Sinwy.WebFrontend/src/shared/components/page-builder/urls.ts` (`resolveHref`, expected unchanged).
- `Sinwy.WebFrontend/src/shared/tests/page-document-view.test.ts:122-135` (rendered hrefs).

**Steps:**
- Widen the rule per Default 1 for `book?service=<id>` only; `page:<id>` comes in Phase 3. Nothing else with `?` passes.
- Add `linkTarget(href)` returning one of: booking page (`book`), one service's booking (`book?service=<id>`, with the id), web address (everything else, including `""`, `tel:`, `mailto:`, `#…` and unknown bare paths). Phase 3 adds the page kind.
- Add the writers the picker needs: `bookingLink(serviceId?)` and `webAddress(text)`, which trims and adds `https://` when the text looks like a domain (has a dot, no scheme, no leading `/` or `#`).
- `resolveHref` needs no change; prove it with a test.

**Tests that matter:**
- The rule accepts `book?service=<uuid>` and refuses `book?service=`, `book?service=a&x=1`, `about?service=x`, `book?x=1` and a service id with `<`, `"` or spaces. A server save with `book?service=<uuid>` succeeds; with `book?service=<script>` it is refused with the existing message.
- `linkTarget` maps every value class above, including values saved before this plan.
- `webAddress` turns `example.com` and ` www.example.com/a ` into `https://…`, and leaves `https://`, `mailto:`, `tel:`, `#x` and `/x` alone.
- The storefront renders a Button with `book?service=svc-1` as `href="/acme/book?service=svc-1"`.

**Done when:**
- `bun run verify` passes with the new tests.

**Verify:** None.

### Log (2026-11-26, `feat(shared): accept one service's booking as a Button link and read link targets`)
- Shipped: `isSafeLink` accepts `book?service=<id>` (id `[\w-]+`, no other query); `linkTarget`, `bookingLink` and `webAddress` in `PageUrls.ts`. Pure tests in `Sinwy.Backend/modules/pages/tests/pageUrls.test.ts`; schema accept/refuse in `pageDocument.test.ts`; a real content save of `book?service=<uuid>` and a refused `book?service=<script>` in `pages.test.ts`; the storefront render of a service Button in `page-document-view.test.ts`. `resolveHref` unchanged.
- Differs from plan: `webAddress` treats only a scheme without dots as a scheme, so `example.com:8080/x` becomes `https://example.com:8080/x`. Pure tests for Shared live in the backend's page tests, as `richText.test.ts` already does.
- Checked in the running app: nothing (Verify was None).


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

### Log (2026-11-27, `feat(web): choose a Button's link from booking, one service or a web address`)
- Shipped: `linkField` (`page-editor/link-field.tsx`) in `customFields.link`: a "Link opens" select whose trigger shows `describeLink`'s words, then a service select or a web address input. Switching follows Default 3; "One service's booking" is disabled with a hint when there are no active services; every control respects `readOnly`. Tests for `describeLink` (all eight values) and `typedWebLink` in `tests/page-editor-link-field.test.ts`.
- Differs from plan: `describeLink` and `typedWebLink` live in a pure `page-editor/links.ts` (the pattern of `images.ts`, `uploads.ts`) so the test imports no React or Puck. `typedWebLink` also refuses addresses over the 2048-character limit, which the server would refuse too. Besides keying by block id, the web address input resyncs from the stored value when it isn't focused, so Undo updates it.
- Checked in the running app (subagent, real editor, saves and services API): default "Booking page"; picking Colouring saved `book?service=<Colouring id>` and read "Booking: Colouring"; `example.com` saved `https://example.com`; `javascript:x` showed the inline message and the stored row didn't change; reloads showed "Web address" and "Booking: Haircut". No console errors. Noted, as designed: switching to "Web address" saves `""` right away (Default 3; publish warns "Has no link"), and the refused text stays in the input until fixed.

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

### Log (2026-11-27, `feat(backend, shared): serve a Button linked to another page by id as that page's current address`)
- Shipped: `isSafeLink` accepts `page:<[\w-]+>`; `linkTarget` reads it as `{ kind: "page", pageId }`, `pageLink(id)` writes it. Pure `pageLinksIn(content)` (linked page ids through every slot) and `resolvePageLinks(content, addresses)` in `PageDocument.ts`, generic over every `link` field of the manifest: a linked id in the map becomes the bare slug, a block whose link isn't in the map is dropped, the input isn't mutated. `getPublicPage` serves `withPageLinks(...)`, which returns the content untouched when there are no page links and otherwise runs one query, `findServedPageSlugs(orgId, limit, ids)`, built on the same `servedPages` query as `findServedPageIds`. Tests: rule and reader (`pageUrls.test.ts`), walkers (`pageDocument.test.ts` "page links"), served content across rename, draft, delete, unpublish, downgrade, another org and an unknown id, plus byte-for-byte content with no page links (`pages.test.ts`), and the storefront render of resolved content (`page-document-view.test.ts`).
- Differs from plan: `describeLink` treats the page kind like a web address for now (the shared `case "page": case "web":`), so the picker type-checks until Phase 4 gives it its own choice. "No extra query" is checked through the early return and the byte-for-byte test, not a query counter. The booking route was looked into but not changed (see the report to the product owner below).
- Checked in the running app (subagent, real backend, web SSR and DB, `pro-org` `seed-8302ad81`): curl of `/<org>/home` had one Button, `href="/<org>/about-us"`, and no `page:` anywhere, including the dehydrated state; after the slug was changed to `about` on the page's detail screen it linked `/<org>/about`; after About us was unpublished the Button was gone and the Section stayed, empty. Home's one `page_content` row was byte-identical throughout. No errors in the server, web or browser logs. Not checked in the app: the downgrade and other-organization cases (integration tests only).
- Booking route `ssr: false`: the reason is in the public-pages log of 2026-11-07 (`7d91db2`): the route reads the session (`authClient.useSession`) and today's date in the org's timezone, which would mismatch on hydration. Both sit in later steps: the session only in the Confirm step, today's date only in the time step. The header and the "Choose a service" step use only `storefrontQuery` data, which the loader already fetches. So the route could render on the server with those two later steps kept to the browser (or with today's date passed from the loader). Reported to the product owner; not changed.
