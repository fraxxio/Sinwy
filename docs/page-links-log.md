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
