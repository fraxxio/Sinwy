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
