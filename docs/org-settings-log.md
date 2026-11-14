# Organization settings log

Finished phases of the [organization settings plan](org-settings-plan.md), each with its spec and log entry.


---

## Phase 1: Block → Widget rename

**Goal:** the code, stored data, UI and plan feature all say "widget"; nothing says "block" for a piece of a page.

**Files:** `Sinwy.Shared/types/page/PageContent.ts` (`blockTypes`, `BLOCK_TYPES`, `BlockType`, `BlockDefinition`, `PageBlock`, `PAGE_CONTENT_LIMITS.maxBlocks/blockId`, `blockList`, `blockAt`, `eachBlock`, `blockTypesIn`, error messages), `PageTemplates.ts`, `Sinwy.Shared/types/plan/PlanFeatures.ts`, `Sinwy.Backend/modules/pages/service.ts:193-200`, `pages/controller.ts:24`, `pages/tests/pages.test.ts`, `pages/tests/pageContracts.test.ts:103`, `auth/tests/requireFeature.test.ts`, `billing/tests/planFeatures.test.ts`, `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx` (`Block`, `Blocks`, `data-block`), `shared/tests/page-renderer.test.ts`, `shared/lib/plans.ts:25`, `shared/tests/plans.test.ts:22`, `account-dashboard/tests/plan-change.test.ts`, `org-dashboard/components/pages/PageContentSummary.tsx:17,47-48`, `org-dashboard/routes/_shell.pages.$id.preview.tsx:77`, `org-dashboard/components/pages/TemplatePicker.tsx`, `Sinwy.Backend/drizzle/` (new migration), `docs/org-rules-map.md:200-203,258`, `.agents/skills/e2e-test/references/seed-scenario.md:14`.

**Steps:**
- Rename every page-piece identifier and message from block to widget (`WidgetType`, `PageWidget`, `WIDGET_TYPES`, `widgetTypesIn`, `maxWidgets`, …). Leave unrelated "block" words alone: CSS `block`, calendar time blocks, "blocker".
- The content key becomes `widgets`, keeping `schemaVersion: 1`. Add a custom Drizzle migration (`drizzle-kit generate --custom`) that renames the top-level key on every `page_content` row that has `blocks`. Nested `children` keep their name.
- Rename the feature `page-builder` to `advanced-widgets`, labelled "Advanced widgets". Nothing stores feature keys in the DB or Polar, so this is code only.
- Update the rules map and the seed-scenario reference to the new words.

**Tests that matter:**
- The migration turns a stored `{ blocks: [...] }` version into `{ widgets: [...] }` and the page still renders. A Starter org can't save a new gallery widget, and an existing one stays editable (the downgrade rule in `pages/service.ts`).
- The content schema refuses the old `blocks` key, so no stale client writes it back.

**Done when:**
- `grep -rniw "block\|blocks\|page-builder"` finds no page-related hits outside the migration file.
- Existing pages render unchanged in preview and on the storefront.

**Verify:** Seed `pro-org`. As the owner, create a page from a template that contains a gallery, publish it, and open it on the storefront. It renders, and the stored version in `page_content.content` has a `widgets` key. Plan cards and billing show "Advanced widgets". Nothing is simulated beyond the seed.

### Log (2026-11-14, `feat(shared, backend, web): rename page blocks to widgets`)
- Shipped: every page-piece identifier, message and stored key renamed to widget (`PageWidget`, `WIDGET_TYPES`, `widgetTypesIn`, `maxWidgets`, `widgetId`, `data-widget`); feature `page-builder` → `advanced-widgets` ("Advanced widgets"); custom migration `0027_page_content_widgets.sql` renames the top-level key on every `page_content` row; rules map, CONTEXT.md and seed-scenario reference updated.
- Differs from plan: `pageContentSchema` is now a strict object, so `blocks` is refused even next to `widgets`. The Professional plan card's "Full page builder customization" became "Advanced widgets", since the builder itself is on every plan. "Page builder" stays where it names the future editor (`PageContentSummary.tsx`). The migration test runs the SQL file against a stored `blocks` row in `pages.test.ts`.
- Checked in the running app: `pro-org` owner created a page from Landing, published it, and the storefront rendered all six widgets (`data-widget` heading, text, button, gallery, heading, testimonials); the stored version has only `schemaVersion` and `widgets`. Plan cards and the billing plan-change dialog say "Advanced widgets", never "page builder". The local DB's 14 existing versions migrated. Not checked: billing against a real Polar sandbox subscription (the seeded one exists only in the DB). Template galleries render empty (`images: []`) until an editor exists.
