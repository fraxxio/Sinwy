# Page document log

Finished phases of the [page document plan](page-document-plan.md), each with its spec and log entry.

## Phase 1: Rich text allowlist in Shared

**Goal:** Shared can parse any HTML string into a tree of allowlisted nodes and serialise that tree back to canonical HTML. The server and the storefront use this one implementation.

**Files:**
- New: `Sinwy.Shared/types/page/RichText.ts`, exported from `Sinwy.Shared/types/page/index.ts`.
- Reference only: the spike's `Sinwy.WebFrontend/src/shared/components/page-builder/rich-text.tsx` (tag maps, drop-with-content set, entity decoding, implicit closing of `p` and `li`) and `Sinwy.Shared/types/page/PageUrls.ts` on `pagebuilder-tryout`.
- The current safe-URL regex: `SAFE_URL` in `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx:22`. Its consumers move to Shared in phase 3.
- New test: `Sinwy.Backend/modules/pages/tests/richText.test.ts`.

**Steps:**
- Export `parseRichText(html): RichTextNode[]` and `serializeRichText(nodes): string`, with `normalizeRichText = serialize ∘ parse`. Use no DOM and no dependency, so the same code runs in Bun and in the browser.
- Handle tags this way:
  - Map aliases: `b` → `strong`, `i` → `em`.
  - Unwrap unknown tags and keep their text.
  - Drop `script`, `style`, `iframe`, `noscript`, `template`, `textarea`, `title`, `svg` and `math` together with their content.
  - Keep no attributes except a safe `href` on `a`, plus a `target="_blank"` flag.
  - Wrap stray top-level text and inline content in `p`.
  - Close an open `p` or `li` the way HTML does.
- Put the link rule (`isSafeHref`) in a small Shared `PageUrls.ts`, together with an `isSafeImageSrc` for the manifest's image kind (http(s) or root-relative). Phase 3 points the web app's URL helpers at these.
- Normalising twice must give the same result as normalising once. The output must contain nothing outside the allowlist.
- Give `RichTextNode` a plain discriminated-union type. The web renderer in phase 3 switches on it.

**Tests that matter:**
- `<script>`, `onerror=`, `style=`, and `javascript:`, `JaVaScRiPt:` and entity-encoded `javascript:` links never survive.
- Unclosed tags, stray `</p>`, nested lists, entities (named and numeric) and text outside any block normalise to valid allowlisted HTML.
- Idempotence over every fixture: `normalize(normalize(x)) === normalize(x)`.
- The HTML Puck's richtext field produces (`<p>`, `<strong>`, `<ul><li><p>`, auto-linked `<a href target rel>`) is preserved.

**Done when:**
- The tests pass and nothing outside Shared imports the module yet.

**Verify:** None.

### Log (2026-11-18, `feat(shared): add rich text allowlist for page documents`)
- Shipped: `Sinwy.Shared/types/page/RichText.ts` (one-pass tokenizer, HTML-like tree builder, canonicalising pass, serializer) and `PageUrls.ts` (`isSafeHref`, `isSafeImageSrc`), both exported from `@sinwy/shared`. `Sinwy.Backend/modules/pages/tests/richText.test.ts` has 125 cases: XSS vectors, malformed HTML with exact expected output, Puck output kept byte for byte, idempotence over every fixture, the depth cap, linear time on unterminated markup and the URL rules.
- Differs from plan:
  - The spike's regex tokenizer was replaced by a hand-rolled linear one. The regex is quadratic on unterminated tags such as `<a <a <a …`. As in HTML, an unterminated tag, comment or raw-text element (`<script>` with no close) ends the input.
  - Nesting is capped at 16 levels. Bun's stack overflows at about 50k levels of `<b>`, and the 256 KB body allows 85k. The builder ignores deeper tags (it keeps their text), and the output pass flattens anything at depth 16 to text. A list or quote at that depth becomes a `p`. Idempotence holds past the cap.
  - Block-like unknown tags (`div`, `section`, `h1`, `h4`–`h6`, `pre`, `hr`, table cells, …) are unwrapped like other unknown tags, but still start a new paragraph. Otherwise pasted `<div>a</div><div>b</div>` would merge into "ab".
  - Canonical shape: stray inline content in the root, a quote or a mixed `li` goes into a `p`; stray `li`s go into a `ul`; non-`li` content in a list goes into an `li`. An `li` with both text and a nested list becomes `<li><p>…</p><ul>…</ul></li>`, which is Tiptap's shape. Empty inline elements and empty lists are dropped. Empty `p`, `li` and headings are kept.
  - Stored links keep only `href` and `target="_blank"`. Tiptap's `rel="noopener noreferrer nofollow"` is dropped, and the renderer adds `rel`. A link with an unsafe `href` is unwrapped and keeps its text. A nested `a` closes the open one, as in HTML.
  - Raw NUL characters and invalid numeric entities become U+FFFD, because Postgres `jsonb` rejects `\u0000`. A small set of named entities is decoded (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`, typographic quotes and dashes, `hellip`, `copy`, …). Other named entities stay literal text.
  - `isSafeHref` follows the Decision's rule exactly, so bare paths like `book` are refused (Standing notes cover `field.link`).
- Checked in the running app: nothing; the phase has no Verify and no route uses the module yet. Checked in Bun that Zod 4 skips `.transform` after a failed `.max()`.

## Phase 2: Block manifest and document schema

**Goal:** the eight first-set blocks are each defined once in Shared, and that definition yields their Zod schemas, prop types, slot `allow` lists, defaults and gating. A document validator walks the tree with limits and errors a user can read. A migration runner applies props-only migrations.

**Files:**
- New: `Sinwy.Shared/types/page/blocks/` with:
  - the field kit (`field.text`, `field.select`, `field.richText`, `field.link`, `field.image`, `field.slot({ allow })`, plus custom kinds such as `field.serviceIds`)
  - `defineBlock`
  - one file per block, or one file for the whole set (split only if it gets long)
  - `BLOCKS` and `ROOT_ALLOW`
- New: `Sinwy.Shared/types/page/PageDocument.ts` with:
  - `PAGE_DOCUMENT_LIMITS`
  - `pageDocumentSchema` (envelope, Default 1)
  - the walker
  - `migrateDocument`
  - `blocksIn` (type set and count)
- Export both from `Sinwy.Shared/types/page/index.ts` (which already exports `PageUrls` and `RichText`).
- Use from phase 1: `normalizeRichText` (`RichText.ts`), `isSafeHref` and `isSafeImageSrc` (`PageUrls.ts`). Add the bare-path link check to `PageUrls.ts` (Standing notes).
- Leave the v1 `PageContent.ts` alone: both models live side by side until phase 4.
- Reference: the spike's `Sinwy.Shared/types/page/PuckContent.ts` (`BLOCKS`, `checkBlocks`, `migrateBlocks`, `eachBlock`, `nodeSchema`).
- New test: `Sinwy.Backend/modules/pages/tests/pageDocument.test.ts`. `richText.test.ts` next to it shows the import style.

**Steps:**
- Each field kind carries:
  - its Zod schema, with limits from `PAGE_DOCUMENT_LIMITS` (text ≤ 200, rich text ≤ 20 000 and normalised through phase 1 with a Zod `transform`, URL ≤ 2048 and checked with `isSafeHref`/`isSafeImageSrc`, ids ≤ 64, service ids ≤ 50)
  - plain editor metadata: label, kind, options with labels, `locked`
  
  Slots carry `allow`, a list of block type names.
- `defineBlock` infers the props type from the fields: slot props are child lists, and every other prop is optional with the definition's default. Derive the per-block strict Zod object without `id` and the slots. Export `BlockType` and `BlockProps<T>`.
- First set (Decisions), nesting (Default 2), Columns (Default 3), and Services props: `title`, `intro` and `serviceIds` (empty means all, in the chosen order).
- Validator (a `superRefine` on `content`, so no schema recurses), which refuses:
  - an unknown type
  - bad or unknown props
  - a slot that isn't a list
  - a type that its slot's `allow` doesn't include, or that `ROOT_ALLOW` doesn't include at the top level
  - a duplicate id anywhere in the tree
  - depth over 6
  - more than 400 blocks
  
  Stop walking once a limit is hit. Each message names the block type, its position and the field, for example `Heading at Section 2 › items › 1: "text" is longer than 200 characters` or `Hero can't go inside Section`.
- Migrations: `BLOCK_MIGRATIONS` is a per-type ordered list of `(props) => props`. `migrateDocument` applies them through all slots before validation (`z.preprocess`), and leaves non-blocks and over-deep subtrees alone. Take the registry as a parameter with `BLOCK_MIGRATIONS` as its default, so tests can pass their own. It ships empty (Default 5).
- No Puck import anywhere in Shared.

**Tests that matter:**
- Every block's defaults validate. A full salon document (every block, nested to the allowed depth) round-trips through `pageDocumentSchema` unchanged except for rich-text normalisation.
- Each of these is refused with a message naming the block: unknown type (nested), bad prop, unknown prop, a disallowed child (Hero in Section, Section in Columns, Button at the top level), a duplicate id across slots, depth 7, 401 blocks, `javascript:` in a Button and in rich text, and an unsafe image src.
- 400 blocks are accepted and 401 are refused.
- Migrations: a test-only rename migration upgrades an old-shape block nested in a slot. Applying it twice equals applying it once. An already-current document is unchanged.

**Done when:**
- `pageDocumentSchema` and `BLOCKS` are exported from `@sinwy/shared`, and the tests pass.

**Verify:** None.

### Log (2026-11-18, `feat(shared): add page block manifest and document schema`)
- Shipped:
  - `Sinwy.Shared/types/page/blocks/fields.ts`: `PAGE_DOCUMENT_LIMITS`, `BlockNode`, `BlockTemplate`, the field kit (`field.text`, `select`, `richText`, `link`, `image`, `slot`, and the custom `serviceIds`), `isSlotField`, `defineBlock` and `PropsOf`.
  - `blocks/blocks.ts`: the eight blocks, `BLOCKS`, `BlockType`, `BlockProps<T>`, `ROOT_ALLOW` and an empty `BLOCK_MIGRATIONS`.
  - `PageDocument.ts`: `createPageDocumentSchema(manifest?)`, `pageDocumentSchema`, `PageDocument`, `emptyPageDocument()`, `migrateDocument`, `migrateProps` and `blocksIn`.
  - `PageUrls.ts`: `isSafeLink` (a safe href or a bare path).
  - `Sinwy.Backend/modules/pages/tests/pageDocument.test.ts`: 31 tests.
- Differs from plan:
  - `PAGE_DOCUMENT_LIMITS` lives in `blocks/fields.ts`, not `PageDocument.ts`, because defining it there would make an import cycle. It also holds `maxBytes` (256 KB) for the controller.
  - The walker is a `.transform` on `content`, not a `superRefine`. One walk both checks and returns each block's parsed props, so the stored rich text is the normalised one. No schema recurses.
  - The schema comes from `createPageDocumentSchema({ blocks, rootAllow, migrations })`, with the real manifest as the default. The real allow lists stop at depth 3 (Section › Columns › leaf), so the depth-7 test uses a test-only self-nesting `Box` block. Phase 5's gated test block can use the same factory.
  - `javascript:` in rich text is not refused. The Decision says nothing pasteable is refused, so normalisation drops the link and keeps its text. The test checks that. Button `href` and image src are refused.
  - The envelope accepts an empty `zones` and drops it, because Puck saved `zones: {}` in the spike's rows. Node keys other than `type` and `props` are dropped; the spike's rows had `readOnly`. Root `props` is a strict empty object and defaults to `{}`.
  - Text, link and image values have NUL stripped. Ids containing NUL are refused. `""` is valid for link and image and means none.
  - Hero ships default slot content (Heading, RichText, Button) as `BlockTemplate`s without ids. The Services `intro` is rich text.
  - Message format: `<where>: <problem>`, where `<where>` is `Section 2` at the top level and `Heading at Section 2 › items › 1` when nested. Deeper levels name each ancestor (`… › items › Columns 1 › column2 › 1`). Other messages: `Unknown block type "X" at …`, `Hero can't go inside Section (…)`, `Button can't go at the top level of a page (Button 2)`, `A page holds at most 400 blocks`, `…: blocks nest at most 6 levels deep`.
  - `isSlotField` exists because a custom field's `kind` is any string, so `kind === "slot"` alone doesn't narrow the type.
- Checked in the running app: nothing. The phase has no Verify. The dev database confirmed the spike's v2 rows hold `zones: {}`, node `readOnly`, and root props `radius` and `spacing`.

## Phase 3: Puck config adapter and storefront renderer

**Goal:** the web app turns the manifest into a Puck config and renders a document on the server through `@puckeditor/core/rsc` with our rich-text renderer. Nothing routes to it yet.

**Files:**
- `Sinwy.WebFrontend/package.json`: add `"@puckeditor/core": "0.24.0"` (exact).
- New: `Sinwy.WebFrontend/src/shared/components/page-builder/` with:
  - `puck-config.ts`: the adapter `puckConfigFrom(BLOCKS, customFields?)`, reading each block's `fields`, `defaults`, `label` and `ROOT_ALLOW` (Standing notes, Manifest)
  - `blocks.tsx`: the render components for the eight blocks, typed with `BlockProps<T>`
  - `rich-text.tsx`: `RichText` renders `parseRichText(html)` to React elements
  - `PageDocumentView.tsx`: `<Render>` with `transformProps` built from `BLOCK_MIGRATIONS` through `migrateProps`, `fieldTransforms.richtext` and `metadata`
- `Sinwy.WebFrontend/src/shared/lib/branding.ts`: `brandAttributes`, `BRAND_FONT_FAMILIES`.
- URL helpers: `resolveHref` and `imageSrc` in `page-content/PageRenderer.tsx:25-35` (deleted in phase 4) move next to the renderer and build on `isSafeLink`/`isSafeImageSrc` from Shared.
- Reference on the spike: `render-config.tsx` (block renders, class maps, `known()` fallbacks, Services list markup, Button `resolveHref` with org slug), `PuckPage.tsx`, `theme-tokens.ts` (`builderMetadata`) and `editor-config.tsx` (`editorConfigFor`, `withLockedFields` for #76).
- Test fixtures: the salon document in `Sinwy.Backend/modules/pages/tests/pageDocument.test.ts` (`salonDocument`) can be copied for the SSR test.
- New tests: `Sinwy.WebFrontend/src/shared/tests/page-document-view.test.ts` (rewrites the v1 `page-renderer.test.ts` in phase 4) and an adapter test.

**Steps:**
- The adapter maps each field kind to a Puck field:
  - text → `text`
  - select → `select` or `radio` with labels
  - rich text → `richtext`
  - link and image → `text`
  - slot → `slot` with `allow`
  - custom kinds → `customFields[kind]` when given, otherwise left out
  
  It turns definition defaults into `defaultProps`, and passes `label` and `locked` metadata through. It is the only place with Puck generics: one cast at its boundary. Check whether Puck 0.24 can restrict top-level drops to `ROOT_ALLOW` (`root` config or permissions), and record the answer for #76.
- The storefront config passes no `customFields`, so no editor UI is imported. `PageDocumentView` imports only from `@puckeditor/core/rsc`.
- Block renders use static Tailwind classes and enum-to-class maps. Unknown enum values fall back to the default. Align with `text-align` (Standing notes). Services renders the given services in `serviceIds` order (all when empty), with Book links to `/<org>/book?service=<id>`. Button links resolve with the org slug, the way v1's `resolveHref` does.
- `metadata` is `{ organizationSlug, services, branding }`, typed through one reader. Brand colour and font apply through `brandAttributes` on the wrapper, the same as in v1.
- `RichText` renders the parsed tree. Links get `rel="noopener noreferrer"`, and links with the `_blank` flag get `target="_blank"`.

**Tests that matter:**
- SSR render (`renderToString`) of a full salon document: every block's text is in the HTML. Unknown types are skipped, not thrown. A slot child that isn't allowed but is already stored still renders, because read must never crash.
- Rich text: stored `<script>` and `javascript:` never reach the HTML, and bold, a list and an https link do.
- A test-only migration through `transformProps` renders an old-shape block the same as the current shape.
- The adapter: every manifest prop has a Puck field, every slot has its `allow` list, and defaults equal the manifest's. This replaces the spike's drift test.

**Done when:**
- `PageDocumentView` renders the fixture document in tests, and `bun run verify` is clean.

**Verify:** None (no route uses it yet).

### Log (2026-11-19, `feat(web): add puck config adapter and storefront page renderer`)
- Shipped:
  - `@puckeditor/core` pinned at exactly `0.24.0` in the web app.
  - `src/shared/components/page-builder/`:
    - `puck-config.ts`: `puckConfigFrom(blocks, renders, { customFields, root })`. The only Puck generics are behind one `as Config` cast. Rich-text fields get Tiptap options trimmed to the allowlist (h2/h3 only, no code, code block, horizontal rule or text align).
    - `blocks.tsx`: `BLOCK_RENDERS` for the eight blocks, typed by `RenderProps<T>` (derived from the manifest's fields: slots as `SlotComponent`, rich text as `ReactNode`), plus `PageMetadata` and the `pageMetadata` reader.
    - `rich-text.tsx`: `RichText` renders `parseRichText`.
    - `urls.ts`: `resolveHref` and `imageSrc` on top of Shared's `isSafeHref`, `isSafeLink` and `isSafeImageSrc`.
    - `PageDocumentView.tsx`: `readPageContent` plus `<Render>` from `@puckeditor/core/rsc`, with `fieldTransforms.richtext`.
  - Tests: `src/shared/tests/page-document-view.test.ts` (9) and `puck-config.test.ts` (6).
- Differs from plan:
  - Migrations on read go through our own walk, `readPageContent`, which calls `migrateProps`, not `transformProps`. Two Puck behaviours made the walk necessary anyway. `<Render>` doesn't apply `defaultProps`, so missing props reach the render as `undefined`. `SlotRender` calls `content.map`, so a stored slot that isn't an array would throw. One pass migrates, fills defaults, runs each value field's Zod schema with a fallback to its default (rich text only gets a type check, because the renderer parses it anyway), and drops non-blocks, unknown types, blocks without an id, duplicate ids and anything deeper than `maxDepth`. The renders therefore get complete, valid props, and unknown enum values fall back to defaults with no `known()` helper. An invalid Button `href` falls back to the default `book`.
  - `puckConfigFrom` also takes the `renders` map and an optional `root`. The storefront config is built in `PageDocumentView.tsx` with a root render that applies `brandAttributes`.
  - `branding.ts` needed no change: `brandAttributes` and `BRAND_FONT_FAMILIES` already existed.
  - There are no root theme tokens (Default 4), so spacing is fixed Tailwind classes (`gap-8` for the page, `gap-4` in slots, a padding map for Section).
  - The Hero background is an absolutely positioned `<img>` under a dark overlay, not the spike's CSS `url()` variable, so no URL goes into CSS.
  - An Image without a source, and a Services block with no services, show a placeholder only when `puck.isEditing`. The storefront renders nothing for them.
  - `bun add` re-resolved every `latest`-tagged TanStack dep, which put two `query-core` copies in the tree and broke the type check of `router.tsx`. Pinning those deps to their locked versions for the install, then putting `latest` back in `package.json` and in the lockfile's workspace lines, kept them unchanged. The lockfile still gained a hoist of `@tanstack/router-plugin` 1.169.0 and `router-generator` 1.168.0, versions that were already nested under `start-plugin-core`.
- Found in Puck 0.24 (for #76):
  - Slot default children get ids on insert. `insertAction` runs `populateIds`, which walks the slots and adds `id` where it's missing, so the adapter adds none.
  - Root drops can't be limited through config: no `root.allow`, and `permissions` has no insert-by-type rule. The editor's root render gets `puck.renderDropZone`, which takes `allow` (`isComponentAllowed`). #76 can render `puck.renderDropZone({ zone: "root:default-zone", allow: ROOT_ALLOW })` in place of `children` in its root render. This hasn't been tried in the browser.
  - The SSR output has no Puck wrapper elements and renders each block once. With `fieldTransforms.richtext` set, the Tiptap `Suspense` path isn't used.
- Checked in the running app: nothing. The phase has no Verify, and no route uses the view yet. The SSR HTML was checked in tests and in a one-off probe.

## Phase 4: Switch pages to the new document and remove v1

**Goal:** the pages API stores, validates, migrates and serves only the new document. The storefront and the dashboard preview render it, and no v1 page code remains.

**Files:**
- Shared:
  - `Sinwy.Shared/types/page/PageContent.ts`: delete the v1 model. `PageContent` becomes the phase 2 document type, or the uses get renamed.
  - `PageTemplates.ts`: delete.
  - `PageSchema.ts`: `createPageSchema` drops `templateId`, and `savePageContentSchema.content` becomes `pageDocumentSchema`.
  - `Page.ts`: `PageVersionDto` and `PublicPageDto` (add `services` per Default 7).
  - `index.ts`.
- Backend:
  - `Sinwy.Backend/db/schema/pageSchema.ts:63`: the `jsonb<PageContent>` type.
  - New data migration in `Sinwy.Backend/drizzle/` (Standing notes).
  - `modules/pages/service.ts`:
    - `createPage` (line 145): empty document, no template
    - `contentSaveCheck` (line 196): `baseVersion` only, until phase 5
    - `getPublicPage` (line 280): services
  - `modules/pages/controller.ts`: `parseContentBody`, and use `PAGE_DOCUMENT_LIMITS` for the byte cap.
  - `modules/pages/tests/pages.test.ts`: create, content and migration tests (lines 144, 205, 318, 336, 363).
  - `pageContracts.test.ts`: delete or fold into `pageDocument.test.ts`.
  - `modules/organizations/tests/activity.test.ts:139`.
- Web:
  - `src/modules/storefront/routes/$pageSlug.tsx`: render `<PageDocumentView document={page.content} metadata={…} />` from `#/shared/components/page-builder/PageDocumentView`, with `organizationSlug`, `services` and `branding` from the public page. Drop the article's `brandAttributes` and `max-w-3xl`, because the view's root applies both brand and width. Keep the org name link above it.
  - `src/modules/org-dashboard/routes/_shell.pages.$id.preview.tsx`: the same view. `services` comes from `servicesQuery` (`org-dashboard/lib/service-queries.ts`), mapped to `PublicServiceDto`.
  - `components/pages/PageContentSummary.tsx`: block count through `blocksIn`, and the "widgets" wording.
  - `components/pages/NewPageForm.tsx`: no template field.
  - `components/pages/TemplatePicker.tsx`: delete.
  - Delete `src/shared/components/page-content/PageRenderer.tsx` and its directory, and `src/shared/tests/page-renderer.test.ts`. Its replacement, `page-document-view.test.ts`, already exists.
- Docs:
  - `docs/user-flow-map.md:107`
  - `docs/user-creation-roadmap.md:299-310`: the template wording, where it describes current behaviour

**Steps:**
- The data migration sets every `page_content.content` to the empty document from Default 1. It keeps rows, versions and `published_version_id`.
- On save, the server parses with `pageDocumentSchema`, which migrates and normalises rich text, and stores the parsed result, never the raw body. Every new version is therefore in the current shape. Validation errors return 400 with the walker's message. Read paths don't re-validate stored rows: the renderer tolerates them, and migrations run on read in `PageDocumentView`.
- `createPage` writes the empty document as version 1. Keep the page-limit and slug behaviour as it is.
- `getPublicPage` adds `services` only when `blocksIn(document)` contains Services.
- Before deleting anything, run `git grep -n -E 'widget|PageWidget|WIDGET_|PAGE_TEMPLATE|templateId|PAGE_CONTENT_LIMITS|PageRenderer|TemplatePicker'` and leave no hits outside docs history. "Widget" may remain only in the `advanced-widgets` feature until phase 5.

**Tests that matter:**
- Save: a valid document becomes the next version, stored with rich text normalised. A body that is invalid, unknown, disallowed in its slot, too deep or too big is refused (400, or 413 for size), the message names the block, and no row is written.
- `baseVersion` conflicts and concurrent saves still behave as before.
- Create writes an empty document. The public endpoint serves the pinned version with services when a Services block is present, and without services otherwise.
- Migration: after migrating, a v1 row and a spike-shaped row both read back as the empty document, and the published pointer still answers.

**Done when:**
- `git grep` finds no v1 page code.
- A published document renders on `/$organizationSlug/$pageSlug` in the server HTML.
- `bun run verify` is clean.

**Verify:**
- Seed: `pro-org`, logged in as the owner. Run `bun run db:migrate` first.
- Existing pages: each opens in the preview as an empty page. Each published one answers on its public URL with an empty article, not a 404.
- Create a page in the dashboard. There's no template step, and its version 1 `content` is the empty document (`psql` on `page_content`).
- From the logged-in browser, `fetch` a save to `PUT .../pages/:id/content` with a document containing Hero (Heading, RichText with bold, a list and a link, Button), a Section with Columns (Image, RichText), and a Services block. Expect 200, and a version 2 row whose rich text is normalised.
- Publish. Load the public URL with JavaScript disabled: the heading, the formatted text and the org's services with Book links are in the server HTML. With JavaScript enabled there are no hydration warnings in the console.
- Replay the save with a Hero inside the Section, then with a `javascript:` Button. Each gets 400 with a message that names the block, and no new row is written.
- Simulated: nothing. There's no editor yet (#76), so content goes in through the API.

### Log (2026-11-19, `feat(backend, web): switch pages to the page document and remove v1`)
- Shipped:
  - Data migration `0033_page_document_reset` sets every `page_content.content` to the empty document. Rows, versions and `published_version_id` stay.
  - `savePageContentSchema.content` is `pageDocumentSchema`, so saves store the parsed document (migrated, rich text normalised). The byte cap uses `PAGE_DOCUMENT_LIMITS.maxBytes`, and `MAX_PAGE_CONTENT_BYTES` is gone.
  - `createPage` writes `emptyPageDocument()` as version 1. `templateId`, `PageTemplates.ts`, `PageContent.ts`, `TemplatePicker`, `PageRenderer` and their tests are deleted.
  - `contentSaveCheck(input)` checks only `baseVersion`, until phase 5.
  - `PublicPageDto.services` lists the org's active services through `listPublicServices` when the pinned document has a Services block, and is `[]` otherwise.
  - The storefront `$pageSlug` route and the dashboard preview render through `PageDocumentView`. The preview gets services from `servicesQuery`, filtered to the active ones, and keeps "This page has no content yet." for an empty document. `PageContentSummary` counts blocks with `blocksIn`.
  - API tests cover: a save stored with rich text normalised; refusals (unknown type, Hero in a Section, a `javascript:` Button, a bad select value, too deep) each giving 400 with the block named and no row written; 413 with no row; the create document; services on the public page with and without a Services block; and the migration of v1 and spike rows with the published pointer intact. `pageContracts.test.ts` is deleted, because `pageDocument.test.ts` covers the new contract.
- Differs from plan:
  - `PublicPageDto.services` is always present (`[]` without a Services block) rather than optional, which keeps the type simple for the renderer.
  - Removed `getOrganizationProfile` from the organizations module. It existed only to prefill templates and had no other caller.
  - Also changed UI copy that described templates as current behaviour: the pages empty state, the New page header and the onboarding profile step. `CONTEXT.md` renames the glossary term Widget to Block; its "(Advanced Widgets)" mentions are left for phase 5.
  - `docs/user-flow-map.md:107` was left as it is, because the template step it mentions is still future work.
  - The plan's `git grep` still hits `widgets:` and `BookingWidget` in the migration test in `pages.test.ts`. They stay on purpose, as the v1 and spike rows the migration must rewrite.
- Checked in the running app (e2e subagent, seed `pro-org`, all passed):
  - Existing pages from other seeded orgs preview as empty, and published ones answer 200 with an empty article.
  - Create has no template step, and its v1 row is the empty document.
  - An API save of Hero, Section with Columns and Services gave 200, and the v2 rich text was normalised (`<b>` to `<strong>`, `<i>` to `<em>`, script and `onclick` dropped).
  - After publishing, the server HTML with JavaScript off holds the heading, the formatted text and both services with `book?service=` links. With JavaScript on there were no hydration warnings.
  - Hero in a Section and a `javascript:` Button gave 400 with messages naming the block, and no row was written.
  - Backend and web logs were clean.


---

## Phase 5: Plan gating of blocks

**Goal:** the server refuses a newly added gated block type on a plan without its feature, keeps saves working for pages that already have it, and the feature is named `premium-blocks`.

**Files:**
- `Sinwy.Shared/types/plan/PlanFeatures.ts`: rename the key.
- `Sinwy.WebFrontend/src/shared/lib/plans.ts`: `FEATURE_NAMES` becomes "Premium blocks".
- `Sinwy.WebFrontend/src/modules/organizations/components/PlanCards.tsx:53`: the hard-coded "Advanced widgets" plan line.
- `CONTEXT.md` lines 43 and 47: the "(Advanced Widgets)" mentions in the Page Builder and Block terms.
- Tests that use the key: listed in Standing notes.
- `Sinwy.Shared/types/page/PageDocument.ts`: a pure rule `lockedBlocksIn(latest, next, features, blocks = BLOCKS)` next to `blocksIn`, returning the gated types `next` adds which the features don't cover. Its tests go in `Sinwy.Backend/modules/pages/tests/pageDocument.test.ts` (`defineBlock` makes the test-only gated block).
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck(input)` (line 188) checks only `baseVersion` now. It takes `membership` again and uses `featuresFor(membership.plan)`.
- `.agents/skills/e2e-test/references/seed-scenario.md:14`
- `docs/org-rules-map.md`: lines 191–208 (the gating rule now covers blocks, not templates or widgets; template gating is gone since phase 4) and line 263 (`Sinwy.Shared/types/page/blocks/` holds the block registry).

**Steps:**
- The rule counts types, not instances, through all slots, including Columns' hidden slots. A type is allowed if the plan has its feature, or if the latest version already contains that type.
- `contentSaveCheck` keeps the `baseVersion` check first, then applies the rule against `featuresFor(membership.plan)`, and returns `"upgrade-required"` (402 `PLAN_UPGRADE_REQUIRED`).
- No first-set block gets `requires`. Pin that with a test, so gating a block is a deliberate change.

**Tests that matter:**
- With a test registry that has one gated block:
  - Refused: a plan without the feature adding it, including when it's nested in a slot.
  - Allowed: a plan with the feature; a page whose latest version already has the type, after a downgrade; a page that keeps the type and adds more of it.
  - Refused again: a page that removed the type and adds it back.
- No real block has `requires`. The plan matrix still gives `premium-blocks` to Professional and Enterprise only.

**Done when:**
- `git grep advanced-widgets` finds nothing outside docs history.
- `bun run verify` is clean.

**Verify:**
- Seed: `subscribed-org` (Starter) and `pro-org`.
- The billing and plan screens show "Premium blocks" where they listed "Advanced widgets", on the Business plan.
- Gating on a save can't be checked in the browser, because no real block is gated. The tests cover it.

### Log (2026-11-19, `feat(shared, backend, web): gate premium blocks by plan`)
- Shipped:
  - The feature key `advanced-widgets` became `premium-blocks` ("Premium blocks") in `PlanFeatures.ts`, `FEATURE_NAMES`, the `PlanCards` line, `CONTEXT.md`, the seed-scenario reference and the tests.
  - `lockedBlocksIn` in `Sinwy.Shared/types/page/PageDocument.ts` returns the gated types `next` adds that the features don't cover and `latest` doesn't already have, counted through every slot.
  - `contentSaveCheck(membership, input)` applies it with `featuresFor(membership.plan)` after the `baseVersion` check, and returns `"upgrade-required"` (402).
  - Tests in `pageDocument.test.ts` use a test-only `Gallery` block with `requires: "premium-blocks"`. They cover refused adds (top level, and in a hidden Columns slot), allowed with the feature, kept after a downgrade (with more added), refused after removal and re-adding, and that no real block has `requires`.
  - `docs/org-rules-map.md` §5 now describes block gating instead of template and widget gating, and its enforcement list points to the block registry and `lockedBlocksIn`.
- Differs from plan: nothing. No API test drives the 402, because no real block is gated. The rule is tested as a pure function, and the service wiring is one call.
- Checked in the running app (subagent, `e2e-test`):
  - "Premium blocks" shows on the home page plan cards, on the choose-plan cards and in the change-plan dialog (Starter → Business "Adds…", Business → Starter "Removes…"). No old label or raw key appears anywhere, and the console had no errors.
  - Not checked: a real plan switch, and the save-time 402, since no real block is gated.

## Phase 6: Storefront bundle and SSR check

**Goal:** it's measured and guarded that a published page ships no editor code, renders on the server fast, and hydrates without warnings.

**Files:**
- New: `scripts/storefrontBundleCheck.ts` (scripts use camelCase names) and `scripts/storefrontBundleCheck.test.ts`. `test:scripts` (`bun test ./scripts`, part of `verify`) picks up the test, so the graph-walk test must not build. Add a root `package.json` script `check:storefront-bundle` (Default 9).
- `Sinwy.WebFrontend/vite.config.ts`: has no `build` or `manifest` options yet. Enable a build manifest if the check needs one.
- Storefront route: `Sinwy.WebFrontend/src/modules/storefront/routes/$pageSlug.tsx`, which renders `src/shared/components/page-builder/PageDocumentView.tsx`. The dashboard preview `modules/org-dashboard/routes/_shell.pages.$id.preview.tsx` uses the same view, but it is not part of the storefront graph.
- Reference: the spike log's phase 7 tables (`git show pagebuilder-tryout:docs/puck-spike-log.md`, lines 672–757).

**Steps:**
- The script runs `vite build`, then walks the static import graph of the storefront `$pageSlug` route chunk. It fails if any reachable chunk contains Tiptap, ProseMirror, `@dnd-kit`, `react-grid-layout`, happy-dom or Puck's editor entry. It prints the route's gzip total and the Puck render path's share. Puck's lazy rich-text chunk may exist, but it must be unreachable statically.
- Measure against the spike's numbers: route static size (293.5 KB with 14.5 KB for the render path), SSR time on a 250-block document (15 ms), and TBT at 4× CPU (171–193 ms). Seed the large document through the API, and record the numbers in the log.
- Check the hydration console on the production build (`vite preview`) with a page that uses every block.

**Tests that matter:**
- The script's graph walk flags a fixture chunk graph that reaches a forbidden module and passes one that doesn't.

**Done when:**
- `bun run check:storefront-bundle` passes.
- The log records the bundle size, the SSR time and that there are no hydration warnings.

**Verify:**
- Seed: `pro-org`, with a published page holding about 250 blocks of every type, saved through the API.
- Build and serve the production web app. Open the public page in a fresh browser.
- The network panel shows no Tiptap, ProseMirror, dnd-kit or RGL file. The console has no hydration warnings. The server HTML holds every block's text.
- Simulated: none. The 4× CPU figure stands in for a mid-range tablet.

### Log (2026-11-19, `feat(tooling): add storefront bundle check`)
- Shipped:
  - `scripts/storefrontBundleCheck.ts`, run by `bun run check:storefront-bundle` (about 8 s). It runs the web `build` with `--manifest --sourcemap hidden`. It takes the client entry, the storefront layout (`routes/route.tsx`) and every `$pageSlug.tsx?tsr-split=…` chunk as roots, and walks their static `imports` in `dist/client/.vite/manifest.json`. Each chunk's modules are its source map's `sources`. It fails on Tiptap, ProseMirror, `@dnd-kit`, `react-grid-layout`, happy-dom, and on any `@puckeditor/core/dist` file outside the static closure of the installed `rsc.mjs` (computed, not hardcoded). It prints the gzip totals, then deletes the maps and both `.vite` dirs so they never ship.
  - `scripts/storefrontBundleCheck.test.ts`: on a fixture manifest, editor code that is only dynamically imported passes, while a static import of Puck's editor or dnd-kit (or the Tiptap chunk) is flagged. A manifest without the route throws, and the Puck render set follows `rsc.mjs`'s static imports only.
  - `vite.config.ts` is unchanged: the manifest and source maps are CLI flags of the check's build only.
- Differs from plan:
  - The script reads source maps rather than chunk text, because the manifest doesn't list modules. Chunks without a map hold only virtual modules (Vite's preload helper, re-export facades), so a map-less chunk is accepted up to 4 KB and fails above that. `hidden` maps keep the sizes equal to a normal build (plain `--sourcemap` adds about 2.5 KB of `sourceMappingURL` comments).
  - Proved on a real leak: importing `Puck` from `@puckeditor/core` in `PageDocumentView` made the check exit 1, with 9 Puck editor and 11 dnd-kit findings and the route at 446.6 KB. The import was reverted.
  - The spike's 4× CPU TBT came from Playwright with CDP `Emulation.setCPUThrottlingRate`, not a DevTools MCP trace. A scratch probe (`/tmp/sinwy-p6/probe.ts`) used `playwright-core` from `node_modules/.bun` with the installed Chromium 1247 (the headless shell isn't installed).
- Measurements (production build on `vite preview` :4173, backend :3001, the same machine as the spike, 1440×900):

  | What | Now | Spike |
  | --- | --- | --- |
  | Storefront route, static JS gzip | 285.2 KB | 293.5 KB |
  | … app entry baseline | 274.4 KB (55 chunks) | 274.5 KB |
  | … route only | 10.8 KB (10 chunks) | – |
  | … of which the Puck render path | 7.4 KB (`PageDocumentView` 6.3, Puck's `chunk-OT7NKYY4` 1.2) | 14.5 KB |
  | Large page | 261 blocks, 33 KB JSON, API save 12 ms | 252 blocks, 69.8 KB |
  | SSR TTFB, warm, 6 runs | 12–19 ms | 15 ms |
  | SSR HTML raw / gzip | 167 / 18 KB | 250 / 25.4 KB |
  | Hydration unthrottled: DCL / load / long tasks | 138–150 / 209–210 ms / none (743 elements) | 134–214 / 307–420 ms / none |
  | Hydration 4× CPU: TBT / longest task | 80–104 / 130–154 ms (1 long task) | 171–193 / 152–158 ms |

  - Seed: `pro-org` scenario `seed-e602abb2` (id `23c52329-708c-4c10-8b58-9298ce6e9eae`), 3 services, published page `large` (id `7faa5977-b516-4e45-8d73-736232d280ee`): Hero (Heading, RichText, Button), Services, then 24 Sections, each with a Heading, a ~500-character RichText with a link and a list, an Image, a Button, and Columns (2 columns, 3 in every third section) holding a Heading and a RichText per column. Seeded by `/tmp/sinwy-p6/seed.ts`.
- Checked in the running app:
  - Probe, 6 loads unthrottled and 6 at 4×: no console messages or page errors, 65 scripts fetched and none editor-like. Headings, buttons and images carry React fibers after load, so the page hydrated.
  - Subagent (`e2e-test`), all passed. With scripts stripped, the server HTML holds every block's text: Hero 3/3, Services title, intro and the 3 services, and 24/24 section headings, rich texts (with `strong`, link and list intact), buttons and image alts, plus 56/56 column headings and texts. A fresh browser fetched 65 JS files, with 0 hits for tiptap, prosemirror, dnd-kit, react-grid-layout or `@puckeditor`, and `Render-H3USS5FU-*` was never requested, not even after client-side navigation away and back. The console had 0 messages, and the backend and preview logs were clean.
  - Finding (not a bug, follow-up for #73): Button blocks and the Services "Book" links render plain `<a href>`, so an internal target like `book` reloads the whole document instead of navigating through the router.
