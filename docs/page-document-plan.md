# Page document plan

Issue #75 (parent #73): the foundation that every page builder feature sits on. Each block is defined once in a manifest in Shared, which produces both the server's Zod validation and the Puck fields. Every saved document is validated, gated by plan and migrated. The storefront renders documents on the server through `@puckeditor/core/rsc`, with no editor code in the bundle. Puck documents replace v1 page content. The editor UI belongs to #76, and autosave, drafts and publishing belong to #77. Neither is in scope here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-document-log.md](page-document-log.md).

Branch: `pagebuilder/75-document-model`. The spike branch `pagebuilder-tryout` is for reference only. Read it with `git show pagebuilder-tryout:<path>`, and never merge, cherry-pick or check out its files.

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Rich text allowlist in Shared | – | done | `feat(shared): add rich text allowlist for page documents` |
| 2 | Block manifest and document schema | 1 | todo | |
| 3 | Puck config adapter and storefront renderer | 2 | todo | |
| 4 | Switch pages to the new document and remove v1 | 3 | todo | |
| 5 | Plan gating of blocks | 4 | todo | |
| 6 | Storefront bundle and SSR check | 4 | todo | |
| 7 | Code review, docs and cleanup | 5, 6 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **The manifest is made of block definitions.** Shared holds plain-data definitions for each block: a typed field kit (text, select, rich text, link, image, slot with an `allow` list, plus custom kinds), and per block its label, defaults, `requires` and locked fields. The Zod schemas and the TypeScript prop types are derived from it in Shared. A web-side adapter generates the Puck `fields` and `defaultProps`. Custom field kinds get their editor UI by name in the web app. Shared never depends on Puck. Location: `Sinwy.Shared/types/page/blocks/`.
- **First block set:** the core layout and content blocks (Section, Columns with 2–4 slots, Heading, RichText, Image, Button) and the ready-made Hero and Services blocks. The Image source is a URL until media upload exists. FreeGrid and Gallery come later, so react-grid-layout is not a dependency in #75.
- **Existing page content is replaced with an empty document.** A Drizzle data migration rewrites every `page_content` row, both v1 and the spike's v2 shape, to an empty new-format document. Version numbers and `published_version_id` stay, so published pages render empty until they are edited. No pages are deleted.
- **Rich text is stored as HTML and normalised on save.** One allowlist tokenizer in Shared does both jobs: the server rewrites every rich-text value to canonical allowlisted HTML, so nothing pasteable is refused, and the storefront renders the same tree to React elements without `dangerouslySetInnerHTML`. Allowlist: `p`, `br`, `strong`, `em`, `u`, `s`, `a` (http(s), `mailto:`, `tel:`, root-relative, `#`), `ul`, `ol`, `li`, `h2`, `h3`, `blockquote`.
- **Gating uses `premium-blocks`.** The feature key `advanced-widgets` becomes `premium-blocks`, shown as "Premium blocks", on the same plans (Professional and Enterprise). A block declares `requires: Feature`. Saving a block type the plan lacks returns 402 `PLAN_UPGRADE_REQUIRED`, unless the page's latest version already has that type, so pages stay saveable after a downgrade. No first-set block is gated. The rule is tested against a gated block that exists only in tests.
- **New pages start empty, and the preview stays.** Creating a page writes an empty document. `templateId`, `PageTemplates.ts` and `TemplatePicker` go away, and a template picker comes in a later issue. The dashboard preview route stays and renders the latest version through the new renderer. Until #76 ships, content can only be changed through the API.

### Defaults (not yet confirmed; change only if asked)

1. **Envelope.** The stored document is `{ schemaVersion: 2, data: { root: { props }, content } }`. `data` is Puck's `Data` shape. Non-empty `zones` are refused (deprecated in Puck). `schemaVersion` stays for future envelope changes. Prop changes go through block migrations, not through this number.
2. **Nesting.** Only Section, Hero and Services go at the top level. `Section.items` takes Heading, RichText, Image, Button and Columns. `Columns.column1…4` take Heading, RichText, Image and Button. `Hero.items` takes Heading, RichText and Button. Services has no slot: its heading and intro are props, and its list comes from the org's services.
3. **Columns.** Slots beyond `count` keep their content and count toward the limits, but are not rendered. Lowering the count therefore never makes a save fail.
4. **No per-breakpoint props and no root theme tokens in #75.** The manifest's field kit can add both later as optional props, without a migration.
5. **No real migration ships in #75.** The migration mechanism (props-only, per block type, idempotent, run on read and on save) is tested with migrations that exist only in tests.
6. **Locked fields are editor metadata only.** The server still validates their values but doesn't refuse edits to them. #76 renders them read-only through a custom field, never through `resolveData`.
7. **Services data.** `getPublicPage` returns the org's public services only when the document contains a Services block, through `listPublicServices` from `@servicesModule`. The dashboard preview maps `servicesQuery` to the same shape.
8. **Limits keep the spike's values** (400 blocks, depth 6, 256 KB) under the Puck-free name `PAGE_DOCUMENT_LIMITS`. The byte cap stays in the controller as the HTTP 413 check.
9. **The bundle check is a script, not part of `verify`.** `bun run check:storefront-bundle` builds the web app and fails if the storefront route's static import graph contains editor code. A build is too slow to run in `verify`.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Spike lessons:**
  - Pin `@puckeditor/core` to exactly `0.24.0`, with no caret. Puck 0.22+ injects its own CSS, so don't import `puck.css`.
  - `@puckeditor/core/rsc` exports `Render` and `transformProps` and is about 6 KB gzip. The storefront must import only from it, never from `@puckeditor/core`.
  - Puck's own rich-text render path costs about 117 KB gzip of Tiptap and renders each block twice in the SSR stream. Puck skips it for any field type that has a `fieldTransforms` entry on `<Render>`.
  - `walkTree` needs the React config, so the server walks the tree with our own code.
  - Puck's `Config` generics don't compose across a component map, and `Fields<Props>` rejects spreads. Generate the fields; cast once at the adapter boundary, not in each block.
  - Under StrictMode, `<Puck>` children remount once (#1884).
  - Align content with inherited `text-align`, not `justify-items`. The editor wraps each slot child in a `[data-puck-component]` div that `<Render>` doesn't have.
  - Returning `readOnly` from `resolveData` records a spurious history entry on load.
- **Rich text (phase 1, log for detail):**
  - `parseRichText`, `serializeRichText`, `normalizeRichText`, `RichTextNode` (`text`, `br`, `a { href, blank }`, containers with `children`) and `isSafeHref`/`isSafeImageSrc` are exported from `@sinwy/shared`. `""` normalises to `""`; an empty editor's `<p></p>` stays. Stored links carry no `rel`, so the renderer adds it.
  - `isSafeHref` is the strict Decision rule and refuses bare paths like `book`, which v1 Button links resolved to `/<org>/book`. For `field.link` add a bare-path check in `PageUrls.ts` (the spike's `BARE_PATH` `^[a-z0-9-]+(\/[\w-]*)*$`) so phase 3's `resolveHref` keeps v1 behaviour.
  - Zod 4 skips a `.transform` when an earlier check such as `.max()` fails, so `z.string().max(20000).transform(normalizeRichText)` never normalises oversized input.
  - Postgres `jsonb` rejects `\u0000`. Rich text replaces NUL with U+FFFD, but plain text and other string fields must refuse or strip it too, or a save fails with 500.
- **Dev database (2026-11-18):** 35 pages (17 published), 38 v1 `page_content` rows and 57 rows in the spike's v2 shape (largest 72.7 KB). The data migration must handle both shapes.
- **Migration 0027 stays.** `Sinwy.Backend/drizzle/0027_page_content_widgets.sql` is applied history in the Drizzle journal, so keep the file and delete only its test (`pages.test.ts` around line 363). Generate data migrations with `bun run db:generate -- --custom` and write the SQL by hand.
- **Saving and errors:**
  - `controller.ts` enforces `MAX_PAGE_CONTENT_BYTES` (256 KB) before parsing (413). `parse` returns only `issues[0].message`, so every validation message must say on its own which block and field is wrong.
  - `insertNextVersion(orgId, pageId, content, userId, check)` runs `ContentSaveCheck(latest)` inside its transaction. Gating and the `baseVersion` conflict both compare against the latest version.
- **Where `advanced-widgets` appears:** `Sinwy.Shared/types/plan/PlanFeatures.ts` and `FEATURE_NAMES` in `Sinwy.WebFrontend/src/shared/lib/plans.ts`. Also tests: `auth/tests/requireFeature.test.ts` (as a sample feature), `billing/tests/planFeatures.test.ts`, web `account-dashboard/tests/plan-change.test.ts` and `shared/tests/plans.test.ts`. Also docs: `.agents/skills/e2e-test/references/seed-scenario.md` line 14 and `docs/org-rules-map.md` lines 191–208 and 263. Polar knows nothing of features.
- **Where tests run:** Shared has no test runner, and its contract tests live in `Sinwy.Backend/modules/pages/tests/` (run by `bun run test:server`). Web tests live in `Sinwy.WebFrontend/src/**/tests/`.
- **Storefront and booking:**
  - The storefront book route accepts `?service=<id>` (`storefront/routes/book.tsx`, `searchSchema`).
  - `listPublicServices(organizationId)` is exported from `@servicesModule` and returns `PublicServiceDto[]` (`Sinwy.Shared/types/service/Service.ts`).

---

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

---

## Phase 3: Puck config adapter and storefront renderer

**Goal:** the web app turns the manifest into a Puck config and renders a document on the server through `@puckeditor/core/rsc` with our rich-text renderer. Nothing routes to it yet.

**Files:**
- `Sinwy.WebFrontend/package.json`: add `"@puckeditor/core": "0.24.0"` (exact).
- New: `Sinwy.WebFrontend/src/shared/components/page-builder/` with:
  - `puck-config.ts`: the adapter `puckConfigFrom(BLOCKS, customFields?)`
  - `blocks.tsx`: the render components for the eight blocks
  - `rich-text.tsx`: `RichText` renders a `RichTextNode[]` to React elements
  - `PageDocumentView.tsx`: `<Render>` with `transformProps(migrations)`, `fieldTransforms.richtext` and `metadata`
- `Sinwy.WebFrontend/src/shared/lib/branding.ts`: `brandAttributes`, `BRAND_FONT_FAMILIES`.
- URL helpers to move or point at Shared `PageUrls.ts`: `resolveHref` and `imageSrc` in `page-content/PageRenderer.tsx:25-35` (that file is deleted in phase 4).
- Reference on the spike: `render-config.tsx` (block renders, class maps, `known()` fallbacks, Services list markup, Button `resolveHref` with org slug), `PuckPage.tsx`, `theme-tokens.ts` (`builderMetadata`) and `editor-config.tsx` (`editorConfigFor`, `withLockedFields` for #76).
- New test: `Sinwy.WebFrontend/src/shared/tests/page-document-view.test.ts` (rewrites the v1 `page-renderer.test.ts` in phase 4).

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

---

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
  - `src/modules/storefront/routes/$pageSlug.tsx`: render through `PageDocumentView`. Drop the article's `max-w-3xl`, because blocks own their width.
  - `src/modules/org-dashboard/routes/_shell.pages.$id.preview.tsx`.
  - `components/pages/PageContentSummary.tsx`: block count through `blocksIn`, and the "widgets" wording.
  - `components/pages/NewPageForm.tsx`: no template field.
  - `components/pages/TemplatePicker.tsx`: delete.
  - `src/shared/components/page-content/PageRenderer.tsx`: delete.
  - `src/shared/tests/page-renderer.test.ts`: delete.
  - `org-dashboard/lib/service-queries.ts` (`servicesQuery`), for the preview.
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

---

## Phase 5: Plan gating of blocks

**Goal:** the server refuses a newly added gated block type on a plan without its feature, keeps saves working for pages that already have it, and the feature is named `premium-blocks`.

**Files:**
- `Sinwy.Shared/types/plan/PlanFeatures.ts`: rename the key.
- `Sinwy.WebFrontend/src/shared/lib/plans.ts`: `FEATURE_NAMES` becomes "Premium blocks".
- Tests that use the key: listed in Standing notes.
- `Sinwy.Shared/types/page/PageDocument.ts`: a pure rule `lockedBlocksIn(latest, next, features, blocks = BLOCKS)` that returns the gated types `next` adds which the features don't cover.
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck`.
- `.agents/skills/e2e-test/references/seed-scenario.md:14`
- `docs/org-rules-map.md`: lines 191–208 (the gating rule now covers blocks, not templates or widgets) and line 263.

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

---

## Phase 6: Storefront bundle and SSR check

**Goal:** it's measured and guarded that a published page ships no editor code, renders on the server fast, and hydrates without warnings.

**Files:**
- New: `scripts/storefront-bundle-check.ts` and a test next to it in `scripts/`. Add a root `package.json` script `check:storefront-bundle` (Default 9).
- `Sinwy.WebFrontend/vite.config.ts`: enable a build manifest if the check needs one.
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

---

## Phase 7: Code review, docs and cleanup

**Goal:** the branch is reviewed for data loss, validation gaps and auth, the docs match the new rules, and nothing temporary is left.

**Files:** the whole branch diff (`git diff master...pagebuilder/75-document-model`), `docs/org-rules-map.md`, this plan and its log.

**Steps:**
- Review with focus on:
  - the data migration (it rewrites every row, and is right only because there is no customer content)
  - the save path (nothing unparsed is stored; rich text always normalised; limits enforced before any work that grows with size)
  - gating (types compared with the latest version inside the transaction)
  - the public endpoint (only the pinned version, services only for served pages)
  - the storefront rendering untrusted stored content without crashing
- Fix what the review finds, or record it as follow-up work on #73.
- Update `docs/org-rules-map.md` if phase 5 didn't, and note on #76 and #77 what this plan leaves them:
  - the root drop restriction finding from phase 3
  - `customFields` for the service picker and locked fields
  - the empty-page state
- Last step: stop every dev server the plan's work started (unless the user asked to keep it running). Delete temporary files the work created: probe scripts, screenshots, console logs, the large seed document if it was scratch, and build output outside `dist/`.

**Tests that matter:**
- Whatever the review adds for a gap it finds.

**Done when:**
- The review findings are fixed or filed.
- #75's "Done when" holds:
  - validation, gating and migrations are covered by tests
  - a published page renders through SSR with no editor code in its bundle
  - no v1 page code remains

**Verify:** None.
