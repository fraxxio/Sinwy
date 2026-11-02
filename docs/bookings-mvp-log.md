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
