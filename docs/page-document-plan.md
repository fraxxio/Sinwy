# Page document plan

Issue #75 (parent #73): the foundation that every page builder feature sits on. Each block is defined once in a manifest in Shared, which produces both the server's Zod validation and the Puck fields. Every saved document is validated, gated by plan and migrated. The storefront renders documents on the server through `@puckeditor/core/rsc`, with no editor code in the bundle. Puck documents replace v1 page content. The editor UI belongs to #76, and autosave, drafts and publishing belong to #77. Neither is in scope here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-document-log.md](page-document-log.md).

Branch: `pagebuilder/75-document-model`. The spike branch `pagebuilder-tryout` is for reference only. Read it with `git show pagebuilder-tryout:<path>`, and never merge, cherry-pick or check out its files.

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Rich text allowlist in Shared | – | done | `feat(shared): add rich text allowlist for page documents` |
| 2 | Block manifest and document schema | 1 | done | `feat(shared): add page block manifest and document schema` |
| 3 | Puck config adapter and storefront renderer | 2 | done | `feat(web): add puck config adapter and storefront page renderer` |
| 4 | Switch pages to the new document and remove v1 | 3 | done | `feat(backend, web): switch pages to the page document and remove v1` |
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
  - `@puckeditor/core` is pinned at exactly `0.24.0`. Puck 0.22+ injects its own CSS, so don't import `puck.css`.
  - `@puckeditor/core/rsc` exports `Render` and `transformProps` and is about 6 KB gzip. Storefront code may import only types from `@puckeditor/core`, never values.
  - Puck's own rich-text render path costs about 117 KB gzip of Tiptap and renders each block twice in the SSR stream. Puck skips it for any field type that has a `fieldTransforms` entry on `<Render>`, and `PageDocumentView` sets one for `richtext`.
  - For #76: under StrictMode, `<Puck>` children remount once (#1884). Returning `readOnly` from `resolveData` records a spurious history entry on load.
- **Rich text (phase 1, log for detail):** `parseRichText`, `serializeRichText`, `normalizeRichText`, `RichTextNode` (`text`, `br`, `a { href, blank }`, containers with `children`) and `isSafeHref`/`isSafeImageSrc` are exported from `@sinwy/shared`. `""` normalises to `""`; an empty editor's `<p></p>` stays. Stored links carry no `rel`, so the renderer adds it.
- **Manifest (phase 2, log for detail):**
  - Each field has `kind`, `label` and optionally `locked`. Value fields also have `default` and `schema`. Kinds: `text`, `select` (`options` with labels, `display: "select" | "radio"`), `richText`, `link`, `image`, `slot` (`allow`, `default: BlockTemplate[]`), and custom fields (`custom: true`, so far only `kind: "serviceIds"`). Use `isSlotField(f)`, not `f.kind === "slot"`. A block has `label`, `fields`, `slots`, `defaults` (slots included), `schema` and optionally `requires`.
  - Hero's default `items` are `BlockTemplate`s without ids. Puck 0.24 adds the ids on insert (`populateIds`).
  - `field.link` takes `isSafeLink` (a safe href or a bare path like `book`) or `""`, and `field.image` takes `isSafeImageSrc` or `""`.
  - `createPageDocumentSchema({ blocks, rootAllow, migrations })` and `blocksIn(document, blocks)` accept a test registry. `defineBlock({ label, fields, requires })` makes a test-only block.
  - `pageDocumentSchema` output is what gets stored: migrated, rich text normalised, NUL stripped, `zones` and node `readOnly` dropped. Each issue message stands on its own. `emptyPageDocument()` is Default 1's empty document.
- **Renderer (phase 3, log for detail):**
  - `PageDocumentView({ document, metadata })` lives in `Sinwy.WebFrontend/src/shared/components/page-builder/`. `metadata` is `PageMetadata` (`{ organizationSlug, services, branding }`, from `./blocks`). Its root wrapper applies `brandAttributes` and `mx-auto grid w-full max-w-5xl gap-8`, so callers add neither.
  - `document` is `unknown`. `readPageContent` migrates, fills defaults, falls back to defaults for invalid values and drops anything malformed, so reading a stored row never throws and never needs re-validation.
  - `puckConfigFrom(blocks, renders, { customFields, root })` is the adapter that #76 reuses with `customFields.serviceIds` and its own root.
- **Adding a web dependency:** `bun add` and `bun install` re-resolve the `latest`-tagged TanStack deps and break `router.tsx` types (two `query-core` copies). Pin them to their locked versions for the install, then restore `latest` in `package.json` and in the lockfile's workspace lines (log, phase 3).
- **Dev database (2026-11-19):** migration `0033_page_document_reset` is applied, so all 95 `page_content` rows hold the empty document and 17 pages are still published. Migrations 0027 and 0033 are applied history; keep both files.
- **Saving and errors:**
  - `controller.ts` enforces `PAGE_DOCUMENT_LIMITS.maxBytes` (256 KB) before parsing (413). `parse` returns only `issues[0].message`, so every validation message must say on its own which block and field is wrong.
  - `insertNextVersion(orgId, pageId, content, userId, check)` runs `ContentSaveCheck(latest)` inside its transaction. Gating and the `baseVersion` conflict both compare against the latest version.
  - `savePageContentSchema.content` is `pageDocumentSchema`, so the service gets and stores the parsed document. `pages.test.ts` has `document(...)`, `section(...)` and `block(type, props)` helpers for API tests.
- **Pages API (phase 4):** `PublicPageDto.services` is always present: the org's active services when the pinned document has a Services block, `[]` otherwise. `PageVersionDto.content` is `PageDocument`. Save is `PUT /api/organizations/:orgId/pages/:pageId/content` with `{ baseVersion, content }`; publish is `POST .../publish`.
- **Where `advanced-widgets` appears:** `Sinwy.Shared/types/plan/PlanFeatures.ts`, `FEATURE_NAMES` in `Sinwy.WebFrontend/src/shared/lib/plans.ts`, the plan line in `PlanCards.tsx` and `CONTEXT.md`. Also tests: `auth/tests/requireFeature.test.ts` (as a sample feature), `billing/tests/planFeatures.test.ts`, web `account-dashboard/tests/plan-change.test.ts` and `shared/tests/plans.test.ts`. Also docs: `.agents/skills/e2e-test/references/seed-scenario.md` line 14 and `docs/org-rules-map.md` lines 191–208 and 263. Polar knows nothing of features.
- **Where tests run:** Shared has no test runner, and its contract tests live in `Sinwy.Backend/modules/pages/tests/` (run by `bun run test:server`). Web tests live in `Sinwy.WebFrontend/src/**/tests/`.

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
