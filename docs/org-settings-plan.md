# Organization settings plan

Phase 11 of the MVP: the basic organization settings and polish. It adds a Settings area with tabs (General, Branding, Activity, Ownership & danger zone), the Activity Log, Branding on hosted pages, a screen for deleting an organization, per-member Notification Preferences and an in-app notification center in both shells. Every part is a basic version to build on later. It also renames "block" to "widget" across the Page Builder, so code and product use one word. Terms are defined in [CONTEXT.md](../CONTEXT.md).

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [org-settings-log.md](org-settings-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Block → Widget rename | – | done | `feat(shared, backend, web): rename page blocks to widgets` |
| 2 | Activity Log foundation | – | done | `feat(shared, backend, web): add organization activity log` |
| 3 | Settings tabs and General | 2 | done | `feat(shared, backend, web): add organization general settings` |
| 4 | Ownership & danger zone | 3 | todo | |
| 5 | Branding | 1, 3 | todo | |
| 6 | Notification Preferences and staff emails | 2 | todo | |
| 7 | In-app notification center | 6 | todo | |
| 8 | Code review | 1–7 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Scope.** General settings, Branding, the Activity Log, the danger zone, Notification Preferences and the notification center are in. Custom domains are deferred (see Deferred to other tickets).
- **Slug is read-only.** Shown with a copy button and "Contact support to change it". Nothing may change a slug, Better Auth's own endpoint included.
- **Currency follows the country.** Shown read-only next to the country, with a hint that existing services keep their price. There's no separate picker.
- **Timezone lives in Settings → General.** Services → Hours shows it read-only with a "Change in Settings" link. Changing it keeps hours as wall-clock times and keeps every booking's instant, and the confirm dialog says so. Analytics days already rolled up stay in the old zone.
- **Logo** reuses the avatar upload pipeline (validation, storage, files route). It's shown in the org switcher and the storefront header.
- **Branding** is one accent color plus one font from a short curated list. It applies to every hosted page and the booking flow of the organization, on every plan. Per-page overrides and extra color slots come later and may be tier-gated.
- **Widget, not block.** The user-facing word is "widget", and the code and stored data follow it. The plan feature `page-builder` becomes `advanced-widgets` ("Advanced widgets"). The Page Builder itself is on every plan; only some widgets and some widget options are tier-gated.
- **Deleting an organization changes no billing.** It frees the slot, cancels upcoming bookings and emails those customers (the existing behaviour). The ticket's "cancels subscription" is wrong for this model.
- **Danger zone is owner-only**, with a confirm that shows the upcoming-booking count and needs the slug typed. Inactive organizations and drafts can be deleted from Account → Organizations with the same dialog. This closes the Default 1 gap in [org-rules-map.md](org-rules-map.md) §11.
- **Notification Preferences** are per membership and email-only. New booking (requests included) defaults to on, cancelled by customer to on, payment recorded to off. Staff now receive the booking ones: every booking, since staff aren't assigned to services. Payment recorded goes to owner and admin only. Customer emails stay transactional, with no preference.
- **Preferences live in the account shell**, on a Preferences tab of `/account/notifications`, with one block per organization. Staff can reach them there; org Settings links to them.
- **Notification center:** one inbox per user. The org shell bell shows only that organization's notifications. The account shell bell and `/account/notifications` show personal ones (own bookings confirmed, declined, cancelled by the business or moved; invitations; transfer offers). Unread per notification, mark all read, a "9+" cap on the count. Refetch on focus plus a ~60 s poll, with no push. Deleted after 90 days. In-app notifications have no preference.
- **Activity Log:** management actions only (settings, team, pages, services, ownership, lifecycle), never booking changes. Owner and admin see it under Settings → Activity, newest first, with load more. The actor is stored with a name snapshot, and system actions read "Sinwy". Entries are deleted after 90 days.
- **Activity is written after the change commits**, best effort. A failed write is logged and never fails the action.
- **Settings tabs:** General, Branding, Activity (owner and admin) and Ownership & danger zone (owner only, holding the existing Transfer section).

### Defaults (not yet confirmed; change only if asked)

1. Name, timezone and logo get Sinwy endpoints under the organizations module. Better Auth's `/organization/update` is refused for everyone, because it can change the slug and the logo URL.
2. Branding is stored as two nullable columns on `organization` (`brand_color` as `#rrggbb`, `brand_font` as a key). Null means Sinwy's defaults.
3. The font list has five options with friendly labels, each a self-hosted `@fontsource` package: Modern (Inter, already installed), Friendly (Nunito), Classic (Lora), Elegant (Playfair Display), Technical (Space Grotesk).
4. There's no contrast refusal. The text on the accent color is picked automatically, white or near-black, whichever contrasts more.
5. Logo limits and accepted types are the avatar's (`AVATAR_LIMITS`).
6. Preferences are a `member_notification_preference` row per member, created on first save and cascading with the member. A missing row means the defaults.
7. Deleting an organization is refused while a transfer is accepted and waiting on the recipient's checkout, so a late webhook can't complete a transfer of a deleted organization.
8. An invitation creates a personal notification only if a user with the invited email already exists at invite time.
9. The Activity list loads 50 entries at a time; the notification list loads 30.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Widgets:** page content is `{ schemaVersion: 1, widgets: PageWidget[] }` with nested `children`, a strict schema (unknown keys refused). Premium widgets and templates use `requires: "advanced-widgets"`. The renderer tags each widget with `data-widget="<type>"`. There's still no editor UI. See the Phase 1 log.
- **Activity Log:** record with `recordActivity(organizationId, actor, { action, details })` from `@organizationsModule`, after the write; `actor` is the session user (`sessionFrom(c).user`) or `null` for Sinwy. A new action needs a key in `ActivityDetailsMap` (`Sinwy.Shared/types/organization/OrganizationActivity.ts`) and a sentence in `SENTENCES` (`org-dashboard/lib/activity.ts`). Details hold names and roles only, never contact details or field values. Seeded active orgs start with one `organization.activated` entry. See the Phase 2 log.
- **Settings tabs:** `_shell.settings.tsx` is the layout (PageHeader + `SETTINGS_TABS` nav, styled off `Link`'s `data-status="active"`) and guards `settings:manage`; tab pages render only their `ContentBox`. An owner-only tab needs its own `beforeLoad` guard and a filtered tab list. Settings content is capped at `max-w-3xl`. General (`_shell.settings.index.tsx`) holds Organization, Business profile, Timezone, Plan and (owner) `TransferSection`; its sections are in `org-dashboard/components/settings/`.
- **General data:** `GET …/general` (`OrganizationGeneralDto`) via `generalQuery` in `org-dashboard/lib/settings-queries.ts`; after a change `useRefreshGeneral` invalidates it, availability, the organizations list and the router (so breadcrumbs and switcher update). `OrganizationSummary` and `StorefrontDto` carry `logo`.
- **Better Auth hooks** (installed version): leaving fires no hook, so the `after` middleware in `auth.ts` handles `/organization/leave`; it also records team activity for `TEAM_ACTIVITY_PATHS` from `ctx.context.returned` (`auth/teamActivity.ts`). A refused call's `returned` is an `APIError`. Hook payloads name the affected user, not the actor, except `afterCancelInvitation`, which has `cancelledBy`. `afterAcceptInvitation` gets `{ invitation, member, user, organization }`, `afterUpdateMemberRole` gets `{ member, previousRole, user, organization }`, and `afterRemoveMember` gets `{ member, user, organization }`. The `after` middleware has the session (`getSessionFromCtx`), `ctx.path`, `ctx.body` and `ctx.context.returned`.
- **`Membership`** (`auth/requirePermission.ts:21`) has no user id. Controllers take the actor from the session user and pass it to the service.
- **Inactive refusal:** `/organization/delete` is `manages: true` in `auth/activeOrganization.ts:95`, so it's refused while the organization is inactive. That's the cause of the Default 1 gap. `/organization/update` is refused outright at the top of the `before` middleware's `/organization/` branch (`auth.ts`).
- **Slots:** `holdSlot` returns `{ result: "held", changed }` and `releaseSlot` returns `{ found, changed }`, so callers can tell a no-op from a change.
- **Owner check** on the web: `hasPermission(member.roles, "billing:manage")` is the owner's alone (`_shell.settings.index.tsx`). `settings:manage` is owner + admin; staff can't open `/settings` (`org-dashboard/lib/sections.ts`).
- **Timezone** is written only by `PUT …/timezone` (`changeOrganizationTimezone`); the availability input has no `timezone` (a stray one is stripped). Name, timezone and logo writes need an active organization (409 otherwise); the profile save still allows drafts.
- **Image uploads:** `Sinwy.Backend/lib/image.ts` (`readImageUpload`, `validateImage`, `respondImageError`; limits are `IMAGE_UPLOAD_LIMITS` in shared). Logos are `logos/<org id>/<uuid>.<ext>` in `organization.logo`, set by `uploadOrganizationLogo`/`removeOrganizationLogo` (old file deleted, best effort). The hourly purge deletes logos (`organizations/purge.ts:52`), but an immediate delete through Better Auth doesn't. Web: `shared/components/ImageUpload.tsx`.
- **Booking emails:** the matrix is `emailsFor` in `bookings/dispatch.ts`. Organization emails go to `listOrganizationManagerEmails` → `findManagerEmails` (`organizations/repository.ts:178`, owner + admin). It runs after commit and never throws.
- **Payments** are manual only (`PAYMENT_PROVIDERS = ["manual"]`). "Payment recorded" means a member marked a payment paid.
- **Jobs** are registered in `Sinwy.Backend/jobs.ts` (the activity cleanup is `purgeActivityJob`). Organizations can't import bookings; wire cross-module work there or through the lazy `bookingsModule()` pattern in `auth.ts`.
- **Hosted page data:** the storefront layout is the bare `storefront/routes/route.tsx`. `StorefrontDto` is in `Sinwy.Shared/types/booking/Storefront.ts` and `PublicPageDto` in `Sinwy.Shared/types/page/Page.ts`. `findPublicOrganization` is at `organizations/service.ts:114`.
- **Fonts:** `styles.css:1,5` loads Manrope/Fraunces from Google Fonts and Inter through `@fontsource-variable/inter`.
- **Dev servers:** the backend (`bun run start:server`, log `/tmp/sinwy-server.log`, port 3001) runs without watch; restart it after backend changes before an e2e check. Killing a server the session didn't start is blocked by auto mode, so ask the user first. The web server (`/tmp/sinwy-web.log`) hot-reloads and regenerates the route tree.
- **Shell:** the header in `shared/components/shell/AppShell.tsx:86` holds the sidebar trigger and breadcrumbs, and is where the bell goes. `shared/` must not import `modules/`.
- **Upcoming-booking counts** exist: `countUpcomingOrganizationBookings(ids)` in `@bookingsModule`, used by the account deletion preview (`user/service.ts:87`).
- **Seed scenarios** (`e2e-test` skill): `subscribed-org`, `pro-org`, `org-with-staff --staff n`, `bookable-org`, `owner-with-org`. `bookable-org` sets its timezone through `PUT …/timezone`, so it starts with a "changed the timezone" Activity entry.

## Deferred to other tickets

Reminder for whoever plans next: these were raised and consciously left out of Phase 11.

- Custom domains: DNS instructions, verification status, TLS, host routing. Branding shows a "Coming soon" card.
- Changing the slug, with old slugs kept as redirects.
- A currency picker independent of the country.
- Tier-gated branding: per-page overrides, extra color slots, removing "Powered by Sinwy".
- Assigning staff to services, and sending booking notifications only to the assigned staff.
- Real-time notifications (SSE/WebSocket), and a feed across organizations.
- Activity Log filters, longer retention as a tier gate, and in-transaction ("never misses") logging.
- Payment notifications from a real provider (Stripe Connect).

---

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

---

## Phase 5: Branding

**Goal:** owners and admins choose an accent color and font, and every hosted page, the booking flow and the dashboard preview use them.

**Files:** `organizationSchema.ts` (`brand_color`, `brand_font`), `Sinwy.Shared/types/organization/` (branding schema, font keys, label map), `organizations/` (save endpoint with `settings:manage`, `findPublicOrganization` at 102), `Sinwy.Shared/types/booking/Storefront.ts` (`StorefrontDto`), `Sinwy.Shared/types/page/Page.ts` (`PublicPageDto`), `pages/service.ts` `getPublicPage`, the storefront handler in `bookings/`; web `storefront/routes/route.tsx`, `index.tsx`, `$pageSlug.tsx`, `book.tsx`, `shared/components/page-content/PageRenderer.tsx`, `org-dashboard/routes/_shell.pages.$id.preview.tsx`, new `org-dashboard/routes/_shell.settings.branding.tsx`, `styles.css`, `Sinwy.WebFrontend/package.json` (font packages).

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

---

## Phase 6: Notification Preferences and staff emails

**Goal:** each member chooses which organization events email them, and staff receive booking emails.

**Files:** `organizationSchema.ts` (new `member_notification_preference`, cascade on `member`), `Sinwy.Shared/types/` (preference DTO, event keys and defaults), `organizations/` (`listOrganizationManagerEmails` → a recipient lookup per event that honours roles and preferences; `repository.ts:178`; routes for the user's own preferences across memberships), `bookings/dispatch.ts` (`emailsFor`, `sendBookingEmails`), `payments/service.ts` (where a payment becomes `paid`), new email template in `payments/` or `bookings/emails/`; web `account-dashboard/routes/_shell.notifications.tsx` (Inbox and Preferences tabs), the account sidebar nav, `org-dashboard/routes/_shell.settings.index.tsx` (link to preferences).

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

---

## Phase 7: In-app notification center

**Goal:** both shells have a bell with an unread count, and `/account/notifications` lists personal notifications. Organization notifications show only in that organization's dashboard.

**Files:** `organizationSchema.ts` or a new `notificationSchema.ts` (new `notification` table), `Sinwy.Shared/types/` (notification DTO and type keys), a notifications home in the backend (a new `modules/notifications/`, which other modules call through its `index.ts`), `bookings/dispatch.ts` (org events and customer personal events from the same matrix), `payments/service.ts` (payment recorded), `auth/auth.ts` `sendInvitationEmail` at 353 (invitations), `transfers/service.ts` `offerTransfer` at 152 (offers), `Sinwy.Backend/jobs.ts` (90-day cleanup); web `shared/components/shell/AppShell.tsx` (a header slot for the bell), new shared `shared/components/notifications/` (bell, list items), org shell `org-dashboard/routes/_shell.tsx`, account shell `account-dashboard/routes/_shell.tsx`, `account-dashboard/routes/_shell.notifications.tsx` (Inbox tab).

**Steps:**
- One row per recipient: user id (cascade), optional organization id (cascade), type, a link target, a small jsonb payload for the sentence, read at, created at. Indexes for (user, organization, created at) and unread counts.
- Org notifications go to every member eligible for the event by role, regardless of email preference. Personal ones go to the customer's user (for bookings with a `customerUserId`), the invited user if they exist, and the transfer recipient.
- Written after commit, best effort, from the same places that send the emails, so both always agree.
- API: list (scoped to `organizationId` or personal), unread count, mark one read, mark all read, all for the session user only. A notification of an organization scheduled for deletion isn't returned.
- The bell goes in the `AppShell` header through a prop/slot so `shared/` stays free of modules. The popover holds the latest items, "Mark all read" and "View all" (account shell). The count shows "9+". Refetch on focus and every ~60 s.
- Clicking an item marks it read and opens its link (booking detail, invitation, transfer offer).
- An hourly job deletes notifications older than 90 days.

**Tests that matter:**
- A user never sees another user's notifications. Org notifications don't appear in the account inbox, and vice versa.
- Removing a member or deleting an organization removes its notifications for them. Staff get no payment notifications.

**Done when:**
- A customer booking makes the owner's org bell show 1. The customer's account bell shows "Booking confirmed". Mark all read clears both.

**Verify:** Seed `bookable-org` with one staff member, and a separate `user` as the customer. As the customer, book "Haircut". The owner and staff, in the org dashboard, see a bell count of 1 with "New booking: Haircut, <time>"; clicking it opens the booking and the count drops. The customer's account bell shows "Booking confirmed", and `/account/notifications` lists it. Invite the customer to the org as staff: their account bell shows the invitation, linking to `/invite/<id>`. Check `notification` rows. Nothing simulated beyond the seed and the outbox.

---

## Phase 8: Code review

**Goal:** the deletion, permission and notification paths are reviewed and the plan is closed.

**Files:** every file changed in phases 1–7 (`git diff` from the plan's first commit), `docs/org-rules-map.md`, `CONTEXT.md`, this plan and its log.

**Steps:**
- Review with focus on: org deletion (owner-only, inactive allowed, the transfer refusal, logo cleanup, booking emails before the cascade); every new endpoint's permission and organization scoping; that activity and notification writes can't fail their action; the jsonb migration on real-shaped data; that notification and activity payloads don't leak contact details.
- Fix what the review finds, run `bun run verify` once, and update the rules map's "Known gaps" with anything left open.
- Move the remaining Defaults that held into Decisions or the log, and mark the plan done.
- Final cleanup: stop every dev server started during the plan's work unless the user asked to keep it running, and delete the temporary files and artifacts the work created (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- Whatever the review flags, with a regression test for each real bug.

**Done when:**
- `bun run verify` exits 0, the review findings are fixed or written down as known gaps, and the plan's status table is complete.

**Verify:** None (each phase ran its own e2e check).
