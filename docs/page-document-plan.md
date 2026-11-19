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
| 5 | Plan gating of blocks | 4 | done | `feat(shared, backend, web): gate premium blocks by plan` |
| 6 | Storefront bundle and SSR check | 4 | done | `feat(tooling): add storefront bundle check` |
| 7 | Code review, docs and cleanup | 5, 6 | done | `fix(shared, web): refuse block types named like object keys` |

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

The plan is complete. These are left for #73, #76 and #77. The log has the detail.

- **Hand-off notes for #76 and #77** were not posted: the permission classifier blocked `gh issue comment`. Drafts are in `/tmp/sinwy-p7/issue76.md` and `issue77.md`. Post them with `gh issue comment <n> --body-file <file>` and then delete the folder.
- **Follow-up for #73:** Button blocks and the Services "Book" links render plain `<a href>`, so internal targets reload the whole document instead of navigating through the router (phase 6).
- **Follow-up for #73:** `0033_page_document_reset` empties every `page_content` row. That was correct only because there was no customer content. It is applied history now, so keep the file, and never copy its pattern for a database that has real pages.
- **Spike lessons for #76:**
  - `@puckeditor/core` is pinned at exactly `0.24.0`, and storefront code imports only types from it (values come from `/rsc` only). `bun run check:storefront-bundle` enforces this.
  - `PageDocumentView`'s `fieldTransforms.richtext` keeps Tiptap out of the render path.
  - Under StrictMode, `<Puck>` children remount once (#1884). Returning `readOnly` from `resolveData` records a spurious history entry on load.
- **Lookups by stored type** go through `ownEntry(record, type)` (phase 7). A plain `blocks[type]` lets `constructor` or `__proto__` reach inherited members and throw.
- **Dev data:** the phase 6 org `seed-e602abb2` remains with no pages, among many other `seed-*` orgs from earlier work. No dev server is running.
