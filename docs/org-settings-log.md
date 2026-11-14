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

---

## Phase 2: Activity Log foundation

**Goal:** owners and admins see a 90-day list of management actions under Settings → Activity, and the existing team, pages, services, ownership and lifecycle actions record into it.

**Files:** `Sinwy.Backend/db/schema/organizationSchema.ts` (new `organization_activity` table), `Sinwy.Shared/types/organization/` (activity DTO and action keys), `Sinwy.Backend/modules/organizations/` (`repository.ts`, `service.ts` `recordActivity` / `listActivity`, `routes.ts`, `controller.ts`, `index.ts`, a cleanup job like `purge.ts`), `Sinwy.Backend/jobs.ts`; recording call sites: `auth/auth.ts` (`after` middleware at 315-335 and the `organizationHooks` at 376-408), `pages/service.ts` (`publishPage`, `unpublishPage`, `deletePage`), `services/service.ts` (`createService`, `updateService` price change, `archiveService`), `transfers/service.ts` (`offerTransfer`, `cancelTransfer`, `completeTransferOnPlan`, `transferOwnershipBySupport`), `organizations/service.ts` (activate and deactivate, called from `controller.ts:103+`); web `org-dashboard/routes/_shell.settings.tsx`, `_shell.settings.index.tsx`, new `_shell.settings.activity.tsx`, `org-dashboard/lib/` (activity queries).

**Steps:**
- One row per action: organization id (cascade), actor user id (set null), actor name snapshot, action key, small jsonb details (field names, role from/to, page title, service name, old/new price), occurred at. Index on (organization, occurred at).
- `recordActivity` is exported from the organizations module, called after the change commits, and catches and logs its own errors. The actor comes from the session user or is `system`. Use the lazy-import pattern where a static import would create a cycle.
- Record team actions where an actor is known. Use the `after` middleware with the session for invite, revoke, remove, role change and leave, and only when `ctx.context.returned` is a success. `afterAcceptInvitation` covers "member joined", with the joining user as actor.
- Log field names, never values, so contact details don't leak into the log.
- `GET` the list with `settings:manage`, cursor-paginated 50 at a time. An hourly job deletes rows older than 90 days.
- Web: turn `/settings` into a tabbed layout with General (the current page) and Activity. The Activity list shows an actor avatar or initial, a sentence built from a map of action keys, a relative time, and load more. Phases 3–5 add the other tabs.

**Tests that matter:**
- A failed write doesn't fail the action. A failed Better Auth call (for example a refused role change) records nothing.
- Staff get 403 on the list. Another organization's entries never show.
- Actor names survive the actor's account deletion.

**Done when:**
- Inviting, removing, publishing, archiving and offering a transfer each add one entry with the right actor and wording, and old rows are cleaned up.

**Verify:** Seed `org-with-staff --staff 1`. As the owner, change the staff member's role to admin, publish a page, archive a service and revoke a fresh invitation. Settings → Activity lists four entries, newest first, each naming the owner. Log in as the staff member (now admin) and see the same list. A new staff member opening `/settings/activity` gets the no-permission screen. Check `organization_activity` rows in the DB.

### Log (2026-11-14, `feat(shared, backend, web): add organization activity log`)
- Shipped: `organization_activity` table (migration `0028`; actor id set null on user delete, name snapshot, null name = Sinwy; UUIDv7 ids so same-millisecond entries keep their order; indexes on org+time+id, time and actor). `recordActivity`, `listActivity` (cursor `<iso>_<id>`, 50 per page) and the hourly `purgeActivityJob` in `organizations/activity.ts`; `GET …/activity` with `settings:manage`. Recorded: team invite, revoke, role change, remove and leave (`auth/teamActivity.ts`, from the `after` middleware, only on success), joined (`afterAcceptInvitation`, joining user as actor), page publish/unpublish/delete, service create/price change/archive, transfer offer/cancel/complete (completion by the recipient, support transfers as Sinwy), activate/deactivate. Web: `/settings` is a tabbed layout (General, Activity); the Activity tab lists avatar or initials, a sentence per action key, a relative time and Load more.
- Differs from plan: role changes store only the new role. Better Auth's response has no previous role and its hooks have no actor; with only admin and staff assignable, the old role is the other one. Invitations store the role, not the invited email, to keep contact details out. Activate/deactivate record only when the slot actually changed, which needed `holdSlot`/`releaseSlot` to report `changed`. Service creation is recorded (the plan listed it); page creation isn't.
- Checked in the running app: `org-with-staff --staff 1`. As the owner: role change to admin, invite, create and publish a page, create and archive a service, revoke the invitation. Settings → Activity listed them newest first, all naming the owner, plus the seed's own `organization.activated`. The promoted admin saw the same list. A newly invited staff member was redirected from `/settings/activity` with the access-denied toast and got 403 from the API. DB rows matched, with no email in any details; an admin-sent invite and a join were attributed correctly. No console or server errors. Not checked in the browser: Load more past 50 entries (covered by the API test). After the run the Activity list was capped at `max-w-3xl` to match General.
