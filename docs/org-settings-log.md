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

## Phase 3: Settings tabs and General

**Goal:** owners and admins edit the organization's name, logo, contact details and timezone on Settings → General, and see the slug and currency read-only.

**Files:** `organizations/routes.ts`, `controller.ts` (`listActivityHandler` shows the actor/`recordActivity` pattern), `service.ts` (`saveOrganizationProfile` at 354, `setOrganizationTimezone` at 382, `findWizardTarget` at 310), `repository.ts` (`updateOrganizationTimezone` at 194); `Sinwy.Shared/types/organization/OrganizationActivity.ts` (new action keys) and web `org-dashboard/lib/activity.ts` (their sentences); `user/avatar.ts` and `user/service.ts:58-80` (pipeline to reuse; move the generic image check somewhere both modules can import, not into another module's internals); `auth/auth.ts` (`before` middleware's `/organization/` branch at 310, to refuse `/organization/update`); `services/service.ts` `saveAvailability` at 247 and `services/repository.ts:145`; `Sinwy.Shared/types/service/Availability.ts:60`; web `org-dashboard/routes/_shell.settings.index.tsx` (General tab body only; the header and tabs are in `_shell.settings.tsx`), `organizations/components/BusinessProfileForm.tsx`, `org-dashboard/components/BusinessHoursForm.tsx:61-95`, `org-dashboard/routes/_shell.services.hours.tsx:84`, `org-dashboard/components/OrganizationSidebar.tsx` (switcher logo), `storefront/routes/index.tsx` (header logo), `shared/lib/organizations.ts` (`organizationsQuery`).

**Steps:**
- Endpoints with `settings:manage`, refused when inactive: update name (validated length) and timezone (`isTimeZone`); upload and remove the logo (avatar limits, key `logos/<org id>/<uuid>.<ext>`, the old file deleted after the new one is stored).
- Timezone moves out of the availability input. Hours only reads it, and the Hours page shows "Times are in <zone> · Change in Settings".
- The timezone confirm dialog says hours stay as wall-clock times and existing bookings keep their moment, so they may show at a different local time.
- Refuse Better Auth's `/organization/update` so neither the slug nor the logo URL can be set around these rules.
- General shows the slug with a copy button and the support hint, and the currency read-only next to the country, with a hint that existing services keep their price. The plan section stays. A "Your notification preferences" link is added once Phase 6 exists.
- After a rename or logo change, refresh the organizations query and the route context so the switcher and breadcrumbs update.
- Record activity for name, logo, profile (field names) and timezone changes.

**Tests that matter:**
- Staff and non-members can't change name, timezone or logo. A spoofed image (wrong magic bytes) is refused.
- Changing the timezone leaves booking instants and hour rows untouched.
- `/organization/update` with a new slug is refused.

**Done when:**
- An admin renames the org, uploads a logo and changes the timezone; the switcher, storefront header and Hours page reflect them.

**Verify:** Seed `bookable-org` and create one booking for tomorrow at 10:00 Vilnius time. As the owner, open Settings → General, rename the org, upload a PNG logo, and change the timezone to Europe/Berlin (the dialog warns). The sidebar switcher shows the new name and logo. Services → Hours shows Berlin read-only with a link. The booking shows 09:00 and its `starts_at` is unchanged in the DB. The storefront shows the logo. Activity lists the three changes.

### Log (2026-11-14, `feat(shared, backend, web): add organization general settings`)
- Shipped: `GET …/general`, `PUT …/name`, `PUT …/timezone`, `POST`/`DELETE …/logo` (all `settings:manage`; writes need an active organization). The image check moved from `user/avatar.ts` to `lib/image.ts` and `AVATAR_LIMITS` became `IMAGE_UPLOAD_LIMITS`; avatars and logos share it, and the web `ImageUpload` component. The availability input lost `timezone`; Hours shows "Times are in <zone> · Change in Settings" (link for owner/admin). Better Auth `/organization/update` is refused for everyone. Activity: `organization.renamed`, `logo_changed`, `logo_removed`, `profile_updated` (field names only) and `timezone_changed`, recorded only when something changed. General shows the slug read-only with copy, the currency as the Country hint, a timezone confirm dialog; the switcher and the storefront booking header show the logo. Shared `organizationNameSchema` is used by create and rename.
- Differs from plan: currency is shown as the Country field's hint ("Prices in EUR, from the country…"), which `ComboboxField` reveals on focus, rather than a separate read-only field. Name, timezone and logo writes refuse drafts too (drafts can't open Settings anyway); the profile save keeps allowing drafts for onboarding. The `bookable-org` seed set its timezone through the hours save and silently stayed on UTC; the e2e run fixed it to call `PUT …/timezone` and added a seed test.
- Checked in the running app: `bookable-org` with a booking for tomorrow 10:00 Vilnius. The owner renamed the org (breadcrumb and switcher updated with no reload, slug unchanged), uploaded a PNG (served 200, shown in the switcher, settings and storefront header) and changed the timezone to Europe/Berlin through the warning dialog. Hours showed Berlin read-only with the link, hour rows were unchanged, the booking showed 09:00 with `starts_at` unchanged, and Activity listed the three changes. Logo remove deleted the file (404). A spoofed PNG got 400 and `/organization/update` got 403. No console or server errors. Not checked in the browser: replacing a logo, the 2 MB limit, the clipboard contents, and admin/staff access (all but the clipboard are covered by API tests).

## Phase 4: Ownership & danger zone

**Goal:** the owner can delete any organization they own, active or not, from a clear confirm dialog, and the rules map matches.

**Files:** `auth/activeOrganization.ts:95` (`/organization/delete` refusal), `auth/auth.ts:430` (`beforeDeleteOrganization`; add `afterDeleteOrganization` for the stored logo), `organizations/` (deletion preview; logo cleanup through `keyFromFileUrl` as in `purge.ts:52` `deleteLogo`, or reuse `deleteStoredLogo` in `service.ts`), `transfers/` (find an accepted transfer awaiting checkout: `findTransferAwaitingCheckout`), `@bookingsModule` `countUpcomingOrganizationBookings`; web `org-dashboard/routes/_shell.settings.tsx` (`SETTINGS_TABS`, filter the owner-only tab), new `_shell.settings.ownership.tsx` (move `TransferSection` there from `_shell.settings.index.tsx`), `account-dashboard/routes/_shell.organizations.tsx` (row actions next to `DeactivateButton` at 253/310), `account-dashboard/components/settings/DangerZone.tsx` (dialog pattern), `shared/lib/organizations.ts` (`invalidateOrganizations`), `docs/org-rules-map.md` §3, §11, §15.

**Steps:**
- Let the owner delete while inactive or a draft. Organizations scheduled for deletion stay refused, and Better Auth's owner-only `organization:delete` still applies.
- Refuse while a transfer is accepted and awaiting checkout, with a message pointing to cancelling it.
- An owner-only preview endpoint returns the upcoming-booking count.
- The dialog says the organization, pages, services, bookings and team are removed; that N upcoming bookings are cancelled and those customers emailed; and that the plan isn't affected and one organization slot is freed. Confirm needs the slug typed exactly.
- After deletion, delete the stored logo. Members' sessions that had it active fall back as they do for any closed organization.
- The tab is owner-only (hidden and route-guarded for admins). It holds Transfer and Delete. After deleting, go to `/account/organizations` with a toast.
- Account → Organizations offers Delete on owned rows in any state but scheduled for deletion, using the same dialog.
- Rules map: remove Default 1's "differs from decision" and "no screen yet", and describe the dialog and the transfer refusal.

**Tests that matter:**
- Admin and staff deletion is refused. Deleting an inactive or draft org works and frees nothing it didn't hold.
- Deletion during an accepted transfer is refused.
- Upcoming bookings are cancelled with customer emails before the cascade, as today. The logo file is gone.

**Done when:**
- An owner deletes an active org from Settings and a draft from Account → Organizations; both disappear with their data.

**Verify:** Seed `bookable-org` and book one upcoming slot as a customer. As the owner, open Settings → Ownership & danger zone, see "1 upcoming booking", type the slug and delete. You land on Account → Organizations. The organization row is gone in the DB, the customer got the cancellation email (outbox), and the owner's held-slot count dropped by one (another draft can now be activated). Then seed `owner-with-org` and delete that draft from Account → Organizations. Log in as an admin of another seeded org: there's no Ownership tab, and a direct `POST /api/auth/organization/delete` returns 403.

### Log (2026-11-14, `feat(shared, backend, web): add organization deletion screens`)
- Shipped: `/organization/delete` is no longer a "manages" endpoint in `activeOrganization.ts`, so the owner can delete an inactive org or a draft. A scheduled org is still refused, and the plugin's owner-only check stays. `beforeDeleteOrganization` refuses with 409 while a transfer is `accepted` and not expired (`isTransferAwaitingCheckout` in `@transfersModule`), before any booking is cancelled. `afterDeleteOrganization` deletes the stored logo. `deleteStoredLogo` is now exported from organizations and used by the purge too. Owner-only `GET /api/account/organizations/:id/deletion-preview` (`OrganizationDeletionPreviewDto`: `upcomingBookings`, `transferAwaitingCheckout`, `holdsSlot`) returns 404 for non-owners and scheduled orgs. Web: shared `DeleteOrganizationDialog` (preview, slug typed exactly, blocked state for an awaiting transfer, invalidates the organizations, subscription and post-login flags). There's an owner-only "Ownership & danger zone" tab (`_shell.settings.ownership.tsx`, Transfer moved there from General) and a "Delete" action on owned rows in Account → Organizations in any state but scheduled. The rules map §3, §9, §10, §11 and §15 are updated. Tests: `auth/tests/organizationDeletion.test.ts`; `delete` left the generic endpoint table in `organizationEndpoints.test.ts`.
- Differs from plan: the preview lives in the `user` module (next to the account deletion preview), because organizations can't import bookings or transfers. The preview also returns `holdsSlot`, so the dialog says "one organization slot is freed" only when one is, and `transferAwaitingCheckout`, so it shows the refusal before the owner types. A pending (not yet accepted) transfer doesn't block deletion; it cascades with the org.
- Checked in the running app: `bookable-org` with one booking by a seeded customer. The owner saw the tab and the dialog ("1 upcoming booking will be cancelled…", "…one organization slot is freed"). Confirm stayed disabled until the exact slug was typed. Deleting landed on Account → Organizations with a toast. The org, its members and the booking were gone, the sessions' active org was NULL, and the customer got "Booking cancelled" with the closed reason. Held slots went from 1 to 0, and a second draft that was refused activation before now activated. An `owner-with-org` draft was deleted from Account → Organizations. An admin (promoted staff of `org-with-staff`) saw no Ownership tab, the direct URL redirected with "You don't have access", the API delete returned 403 and the preview 404. No console or web-log errors. Not checked in the browser (API tests cover them): logo file removal and the accepted-transfer refusal.

---

## Phase 5: Branding

**Goal:** owners and admins choose an accent color and font, and every hosted page, the booking flow and the dashboard preview use them.

**Files:** `Sinwy.Backend/db/schema/organizationSchema.ts` (`brand_color`, `brand_font`; a Drizzle migration), `Sinwy.Shared/types/organization/` (branding schema, font keys, label map; `OrganizationSettings.ts` holds `OrganizationGeneralDto`), `organizations/` (`routes.ts` `manageSettings` middlewares, `controller.ts`, `service.ts` `replaceField`/`editableTarget` pattern and `findPublicOrganization` at 114, `recordActivity` + a new `ActivityDetailsMap` key and `SENTENCES` entry in `org-dashboard/lib/activity.ts`), `Sinwy.Shared/types/booking/Storefront.ts` (`StorefrontDto`), `Sinwy.Shared/types/page/Page.ts` (`PublicPageDto`), `pages/service.ts` `getPublicPage` (290), `bookings/service.ts` (builds `StorefrontDto`); web `storefront/routes/route.tsx`, `index.tsx`, `$pageSlug.tsx`, `book.tsx`, `shared/components/page-content/PageRenderer.tsx`, `org-dashboard/routes/_shell.pages.$id.preview.tsx`, `org-dashboard/routes/_shell.settings.tsx` (`SETTINGS_TABS`), new `org-dashboard/routes/_shell.settings.branding.tsx`, `org-dashboard/lib/settings-queries.ts`, `styles.css`, `Sinwy.WebFrontend/package.json` (font packages).

**Steps:**
- Validate the color as `#rrggbb` and the font against the shared key list on both sides. Null resets to the default.
- Public DTOs carry `branding: { color, font }`. The storefront root sets CSS variables for the accent, the text on it and the font family. Buttons, links and highlights in the renderer and booking flow read the variables instead of the app's primary.
- Pick the text on the accent from contrast, with no refusal.
- Load the curated fonts as self-hosted `@fontsource` packages; only the chosen one is fetched by the browser.
- The Branding tab has a color input plus a few swatches, the font list rendered in its own face, a live preview card (heading, text, button), Reset, and a "Custom domain: coming soon" card.
- Record a "branding changed" activity entry.

**Tests that matter:**
- Invalid colors and unknown font keys are refused by the API. Staff can't save.
- A public page and the storefront of an unbranded org look exactly as before.

**Done when:**
- Saving a color and font changes the storefront, every published page, the booking flow and the dashboard preview.

**Verify:** Seed `bookable-org`. As the owner, open Settings → Branding and pick `#0f766e` and "Classic". The preview updates. Open the storefront: the book button is teal with white text and headings use Lora. Go through booking a slot: the buttons stay teal. Publish a page and open it: it's branded too. Reset brings Sinwy's defaults back. The `organization` row holds the values, then nulls.

### Log (2026-11-14, `feat(shared, backend, web): add organization branding`)
- Shipped: `organization.brand_color` (`#rrggbb`, lowercase, check-constrained) and `brand_font` (a `BRAND_FONTS` key, `oneOf` check), migration `0029_organization_branding`. Shared `OrganizationBranding.ts`: `BRAND_FONTS`, `BRAND_FONT_LABELS`, `organizationBrandingSchema` (strict, both keys required, null resets; the color is trimmed and lowercased) and `brandTextColor` (white or `#0a0a0a`, whichever has the higher WCAG contrast). `PUT /api/organizations/:id/branding` (owner + admin, active org only) records `organization.branding_changed` with the changed field names only (`fields: ["color" | "font"]`) and nothing when unchanged. `branding` was added to `OrganizationGeneralDto`, `OrganizationSummary`, `StorefrontDto.organization` and `PublicPageDto.organization`. Web: `shared/lib/branding.ts` (`BRAND_FONT_FAMILIES`, `brandAttributes`) spreads `data-brand-color`/`data-brand-font` plus CSS variables on the wrapper. The rules in `styles.css` remap `--primary`, `--primary-foreground`, `--primary-text` (lifted toward white in dark mode) and `--ring`, and set the font on the wrapper and on headings, `.font-heading` and `.font-sans` inside it. Four `@fontsource-variable` packages were added (Nunito, Lora, Playfair Display, Space Grotesk). They're imported globally, so only the faces in use get fetched. There's a new Branding tab (`_shell.settings.branding.tsx`, `components/settings/BrandingSection.tsx`) with swatches, a native picker and a hex field, the font list in its own faces, a live preview, Save, "Reset to defaults" (saves nulls at once) and a "Custom domain: Coming soon" section. Tests: branding cases in `organizations/tests/general.test.ts` (save, public DTO, activity fields, reset, invalid colors and fonts, staff 403, outsider 404, inactive 409), shape tests updated for unbranded nulls, web `shared/tests/branding.test.ts`.
- Differs from plan: the storefront layout (`route.tsx`) has no data, so the brand attributes go on each page's own wrapper (`book.tsx`'s outer div, `$pageSlug.tsx`'s `<article>`) rather than on the storefront root. The dashboard preview gets branding from the `OrganizationSummary` in `organizationsQuery`, because the preview is open to staff and `generalQuery` is `settings:manage` only. `bun add` re-resolved the web's `"latest"` TanStack packages, so the lockfile also bumps react-query 5.105→5.107 and the devtools patch versions, and `bun install --force` was needed to relink a stale `query-core` (see standing notes).
- Checked in the running app: `bookable-org` (`seed-e4e0b43a`). The owner picked the teal swatch and Classic. The preview updated (button `rgb(15,118,110)` with white text, heading in Lora), the save toasted, and the row held `#0f766e | classic`. Activity showed "changed the brand color and font". On the storefront the headings were in Lora, and through to a confirmed booking "Confirm booking" and "View booking" stayed teal with white text. A page created and published through the API was branded (Lora headings, teal button), and so was its dashboard preview, while the dashboard chrome stayed unbranded. Reset saved nulls in the row and the storefront and page went back to defaults. There were no console or log errors. Not checked in the browser (API tests cover them): typed and invalid hex input and the native picker, staff refusal. Open notes: unbranded, the `/book` headings are Inter while pages and the preview's "Sinwy default" use Manrope (`font-heading`), which predates this phase. A reset is logged the same as a save ("changed the brand color and font").


---

## Phase 6: Notification Preferences and staff emails

**Goal:** each member chooses which organization events email them, and staff receive booking emails.

**Files:** `Sinwy.Backend/db/schema/organizationSchema.ts` (new `member_notification_preference`, cascade on `member`; check constraints via `oneOf` as on `organization`; migration with `bun run db:generate -- --name …` then `bun run db:migrate`), `Sinwy.Shared/types/organization/` (preference DTO, event keys, defaults, role eligibility; export from `index.ts`), `organizations/` (`service.ts:417` `listOrganizationManagerEmails` → a recipient lookup per event that honours roles and preferences; `repository.ts:186` `findManagerEmails`; `index.ts` exports; new routes for the user's own preferences across memberships, like the `/api/account/organizations/:id/…` routes in `routes.ts`), `bookings/dispatch.ts` (`emailsFor` at 30, `sendBookingEmails` at 86, manager lookup at 119), `payments/service.ts` (`markPaid` at 140), new email template in `payments/` or `bookings/emails/`; web `account-dashboard/routes/_shell.notifications.tsx` (Inbox and Preferences tabs; the Settings tab nav in `org-dashboard/routes/_shell.settings.tsx` is a pattern), the account sidebar nav, `org-dashboard/routes/_shell.settings.index.tsx` (link to preferences).

**Steps:**
- Events: `booking.new` (created by a customer, requests included), `booking.cancelled_by_customer`, `payment.recorded`. Defaults on, on, off. Roles: booking events go to owner, admin and staff; `payment.recorded` to owner and admin only.
- The recipient lookup returns member emails with the event enabled. Its default is used when there's no row.
- `dispatch.ts` asks for recipients per event instead of the manager list. The rest of the matrix is unchanged.
- Marking a payment paid sends "Payment recorded" after commit, best effort, to opted-in owners and admins other than the actor.
- `GET` returns the user's memberships with their preferences (only the events their role can receive); `PUT` saves one organization's preferences. Both are scoped to the session user, and the organization must not be scheduled for deletion.
- The Preferences tab lists one block per organization, with switches labelled as email.

**Tests that matter:**
- Opting out stops that member's email only. Staff never get `payment.recorded`, even with a forged `PUT`.
- A user can't read or write another member's preferences.
- A new staff member receives the new-booking email with no row saved.

**Done when:**
- With defaults, a customer booking emails owner, admin and staff. After the admin turns it off, only the owner and staff get it.

**Verify:** Seed `bookable-org` and add one staff member (`org-with-staff` flow or invite). Book "Haircut" as a customer. The outbox has new-booking emails for the owner and staff. As the owner, open Account → Notifications → Preferences, turn "New booking" off for that org and book again: only the staff email is sent. As staff, the Preferences block shows no payment row. Mark a payment paid as staff: an owner with "Payment recorded" switched on gets the email. Check `member_notification_preference` rows.

### Log (2026-11-14, `feat(shared, backend, web): add member notification preferences`)
- Shipped: shared `NotificationPreferences.ts` (`NOTIFICATION_EVENTS`, `NOTIFICATION_EVENT_DEFAULTS`, `NOTIFICATION_EVENT_ROLES`, `NOTIFICATION_EVENT_LABELS`, `notificationEventsFor(roles)`, the strict `notificationPreferencesInputSchema` with `email` as a partial record, so unknown keys are a 400, and `OrganizationNotificationPreferencesDto`). There's a new table `member_notification_preference` (migration `0030`) with one row per member: `member_id` PK cascading with `member`, and three non-null booleans whose DB defaults come from the shared defaults. `organizations/notificationPreferences.ts` has `listNotificationRecipients(orgId, event, { exceptUserId })`, exported from the module, which replaces `listOrganizationManagerEmails`/`findManagerEmails`. It's a LEFT JOIN with `coalesce(column, default)` plus a role filter. It also has `listNotificationPreferences` and `saveNotificationPreferences`. Routes: `GET /api/account/notification-preferences` and `PUT /api/account/organizations/:organizationId/notification-preferences`, session user only; an organization scheduled for deletion is left out of the GET and gives 404 on the PUT. In `dispatch.ts`, the org half of the matrix now carries its event key. "Payment recorded" lives in `payments/emails.ts` (`PaymentRecordedEmail`, `sendPaymentRecordedEmails`, best effort) and is called by `markPaidHandler` after a successful mark. `formatBookingTime` moved to `lib/localDate.ts` as `formatLocalTime`, because bookings imports payments and the reverse would be circular. Web: `/account/notifications` is a layout with Inbox (`notifications.index`) and Preferences (`notifications.preferences`) tabs; the preference switches save on toggle, optimistically. The tab nav was extracted to `shared/components/RouteTabs.tsx`, and Settings uses it too. Settings → General has a Notifications section linking to the preferences. Tests: `organizations/tests/notificationPreferences.test.ts` (defaults, role filtering, opt-out, forged staff PUT, outsider and other-org 404, scheduled org, cascade, 401), a payment email test in `payments.test.ts`, and storefront/changes tests updated so staff now get new-booking emails, plus an opt-out case.
- Differs from plan: preferences are stored as boolean columns, one row per member as Default 6 says, so there's no `oneOf` constraint. A PUT with events the role can't receive ignores them rather than refusing them, so a member demoted between load and save doesn't hit an error; the recipient lookup also filters by role. Staff can't mark payments (an existing rule, 403), so the Verify's "mark a payment paid as staff" used a promoted admin. The "Payment recorded" description reads "Someone else marks…" because the actor is never emailed.
- Checked in the running app: on `bookable-org` (`seed-8ed5df85`) plus a staff member who joined through the real invite flow, a customer booking emailed the owner and the staff member. The owner turned New booking off in the browser (row `f,t,f`), and the next booking emailed only staff. The staff block showed no payment row, and a forged staff PUT was ignored with no row written. Unknown key gave 400, a non-member gave 404, and staff mark-paid gave 403. After promoting the staff member to admin, the owner switched Payment recorded on and the admin marked a payment paid: exactly one "Payment recorded: €25.00 for Haircut" went to the owner and none to the admin, and its link opened the booking. The Settings → General link worked. Logs and console were clean. Not checked in the app (API tests cover them): the cancelled-by-customer email and its opt-out, and a real Resend send.
