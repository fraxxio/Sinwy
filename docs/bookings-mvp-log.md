# Bookings MVP log

Finished phases of [bookings-mvp-plan.md](bookings-mvp-plan.md).

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

### Log (2026-11-02, `feat(backend, web): move the org dashboard under /dashboard`)
- Shipped: `routes.ts` mounts `modules/org-dashboard/routes` at `/dashboard/$organizationSlug`, and every route id, link and redirect uses the new prefix (sidebar, sections, switcher, permission guard, post-login, funnel, onboarding, Account → Organizations). `reservedSlugs` gains `app`, `book`, `dashboard` and `s`, and the org test checks that "Dashboard" gets a suffixed slug. The e2e skill's app map names the new URL.
- Differs from plan: `docs/user-flow-map.md` names no dashboard URLs, so it's unchanged. No dev org slugs collided with the new reserved ones. Biome rewrapped the longer `createFileRoute` ids.
- Checked in the running app: owner and staff post-login land on `/dashboard/<slug>`; every sidebar entry, the services list, new service, the editor, Duplicate and the hours page stay under it; the switcher and Account → Organizations open `/dashboard/<slug>` for two active orgs; staff opening settings, team, payments or analytics are sent back to `/dashboard/<slug>` with the access notice; `/<slug>` and `/<slug>/services` are 404. Seen but older than this phase: the not-found page is TanStack's default text (no `notFoundComponent`), and opening an org you don't belong to redirects to `/` with no message. Not checked: the "Finish setup" button on an un-onboarded org's overview.


## Phase 2: Bookings schema, status rules and the approval switch

**Goal:** The `booking` and `booking_event` tables exist, the shared package holds the booking schemas and the transition table, `@bookingsModule` is wired, services have a working `requiresApproval` switch, and the `bookable-org` seed exists.

**Files:**
- New `Sinwy.Backend/db/schema/bookingSchema.ts` (export from `db/schema/index.ts`); new migration in `Sinwy.Backend/drizzle/`.
- `Sinwy.Backend/db/schema/serviceSchema.ts` (`service.requiresApproval`); `modules/services/` `utils.ts` (`createServiceBody`, `updateServiceBody`), `repository.ts` (insert, update, duplicate), `service.ts` (DTO mapping).
- New `Sinwy.Shared/types/booking/` (`BookingStatus.ts` with `BOOKING_STATUSES` and `BOOKING_TRANSITIONS`, `Booking.ts` DTOs, `BookingSchema.ts` inputs), exported from `Sinwy.Shared/types/index.ts`. `Sinwy.Shared/types/service/Service.ts` and `ServiceSchema.ts` (`requiresApproval`).
- New `Sinwy.Backend/modules/bookings/` (`index.ts`, `routes.ts` with an empty `registerBookingRoutes`); `import_map.json`, `tsconfig.json`, `Sinwy.Backend/index.ts`.
- Tests: `modules/services/tests/services.test.ts` (round-trip and 403 for staff); new `modules/bookings/tests/` for the check constraints; a `Sinwy.Shared` test for `canTransition`.
- Web: `modules/org-dashboard/components/ServiceForm.tsx`, `org-dashboard/lib/services.ts`.
- `Sinwy.Backend/scripts/dev/seedScenario.ts` and `.agents/skills/e2e-test/references/seed-scenario.md`; the dashboard URL in `.agents/skills/e2e-test/references/app-map.md` is already `/dashboard/<org slug>`.

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

### Log (2026-11-02, `feat(backend, web): add the bookings schema and the service approval switch`)
- Shipped: migration `0020_bookings.sql` with `booking` and `booking_event` (check constraints, indexes, cascades per the plan) and `service.requires_approval`. `@sinwy/shared` gains the booking statuses, the transition table with `canTransition`, the booking DTOs and the contact, note and reason schemas. `requiresApproval` goes through the API body, DTO and Duplicate, and into a "Bookings" section of the service editor ("Approve each booking before it's confirmed", read-only for staff). `@bookingsModule` is wired with an empty `registerBookingRoutes`. The `bookable-org` seed scenario and its skill reference are added.
- Differs from plan: the `canTransition` test is in `Sinwy.Backend/modules/bookings/tests/transitions.test.ts`, not `Sinwy.Shared`, because the shared package has no test runner and its tsconfig has `types: []`; it covers every status, actor and before/after combination. `bookable-org` sets the org timezone to `Europe/Vilnius` (the seeded org is LT; the default is UTC), so later Verifies exercise a non-UTC zone. `booking.cancelledBy` uses its own `BOOKING_CANCELLERS` list, and the event actor types (`member`, `customer`, `system`) are separate from the transition actors (`organization`, `customer`). There are extra checks: price ≥ 0, buffers ≥ 0, and `oneOf` on the event's statuses. The schema test confirms that the `restrict` FK to `service` blocks deleting a booked service but not the org cascade. The running backend wasn't in watch mode, so it was restarted (with the user's approval) before the browser check.
- Checked in the running app: in the `bookable-org` seed, Haircut is false and Colouring true in the DB, and their editors show the switch off and on. Turning it on for Haircut and saving shows "Service saved", the DB has `requires_approval = t`, and it is still on after a reload. Duplicating Haircut gives "Haircut (copy)" with `t` in the DB and the switch on. There were no console errors and no backend log warnings. The login used `dev:login-as`. Not checked in the browser: that staff see the switch read-only; the HTTP test covers their 403.

## Phase 3: Create bookings, the capacity check, list and calendar API

**Goal:** Staff can create manual bookings through the API, nothing can double-book an org, bookable times leave out busy time, and the list, calendar and detail endpoints return bookings.

**Files:**
- `Sinwy.Backend/modules/bookings/`: `routes.ts` (empty `registerBookingRoutes`, already wired in `Sinwy.Backend/index.ts`, `import_map.json` and `tsconfig.json`) and `index.ts`; new `repository.ts`, `service.ts`, `controller.ts`, `utils.ts`. Tests in `tests/` next to `schema.test.ts` and `transitions.test.ts`; the HTTP tests copy the `seedOrg`/`call` harness from `modules/services/tests/services.test.ts`.
- `Sinwy.Backend/db/schema/bookingSchema.ts` (`booking`, `bookingEvent`; no schema change expected).
- `Sinwy.Backend/modules/services/`: `index.ts` exports `listBookableTimes`, `bookableTimes` and `BusyInterval`; add a read of the fields to copy (`repository.ts` `findService`, `service.ts` ~230–260 where `listBookableTimes` checks `isActive`) and `todayIn` from `utils.ts` if needed. Remove `listBookableTimesHandler` from `controller.ts` and its route in `routes.ts`; move `tests/times.test.ts` to bookings.
- `Sinwy.Shared/types/booking/BookingSchema.ts` (contact, note and reason schemas exist; add the manual booking body and the list and calendar queries); `Sinwy.Shared/types/api/ApiResponse.ts` (`API_ERROR_CODES`, add `BOOKING_TIME_TAKEN`).

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

### Log (2026-11-02, `feat(backend): add manual bookings with the capacity check, list and calendar API`)
- Shipped: `createBooking` in the bookings service, backed by `insertBookingIfFree` (advisory lock, padded-window overlap check among `pending`/`confirmed`, insert plus a `created` event in one transaction). Manual bookings (`POST bookings`, `bookings:write`) start `confirmed` with the member as actor and refuse overlaps with 409 `BOOKING_TIME_TAKEN`. `listBusyIntervals` feeds `GET bookings/times`, which wraps `listBookableTimes` and takes `excludeBookingId`. The list (`{ items, total }`, filters, three sorts, 25/100 paging), the calendar (same filters, at most 42 days) and the detail with its history and actor names are in. Shared: `manualBookingSchema`, the list and calendar query schemas, `BOOKING_SORTS`, `BookingListDto`, `BookingDetailDto` and the new `BOOKING_LIMITS` entries. Services: `findBookableService` and `todayIn` are exported, and the old times route is removed with its tests moved to `bookings/tests/times.test.ts`.
- Differs from plan: `assertNoOverlap` became `isTimeTaken(tx, organizationId, window, excludeBookingId?)`, returning a boolean, and lives in the repository because transactions open there; the caller rolls back by returning null. The calendar returns a bare `BookingDto[]`; the web gets the zone from the availability query. Defaults the plan left open: no `status` means everything but cancelled (list and calendar), and a list without `from`/`to` starts at today in the org zone; sorts are `startsAt`, `-startsAt` and `-createdAt`. An inactive service gives 409 "This service isn't taking bookings"; an archived, foreign or unknown one gives 404. The times endpoint reads busy time one local day beyond each end of the range, which covers the 240-minute buffer limit. Extra tests: `tests/utils.test.ts` checks `startOfLocalDate` on DST days (including Santiago's missing midnight), and the race test was confirmed to fail with the lock removed.
- Checked in the running app: nothing; Verify was "None" (API only), and the HTTP tests cover every item in **Tests that matter**.

## Phase 4: Status changes, reschedule, edits and booking emails

**Goal:** Staff can move bookings through the transition table, reschedule them and edit notes and manual contacts, each change writes a `booking_event`, and the email matrix is sent after commit.

**Files:**
- `Sinwy.Backend/modules/bookings/`:
  - `repository.ts`: status change with the row locked `.for("update")`; reschedule under `lockOrganization` + `isTimeTaken(tx, …, bookingId)`; the PATCH update. Each write returns the inserted `booking_event` rows, as `insertBookingIfFree` does.
  - `service.ts`: `createBooking` and the new writes call dispatch after commit; add errors to `BookingError` (e.g. `illegal-transition`, `contact-locked`). `toBookingDto` is there.
  - `controller.ts` (`respondError`, `parseBody`), `routes.ts`, new `emails/bookingEmails.ts` (copy `modules/transfers/emails/transferEmails.ts`), new `dispatch.ts`.
  - Tests: extend `tests/bookings.test.ts` or add `tests/status.test.ts` and `tests/emails.test.ts` with the same harness.
- `Sinwy.Shared/types/booking/BookingSchema.ts`: add the cancel body (`cancellationReasonSchema`), the reschedule body (`startsAt` like `manualBookingSchema`) and the PATCH body (`internalNote` plus the contact fields; `contactFields` and `hasEmailOrPhone` are private there today).
- `Sinwy.Backend/modules/organizations/`: add and export `listOrganizationManagerEmails(organizationId)` (no equivalent exists); filter `member` with `memberHasRole("owner")`/`("admin")` from `@db/memberRole` joined to `user`.
- `Sinwy.Backend/infrastructure/email/` (templates only use its types); links via `appConfig.WEB_APP_URL` as `transfers/service.ts` ~190 does.

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

### Log (2026-11-02, `feat(backend): add booking status changes, reschedule, edits and emails`)
- Shipped: `POST bookings/:bookingId/confirm | cancel | complete | no-show | reschedule` and `PATCH bookings/:bookingId`, all `bookings:write` and 409 `ORGANIZATION_INACTIVE` for an inactive org. Illegal transitions are 409 `BOOKING_STATUS_CHANGE_NOT_ALLOWED` (40920). Every write goes through `changeBooking(organizationId, bookingId, decide, { lockOrganization? })` in the repository: it locks the row (`for update of booking`), runs `decide(row)`, checks `window` with `isTimeTaken` excluding the booking, then writes the update and its event in one transaction. `dispatch.ts` maps events to the email matrix after commit (`dispatchBookingEvent`, plus `sendBookingEmails(event, context)` for callers that preload `findBookingEmailContext`), and `emails/bookingEmails.ts` holds all nine templates with one props shape. `createBooking` dispatches too. Organizations export `listOrganizationManagerEmails`. Shared adds `cancelBookingSchema`, `rescheduleBookingSchema` and `bookingUpdateSchema`. Tests are in `bookings/tests/changes.test.ts`.
- Differs from plan:
  - `changeBookingStatus(membership, memberUserId, bookingId, to, reason?, now?)` is staff-only. Phase 9 adds the customer actor, and `changeBooking` scopes by organization today.
  - PATCH contact fields are all-or-nothing (400 "Send the name, email and phone together"), so the email-or-phone rule stays in the schema.
  - Reschedule takes the organization lock before the row lock, so the lock order is organization → row everywhere.
  - Customer emails on manual bookings carry no link because there's no account to open it in. "Request declined" is sent only for a member cancelling a `pending` booking; a `system` cancel (Phase 10) sends "Booking cancelled".
  - The whole matrix is in, including self-booking emails, which are tested by calling `createBooking` with a `customer` actor. Subjects start with the matrix label (e.g. "Booking confirmed: Haircut at Salon").
  - Concurrent confirm and cancel can both succeed legally (staff may cancel a confirmed booking), so the race test runs complete against cancel on a started booking, and two confirms. It fails 5/5 with the row lock removed.
- Checked in the running app: nothing; Verify was "None" (API only), and the HTTP tests cover every item in **Tests that matter**.

## Phase 5: Storefront module and the public booking flow

**Goal:** A signed-in user books a service at `/<slug>/book`, gets `confirmed` or `pending` per the service, and the right emails go out.

**Files:**
- `Sinwy.Backend/modules/organizations/`: `repository.ts` (a slug lookup returning `organizationAccess` fields plus name, slug, timezone, currency; copy `findOrganizationAccess`), `service.ts` (`findPublicOrganization(slug)` using `isOrganizationPublic`), `index.ts`.
- `Sinwy.Backend/modules/services/`: export `listPublicServices(organizationId)` (active, non-archived, with name, description, duration, price and `requiresApproval`) through `index.ts`.
- `Sinwy.Backend/modules/bookings/`:
  - `repository.ts`: the cap in `insertBookingIfFree` (count the customer's upcoming `pending`/`confirmed` bookings in the org under the same lock).
  - `service.ts`: `createSelfBooking` (bookable-time check via `listBookableTimes`, then `createBooking` with actor `customer`), plus a `limit-reached` error.
  - `controller.ts`/`routes.ts`: public handlers. Register them from `registerBookingRoutes` or a new function wired in `Sinwy.Backend/index.ts`.
  - Emails need no work: self-booking emails already dispatch.
  - Tests: new `tests/storefront.test.ts`, copying the harness from `tests/changes.test.ts`.
- `Sinwy.Shared/types/booking/BookingSchema.ts` (self-booking body from `customerPhoneSchema` and `customerNoteSchema`), `types/api/ApiResponse.ts` (`BOOKING_LIMIT_REACHED: 40921`), and a public profile/services DTO.
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
  - The success state shows "Booked" or "Request sent — {org} will confirm", with a link to `/account/bookings/<id>` (that page arrives in Phase 10; the placeholder is fine).
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

### Log (2026-11-02, `feat(backend, web): add the storefront and public self-booking`)
- Shipped:
  - Backend: `findPublicOrganization(slug)` (organizations), `listPublicServices` (services) and the three public routes in `registerStorefrontRoutes`. `createSelfBooking` checks the start against the current free times for that local date, then calls `createBooking` with actor `customer`, status from `requiresApproval` and `upcomingLimit: 5`. `insertBookingIfFree` counts the cap under the org lock. `listBookingTimes` and the storefront share `findFreeTimes`.
  - Shared: `selfBookingSchema`, `StorefrontDto`, `PublicServiceDto`, `BOOKING_LIMITS.selfBookingDays`/`upcomingSelfBookings` and `BOOKING_LIMIT_REACHED: 40921`. Tests: `bookings/tests/storefront.test.ts` (9).
  - Web: the `storefront` module (`route.tsx` layout with the unavailable page, `index.tsx` redirect, `book.tsx` with three steps in search params), `BookableTimesPicker`, booking date helpers in `src/shared/lib/date.ts`, and `date-fns` + `@date-fns/tz`.
- Differs from plan:
  - The self-booking response is a `CustomerBookingDto`, not a `BookingDto`, so `internalNote` and the contact snapshot never reach the storefront.
  - An unbookable start (off grid, outside hours, taken, past, beyond 60 days) is 409 with `BOOKING_TIME_TAKEN`, so the web handles one code: it refetches the times and offers "Pick another time". A malformed `startsAt` is 400.
  - "Now → 60 days" is local dates today through today + 60, inclusive. The cap is checked before the overlap, so a customer at the cap hears about the cap.
  - The storefront profile also carries the tagline, description, city and country for the page header. The layout is `ssr: false` like the rest of the app, so `/<slug>` redirects in the browser.
  - The confirm button reads "Confirm booking", or "Send request" for approval services.
  - `bun add` bumped unrelated TanStack packages and broke `router.tsx` types (two `query-core` versions), so the lockfile has only the two new workspace lines, added by hand and checked with `--frozen-lockfile`.
- Checked in the running app (e2e subagent, all 6 Verify steps passed):
  - Signed out, `/<slug>` → `/<slug>/book` with both services and their prices.
  - Haircut tomorrow 10:00 → Confirm → login → back on the confirm URL → "Booked". The row is `confirmed` with the account's name and email, plus the typed phone and note. The outbox has "Booking confirmed" (customer) and "New booking" (owner).
  - Colouring 13:00 → "Request sent". The row is `pending`. The outbox has "Request received" and "New booking request".
  - Haircut's times lost 09:45–10:15 and 12:45–14:15, so pending bookings hold time. An `owner-with-org` org and an unknown slug show "This booking page isn't available".
  - A taken start is 409 40919, and a POST without a session is 401.
  - Found: phone and note typed before the login redirect are lost (minor, not in the brief).
  - Not checked: real Resend delivery of the four templates. The web server's own log during the run wasn't captured.

## Phase 6: Bookings calendar and list (web)

**Goal:** `/dashboard/<slug>/bookings` shows a month, week and day calendar by default and a filterable, sortable, paginated list, both in the org's timezone.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.bookings.index.tsx` (replace the placeholder; `_shell.bookings.tsx` is its layout).
- New `org-dashboard/lib/booking-queries.ts`: copy `service-queries.ts` (keys, `queryOptions`, `useUnwrapWrite`). Endpoints: `GET /organizations/:id/bookings` → `BookingListDto` and `GET …/bookings/calendar` → `BookingDto[]`, with repeatable `serviceId`/`status` params; query schemas `bookingListQuerySchema`/`bookingCalendarQuerySchema` and `BOOKING_SORTS` are in `@sinwy/shared`.
- New `org-dashboard/lib/calendar.ts` (pure date maths in the org zone), built on `todayIn`, `addDaysToDate`, `formatTimeIn` and `formatDateIn` in `src/shared/lib/date.ts`; `date-fns` and `@date-fns/tz` are already installed.
- New `org-dashboard/components/bookings/` (`BookingsCalendar`, `MonthView`, `TimeGridView`, `BookingsList`, `BookingFilters`, `BookingStatusBadge`).
- Business hours come from `availabilityQuery` in `service-queries.ts`; the service filter's options from `servicesQuery`. Prices with `formatMinorUnits` in `src/shared/lib/money.ts`.
- Web tests use `bun test` next to the code (`*.test.ts`), as the existing 26 web test files do.

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

### Log (2026-11-03, `feat(web): add the bookings calendar and list`)
- Shipped:
  - `/dashboard/<slug>/bookings` with Calendar (month, week, day) and List views, all in the org zone with a "Times in {zone}" label. The month view shows 3 bookings a day plus "+N more" (opens the day). Week and day views shade closed hours and closures, and scroll to the earliest opening. Clicking a booking opens its detail page, and clicking an empty spot (`bookings:write` only) goes to `bookings/new?start=<UTC ISO>`.
  - The list has search, From/To dates, service and status multi-selects, three sorts, paging with the total, and "Clear filters".
  - `lib/calendar.ts` (pure zone maths), `lib/booking-search.ts` (search schema, defaults, query strings), `lib/booking-queries.ts`, `components/bookings/`, and `formatShortDateIn` in `src/shared/lib/date.ts`. 24 new web tests.
- Differs from plan:
  - DST: the time grid's rows are wall-clock hours, the union over the visible dates. A repeated hour gets its own row (`03:00#1`), and an hour a date skips is shaded in that column, so 10:00 sits on the same row in every column of a DST week. A booking past local midnight is split across both columns. The month view lists it on its start date only.
  - Added `showCancelled` to the search params. The calendar's filters are the service filter and that switch; the status, search and date-range filters are list-only, and the calendar ignores them while they stay in the URL.
  - The calendar query filters on `startsAt`, so a booking that starts before the first visible date and runs past its midnight doesn't show in the first column. Accepted for the MVP.
  - Array params are written in TanStack's JSON form (`status=%5B%22pending%22%5D`). Plain and repeated params (`?status=pending&status=cancelled`) are read too.
  - The Phase 5 servers weren't running anymore, so this phase started them again.
- Checked in the running app (e2e subagent, all 4 Verify steps passed, browser in `America/New_York`):
  - The month view shows both bookings for tomorrow. "Show cancelled" reveals next week's cancelled booking, muted and struck through.
  - In the week and day views, the blocks sit on the 10:00 and 13:00 gutter rows (480px and 624px). Clicking 15:30 goes to `new?start=2026-11-04T13:30:00.000Z`, which 404s until Phase 7.
  - The list defaults to 2 upcoming rows. Status `pending` gives 1 row, the customer's email gives 2, `q=walkin` gives the cancelled row (with cancelled included), and "Newest booked" reverses the order.
  - After a refresh, the list filters and sort, and the calendar's week, date and `showCancelled`, are all kept. The backend and web logs and the browser console have no errors.

---

## Phase 7: Booking detail, manual booking and reschedule (web)

**Goal:** Staff open a booking and act on it, create phone and walk-in bookings, and reschedule with the shared picker or a custom time.

**Files:**
- `org-dashboard/routes/_shell.bookings.$id.tsx` (replace the placeholder); new `_shell.bookings.new.tsx` with `validateSearch` for `start` (`z.iso.datetime({ offset: true }).optional().catch(undefined)`, as `storefront/routes/book.tsx` does). The calendar already links to both.
- `org-dashboard/lib/booking-queries.ts`: add `bookingKeys.detail` and `bookingKeys.times` under `bookingKeys.all`, a detail query (`GET bookings/:bookingId` → `BookingDetailDto`), a times query (`GET bookings/times?serviceId&from&to&excludeBookingId` → `BookableTimesDto`) and the writes: `POST bookings` (`ManualBookingInput`), `PATCH bookings/:bookingId` (`BookingUpdateInput`), and `POST bookings/:bookingId/{confirm|cancel|complete|no-show|reschedule}` (`cancelBookingSchema`, `rescheduleBookingSchema`). Copy `useUnwrapWrite` from `service-queries.ts`, or import it from there.
- New in `org-dashboard/components/bookings/`: `BookingActions`, `RescheduleDialog`, `ManualBookingForm`, `BookingHistory` and `ContactCard`. Reuse `BookingStatusBadge` and `BOOKING_STATUS_LABELS`.
- The action mapping is a pure function in a new `org-dashboard/lib/booking-actions.ts` over `canTransition`, with a test in `org-dashboard/tests/`.
- The custom-time conversion uses `startOfLocalDate` from `lib/calendar.ts` plus the wall minutes; it's not in the browser zone.
- `src/shared/components/booking/BookableTimesPicker.tsx` (from Phase 5). Org timezone and hours come from `availabilityQuery`, and services from `servicesQuery`, both in `service-queries.ts`.
- `org-dashboard/routes/_shell.bookings.index.tsx`: the "New booking" header button, next to the Calendar/List toggle.

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

### Log (2026-11-03, `feat(web): add the booking detail, manual booking and reschedule`)
- Shipped:
  - The booking detail page (status and actions, appointment, contact card, notes, history), `/bookings/new` with the picker or a custom time and the `?start=` prefill, the reschedule dialog, and the "New booking" button on the bookings page.
  - Pure logic in `lib/booking-actions.ts` and `lib/booking-forms.ts`, with 8 new web tests: the actions match `canTransition` for every status and time, and the form schemas cover name, email or phone, and typed times read in the org zone, including both DST days and a skipped hour.
  - `fromText` moved from `storefront/components/ConfirmStep.tsx` to `src/shared/lib/text-schema.ts`.
- Differs from plan:
  - A custom time converts with the new `instantOfWallTime(date, time, timezone)` in `lib/calendar.ts`, not `startOfLocalDate` plus minutes, which is an hour off after a DST change on that day. `startOfLocalDate` is now `instantOfWallTime(date, "00:00", …)`. A skipped wall time moves forward past the jump, and a repeated one takes its first pass.
  - An expired request's only action is labelled "Cancel request", and it can't be rescheduled. Confirmed bookings that have started keep Cancel booking and Reschedule next to Complete and No-show, as the transition table allows.
  - The "From the customer" note shows only on self-bookings, because manual bookings have no customer note.
  - A picked time that stops being free after the service changes is dropped. Only the `?start=` prefill switches to a custom time.
- Checked in the running app (e2e subagent, all 7 Verify steps passed):
  - Declining with "Fully booked" stored `cancelled_by = organization` and the reason, and sent "Request declined" with the reason. The history reads "Declined by Seed Owner / Reason: Fully booked".
  - A week-view click at 15:00 opened `new?start=…13:00Z` with 15:00 preselected for Haircut. The phone-only walk-in was `confirmed` and sent no email. A custom 15:15 got 409 "That time was just taken".
  - Rescheduling showed "Moved from … 15:00 to … 16:00", and the phone edit logged "Contact phone updated". A self-booking's contact had no Edit.
  - A past custom-time booking went Completed and then No-show, with the matching history.
  - The backend and web logs had no errors. The browser console had only the expected 409.
  - Findings:
    - `booking_event.payload` is double-encoded jsonb (reproduced inline: `jsonb_typeof` is `string` for `rescheduled` and `contact_updated`). It comes from Phase 4 and is left for later (standing note).
    - A past manual booking with an email still sends "Booking confirmed", as the email matrix says.
  - Not checked: Resend delivery and rendering, the "Not found" state of an unknown booking id, and read-only users (every role has `bookings:write`).
