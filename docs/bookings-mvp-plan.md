# Bookings MVP plan

Lets an organization take bookings. Signed-in customers book on the org's public storefront, and staff add phone and walk-in bookings, manage them in a calendar and a list, and work requests through a status machine that sends emails. The overview and Customer Mode get real content. This is the first working version; staff and resources, payments, customer records, background jobs and a page builder come in later plans.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [bookings-mvp-log.md](bookings-mvp-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Move the dashboard to `/dashboard/$organizationSlug` | – | done | `feat(backend, web): move the org dashboard under /dashboard` |
| 2 | Bookings schema, status rules and the approval switch | 1 | done | `feat(backend, web): add the bookings schema and the service approval switch` |
| 3 | Create bookings, the capacity check, list and calendar API | 2 | done | `feat(backend): add manual bookings with the capacity check, list and calendar API` |
| 4 | Status changes, reschedule, edits and booking emails | 3 | done | `feat(backend): add booking status changes, reschedule, edits and emails` |
| 5 | Storefront module and the public booking flow | 4 | done | `feat(backend, web): add the storefront and public self-booking` |
| 6 | Bookings calendar and list (web) | 3 | done | `feat(web): add the bookings calendar and list` |
| 7 | Booking detail, manual booking and reschedule (web) | 4, 5, 6 | done | `feat(web): add the booking detail, manual booking and reschedule` |
| 8 | Overview page | 4 | done | `feat(backend, web): add the bookings overview` |
| 9 | Cancellation window | 4, 5 | done | `feat(backend, web): add the service cancellation window` |
| 10 | Customer Mode bookings | 4, 5, 9 | done | `feat(backend, web): add Customer Mode bookings` |
| 11 | Account overview | 10 | done | `feat(backend, web): add the account overview` |
| 12 | Bookings when an org, account or service goes away | 4, 9 | done | `feat(backend, web): cancel bookings when an org or account goes away` |
| 13 | Code review | 1–12 | done | `fix(backend, web): review the bookings MVP and store who made each booking` |

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

  A decline is a cancellation, recorded as `cancelledBy: "customer" | "organization"` plus an optional `cancellationReason`. No background jobs: a past `pending` shows as "Expired request" and can only be cancelled, and nothing auto-completes. Rescheduling keeps the status and is staff-only, for `pending` and `confirmed`. Customers cancel and book again, within the service's cancellation window.
- **Cancellation window**, per service.
  - `service.cancellationWindowMinutes` is one of none (0, the default), 2, 12, 24 or 48 hours. The service editor sets it and Duplicate copies it. Bookings copy it at creation, so later edits don't change existing bookings.
  - It binds only customer cancels of `confirmed` bookings. Inside the last X minutes before the start, the customer can't cancel (409), and the detail page shows the org's phone and email instead.
  - Withdrawing a `pending` request is always allowed. Staff and system cancels ignore the window.
  - A booking made inside its window can't be cancelled by the customer at all. The storefront confirm step shows the policy before booking.
  - No late-cancellation flag and no fee. A soft flag can be added later without changing this.
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
  - Detail page: org with a link to its storefront and its city and country, service, time, price, status ("Waiting for {org} to confirm"), the customer's own note, the decline or cancel reason, and a status timeline.
  - Actions: Cancel with the policy notice, "Add to calendar" (`.ics`, built in the browser) and "Book again". Customers can't reschedule.
  - Empty state: there's no discovery page yet, so it explains that bookings are made on a business's booking page, with no link. The discovery link comes with discovery.
  - `/account/` overview: the next upcoming booking and up to 3 "Book again" services.
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

Verified facts and gotchas for later booking work (staff and resources, payments, customer records). Don't check them again.

- **"Slot" is taken** (plan cap). Say "bookable times" in code, routes and UI copy.
- **Permissions exist.** `bookings:read`/`bookings:write` are in `Sinwy.Shared/types/access/Permission.ts`; owner, admin and staff have both (`RolePermissions.ts`). Bookings are on every plan; `PLAN_FEATURES` gates nothing here.
- **Backend module pattern.** Copy `modules/services/`: `routes.ts` with `read`/`write` middleware arrays (`requireAuth`, `requirePermission` from `@authModule`), and controllers with a local `respondError` and `parseBody` (400 with the first Zod message). Service functions take the `Membership` (`membershipFrom(c)`), return `Result<T>` and check `membership.status !== "active"` → `inactive` (409 `ORGANIZATION_INACTIVE`) before any write. Wire a new module in `Sinwy.Backend/import_map.json`, `tsconfig.json` and `Sinwy.Backend/index.ts`.
- **The public org check exists.** `isOrganizationPublic(access)` in `modules/organizations/service.ts` is the §9 "active" rule (slot held, not scheduled, owner has a plan); `findOrganizationAccess(organizationId)` loads `access`. `findPublicOrganization(slug)` from `@organizationsModule` returns `PublicOrganization` (id, name, slug, timezone, currency, tagline, description, city, country) or null when unknown or not active.
- **Org locale:** `getOrganizationLocale(organizationId) → { timezone, currency } | null` from `@organizationsModule`; `todayIn(timezone, now?)` from `@servicesModule`.
- **Bookable times:** `listBookableTimes(organizationId, serviceId, range, busy, now?)` from `@servicesModule` takes `BusyInterval[]` (`{ start, end }`, already padded) and returns `{ timezone, times }`. The range is local dates, limited by `bookableTimesQuerySchema` / `AVAILABILITY_LIMITS.bookableTimesDays` in `Sinwy.Shared/types/service/Availability.ts`. It ignores org status, so callers check it. Wall times convert with `tzOffset`, never `TZDate`. `findBookableService(organizationId, serviceId)` from `@servicesModule` returns the fields a booking copies (null when archived or foreign); `listPublicServices(organizationId)` returns `PublicServiceDto[]` (active, not archived). The old `GET services/:serviceId/times` route is gone.
- **Transactions across modules:** open in the repository and pass `tx` into the other module's exported function (`Tx` pattern in `modules/organizations/access.ts`, as `transfers/repository.ts` does). Row locks use `.for("update")` (`modules/organizations/slots.ts`).
- **IDs** are `crypto.randomUUID()` in `text` columns; FKs to `organization.id` cascade, so purge (`modules/organizations/purge.ts`) removes bookings without code changes. FK to `service.id`: `restrict` (services are archived, never deleted).
- **Migrations:** edit `Sinwy.Backend/db/schema/`, export from `db/schema/index.ts`, then `bun run db:generate --name <name>` and `bun run db:migrate`. Latest is `drizzle/0022_booked_by.sql`; a column added to a table with rows needs a hand-written backfill in the generated SQL (see that file). Status-style checks use `oneOf` from `@db/oneOf` (see `availability_exception`).
- **Drizzle quirks:** queries are thenables (`expect(query).rejects` fails; use `query.then(() => null, (e) => e)`). `exactOptionalPropertyTypes` is on, so partial update types spell out `| undefined`. Use `jsonb` from `@db/jsonb`, never Drizzle's: with `bun-sql` Drizzle's stores a JSON string (log Phase 13).
- **Email:** locally, mail lands in the outbox (`readOutboxEmails`, `bun run Sinwy.Backend/scripts/dev/lastEmail.ts`). Loggers: `createLogger("bookings")` from `@logger`.
- **Lifecycle:** `auth.ts` `beforeDelete` → schedule owned orgs → `cancelUpcomingOrganizationBookings` → `handleCustomerAccountDeleted`; `beforeDeleteOrganization` cancels before the cascade. `auth.ts` must import `@bookingsModule` lazily (static import breaks module load). Organizations can't import bookings, so cross-module job wiring lives in `Sinwy.Backend/jobs.ts` (the purge's `onScheduled` hook cancels bookings). Deletion-preview counts (per org and the user's own) are joined in `user/service.ts`. A closing race is open (`org-rules-map.md` §14). See log Phases 12–13.
- **Backend tests:** `bun:test` with a real DB, using the helpers in `Sinwy.Backend/test/helpers.ts` (`createUserWithSession` gives `<userId>@test.dev`, `insertOrganization`, `givePlan`, `holdSlot`, `activateOrganization`, `joinOrganization`, `fakeCtx`). For booking HTTP tests, copy the harness in `modules/bookings/tests/changes.test.ts` (`book`, `selfBook` via `createBooking` with a customer actor, `action`, `sentTo`, an org in `Europe/Vilnius`). The outbox is shared across tests: filter by a fresh recipient, and compare outbox ids to prove that nothing was sent. Stub failures with `spyOn(emailClient, "send")`. An org becomes inactive with `slotHeldAt: null`.
- **Seeds:** `bun run dev:seed-scenario <user|owner-with-org|subscribed-org|org-with-staff>` (`Sinwy.Backend/scripts/dev/seedScenario.ts`, `scenarios` array). `subscribed-org` returns an active, onboarded org with its owner's credentials. See the `e2e-test` skill.
- **Web routing:**
  - `Sinwy.WebFrontend/src/routes.ts` mounts modules with `physical(prefix, dir)`. The dashboard is at `/dashboard/$organizationSlug` (route ids `"/dashboard/$organizationSlug/_shell/..."`); nothing serves the root slug until the storefront mounts there, last.
  - Dashboard routes are in `modules/org-dashboard/routes/`; route context gives `organization` (with `currency`) and `member`. Check writes with `hasPermission(member.roles, "bookings:write")`.
  - The route tree regenerates while `vite dev` runs; there's no separate generate script. The app has no `notFoundComponent`, so unmatched URLs show TanStack's plain "Not Found".
  - An org the user can't open (not a member, unknown slug) redirects to `/` with no message (`_shell.tsx` `beforeLoad`); unchanged by Phase 1.
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
- **Booking tables** (`db/schema/bookingSchema.ts`): `booking` and `bookingEvent`. `booking.bookedBy` (`customer` | `organization`) is what makes a booking manual, not `customerUserId`, which a deleted account nulls; `createBooking` derives it from the actor. Status-like columns are `text` with `oneOf` checks, `startsAt`/`endsAt` are timestamptz, and `createdAt`/`occurredAt` are plain `timestamp` like the rest. The `restrict` FK to `service` still lets an org's cascade remove its bookings (`bookings/tests/schema.test.ts`).
- **Shared booking types** (`Sinwy.Shared/types/booking/`): `BOOKING_STATUSES`, `ACTIVE_BOOKING_STATUSES`, `BOOKING_TRANSITIONS`, `BOOKING_PARTIES` (`bookedBy`, `cancelledBy`), `canTransition(from, to, actor, startsAt, now?)` with actors `organization` | `customer` (the start instant counts as started), `BookingDto`, `CustomerBookingDto`, `BookingEventDto`, `BOOKING_LIMITS`, and `bookingContactSchema` (name + email or phone), `internalNoteSchema`, `customerNoteSchema`, `cancellationReasonSchema`. Event actor types (`member` | `customer` | `system`) differ from transition actors.
- **`Sinwy.Shared` has no test runner** (its tsconfig has `types: []`); tests of shared logic live in the backend (`bookings/tests/transitions.test.ts`) or web.
- **`bookable-org`** is in `Europe/Vilnius`; its output adds `timezone`, `hours` and `services` (ids, prices, `requiresApproval`) to `organization`.
- **The backend dev server doesn't watch files.** Restart it after backend changes before a browser Verify, with its output in a log file (`bun run start:server`, :3001; vite is `bun run start:web`, :3000). The auto-mode classifier blocks killing a server without the user's approval, so ask first.
- **Bookings API (Phase 3):** `GET|POST organizationPath("bookings")`, `GET bookings/times?serviceId&from&to&excludeBookingId`, `GET bookings/calendar` (returns `BookingDto[]`, no timezone) and `GET bookings/:bookingId` (`BookingDetailDto` with `history`). Filters are repeatable `serviceId` and `status`; no `status` means everything but cancelled, and a list without `from`/`to` starts today in the org zone. Schemas: `manualBookingSchema`, `bookingListQuerySchema`, `bookingCalendarQuerySchema` in `@sinwy/shared`.
- **One way in:** `createBooking(input)` in `bookings/service.ts` (`BookableService`, `startsAt`, contact, notes, status, actor) returns `Result<BookingDto>` with `time-taken` → 409 `BOOKING_TIME_TAKEN`, and dispatches its emails. Its transaction is `insertBookingIfFree` in the repository; `upcomingLimit` turns on the per-customer cap (`limit-reached` → 409 `BOOKING_LIMIT_REACHED` 40921), checked before the overlap. Next free error code: 40923.
- **Booking writes (Phase 4):** every change goes through `changeBooking(scope, bookingId, decide, { lockOrganization? })` in the repository. The scope is `{ organizationId }` or `{ customerUserId }`, and only an organization scope can take the organization lock. It takes the row lock, then `decide` returns `values`, `event` and an optional `window` to check. The service's `committed()` dispatches its events after commit. Status changes go through `changeBookingStatus` (staff) and `cancelCustomerBooking`, which share `statusChange()`.
- **Booking emails:** after commit, `dispatchBookingEvent(event)`. The matrix is all in `dispatch.ts`, including self-bookings (actor `customer`) and customer cancels (`cancelledBy: "customer"`). Org emails go to `listOrganizationManagerEmails` from `@organizationsModule`. Subjects start with the matrix label ("Request received: …", "New booking request: …").
- **Overlap check:** `lockOrganization(tx, organizationId)` (repository-private) then `isTimeTaken(tx, organizationId, window, excludeBookingId?)` (exported from `@bookingsModule`); `paddedWindow(booking)` in `bookings/utils.ts` builds the window. Removing the lock makes the race test fail, so it is a real guard (log Phase 3).
- **Local dates → instants:** `startOfLocalDate`, `localDateRange` and `addDaysToDate` in `bookings/utils.ts` (DST-tested in `tests/utils.test.ts`). Raw `sql` comparisons pass instants as ISO strings cast `::timestamptz` (`instant()` in the repository).
- **Storefront API (Phase 5):** `registerStorefrontRoutes` in `bookings/routes.ts` serves `GET /api/public/organizations/:slug` (`StorefrontDto`), `GET …/services/:serviceId/times?from&to` and `POST …/bookings` (`requireAuth`, `selfBookingSchema`, returns `CustomerBookingDto`); unknown or non-active orgs are 404 "This booking page isn't available".
  - Customers book local dates today through today + `BOOKING_LIMITS.selfBookingDays` (60, inclusive); the times route clamps to that. A start that isn't a current free time is 409 `BOOKING_TIME_TAKEN`.
  - The cap (`BOOKING_LIMITS.upcomingSelfBookings`, 5) counts the customer's `pending`/`confirmed` bookings in the org with `startsAt >= now`.
  - Free times for any caller go through `findFreeTimes` in `bookings/service.ts` (busy intervals a day either side, then `listBookableTimes`).
- **Web storefront (Phase 5):** `modules/storefront/` mounts at `/$organizationSlug` (last in `src/routes.ts`); `route.tsx` at a physical mount's root is that path's layout. It is `ssr: false`, loads `storefrontQuery(slug)` (null on 404) and children read it with `useSuspenseQuery`. Query keys start `["storefront", slug]`. `/<slug>/book` steps follow the search params `service`, `date` and `start`; the confirm step is `components/ConfirmStep.tsx`. Phone and note typed before the login redirect are lost (log Phase 5).
- **Web booking helpers:** `src/shared/lib/date.ts` has `todayIn`, `addDaysToDate`, `localDateOf`, `formatTimeIn` and `formatDateIn` (org zone via `@date-fns/tz`). `BookableTimesPicker` in `src/shared/components/booking/` takes `timezone`, `date`/`onDateChange`, `minDate`/`maxDate`, `times`, `value`/`onChange`, `loading` and `emptyMessage`.
- **Forms over shared nullish schemas:** a text field can't take `customerPhoneSchema` directly (its input allows null); pipe it through `fromText` from `src/shared/lib/text-schema.ts`. A cross-field `.refine` takes `when: () => true` so its error shows next to field errors (`lib/booking-forms.ts`).
- **Dependencies:** `bun add` re-resolves the lockfile and bumps TanStack packages, leaving two `query-core` versions that break `router.tsx` types. Add the dependency to `package.json` and the workspace block of `bun.lock` by hand, then `bun install --frozen-lockfile`. After new deps, vite's first page load gives 504 "Outdated Optimize Dep"; a reload clears it.
- **Vite reads `src/routes.ts` only at startup**: restart it after changing mounts, or a route-file edit regenerates the tree from the old config.
- **Web bookings page (Phase 6):**
  - `org-dashboard/lib/booking-queries.ts` keys start `["bookings", organizationId]` (`bookingKeys.all`); invalidate that prefix after writes. List and calendar queries use `keepPreviousData`.
  - `src/shared/components/booking/BookingStatusBadge.tsx` (moved there in Phase 10) exports `BOOKING_STATUS_LABELS`, `BOOKING_STATUS_STYLES` and `isExpiredRequest`. The badge already reads "Expired request" for a past `pending`.
  - Calendar maths is in `lib/calendar.ts` (`startOfLocalDate`, `dayColumn`, `gridRows`, `instantAt`; see log Phase 6 for the DST rows). Search params are `bookingsSearchSchema` in `lib/booking-search.ts`. Links into the list can use plain params (`?view=list&status=confirmed&to=<date>`).
- **Web booking detail (Phase 7):**
  - `booking-queries.ts` has `bookingQuery` (detail), `bookingTimesQuery` (one local date, optional `excludeBookingId`), the writes (`createManualBooking`, `updateBooking`, `changeBookingStatus(org, id, to, body?)`, `rescheduleBooking`) and `invalidateBookings(queryClient, organizationId)`, which invalidates `bookingKeys.all`. Key new booking queries under `bookingKeys.all` so every write refreshes them.
  - `lib/booking-actions.ts`: `statusActions(booking, now?)` (labels and targets from `canTransition`) and `canReschedule`. `components/bookings/BookingActions.tsx` renders them, with a private `CancelDialog` (reason).
  - `lib/booking-forms.ts`: `bookingTimeSchema(timezone)` (picked time or typed wall time → ISO), `contactFormSchema`, `manualBookingFormSchema`. `BookingTimeField` is the picker plus the Custom time switch. Wall time → instant is `instantOfWallTime(date, "HH:mm", timezone)` in `lib/calendar.ts`.
- **e2e quirks:** `page.ts` lists Base UI toasts as `Dialog:`. Option names overlap ("2 hours" matches "12 hours"), so role locators need `exact: true`.
- **TanStack search schemas:** a Zod key whose input type is `unknown` (e.g. `z.preprocess`) makes `search` required on every `Link` to the route. Keep each key's input optional (`.optional()` before `.transform`/`.catch`).
- **Browser zone in e2e:** `playwright-cli open --config <copy of .playwright/cli.config.json>` with `contextOptions.timezoneId` added. Don't edit the real config.
- **Overview (Phase 8):**
  - `getOverview` in `bookings/service.ts` and `GET bookings/overview`; `bookingOverviewQuery` sits under `bookingKeys.all`, so every booking write refreshes it.
  - "Pending" means not started (`startsAt > now`); started `pending` and `confirmed` bookings count as needs attention.
  - `openMinutes` from `@servicesModule` counts wall-clock minutes of org-wide hours.
  - See log Phase 8.
- **Cancellation window (Phase 9):** `CANCELLATION_WINDOW_PRESETS` (0, 120, 720, 1440, 2880) in `Sinwy.Shared/types/service/Service.ts`; the schema field is `z.literal(presets)`, and DTOs type it as `number`. `service` and `booking` have `cancellation_window_minutes` (default 0); `createBooking` copies it from `BookableService`, and `BookingDto`, `CustomerBookingDto` and `PublicServiceDto` carry it.
  - `customerCanCancel(booking, now?)` and `customerCancelDeadline(booking)` in `BookingStatus.ts` take `{ status, startsAt (string or Date), cancellationWindowMinutes }`. The deadline itself is already too late (`now < deadline`).
  - Web copy: `formatCancellationWindow` ("24 hours") and `formatCancellationPolicy` in `src/shared/lib/cancellation-policy.ts`.
- **Customer Mode (Phase 10):**
  - Backend: `registerAccountBookingRoutes` in `bookings/routes.ts` (`/api/account/bookings`, `/:bookingId` and `/:bookingId/cancel`, all `requireAuth`) is wired in `Sinwy.Backend/index.ts`. The service has `listCustomerBookings`, `getCustomerBooking` and `cancelCustomerBooking`, which returns 409 with no code when the org is scheduled for deletion.
  - DTO mapping is `toCustomerBookingDto(row)` over `findCustomerBooking(s)` in the repository, which join `organization` + `organization_profile` (`customerBookingFields`). `createSelfBooking` now reloads through it too.
  - "Upcoming" is `upcomingFor(now)` in the repository (`pending`/`confirmed` and `endsAt > now`, so in-progress bookings count). The web mirror is `isUpcoming` in `account-dashboard/lib/customer-booking.ts`.
  - The timeline DTO is `CustomerBookingEventDto` (`actor`: `customer` | `organization` | `system`, plus `moved: { from, to }`). Contact events are dropped. Only an `organization` cancel of a `pending` request reads "Declined" (`statusLineOf`, `timelineLabelOf`, and `dispatch.ts` for email).
  - Web: `account-dashboard/lib/booking-queries.ts` keys start `["account-bookings"]` (`accountBookingKeys.all`), and `invalidateAccountBookings` invalidates that prefix. `customer-booking.ts` has `cancelPolicyOf`, `windowPassedMessage`, `statusLineOf` and `timelineLabelOf`. Reusable components: `components/bookings/AddToCalendarButton.tsx` (`downloadBookingIcs` in `lib/ics.ts`) and `CustomerBookingList.tsx`. See log Phase 10.
- **Account overview (Phase 11):** `GET /api/account/bookings/summary` (`getCustomerBookingSummary`, `CustomerBookingSummaryDto` = `next` + `rebook`) and `accountBookingSummaryQuery` under `accountBookingKeys.all`. The `account.test.ts` harness has `selfBook(startsAt, { serviceId, organizationId, by, status, windowMinutes })` and `addService(name, organizationId?)` (a direct insert, so any org can have services).
- **The fall-back hour** of a DST-end day offers only the first pass of the repeated hour. Fine for the MVP.
