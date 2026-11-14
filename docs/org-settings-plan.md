# Organization settings plan

Phase 11 of the MVP: the basic organization settings and polish. It adds a Settings area with tabs (General, Branding, Activity, Ownership & danger zone), the Activity Log, Branding on hosted pages, a screen for deleting an organization, per-member Notification Preferences and an in-app notification center in both shells. Every part is a basic version to build on later. It also renames "block" to "widget" across the Page Builder, so code and product use one word. Terms are defined in [CONTEXT.md](../CONTEXT.md).

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [org-settings-log.md](org-settings-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Block → Widget rename | – | done | `feat(shared, backend, web): rename page blocks to widgets` |
| 2 | Activity Log foundation | – | done | `feat(shared, backend, web): add organization activity log` |
| 3 | Settings tabs and General | 2 | done | `feat(shared, backend, web): add organization general settings` |
| 4 | Ownership & danger zone | 3 | done | `feat(shared, backend, web): add organization deletion screens` |
| 5 | Branding | 1, 3 | done | `feat(shared, backend, web): add organization branding` |
| 6 | Notification Preferences and staff emails | 2 | done | `feat(shared, backend, web): add member notification preferences` |
| 7 | In-app notification center | 6 | done | `feat(shared, backend, web): add in-app notification center` |
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
- **Settings tabs:** `_shell.settings.tsx` is the layout (PageHeader + `SETTINGS_TABS` in a shared `RouteTabs` nav (`shared/components/RouteTabs.tsx`, also used by `/account/notifications`): General, Branding, Activity, Ownership) and guards `settings:manage`; tab pages render only their `ContentBox`. An owner-only tab needs its own `beforeLoad` guard and a filtered tab list. Settings content is capped at `max-w-3xl`. General (`_shell.settings.index.tsx`) holds Organization, Business profile, Timezone and Plan; Ownership holds `TransferSection` and Delete; its sections are in `org-dashboard/components/settings/`.
- **General data:** `GET …/general` (`OrganizationGeneralDto`) via `generalQuery` in `org-dashboard/lib/settings-queries.ts`; after a change `useRefreshGeneral` invalidates it, availability, the organizations list and the router (so breadcrumbs and switcher update). `OrganizationSummary` and `StorefrontDto` carry `logo`. The org shell's route-context `organization` is Better Auth's, not the summary; read the summary from `organizationsQuery` by id.
- **Better Auth hooks** (installed version): leaving fires no hook, so the `after` middleware in `auth.ts` handles `/organization/leave`; it also records team activity for `TEAM_ACTIVITY_PATHS` from `ctx.context.returned` (`auth/teamActivity.ts`). A refused call's `returned` is an `APIError`. Hook payloads name the affected user, not the actor, except `afterCancelInvitation`, which has `cancelledBy`. `afterAcceptInvitation` gets `{ invitation, member, user, organization }`, `afterUpdateMemberRole` gets `{ member, previousRole, user, organization }`, and `afterRemoveMember` gets `{ member, user, organization }`. The `after` middleware has the session (`getSessionFromCtx`), `ctx.path`, `ctx.body` and `ctx.context.returned`.
- **`Membership`** (`auth/requirePermission.ts:21`) has no user id. Controllers take the actor from the session user and pass it to the service.
- **Organization deletion** is Better Auth's `/organization/delete` (owner only by the plugin; allowed inactive or draft, refused when scheduled or during an accepted transfer: `beforeDeleteOrganization` in `auth.ts`; `afterDeleteOrganization` deletes the logo through `deleteStoredLogo`). Its sessions' `active_organization_id` becomes NULL. Preview: `GET /api/account/organizations/:id/deletion-preview` in `user/`. The web dialog is `modules/organizations/components/DeleteOrganizationDialog.tsx`. `/organization/update` is refused outright at the top of the `before` middleware's `/organization/` branch (`auth.ts`). See the Phase 4 log.
- **Slots:** `holdSlot` returns `{ result: "held", changed }` and `releaseSlot` returns `{ found, changed }`, so callers can tell a no-op from a change.
- **Owner check** on the web: `hasPermission(member.roles, "billing:manage")` is the owner's alone. `SETTINGS_TABS` entries take `ownerOnly: true`; the owner-only route guards with `requirePermission("billing:manage")` (`_shell.settings.ownership.tsx`). `settings:manage` is owner + admin; staff can't open `/settings` (`org-dashboard/lib/sections.ts`).
- **Timezone** is written only by `PUT …/timezone` (`changeOrganizationTimezone`); the availability input has no `timezone` (a stray one is stripped). Name, timezone and logo writes need an active organization (409 otherwise); the profile save still allows drafts.
- **Image uploads:** `Sinwy.Backend/lib/image.ts` (`readImageUpload`, `validateImage`, `respondImageError`; limits are `IMAGE_UPLOAD_LIMITS` in shared). Logos are `logos/<org id>/<uuid>.<ext>` in `organization.logo`, set by `uploadOrganizationLogo`/`removeOrganizationLogo` (old file deleted, best effort). Both the purge and an immediate delete remove the logo file (`deleteStoredLogo`). Web: `shared/components/ImageUpload.tsx`.
- **Booking notices:** the matrix is `noticesFor` in `bookings/dispatch.ts`: per side `{ template, notification? }` (customer) and `{ template, notification }` (organization; its email event is `ORGANIZATION_NOTIFICATION_EVENTS[notification]`). `sendBookingEmails` sends the emails (`listNotificationRecipients`) and writes the notifications. It runs after commit and never throws.
- **Notification Preferences:** shared `NotificationPreferences.ts` holds the event keys, defaults and `NOTIFICATION_EVENT_ROLES` (`notificationEventsFor(roles)` gives a member's eligible events). Recipients come from `organizations/notificationPreferences.ts`; preferences are boolean columns on `member_notification_preference`, no row = defaults. The account page is `account-dashboard/routes/_shell.notifications.tsx` (layout, Inbox + Preferences tabs). See the Phase 6 log.
- **Payments** are manual only (`PAYMENT_PROVIDERS = ["manual"]`). Only owner and admin can mark paid (staff 403). `markPaidHandler` (`payments/controller.ts:79`) calls `sendPaymentRecordedEmails` (`payments/emails.ts`) with the session user as actor, who is excluded. Bookings imports payments, so payments can't import bookings; shared time formatting is `formatLocalTime` in `lib/localDate.ts`.
- **Jobs** are registered in `Sinwy.Backend/jobs.ts` (the activity cleanup is `purgeActivityJob`). Organizations can't import bookings; wire cross-module work there or through the lazy `bookingsModule()` pattern in `auth.ts`.
- **Branding:** `organization.brand_color`/`brand_font` (nullable, check-constrained), `PUT …/branding` (`organizationBrandingSchema`). `branding` rides on `OrganizationGeneralDto`, `OrganizationSummary`, `StorefrontDto.organization` and `PublicPageDto.organization`. The web applies it with `brandAttributes()` (`shared/lib/branding.ts`) spread on the hosted content's wrapper; unbranded adds nothing. See the Phase 5 log.
- **shadcn CLI:** `shadcn add` writes `import { cn } from "cn"` and adds the npm package `cn`; change the import to `@/shared/lib/utils` and revert `package.json`/`bun.lock`.
- **Dependencies:** the web's TanStack packages are `"latest"`, so any lockfile change (even `bun add` of something else) bumps them. If the type check then fails with two `query-core` versions, run `bun install --force` to relink Bun's store.
- **Dev servers:** the backend (`bun run start:server`, log `/tmp/sinwy-server.log`, port 3001) runs without watch; restart it after backend changes before an e2e check. Killing a server the session didn't start is blocked by auto mode, so ask the user first. Phase 7 restarted it from this session's work (log as above), so it can be stopped at cleanup. The web server (`/tmp/sinwy-web.log`) hot-reloads and regenerates the route tree.
- **Notifications:** `@notificationsModule` (`notifyOrganization`, `notifyUser`, `notifyEmail`, `readInvitationNotifications`), best effort. Org rows have `organization_id` + `member_id` (cascade; no org FK), personal rows neither; org routes run behind `requireMember`, personal under `/api/account/notifications`, mark one at `/api/notifications/:id/read`. Web: `shared/lib/notifications.ts`, `shared/components/notifications/`, `AppShell` `actions` slot. See the Phase 7 log.
- **Seed scenarios** (`e2e-test` skill): `subscribed-org`, `pro-org`, `org-with-staff --staff n`, `bookable-org`, `owner-with-org`, `user`. `--staff` only applies to `org-with-staff` and is silently ignored elsewhere; to give `bookable-org` staff, seed a `user` and invite them through the real flow (`invite-member` + accept on `/invite/<id>`). `bookable-org` sets its timezone through `PUT …/timezone`, so it starts with a "changed the timezone" Activity entry. `org-with-staff` has no admin; promote a staff member with `POST /api/auth/organization/update-member-role` as the owner. Seeded subscriptions exist only in the DB, so the backend logs `WARN [billing] Polar subscription read failed` for them, which is expected.

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

## Phase 8: Code review

**Goal:** the deletion, permission and notification paths are reviewed and the plan is closed.

**Files:** every file changed in phases 1–7 (`git diff 39d4936`, the plan's first commit). Focus files: org deletion in `modules/auth/auth.ts` (`before`/`after` middleware, organization hooks), `modules/user/` deletion preview, `modules/organizations/{controller,routes,service,activity,notificationPreferences,repository}.ts`, `modules/notifications/`, `modules/bookings/dispatch.ts`, `modules/payments/emails.ts`, `modules/transfers/service.ts`, migrations `drizzle/0027`–`0032` (0027 is Phase 1's widget jsonb migration), `Sinwy.Shared/types/{organization,notification}/`, web `shared/components/notifications/`, `shared/lib/notifications.ts`, `org-dashboard/routes/_shell.settings*.tsx`, `modules/organizations/components/DeleteOrganizationDialog.tsx`; plus `docs/org-rules-map.md`, `CONTEXT.md`, this plan and its log.

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
