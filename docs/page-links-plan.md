# Page links plan

Owners choose where a Button goes from plain choices (the booking page, one service's booking, another of the organization's pages, or a web address) instead of typing paths into a free-text Link field (issue #81). The field names the current target in words, existing documents keep working, and links to pages survive a page's address change. Done when an agent adds a Button that opens booking for one service, and another that opens a different page, without typing a path.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-links-log.md](page-links-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Service links pass the link rule; a shared link reader | – | done | `feat(shared): accept one service's booking as a Button link and read link targets` |
| 2 | Link picker: booking, one service, web address | 1 | done | `feat(web): choose a Button's link from booking, one service or a web address` |
| 3 | Page links by id, resolved on the server | 1 | done | `feat(backend, shared): serve a Button linked to another page by id as that page's current address` |
| 4 | "Another page" in the picker; editor and preview resolve page links | 2, 3 | done | `feat(web): point a Button at another live page, and resolve page links in the editor and preview` |
| 5 | Publish warns about links that go nowhere | 4 | done | `feat(web): warn on publish about Buttons that open a service no longer offered or a page that isn't live` |
| 6 | Editor e2e test, usability check, docs and cleanup | 5 | done | `test(web): prove a Button opens one service's booking and another page by clicks only` |

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

None: every phase is done and the plan is closed. Findings left open are in the Phase 6 log entry.
