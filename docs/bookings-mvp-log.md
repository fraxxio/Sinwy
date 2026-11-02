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
