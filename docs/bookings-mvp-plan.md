# Bookings MVP plan

Lets an organization take bookings. Signed-in customers book on the org's public storefront, and staff add phone and walk-in bookings, manage them in a calendar and a list, and work requests through a status machine that sends emails. The overview and Customer Mode get real content. This is the first working version; staff and resources, payments, customer records, background jobs and a page builder come in later plans.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [bookings-mvp-log.md](bookings-mvp-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Move the dashboard to `/dashboard/$organizationSlug` | – | todo | |
| 2 | Bookings schema, status rules and the approval switch | 1 | todo | |
| 3 | Create bookings, the capacity check, list and calendar API | 2 | todo | |
| 4 | Status changes, reschedule, edits and booking emails | 3 | todo | |
| 5 | Storefront module and the public booking flow | 4 | todo | |
| 6 | Bookings calendar and list (web) | 3 | todo | |
| 7 | Booking detail, manual booking and reschedule (web) | 4, 5, 6 | todo | |
| 8 | Overview page | 4 | todo | |
| 9 | Customer Mode bookings | 4, 5 | todo | |
| 10 | Bookings when an org, account or service goes away | 4 | todo | |
| 11 | Code review | 1–10 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Customers book themselves, signed in only.** Signed-out visitors browse services and times; confirming needs a session. There are no guest bookings from the storefront.
- **Manual bookings have no account.** Staff enter a name plus at least one of email or phone; `customerUserId` stays null.
- **Every booking stores a contact snapshot** (`customerName`, `customerEmail`, `customerPhone`). For self-bookings it's copied from the user, with an optional phone the customer types in.
- **Two notes.** `customerNote` is written by the customer and read-only for staff. `internalNote` is staff-only, editable on the detail page, and never sent to the customer.
- **The price is copied onto the booking**: `priceMinor` + `currency` at creation. Rescheduling keeps it.
- **Approval is a per-service switch.** `service.requiresApproval` defaults to false, `services:write` edits it in the service editor, Duplicate copies it, and changing it doesn't touch existing bookings. It only sets the starting status of self-bookings.
- **One booking at a time per organization.** A `pending` or `confirmed` booking blocks every service over its window padded by its buffers. The check runs in a transaction under a per-org lock and refuses overlaps with 409. Bookable times get the same busy intervals, so the picker and the check agree. When staff or resources arrive, only the scope of the check changes.
- **Manual bookings start `confirmed`.** Staff pick a bookable time or type a custom start (past or outside hours allowed); the overlap check always applies, and the end is always start + the service's duration.
- **Transition table** (in one place, in `@sinwy/shared`):

  | From | To | Who | When |
  | --- | --- | --- | --- |
  | `pending` | `confirmed` | staff | before start |
  | `pending` | `cancelled` | staff (decline) or customer (withdraw) | any time |
  | `confirmed` | `cancelled` | staff or customer | customer: before start; staff: any time |
  | `confirmed` | `completed` / `no_show` | staff | after start |
  | `completed` / `no_show` | each other | staff | fixes a mis-click |
  | `cancelled` | – | – | final |

  A decline is a cancellation, recorded as `cancelledBy: "customer" | "organization"` plus an optional `cancellationReason`. No background jobs: a past `pending` shows as "Expired request" and can only be cancelled, and nothing auto-completes. Rescheduling keeps the status and is staff-only, for `pending` and `confirmed`. Customers cancel and book again; there's no cancellation window.
- **Events: a `booking_event` row in the same transaction**, then `dispatchBookingEvent(event)` after commit sends emails. A failed email is logged, not retried. The rows are also the history on the detail page.
- **Email matrix.** "Organization" means the owner and admins. Customer emails go only when there's a `customerEmail`. Plain HTML, no `.ics`, times in the org zone with its name.

  | Event | Customer | Organization |
  | --- | --- | --- |
  | Self-booked, needs approval (`pending`) | Request received | New booking request (link to approve) |
  | Self-booked, auto-confirmed | Booking confirmed | New booking |
  | Manual booking created | Booking confirmed | – |
  | `pending` → `confirmed` | Booking confirmed | – |
  | Declined by the org | Request declined (reason) | – |
  | Cancelled by the org | Booking cancelled (reason) | – |
  | Cancelled by the customer | Cancellation confirmed | Booking cancelled by customer |
  | Rescheduled | Booking moved (old → new time) | – |
  | `completed` / `no_show` / fixes | – | – |

- **URLs.** The storefront owns root slugs: `/$organizationSlug` redirects to `/$organizationSlug/book`. The dashboard moves to `/dashboard/$organizationSlug/...`, and old dashboard URLs get no redirect because nothing is live. Add `dashboard`, `book`, `s` and `app` to `reservedSlugs`.
- **Storefront is its own web module, `storefront`**, so the page builder, custom domains and other public pages grow there later. Its layout route shows "This booking page isn't available" for unknown and non-active orgs. Booking window: now → 60 days, no minimum notice. Cap: 5 upcoming `pending`/`confirmed` self-bookings per customer per org. Members may book their own org.
- **The calendar is built in-house** with `date-fns` + `@date-fns/tz`, always in the org's timezone with a label.
  - Month, week and day views; view and date live in search params.
  - `cancelled` is hidden behind a toggle and `no_show` is shown muted.
  - Clicking a booking opens its detail page; clicking an empty spot in week or day opens manual booking with that start time.
  - Business hours are shaded, and there's no drag and drop.
- **Bookings page:** the calendar is the default, with a Calendar/List toggle as a search param.
  - The list is offset-paginated (25 per page, max 100) and returns `{ items, total }`.
  - Filters: date range on `startsAt` in local dates, service and status (both repeatable), and `q` over name, email and phone.
  - Sort: `startsAt` ascending or descending, or `createdAt` descending.
  - Default: upcoming bookings, no cancelled, soonest first.
  - The calendar endpoint uses the same filters, has no paging, and takes at most 42 days.
- **Overview** (org zone, ISO week), served by one endpoint. Staff see revenue too.
  - **Today's bookings:** in time order, without cancelled.
  - **Booked this week:** `priceMinor` of `confirmed` + `completed` bookings, with a "from completed" sub-line.
  - **Pending requests:** the count plus the oldest 5, with inline Approve and Decline (decline asks for a reason).
  - **Occupancy:** service-duration minutes of `pending`, `confirmed`, `completed` and `no_show` bookings, divided by open minutes from hours minus closures. With no hours, it shows a link to set them.
  - **Needs attention:** past `confirmed` bookings with no outcome, plus expired `pending` requests.
- **Customer Mode → Bookings.**
  - Upcoming tab (`pending` + `confirmed`, soonest first) and Past tab (the rest, newest first), 20 per page.
  - Detail page: org with a link to its storefront, service, time, price, status ("Waiting for {org} to confirm"), the customer's own note, and the decline or cancel reason.
  - Actions: Cancel and "Book again".
  - It shows only the session user's bookings, and another user's booking id is a 404. Manual bookings that happen to share the user's email never show.
- **Detail page edits.** Contact details can be edited only on manual bookings. The service and price can't be changed, and `customerNote` is read-only. History is built from `booking_event` (created, status changes, reschedules, contact edits, each with its actor); note edits aren't logged.
- **Lifecycle.**
  - **Org goes inactive:** bookings are kept. Staff writes get 409, customers can still cancel (and the org email still goes), and the storefront goes offline.
  - **Org deleted** (immediately by the owner, or scheduled by owner account deletion): upcoming bookings are cancelled at that moment, by the organization, with the reason "The business closed its Sinwy account", and the customer emails go out. Past bookings go with the org's cascade.
  - **Customer deletes their account:** upcoming bookings are cancelled by the customer, `customerUserId` is set to null, and the snapshot stays. This rule lives in one function so it can change per region later.
  - **Service archived or inactive:** bookings stay, and the archive dialog warns with the count.
  - **Hours or closures changed:** bookings stay, with no warning.

### Defaults (not yet confirmed; change only if asked)

1. **`startsAt`/`endsAt` are `timestamp with time zone`**, unlike the existing `timestamp` columns, because they are instants that every query compares with ranges.
2. **Buffers are copied onto the booking** (`bufferBeforeMinutes`, `bufferAfterMinutes`), so later service edits don't move the time an existing booking blocks.
3. **Busy window** = `[startsAt − bufferBefore, endsAt + bufferAfter)`. Two bookings clash when their padded windows overlap, which is the same rule as Default 6 of the services plan.
4. **Lock with `pg_advisory_xact_lock(hashtext(organizationId))`** around the overlap check, the 5-booking cap and the insert or reschedule. A database exclusion constraint was rejected because it couldn't express the capacity count later.
5. **The bookings module owns every endpoint that needs busy times**: the dashboard and storefront bookable-times routes and the storefront profile and services route. It calls `@organizationsModule` and `@servicesModule`. The existing `GET services/:serviceId/times` route goes away (the web doesn't use it), and its HTTP tests move to bookings. `listBookableTimes` and `bookableTimes` stay in services.
6. **API paths.**
   - Dashboard: `organizationPath("bookings…")`.
   - Customer: `/api/account/bookings…`, following `/api/account/*`.
   - Storefront: `/api/public/organizations/:slug…`, where only `POST …/bookings` needs a session.
7. **`booking_event` columns:** `type` (`created`, `status_changed`, `rescheduled`, `contact_updated`), `fromStatus`/`toStatus`, `actorType` (`member` | `customer` | `system`), a nullable `actorUserId`, a `payload` jsonb (old and new times, changed fields) and `occurredAt`. Cascades with the booking.
8. **No new rate limiter.** There's no app-level limiter (Better Auth's `rateLimit` in `auth.ts` covers only auth routes); the 5-booking cap is the abuse limit.
9. **Email links.** Org emails point to `/dashboard/{slug}/bookings/{id}` and customer emails to `/account/bookings/{id}`, built with `new URL(path, appConfig.WEB_APP_URL)` as `transfers/service.ts` does.
10. **The web app gets `date-fns` + `@date-fns/tz`** (the same versions as `Sinwy.Backend/package.json`).
11. **A `bookable-org` seed scenario**: `subscribed-org`, plus Mon–Sun 09:00–17:00 hours, an auto-confirm "Haircut" (30 min, €25) and an approval "Colouring" (90 min, €80). Every Verify starts from it.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes. Services-plan notes still apply; [services-mvp-plan.md](services-mvp-plan.md) keeps them.

- **"Slot" is taken** (plan cap). Say "bookable times" in code, routes and UI copy.
- **Permissions exist.** `bookings:read`/`bookings:write` are in `Sinwy.Shared/types/access/Permission.ts`; owner, admin and staff have both (`RolePermissions.ts`). Bookings are on every plan; `PLAN_FEATURES` gates nothing here.
- **Backend module pattern.** Copy `modules/services/`: `routes.ts` with `read`/`write` middleware arrays (`requireAuth`, `requirePermission` from `@authModule`), and controllers with a local `respondError` and `parseBody` (400 with the first Zod message). Service functions take the `Membership` (`membershipFrom(c)`), return `Result<T>` and check `membership.status !== "active"` → `inactive` (409 `ORGANIZATION_INACTIVE`) before any write. Wire a new module in `Sinwy.Backend/import_map.json`, `tsconfig.json` and `Sinwy.Backend/index.ts`.
- **The public org check exists.** `isOrganizationPublic(access)` in `modules/organizations/service.ts` is the §9 "active" rule (slot held, not scheduled, owner has a plan); `findOrganizationAccess(organizationId)` in its repository loads `access`. A slug lookup doesn't exist yet.
- **Org locale:** `getOrganizationLocale(organizationId) → { timezone, currency } | null` from `@organizationsModule`; `todayIn(timezone, now?)` is in `modules/services/utils.ts` (not exported).
- **Bookable times:** `listBookableTimes(organizationId, serviceId, range, busy, now?)` from `@servicesModule` takes `BusyInterval[]` (`{ start, end }`, already padded) and returns `{ timezone, times }`. The range is local dates, limited by `bookableTimesQuerySchema` / `AVAILABILITY_LIMITS.bookableTimesDays` in `Sinwy.Shared/types/service/Availability.ts`. It ignores org status, so callers check it. Wall times convert with `tzOffset`, never `TZDate`.
- **Transactions across modules:** open in the repository and pass `tx` into the other module's exported function (`Tx` pattern in `modules/organizations/access.ts`, as `transfers/repository.ts` does). Row locks use `.for("update")` (`modules/organizations/slots.ts`).
- **IDs** are `crypto.randomUUID()` in `text` columns; FKs to `organization.id` cascade, so purge (`modules/organizations/purge.ts`) removes bookings without code changes. FK to `service.id`: `restrict` (services are archived, never deleted).
- **Migrations:** edit `Sinwy.Backend/db/schema/`, export from `db/schema/index.ts`, then `bun run db:generate --name <name>` and `bun run db:migrate`. Latest is `drizzle/0019_availability.sql`. Status-style checks use `oneOf` from `@db/oneOf` (see `availability_exception`).
- **Drizzle quirks:** queries are thenables (`expect(query).rejects` fails; use `query.then(() => null, (e) => e)`). `exactOptionalPropertyTypes` is on, so partial update types spell out `| undefined`.
- **Email:** `emailClient.send({ to, template, props })` from `@backend/infrastructure/email`. A template is `{ subject(props), html(props) }`; copy the shape of `modules/transfers/emails/transferEmails.ts`. Locally, mail lands in the outbox (`readOutboxEmails`, `bun run Sinwy.Backend/scripts/dev/lastEmail.ts`). Loggers: `createLogger("bookings")` from `@logger`.
- **Deletion hooks:**
  - Owner account deletion runs `beforeDelete` → `scheduleOwnedOrganizationsForDeletion(user.id)` and `afterDelete` → `cleanupDeletedUser` (`modules/auth/auth.ts` ~168–195, `deletedUserCleanup.ts`).
  - Immediate org deletion is Better Auth's `/organization/delete`; `organizationHooks` sits in `auth.ts` ~313, and there's no delete hook yet.
  - The deletion dialog's data is `getAccountDeletionPreview` (`modules/organizations/service.ts` ~310, `GET /api/user/deletion-preview`).
- **Backend tests:** `bun:test` with a real DB, using the helpers in `Sinwy.Backend/test/helpers.ts` (`createUserWithSession`, `insertOrganization`, `givePlan`, `holdSlot`, `activateOrganization`, `joinOrganization`, `fakeCtx`). For HTTP tests, copy the `seedOrg`/`call` harness from `modules/services/tests/services.test.ts`. An org becomes inactive with `slotHeldAt: null`.
- **Seeds:** `bun run dev:seed-scenario <user|owner-with-org|subscribed-org|org-with-staff>` (`Sinwy.Backend/scripts/dev/seedScenario.ts`, `scenarios` array). `subscribed-org` returns an active, onboarded org with its owner's credentials. See the `e2e-test` skill.
- **Web routing:**
  - `Sinwy.WebFrontend/src/routes.ts` mounts modules with `physical(prefix, dir)`, and the dynamic root slug must stay last.
  - Dashboard routes are in `modules/org-dashboard/routes/`; route context gives `organization` (with `currency`) and `member`. Check writes with `hasPermission(member.roles, "bookings:write")`.
  - `requireSession` in `src/shared/lib/auth/protected-route.ts` redirects to `/auth/login?redirect=<href>`, and login honours it.
- **Web data and forms:**
  - Copy `org-dashboard/lib/service-queries.ts`: a keys object, query options and write functions over `api()` from `src/shared/lib/api.ts`, and `useUnwrapWrite()` (a 409 inactive org calls `handleOrganizationInactive` and shows nothing).
  - Form pattern: string values, then a Zod schema that transforms into the shared schema, `onSubmit` returning an error message or null, and `<fieldset disabled>` for read-only users.
  - Money: `src/shared/lib/money.ts`. Dates: `formatDay` in `src/shared/lib/date.ts` (browser zone, so use it only for non-booking dates).
- **Web UI available:**
  - Components: `PageHeader`, `EmptyState`, `ContentBox`, `SettingsSection`, `TextField`, `TextareaField`, `SelectField`, `ComboboxField`, `SubmitButton`.
  - shadcn: `table`, `dialog`, `alert-dialog`, `sheet`, `badge`, `card`, `switch`, `select`, `combobox`, `dropdown-menu`, `tooltip`, `skeleton`, `toast`.
  - The shadcn CLI adds a stray `cn` package: revert `package.json`/`bun.lock` and import `cn` from `@/shared/lib/utils`.
  - `src/shared/` must never import from `src/modules/`.
- **The fall-back hour** of a DST-end day offers only the first pass of the repeated hour. Fine for the MVP.

---

## Phase 1: Move the dashboard to `/dashboard/$organizationSlug`

**Goal:** The org dashboard lives under `/dashboard/$organizationSlug`, every link and redirect points there, and the root slug is free for the storefront.

**Files:**
- `Sinwy.WebFrontend/src/routes.ts`: mount `modules/org-dashboard/routes` at `/dashboard/$organizationSlug`, keep the root slug last, and leave a comment that the storefront will take it.
- Every route file in `modules/org-dashboard/routes/` (`createFileRoute("/$organizationSlug/...")` ids), then regenerate `src/routeTree.gen.ts`.
- Links and redirects:
  - Dashboard: `modules/org-dashboard/components/OrganizationSidebar.tsx`, `ServiceActions.tsx`, `ServicesTable.tsx`, `org-dashboard/lib/nav.tsx`, `org-dashboard/lib/sections.ts`.
  - Shell and auth: `src/shared/components/shell/OrganizationSwitcher.tsx`, `src/shared/lib/auth/protected-route.ts`, `modules/auth/lib/post-login.ts`.
  - Organizations and account: `modules/organizations/lib/funnel.ts`, `modules/organizations/routes/$id.onboarding.tsx`, `modules/account-dashboard/routes/_shell.organizations.tsx`.
- Tests: `modules/auth/tests/post-login.test.ts`, `modules/organizations/tests/funnel.test.ts`, `src/shared/tests/permissions-route.test.ts`.
- `Sinwy.Backend/modules/organizations/utils.ts` (`reservedSlugs`) and its tests.

**Steps:**
- This is a pure move: no behaviour changes. Grep `"/$organizationSlug` and `organizationSlug` after the change and leave none pointing at the old root.
- Add `dashboard`, `book`, `s` and `app` to `reservedSlugs`. Check the dev DB for existing org slugs that collide (`psql service=sinwy_ro -c "select id, slug from organization where slug in ('dashboard','book','s','app') limit 10"`) and rename any with `sinwy_rw`.
- After this phase, nothing serves the root slug; the storefront arrives in Phase 5.
- Update `docs/user-flow-map.md` wherever it names dashboard URLs.

**Tests that matter:**
- Post-login and funnel redirects land on `/dashboard/<slug>`.
- The permission guard redirect still works under the new prefix.
- Reserved slugs: creating an org named "Dashboard" gets a different slug.

**Done when:**
- Every dashboard page opens under `/dashboard/<slug>`, `bun run verify` passes, and no source path builds a root-level dashboard URL.

**Verify:** Seed `org-with-staff`. Log in as the owner; post-login lands on `/dashboard/<slug>`. Click every sidebar entry, the services list, a service editor and the hours page; each URL starts with `/dashboard/<slug>`. Use the org switcher, then log in as staff and open a page staff can't see (e.g. settings): they're redirected inside `/dashboard/<slug>`. Opening `/<slug>` shows the not-found page. Nothing is simulated.

---

## Phase 2: Bookings schema, status rules and the approval switch

**Goal:** The `booking` and `booking_event` tables exist, the shared package holds the booking schemas and the transition table, `@bookingsModule` is wired, services have a working `requiresApproval` switch, and the `bookable-org` seed exists.

**Files:**
- New `Sinwy.Backend/db/schema/bookingSchema.ts` (export from `db/schema/index.ts`); new migration in `Sinwy.Backend/drizzle/`.
- `Sinwy.Backend/db/schema/serviceSchema.ts` (`service.requiresApproval`); `modules/services/` `utils.ts` (`createServiceBody`, `updateServiceBody`), `repository.ts` (insert, update, duplicate), `service.ts` (DTO mapping).
- New `Sinwy.Shared/types/booking/` (`BookingStatus.ts` with `BOOKING_STATUSES` and `BOOKING_TRANSITIONS`, `Booking.ts` DTOs, `BookingSchema.ts` inputs), exported from `Sinwy.Shared/types/index.ts`. `Sinwy.Shared/types/service/Service.ts` and `ServiceSchema.ts` (`requiresApproval`).
- New `Sinwy.Backend/modules/bookings/` (`index.ts`, `routes.ts` with an empty `registerBookingRoutes`); `import_map.json`, `tsconfig.json`, `Sinwy.Backend/index.ts`.
- Web: `modules/org-dashboard/components/ServiceForm.tsx`, `org-dashboard/lib/services.ts`.
- `Sinwy.Backend/scripts/dev/seedScenario.ts` and `.agents/skills/e2e-test/references/seed-scenario.md`.

**Steps:**
- `booking` columns:
  - Identity: `id`, `organizationId` (cascade), `serviceId` (restrict), `customerUserId` (nullable, FK `user.id`, `onDelete: set null`).
  - Contact snapshot: `customerName` (not null), `customerEmail`, `customerPhone`.
  - Time: `startsAt`, `endsAt` (timestamptz, Default 1).
  - Copied from the service: `bufferBeforeMinutes`, `bufferAfterMinutes`, `priceMinor`, `currency`.
  - Status: `status`, `cancelledBy`, `cancellationReason`.
  - Notes and timestamps: `customerNote`, `internalNote`, `createdAt`, `updatedAt`.
- Checks: `status` and `cancelledBy` limited with `oneOf`; `startsAt < endsAt`; `cancelledBy` not null exactly when `status = 'cancelled'`; `customerEmail` or `customerPhone` or `customerUserId` not null.
- Indexes: `(organizationId, startsAt)`, `(customerUserId, startsAt)`.
- `booking_event` per Default 7, with an index on `(bookingId, occurredAt)`.
- Shared: `BOOKING_STATUSES`, `ACTIVE_BOOKING_STATUSES` (`pending`, `confirmed`: the ones that hold time) and the transition table as data.
  - Shape: for each transition, `from`, `to`, the actors allowed (`organization` | `customer`), and a timing rule (`beforeStart` | `afterStart` | `any`, with the confirmed→cancelled row split per actor).
  - A pure `canTransition(from, to, actor, startsAt, now)` the backend enforces and the web uses to show buttons.
  - The DTOs leave out `internalNote` for the customer-facing type.
- `requiresApproval`: `boolean not null default false`. It goes in the API body, the DTO, Duplicate, and an editor switch labelled "Approve each booking before it's confirmed" (read-only for staff like the rest of the form).
- Seed `bookable-org` per Default 11, adding `bookable-org` to the `scenarios` array and the skill reference.

**Tests that matter:**
- `canTransition` against the full table, including the time rules and the customer/staff split on confirmed → cancelled.
- The check constraints refuse a cancelled booking without `cancelledBy`, and a booking with no way to reach the customer.
- `requiresApproval` round-trips through create, update and duplicate; staff can't change it (403).

**Done when:**
- The migration is applied, the editor switch saves, and `bun run dev:seed-scenario bookable-org` prints an org with two services and hours.

**Verify:** Run `bun run dev:seed-scenario bookable-org`. Log in as the owner, open the services list at `/dashboard/<slug>/services` and edit "Haircut": the approval switch is off. Turn it on and save; `psql service=sinwy_ro -c "select name, requires_approval from service where organization_id = '<id>' limit 5"` shows it true. Duplicate it; the copy is also true. Nothing is simulated.

---

## Phase 3: Create bookings, the capacity check, list and calendar API

**Goal:** Staff can create manual bookings through the API, nothing can double-book an org, bookable times leave out busy time, and the list, calendar and detail endpoints return bookings.

**Files:**
- `Sinwy.Backend/modules/bookings/`: `repository.ts`, `service.ts`, `controller.ts`, `routes.ts`, `utils.ts`, `index.ts`, `tests/`.
- `Sinwy.Backend/modules/services/`: export what bookings needs from `index.ts`: a read of the service fields to copy (duration, buffers, price, currency, `requiresApproval`, active/archived), `listBookableTimes`, and `todayIn` if needed. Remove the `services/:serviceId/times` route and its controller; move its HTTP tests (`tests/times.test.ts` or wherever they live) to bookings.
- `Sinwy.Shared/types/booking/` for the query and input schemas.

**Steps:**
- **Core:** one `createBooking` in the service layer, used by manual bookings now and self-bookings in Phase 5. It takes the copied service fields, the start, the contact snapshot, the notes, the starting status and the actor.
  - Inside one transaction it takes the advisory lock (Default 4), checks for overlapping padded windows among `ACTIVE_BOOKING_STATUSES`, and inserts the booking plus a `created` `booking_event`.
  - Export a reusable `assertNoOverlap(tx, organizationId, window, excludeBookingId?)` for reschedule.
- **Manual booking:** `POST organizationPath("bookings")`, with `bookings:write`.
  - Body: `serviceId`, `startsAt` (ISO instant), `customerName`, `customerEmail?`, `customerPhone?`, `internalNote?`.
  - Rules: name plus email or phone, an active non-archived service, and an active org. Status `confirmed`; the actor is the member.
  - Hours and the 15-minute grid aren't checked (Decision: custom times allowed).
  - An overlap is a 409 with a clear code (add `BOOKING_TIME_TAKEN` to `API_ERROR_CODES`).
- **Busy times:** `listBusyIntervals(organizationId, from, to, excludeBookingId?)` returns padded windows of active bookings.
  - `GET organizationPath("bookings/times")?serviceId&from&to&excludeBookingId`, with `bookings:read`, wraps `listBookableTimes` with those intervals. The dashboard picker and reschedule use it.
- **List:** `GET organizationPath("bookings")` per the decision (filters, sort, paging, defaults).
  - Local dates convert to instants with the org zone.
  - `q` uses `ilike` over name, email and phone, escaping `%` and `_`.
  - Returns `{ items, total }`; each item has the service name.
- **Calendar:** `GET organizationPath("bookings/calendar")` with the same filters, no paging, and at most 42 days.
- **Detail:** `GET organizationPath("bookings/:bookingId")` returns the booking, the service name and the `booking_event` history with actor names (member names via a join on `user`). Another org's booking is a 404.
- Writes check `membership.status === "active"`; reads work for inactive orgs, as services do.

**Tests that matter:**
- **Concurrency:** two `createBooking` calls for the same window with `Promise.all` give exactly one 201 and one 409.
- **Overlap rules:**
  - Buffers padding either side cause a clash.
  - Back-to-back bookings with no buffers don't clash.
  - Cancelled and `no_show` bookings don't block.
  - Bookings in another org don't block.
- Bookable times leave out a confirmed booking's padded window and show it again once the booking is cancelled.
- The list filters by date range in the org zone (a booking at 23:30 local on a UTC+2 org falls on the right day), status, service and `q`. Paging totals are correct.
- Manual bookings are refused for an inactive org (409), for a non-member (404), and when there's no email or phone (400).

**Done when:**
- Manual bookings can be created, listed and fetched by API, and every test above passes.

**Verify:** None. This is API only, and the HTTP tests cover it; the dashboard pages arrive in Phases 6 and 7.

---

## Phase 4: Status changes, reschedule, edits and booking emails

**Goal:** Staff can move bookings through the transition table, reschedule them and edit notes and manual contacts, each change writes a `booking_event`, and the email matrix is sent after commit.

**Files:**
- `Sinwy.Backend/modules/bookings/` (service, repository, controller, routes, new `emails/bookingEmails.ts`, new `dispatch.ts`, tests).
- `Sinwy.Backend/modules/organizations/`: add and export `listOrganizationManagerEmails(organizationId)` (the owner and admins) if no equivalent exists.
- `Sinwy.Backend/infrastructure/email/` (templates only use its types).

**Steps:**
- `changeBookingStatus(actor, bookingId, to, reason?)` locks the booking row (`for update`) and enforces `canTransition` from `@sinwy/shared`.
  - It sets `cancelledBy`/`cancellationReason` on cancel and clears them on nothing else (cancelled is final).
  - It writes a `status_changed` event.
  - Endpoints, all `bookings:write`: `POST organizationPath("bookings/:bookingId/confirm" | "cancel" | "complete" | "no-show")`. `cancel` takes an optional `reason`, and the correction between `completed` and `no_show` reuses `complete` and `no-show`.
- **Reschedule:** `POST organizationPath("bookings/:bookingId/reschedule")` takes `{ startsAt }` and is allowed only for `pending`/`confirmed`.
  - The end is recomputed from the booking's own duration (`endsAt − startsAt`). Price and buffers are kept.
  - It runs under the org advisory lock with `assertNoOverlap` excluding itself, and writes `rescheduled` with the old and new times.
- **Edits:** `PATCH organizationPath("bookings/:bookingId")` takes `internalNote` and, only when `customerUserId` is null, the contact fields (same "email or phone" rule).
  - A contact change writes `contact_updated` with the changed field names. A note change writes no event.
- **Dispatch:** each write returns the events it inserted, and the service calls `dispatchBookingEvent(event)` **after** the transaction commits.
  - Dispatch maps the event to the email matrix, loads the booking, service name, org name, slug and timezone, and sends.
  - Each send is wrapped so a failure logs `createLogger("bookings").warn` and never fails the request.
  - Manual creation from Phase 3 now dispatches too (customer "Booking confirmed" only).
- **Templates:** one file holding every template in the matrix. Times are formatted in the org zone with the zone name, plus the links per Default 9.

**Tests that matter:**
- Every illegal transition returns 409 (e.g. confirm a cancelled booking, complete before start, staff confirm after start).
- Concurrent confirm and cancel on the same booking leave exactly one transition and one event.
- A reschedule onto a taken window is 409. A reschedule onto its own padded window (a 15-minute shift) succeeds.
- Contact edits on a self-booking are refused, and note edits work on both kinds of booking.
- **Emails** (read the outbox in tests):
  - Manual booking with an email → one customer email. Phone only → none.
  - A decline sends the reason.
  - An email failure (stub `emailClient.send` to throw) still returns 200, and the change is committed.
- Inactive org: every write is 409.

**Done when:**
- The full transition table and reschedule work through the API, the history lists the events, and the outbox shows the matrix emails.

**Verify:** None. This is API only and covered by HTTP tests; Phase 7 drives it in the browser.

---

## Phase 5: Storefront module and the public booking flow

**Goal:** A signed-in user books a service at `/<slug>/book`, gets `confirmed` or `pending` per the service, and the right emails go out.

**Files:**
- `Sinwy.Backend/modules/organizations/`: add and export `findPublicOrganization(slug)`, which returns `{ id, name, slug, timezone, currency }` or null unless `isOrganizationPublic`.
- `Sinwy.Backend/modules/services/`: export `listPublicServices(organizationId)` (active, non-archived, with name, description, duration, price and `requiresApproval`).
- `Sinwy.Backend/modules/bookings/`: public controller and routes.
- Web: new `Sinwy.WebFrontend/src/modules/storefront/routes/` (`route.tsx` layout, `index.tsx` redirect, `book.tsx`) and `storefront/lib/` (queries); `src/routes.ts` (root slug → storefront, last); new `src/shared/components/booking/BookableTimesPicker.tsx`; `Sinwy.WebFrontend/package.json` (Default 10).

**Steps:**
- **Public API**, every route resolving the org through `findPublicOrganization` (unknown or non-active → 404):
  - `GET /api/public/organizations/:slug` returns the org profile plus its public services.
  - `GET /api/public/organizations/:slug/services/:serviceId/times?from&to` returns bookable times with busy intervals. It clamps the window to now → 60 days; a range outside it is empty.
  - `POST /api/public/organizations/:slug/bookings` (`requireAuth`) takes `{ serviceId, startsAt, customerPhone?, customerNote? }`.
- **Self-booking rules:**
  - `startsAt` must be one of the service's current bookable times (recompute for that local date). This is the check manual bookings skip.
  - Under the lock, count the user's upcoming active bookings in the org and refuse a 6th (409, `BOOKING_LIMIT_REACHED`).
  - Status is `pending` if `requiresApproval`, else `confirmed`. The snapshot uses the user's name and email, and the actor is `customer`.
- **Web storefront:** mount with `physical("/$organizationSlug", "modules/storefront/routes")` last in `routes.ts`.
  - The layout loads the public profile; a 404 renders "This booking page isn't available".
  - The index redirects to `book`. The `book` page runs three steps, and its search params (`service`, `date`, `start`) survive refresh.
  - Confirm with no session → `/auth/login?redirect=<current href>`.
  - The success state shows "Booked" or "Request sent — {org} will confirm", with a link to `/account/bookings/<id>` (that page arrives in Phase 9; the placeholder is fine).
- **`BookableTimesPicker`** (shared, presentational):
  - Props: `timezone`, a selected date plus `onDateChange`, `times: string[]`, `value`/`onChange`, and loading and empty states.
  - Shows a day row (a native date input is fine), then the times as buttons, labelled in the org zone with the zone name.
  - No data fetching inside it.

**Tests that matter:**
- An inactive, scheduled-for-deletion or draft org: all three public routes are 404.
- A start that isn't a bookable time (off grid, outside hours, taken, past, beyond 60 days) → 409/400.
- The 6th upcoming booking is refused; a cancelled one doesn't count.
- A `requiresApproval` service creates `pending` and sends "Request received" plus "New booking request" to the owner and admins. An auto-confirm service sends "Booking confirmed" plus "New booking".
- An unauthenticated POST → 401.

**Done when:**
- A signed-in user can book both seeded services in the browser, and the DB and outbox match.

**Verify:** Seed `bookable-org`, plus a `user` scenario for the customer.
1. Signed out, open `/<slug>`: it redirects to `/<slug>/book` and lists Haircut and Colouring with prices.
2. Pick Haircut, then tomorrow and 10:00, then Confirm. You're redirected to login; log in as the customer and you're back on the confirm step with the selection intact.
3. Confirm → "Booked". `psql service=sinwy_ro -c "select status, customer_name, customer_email, price_minor from booking where organization_id = '<id>' limit 5"` shows `confirmed`. The outbox has "Booking confirmed" to the customer and "New booking" to the owner.
4. Book Colouring → "Request sent". The row is `pending`, and the emails are "Request received" plus "New booking request".
5. Reopen tomorrow's times for Haircut: 10:00–10:30 (plus buffers) is gone.
6. Open `/<slug-of-an-owner-with-org-draft>/book` (seed `owner-with-org`): "This booking page isn't available".

Emails go to the local outbox; nothing else is simulated.

---

## Phase 6: Bookings calendar and list (web)

**Goal:** `/dashboard/<slug>/bookings` shows a month, week and day calendar by default and a filterable, sortable, paginated list, both in the org's timezone.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.bookings.index.tsx` (replace the placeholder).
- New `org-dashboard/lib/booking-queries.ts` (keys, list and calendar queries).
- New `org-dashboard/lib/calendar.ts` (pure date maths in the org zone).
- New `org-dashboard/components/bookings/` (`BookingsCalendar`, `MonthView`, `TimeGridView`, `BookingsList`, `BookingFilters`, `BookingStatusBadge`).
- Business hours come from `availabilityQuery` in `service-queries.ts`.

**Steps:**
- Search params: `view` (`calendar` | `list`), `calendarView` (`month` | `week` | `day`), `date`, plus the list filters, `sort` and `page`. Validate them with Zod, falling back to the defaults.
- **Calendar maths** lives in `calendar.ts`: the visible range, the day columns, and minute offsets from local midnight, all with `@date-fns/tz` in the org zone. It's pure and unit-tested; no component does zone maths itself.
- **Month view:** up to 3 bookings per day plus "+N more" (which switches to the day view).
- **Week and day views:** positioned blocks, no overlap layout (bookings never overlap), closed hours shaded from the weekly hours, scrolled to the earliest opening time.
- Hide `cancelled` unless "Show cancelled" is on; show `no_show` muted. Clicking a booking goes to `/dashboard/<slug>/bookings/<id>`.
- Clicking an empty week or day spot goes to `/dashboard/<slug>/bookings/new?start=<ISO>` (Phase 7 builds that route; until then the link may 404).
- **List:** `table` with the columns date and time, customer, service, status and price (`money.ts`), a filter bar (date inputs, service and status multi-select, debounced search) and page controls with the total.
- The "Times in {zone}" label sits on both views.

**Tests that matter:**
- `calendar.ts`: week ranges start Monday in the org zone; a booking across local midnight is handled consistently; DST-change days give 23/25-hour grids without shifting the blocks.
- Search params round-trip, and invalid values fall back to the defaults.

**Done when:**
- Bookings created in Phase 5 appear on the right day and time in all three views and in the list, and the filters and paging work.

**Verify:** Seed `bookable-org`. Create bookings by API or by booking on the storefront as in Phase 5: two tomorrow (10:00 Haircut confirmed, 13:00 Colouring pending) and one next week (then cancel it with `POST …/cancel`).
1. As the owner, open `/dashboard/<slug>/bookings`: month view, tomorrow shows 2 bookings, and the cancelled one is hidden until "Show cancelled" is on.
2. Switch to week and day: the blocks sit at 10:00 and 13:00 in the org zone, whatever the browser's zone (set Playwright's `timezoneId` to something else, e.g. `America/New_York`).
3. Switch to List: the default shows the upcoming non-cancelled bookings. Filter by status `pending` → 1 row, search the customer's email → the matching rows, sort by created → newest first.
4. Refresh: the view and filters are kept.

Nothing is simulated.

---

## Phase 7: Booking detail, manual booking and reschedule (web)

**Goal:** Staff open a booking and act on it, create phone and walk-in bookings, and reschedule with the shared picker or a custom time.

**Files:**
- `org-dashboard/routes/_shell.bookings.$id.tsx` (replace the placeholder); new `_shell.bookings.new.tsx`.
- `org-dashboard/lib/booking-queries.ts` (detail query, writes, times query); new `org-dashboard/components/bookings/` (`BookingActions`, `RescheduleDialog`, `ManualBookingForm`, `BookingHistory`, `ContactCard`).
- `src/shared/components/booking/BookableTimesPicker.tsx` (from Phase 5).

**Steps:**
- **Detail layout:** status badge and the allowed actions at the top (from `canTransition`, not hard-coded). Then customer, service with time and price, `customerNote` read-only and an editable `internalNote`. History at the bottom.
  - A past `pending` booking reads "Expired request" and offers only Cancel.
- **Actions:** Confirm, Complete and No-show are single buttons. Cancel/Decline open a dialog with an optional reason ("Decline" on pending, "Cancel booking" on confirmed). Correction buttons ("Mark as completed" / "Mark as no-show") appear on finished bookings.
- **Contact card:** editable inline for manual bookings, read-only with "From the customer's account" for self-bookings.
- **Manual booking** at `/dashboard/<slug>/bookings/new?start=`:
  - Pick a service, then the picker (dashboard times endpoint) or a "Custom time" toggle (date + `<input type="time">`, any minute).
  - Contact fields (name required, email or phone required) and an internal note.
  - Prefill the date and time from `?start=` (the calendar click). With a prefilled start that isn't a bookable time, switch to custom time automatically.
  - On success, go to the new booking's detail page.
  - Add a "New booking" button to the bookings page header for `bookings:write`.
- **Reschedule dialog:** the same picker against `bookings/times?excludeBookingId=`, plus the custom-time toggle. A 409 shows "That time was just taken".
- Read-only users (without `bookings:write`) see no actions; all three roles have it today, but gate it anyway.
- After writes, invalidate the booking keys (detail, list, calendar) and the overview key (Phase 8 adds it; invalidate the prefix).

**Tests that matter:**
- The manual form schema: name required, email or phone required, custom time → ISO in the org zone (not the browser's).
- The action buttons shown match `canTransition` for each status and time combination (unit test of the mapping).

**Done when:**
- Every status action, reschedule and manual booking works in the browser and shows up in the history.

**Verify:** Seed `bookable-org`; as a `user` customer, book a pending Colouring tomorrow 13:00 on the storefront.
1. As the owner, open it from the calendar: "Confirm" and "Decline" are shown.
2. Decline with the reason "Fully booked": status `cancelled`, `cancelled_by = 'organization'`, the outbox has "Request declined" with the reason, and the history shows it.
3. Create a manual booking from a week-view click at tomorrow 15:00, Haircut, name "Walk-in Ana", phone only: status `confirmed`, no customer email in the outbox.
4. Try a manual booking at 15:15 with a custom time: 409 "That time was just taken".
5. Reschedule the walk-in to 16:00 with the picker; the history shows old → new.
6. Edit the walk-in's phone; the history shows a contact update. On a self-booking, the contact is read-only.
7. Create a manual booking for yesterday 11:00 with a custom time, then mark it Completed, then correct it to No-show.

Emails go to the local outbox; nothing else is simulated.

---

## Phase 8: Overview page

**Goal:** `/dashboard/<slug>/` shows today's bookings, this week's booked value, pending requests with inline approve and decline, occupancy, and needs-attention counts.

**Files:**
- `Sinwy.Backend/modules/bookings/`: `getOverview(membership, now?)` and `GET organizationPath("bookings/overview")` (`bookings:read`).
- `Sinwy.Backend/modules/services/`: export `openMinutes(organizationId, from, to)` (local dates; weekly hours minus closures, in the org zone), next to the bookable-times inputs it already reads.
- Web: `org-dashboard/routes/_shell.index.tsx` (replace the placeholder), `org-dashboard/lib/booking-queries.ts` (overview query), new `org-dashboard/components/overview/`.

**Steps:**
- Follow the Decision's definitions exactly. "This week" is the ISO week containing today in the org zone. One SQL round-trip per figure is fine.
- Occupancy is a percentage rounded to whole numbers; with 0 open minutes it returns null, and the web shows "Set your business hours" linking to `/dashboard/<slug>/services/hours`.
- Revenue uses the booking's own `priceMinor` and the org currency.
- Approve and Decline on the overview reuse the Phase 7 write functions and dialog.
- Each needs-attention item links to the list with the matching filters (e.g. `?view=list&status=confirmed&to=<yesterday>`).

**Tests that matter:**
- Revenue counts `confirmed` + `completed` in this week only, and leaves out `pending`, `cancelled` and `no_show`. Week boundaries are in the org zone (a booking Sunday 23:30 local in a UTC+2 org counts).
- Occupancy: 7 days × 8h open with one 90-minute `no_show` and one 30-minute cancelled → 90 / 3360. A closure day removes its minutes.
- Needs attention counts past `confirmed` bookings and expired `pending` ones only.

**Done when:**
- The overview shows correct figures for the seeded data, and approving from it updates the figures without a reload.

**Verify:** Seed `bookable-org`. Create through the API: a confirmed Haircut today in an hour's time (€25), a completed Haircut earlier this week (€25), a pending Colouring tomorrow (€80) and a no-show Colouring yesterday (€80).
1. The overview shows today's booking, "Booked this week €50" with "€25 from completed" (if yesterday was in this week), 1 pending request, and occupancy matching (30+30+90+90 if all in this week) / open minutes.
2. Approve the pending request inline: pending drops to 0, booked rises by €80 if it's in this week, and the customer gets "Booking confirmed" in the outbox.

Nothing else is simulated.

---

## Phase 9: Customer Mode bookings

**Goal:** A customer sees their bookings across organizations at `/account/bookings`, opens one, cancels it, or books again.

**Files:**
- `Sinwy.Backend/modules/bookings/`: account controller and routes (`GET /api/account/bookings?tab&page`, `GET /api/account/bookings/:bookingId`, `POST /api/account/bookings/:bookingId/cancel`, all `requireAuth`).
- Web: `modules/account-dashboard/routes/_shell.bookings.index.tsx` and `_shell.bookings.$id.tsx` (replace the placeholders), and a new `account-dashboard/lib/booking-queries.ts`.

**Steps:**
- Filter strictly on `customerUserId = session user`; a missing or another user's booking is 404.
- The DTO has the org name, slug and timezone, the service name, times, price, status, `customerNote`, `cancelledBy` and `cancellationReason`. It never includes `internalNote` or other contact fields.
- Cancel goes through `changeBookingStatus` with the actor `customer` and dispatches "Cancellation confirmed" plus "Booking cancelled by customer".
  - It works even when the org is inactive (the customer isn't a member, so there's no membership check). It's refused when the org is scheduled for deletion (the booking was already cancelled by Phase 10 anyway).
- **Web:** Upcoming and Past tabs as a search param, rows formatted in each booking's org zone with the zone label.
  - Detail: the "Waiting for {org} to confirm" copy, Cancel with a confirm dialog when `canTransition` allows it, and "Book again" linking to `/<slug>/book?service=<id>`.

**Tests that matter:**
- User B can't read or cancel user A's booking (404). A manual booking with user A's email never appears for A.
- A customer cancels a confirmed booking after its start → 409. A cancelled booking can't be cancelled again.
- `internalNote` is absent from both account endpoints' JSON.
- A booking at an inactive org can still be read and cancelled by its customer.

**Done when:**
- A customer sees, opens and cancels their bookings in the browser, and the org receives the email.

**Verify:** Seed `bookable-org` and a `user` customer; the customer books a Haircut tomorrow on the storefront, and the owner adds an internal note to it.
1. As the customer, `/account/bookings` → Upcoming lists it in the org zone. Open it: no internal note visible, and the API response has no `internalNote`.
2. Cancel → the status is cancelled, it moves to Past, and the outbox has "Cancellation confirmed" (customer) and "Booking cancelled by customer" (owner).
3. "Book again" opens `/<slug>/book?service=<id>` with Haircut selected.

Nothing is simulated.

---

## Phase 10: Bookings when an org, account or service goes away

**Goal:** Org deletion and customer account deletion handle upcoming bookings per the lifecycle decision, the deletion and archive dialogs show the counts, and the rules map describes bookings.

**Files:**
- `Sinwy.Backend/modules/bookings/`: export `cancelUpcomingOrganizationBookings(organizationIds, tx?)` and `handleCustomerAccountDeleted(userId, tx?)`, plus count helpers.
- `Sinwy.Backend/modules/auth/auth.ts`: `deleteUser.beforeDelete` (after `scheduleOwnedOrganizationsForDeletion`, call `handleCustomerAccountDeleted`) and a new `organizationHooks.beforeDeleteOrganization`.
- `Sinwy.Backend/modules/organizations/service.ts` (`scheduleOwnedOrganizationsForDeletion`, `getAccountDeletionPreview`): cancel the scheduled orgs' upcoming bookings and add an upcoming-bookings count per org to the preview DTO in `@sinwy/shared`.
- Web: the account deletion dialog (find it with `grep -rn "deletion-preview" Sinwy.WebFrontend/src`) and the archive dialog in `org-dashboard/components/ServiceActions.tsx`. The archive count comes from a new `upcomingCount` in the service detail DTO or a bookings endpoint.
- `docs/org-rules-map.md` §1, §9, §11 and §14; `docs/user-flow-map.md` for the storefront and Customer Mode bookings.

**Steps:**
- **Org deletion cancels upcoming bookings:** `pending`/`confirmed` with `startsAt >= now`, `cancelledBy: "organization"`, the reason "The business closed its Sinwy account", the actor `system`. Customer emails dispatch after commit.
  - Immediate deletion runs this from `beforeDeleteOrganization`, so the emails go before the cascade deletes the rows: load what the emails need first.
  - Scheduled deletion runs it inside the scheduling flow.
- **Customer account deletion:** `handleCustomerAccountDeleted` cancels the user's upcoming bookings as the customer and dispatches the org emails. The FK nulls `customerUserId` when the user row goes.
  - Keep every retention choice inside this function; a comment says it's the one place to change for regional rules.
  - This also runs for owners, after their orgs were scheduled, so their own bookings elsewhere are cancelled too.
- **Import cycle:** `auth.ts` already imports `@organizationsModule`. Make sure importing `@bookingsModule` there doesn't create an import cycle that breaks module loading; if it does, call it through the organizations module or a lazy import.
- **Deletion preview:** show "N upcoming bookings will be cancelled" per org in the dialog. The archive dialog says "N upcoming bookings stay booked".
- **Rules map:**
  - §1: the storefront owns root slugs, and the dashboard is under `/dashboard/`.
  - §9: inactive orgs keep their bookings, staff writes are refused, customers can cancel, and the storefront is offline.
  - §11: deletion cancels upcoming bookings, and customer deletion keeps the snapshot.
  - §14: retention is still a gap to revisit per region.

**Tests that matter:**
- Owner account deletion: a scheduled org's upcoming bookings are cancelled by the organization, past bookings are untouched, and customers get emails.
- Immediate org deletion (`/organization/delete`): the customer emails are sent and the rows are gone afterwards.
- Customer deletion: their upcoming bookings are cancelled by the customer, the org is emailed, and the snapshot is still there with `customer_user_id` null.
- The deletion preview count matches upcoming active bookings only.

**Done when:**
- The three lifecycle flows behave as decided, the dialogs show counts, and the rules map is updated.

**Verify:** Seed `bookable-org` and two `user` customers. Customer A books a Haircut tomorrow; customer B books a Colouring the day after.
1. Customer A deletes their account (`/account/settings`, confirm via the outbox link): A's booking is `cancelled` with `cancelled_by = 'customer'` and `customer_user_id` null, the name and email are still there, and the owner gets "Booking cancelled by customer".
2. Archive Haircut: the dialog warns about upcoming bookings (0 now); archive Colouring → "1 upcoming booking stays booked".
3. The owner starts account deletion: the dialog lists the org with "1 upcoming booking will be cancelled". Confirm via the outbox link: B's booking is cancelled by the organization, and B gets "Booking cancelled" with the closing reason.

Polar revocation uses the seeded subscription as in the `e2e-test` skill; emails go to the local outbox.

---

## Phase 11: Code review

**Goal:** The bookings work is reviewed for races, authorization leaks, timezone bugs and lifecycle gaps, and the findings are fixed.

**Files:** Everything changed in Phases 1–10 (`git diff master...HEAD --stat`).

**Steps:**
- **Races:** every path that creates or moves a booking takes the org advisory lock before reading overlaps. Status changes lock the row.
- **Authorization:** each route's middleware matches its permission; customer endpoints filter on the session user; public endpoints never return `internalNote`, other customers' data or inactive orgs; another org's ids are 404.
- **Time:** every conversion between a local date and an instant goes through the org zone, nothing uses the browser zone for booking times, and the DST tests exist for the calendar and overview.
- **Lifecycle:** emails dispatch only after commit; org deletion emails go out before the cascade; no booking is left `pending`/`confirmed` at a scheduled org.
- **Docs:** `org-rules-map.md` and `user-flow-map.md` match the code; prune this plan's standing notes; move the finished phases to the log.
- **Final step:** stop every dev server started during the plan's work unless the user asked to keep it running, and delete temporary files and artifacts from the plan's work (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- Any gap found gets a test before its fix.

**Done when:**
- The review findings are fixed or written down as known gaps in `org-rules-map.md` §14, and `bun run verify` passes.

**Verify:** Seed `bookable-org` and two `user` customers, then run the main path end to end:
1. Storefront booking of each kind (auto-confirmed and approval).
2. Approve on the overview.
3. Manual walk-in booking with a custom time.
4. Reschedule.
5. Complete, then no-show.
6. Customer cancel from Customer Mode.
7. Owner account deletion.

Check the DB rows and the outbox at each step, as in Phases 5–10. Emails go to the local outbox; Polar uses the seeded subscription.
