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
