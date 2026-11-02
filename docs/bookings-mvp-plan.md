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
| 6 | Bookings calendar and list (web) | 3 | todo | |
| 7 | Booking detail, manual booking and reschedule (web) | 4, 5, 6 | todo | |
| 8 | Overview page | 4 | todo | |
| 9 | Cancellation window | 4, 5 | todo | |
| 10 | Customer Mode bookings | 4, 5, 9 | todo | |
| 11 | Account overview | 10 | todo | |
| 12 | Bookings when an org, account or service goes away | 4, 9 | todo | |
| 13 | Code review | 1–12 | todo | |

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

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes. Services-plan notes still apply; [services-mvp-plan.md](services-mvp-plan.md) keeps them.

- **"Slot" is taken** (plan cap). Say "bookable times" in code, routes and UI copy.
- **Permissions exist.** `bookings:read`/`bookings:write` are in `Sinwy.Shared/types/access/Permission.ts`; owner, admin and staff have both (`RolePermissions.ts`). Bookings are on every plan; `PLAN_FEATURES` gates nothing here.
- **Backend module pattern.** Copy `modules/services/`: `routes.ts` with `read`/`write` middleware arrays (`requireAuth`, `requirePermission` from `@authModule`), and controllers with a local `respondError` and `parseBody` (400 with the first Zod message). Service functions take the `Membership` (`membershipFrom(c)`), return `Result<T>` and check `membership.status !== "active"` → `inactive` (409 `ORGANIZATION_INACTIVE`) before any write. Wire a new module in `Sinwy.Backend/import_map.json`, `tsconfig.json` and `Sinwy.Backend/index.ts`.
- **The public org check exists.** `isOrganizationPublic(access)` in `modules/organizations/service.ts` is the §9 "active" rule (slot held, not scheduled, owner has a plan); `findOrganizationAccess(organizationId)` loads `access`. `findPublicOrganization(slug)` from `@organizationsModule` returns `PublicOrganization` (id, name, slug, timezone, currency, tagline, description, city, country) or null when unknown or not active.
- **Org locale:** `getOrganizationLocale(organizationId) → { timezone, currency } | null` from `@organizationsModule`; `todayIn(timezone, now?)` from `@servicesModule`.
- **Bookable times:** `listBookableTimes(organizationId, serviceId, range, busy, now?)` from `@servicesModule` takes `BusyInterval[]` (`{ start, end }`, already padded) and returns `{ timezone, times }`. The range is local dates, limited by `bookableTimesQuerySchema` / `AVAILABILITY_LIMITS.bookableTimesDays` in `Sinwy.Shared/types/service/Availability.ts`. It ignores org status, so callers check it. Wall times convert with `tzOffset`, never `TZDate`. `findBookableService(organizationId, serviceId)` from `@servicesModule` returns the fields a booking copies (null when archived or foreign); `listPublicServices(organizationId)` returns `PublicServiceDto[]` (active, not archived). The old `GET services/:serviceId/times` route is gone.
- **Transactions across modules:** open in the repository and pass `tx` into the other module's exported function (`Tx` pattern in `modules/organizations/access.ts`, as `transfers/repository.ts` does). Row locks use `.for("update")` (`modules/organizations/slots.ts`).
- **IDs** are `crypto.randomUUID()` in `text` columns; FKs to `organization.id` cascade, so purge (`modules/organizations/purge.ts`) removes bookings without code changes. FK to `service.id`: `restrict` (services are archived, never deleted).
- **Migrations:** edit `Sinwy.Backend/db/schema/`, export from `db/schema/index.ts`, then `bun run db:generate --name <name>` and `bun run db:migrate`. Latest is `drizzle/0020_bookings.sql`. Status-style checks use `oneOf` from `@db/oneOf` (see `availability_exception`).
- **Drizzle quirks:** queries are thenables (`expect(query).rejects` fails; use `query.then(() => null, (e) => e)`). `exactOptionalPropertyTypes` is on, so partial update types spell out `| undefined`.
- **Email:** locally, mail lands in the outbox (`readOutboxEmails`, `bun run Sinwy.Backend/scripts/dev/lastEmail.ts`). Loggers: `createLogger("bookings")` from `@logger`.
- **Deletion hooks:**
  - Owner account deletion runs `beforeDelete` → `scheduleOwnedOrganizationsForDeletion(user.id)` and `afterDelete` → `cleanupDeletedUser` (`modules/auth/auth.ts` ~168–195, `deletedUserCleanup.ts`).
  - Immediate org deletion is Better Auth's `/organization/delete`; `organizationHooks` sits in `auth.ts` ~313, and there's no delete hook yet.
  - The deletion dialog's data is `getAccountDeletionPreview` (`modules/organizations/service.ts` ~310, `GET /api/user/deletion-preview`).
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
- **Booking tables** (`db/schema/bookingSchema.ts`): `booking` and `bookingEvent`; status-like columns are `text` with `oneOf` checks, `startsAt`/`endsAt` are timestamptz, and `createdAt`/`occurredAt` are plain `timestamp` like the rest. The `restrict` FK to `service` still lets an org's cascade remove its bookings (`bookings/tests/schema.test.ts`).
- **Shared booking types** (`Sinwy.Shared/types/booking/`): `BOOKING_STATUSES`, `ACTIVE_BOOKING_STATUSES`, `BOOKING_TRANSITIONS`, `canTransition(from, to, actor, startsAt, now?)` with actors `organization` | `customer` (the start instant counts as started), `BookingDto`, `CustomerBookingDto`, `BookingEventDto`, `BOOKING_LIMITS`, and `bookingContactSchema` (name + email or phone), `internalNoteSchema`, `customerNoteSchema`, `cancellationReasonSchema`. Event actor types (`member` | `customer` | `system`) differ from transition actors.
- **`Sinwy.Shared` has no test runner** (its tsconfig has `types: []`); tests of shared logic live in the backend (`bookings/tests/transitions.test.ts`) or web.
- **`bookable-org`** is in `Europe/Vilnius`; its output adds `timezone`, `hours` and `services` (ids, prices, `requiresApproval`) to `organization`.
- **The backend dev server doesn't watch files.** Restart it after backend changes before a browser Verify, with its output in a log file; ask the user before stopping a server you didn't start.
- **Bookings API (Phase 3):** `GET|POST organizationPath("bookings")`, `GET bookings/times?serviceId&from&to&excludeBookingId`, `GET bookings/calendar` (returns `BookingDto[]`, no timezone) and `GET bookings/:bookingId` (`BookingDetailDto` with `history`). Filters are repeatable `serviceId` and `status`; no `status` means everything but cancelled, and a list without `from`/`to` starts today in the org zone. Schemas: `manualBookingSchema`, `bookingListQuerySchema`, `bookingCalendarQuerySchema` in `@sinwy/shared`.
- **One way in:** `createBooking(input)` in `bookings/service.ts` (`BookableService`, `startsAt`, contact, notes, status, actor) returns `Result<BookingDto>` with `time-taken` → 409 `BOOKING_TIME_TAKEN`, and dispatches its emails. Its transaction is `insertBookingIfFree` in the repository; `upcomingLimit` turns on the per-customer cap (`limit-reached` → 409 `BOOKING_LIMIT_REACHED` 40921), checked before the overlap. Next free error code: 40922 (Phase 10).
- **Booking writes (Phase 4):** every change goes through `changeBooking(organizationId, bookingId, decide, { lockOrganization? })` in the repository (row lock; organization lock first when set; `decide` returns `values`, `event` and an optional `window` to check), and the service's `committed()` dispatches its events after commit. It's scoped by organization; Phase 10 needs a customer scope. Status changes: `changeBookingStatus` (staff only today).
- **Booking emails:** after commit, `dispatchBookingEvent(event)`. Phase 12 can load `findBookingEmailContext(bookingId)` before the cascade and call `sendBookingEmails(event, context)`. The matrix is all in `dispatch.ts`, including self-bookings (actor `customer`) and customer cancels (`cancelledBy: "customer"`). Org emails go to `listOrganizationManagerEmails` from `@organizationsModule`. Subjects start with the matrix label ("Request received: …", "New booking request: …").
- **Overlap check:** `lockOrganization(tx, organizationId)` (repository-private) then `isTimeTaken(tx, organizationId, window, excludeBookingId?)` (exported from `@bookingsModule`); `paddedWindow(booking)` in `bookings/utils.ts` builds the window. Removing the lock makes the race test fail, so it is a real guard (log Phase 3).
- **Local dates → instants:** `startOfLocalDate`, `localDateRange` and `addDaysToDate` in `bookings/utils.ts` (DST-tested in `tests/utils.test.ts`). Raw `sql` comparisons pass instants as ISO strings cast `::timestamptz` (`instant()` in the repository).
- **Storefront API (Phase 5):** `registerStorefrontRoutes` in `bookings/routes.ts` serves `GET /api/public/organizations/:slug` (`StorefrontDto`), `GET …/services/:serviceId/times?from&to` and `POST …/bookings` (`requireAuth`, `selfBookingSchema`, returns `CustomerBookingDto`); unknown or non-active orgs are 404 "This booking page isn't available".
  - Customers book local dates today through today + `BOOKING_LIMITS.selfBookingDays` (60, inclusive); the times route clamps to that. A start that isn't a current free time is 409 `BOOKING_TIME_TAKEN`.
  - The cap (`BOOKING_LIMITS.upcomingSelfBookings`, 5) counts the customer's `pending`/`confirmed` bookings in the org with `startsAt >= now`.
  - Free times for any caller go through `findFreeTimes` in `bookings/service.ts` (busy intervals a day either side, then `listBookableTimes`).
- **Web storefront (Phase 5):** `modules/storefront/` mounts at `/$organizationSlug` (last in `src/routes.ts`); `route.tsx` at a physical mount's root is that path's layout. It is `ssr: false`, loads `storefrontQuery(slug)` (null on 404) and children read it with `useSuspenseQuery`. Query keys start `["storefront", slug]`. `/<slug>/book` steps follow the search params `service`, `date` and `start`; the confirm step is `components/ConfirmStep.tsx`. Phone and note typed before the login redirect are lost (log Phase 5).
- **Web booking helpers:** `src/shared/lib/date.ts` has `todayIn`, `addDaysToDate`, `localDateOf`, `formatTimeIn` and `formatDateIn` (org zone via `@date-fns/tz`). `BookableTimesPicker` in `src/shared/components/booking/` takes `timezone`, `date`/`onDateChange`, `minDate`/`maxDate`, `times`, `value`/`onChange`, `loading` and `emptyMessage`.
- **Forms over shared nullish schemas:** a text field can't take `customerPhoneSchema` directly (its input allows null); pipe it as `fromText` in `ConfirmStep.tsx` does.
- **Dependencies:** `bun add` re-resolves the lockfile and bumps TanStack packages, leaving two `query-core` versions that break `router.tsx` types. Add the dependency to `package.json` and the workspace block of `bun.lock` by hand, then `bun install --frozen-lockfile`. After new deps, vite's first page load gives 504 "Outdated Optimize Dep"; a reload clears it.
- **Vite reads `src/routes.ts` only at startup**: restart it after changing mounts, or a route-file edit regenerates the tree from the old config.
- **Running servers:** Phase 5 left vite on :3000 (`bun run dev` in `Sinwy.WebFrontend`) and the backend on :3001 (`bun run index.ts`, log `/tmp/sinwy-backend.log`) running; Phase 13 stops them. `/tmp/sinwy-web.log` doesn't capture the current vite.
- **The fall-back hour** of a DST-end day offers only the first pass of the repeated hour. Fine for the MVP.

---

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

## Phase 9: Cancellation window

**Goal:** Each service has a cancellation window, every booking copies it, and the storefront shows the policy before booking.

**Files:**
- `Sinwy.Backend/db/schema/serviceSchema.ts` and `bookingSchema.ts`: `cancellationWindowMinutes` integer, not null, default 0 (so existing rows backfill), with a `>= 0` check. Migration `cancellation_window`.
- `Sinwy.Shared/types/service/` (`ServiceSchema.ts`, `Service.ts`): the field, limited to `CANCELLATION_WINDOW_PRESETS` (0, 120, 720, 1440, 2880), and the public services DTO from Phase 5.
- `Sinwy.Shared/types/booking/BookingStatus.ts`: `customerCancelDeadline(booking)` and `customerCanCancel(booking, now?)` next to `canTransition`; `Booking.ts`: the field on `BookingDto`.
- `Sinwy.Backend/modules/services/service.ts`: create, update, Duplicate, `findBookableService`, `listPublicServices`. `modules/bookings/`: `createBooking` copies the field.
- Web: `org-dashboard/components/ServiceForm.tsx` and `org-dashboard/lib/services.ts` (a select under the approval switch); `storefront/routes/book.tsx` (the notice on the confirm step); `formatCancellationPolicy` in `src/shared/lib/` for the storefront and Customer Mode.

**Steps:**
- `customerCanCancel` is `canTransition(status, "cancelled", "customer", startsAt, now)` and, for `confirmed`, `now < startsAt − window`. `customerCancelDeadline` returns that instant, or null for `pending` and a 0 window. `canTransition` stays a pure status table.
- Every booking copies the window, manual ones included, so the rule has one source.
- Editor select: "None", "2 hours", "12 hours", "24 hours", "48 hours", with the help text "Customers can't cancel online during this time before the start." Read-only users see it disabled.
- Storefront confirm step: "Free cancellation up to 24 hours before the start", or "You can cancel any time before the start" with no window.

**Tests that matter:**
- `customerCanCancel`: `pending` is always allowed. A `confirmed` booking with a 24-hour window can be cancelled 24h01m before the start, but not 24h before or later. A 0 window allows cancelling until the start. A started booking can't be cancelled.
- Editing a service's window leaves existing bookings' copies alone; Duplicate copies it; a value outside the presets → 400.

**Done when:**
- The editor saves the window, new bookings carry it, and the storefront shows the policy.

**Verify:** Seed `bookable-org` and a `user` customer.
1. As the owner, set Haircut's window to 24 hours; reopening the editor keeps it. Duplicate Haircut: the copy has 24 hours.
2. On the storefront, Haircut's confirm step says "Free cancellation up to 24 hours before the start"; Colouring's says "You can cancel any time before the start".
3. Book Haircut as the customer: `psql service=sinwy_ro -c "select cancellation_window_minutes from booking where organization_id = '<id>' limit 5"` shows 1440. Change Haircut to 2 hours: the booking still shows 1440.

Nothing is simulated.

---

## Phase 10: Customer Mode bookings

**Goal:** A customer sees their bookings across organizations at `/account/bookings`, opens one with its location and timeline, cancels it within the policy, adds it to their calendar, or books again.

**Files:**
- `Sinwy.Backend/modules/bookings/`: account controller and routes (`GET /api/account/bookings?tab&page`, `GET /api/account/bookings/:bookingId`, `POST /api/account/bookings/:bookingId/cancel`, all `requireAuth`).
- `Sinwy.Backend/modules/organizations/`: export the profile's city, country, phone and email for the DTO through `index.ts`.
- `Sinwy.Shared/types/booking/Booking.ts` (`CustomerBookingDto` additions, `CustomerBookingDetailDto`, `CustomerBookingEventDto`); `types/api/ApiResponse.ts` (`BOOKING_CANCELLATION_WINDOW_PASSED: 40922`).
- Web: `modules/account-dashboard/routes/_shell.bookings.index.tsx` and `_shell.bookings.$id.tsx` (replace the placeholders), a new `account-dashboard/lib/booking-queries.ts`, a new `account-dashboard/lib/ics.ts` and new `account-dashboard/components/bookings/`.

**Steps:**
- Filter strictly on `customerUserId = session user`; a missing or another user's booking is 404.
- The DTO has:
  - the org's name, slug, timezone, city, country, phone and email (from `organization_profile`);
  - the service name, times, price and status;
  - `customerNote`, `cancelledBy`, `cancellationReason` and `cancellationWindowMinutes`.

  It never includes `internalNote` or the booking's contact fields.
- **Timeline** (detail only): the `created`, `status_changed` and `rescheduled` events. The actor shows as "You", the org name, or nothing for `system`. Never send member names, `contact_updated` events, or payload fields other than the old and new times.
- **Cancel** goes through `changeBookingStatus` with the actor `customer`, checks `customerCanCancel` and dispatches "Cancellation confirmed" plus "Booking cancelled by customer".
  - Inside the window → 409 `BOOKING_CANCELLATION_WINDOW_PASSED`.
  - It works even when the org is inactive (the customer isn't a member, so there's no membership check). It's refused when the org is scheduled for deletion (Phase 12 has already cancelled the booking anyway).
- **Web:** Upcoming and Past tabs as a search param, rows formatted in each booking's org zone with the zone label.
  - Detail: the "Waiting for {org} to confirm" copy, the city and country, the timeline, and "Book again" linking to `/<slug>/book?service=<id>`.
  - Policy notice:
    - Before the deadline: "You can cancel until {deadline in the org zone}", and Cancel opens a confirm dialog.
    - Inside the window: no Cancel button, and "Cancellations within {window} of the start aren't possible online. Contact {org} at {phone} or {email}." Show whichever contacts exist, or just "Contact {org}."
  - **Add to calendar** on upcoming `pending`/`confirmed` bookings. `bookingToIcs(booking, detailUrl)` in `ics.ts` builds the file in the browser and downloads it as an `.ics`; there's no backend route.
    - Fields: UTC `DTSTART`/`DTEND`, `UID:<id>@sinwy`, `SUMMARY:{service} at {org}`, `LOCATION:{city}, {country}`, `URL` to the detail page, and `STATUS` `TENTATIVE` (pending) or `CONFIRMED`.
    - Format: CRLF line endings, with RFC 5545 escaping and 75-octet line folding.
  - Empty Upcoming tab: "No upcoming bookings", explaining that bookings are made on a business's booking page, with no link (see the decision).

**Tests that matter:**
- User B can't read or cancel user A's booking (404). A manual booking with user A's email never appears for A.
- A customer cancels a confirmed booking after its start → 409. A cancelled booking can't be cancelled again.
- Inside the window a confirmed booking's cancel → 409 and nothing changes; a `pending` request inside the window can still be withdrawn.
- `internalNote` is absent from both read endpoints' JSON, and the timeline has no member names or contact events.
- A booking at an inactive org can still be read and cancelled by its customer.
- `ics.ts`: escaping of `,`, `;`, `\` and newlines, folding of long lines, and UTC times for a booking on a DST-change day.

**Done when:**
- A customer sees, opens and cancels their bookings in the browser within the policy, downloads a valid `.ics`, and the org receives the email.

**Verify:** Seed `bookable-org` and a `user` customer. Give the org a city and country in its settings if the seed has none. The owner sets Haircut's window to 48 hours. The customer books Haircut tomorrow and Haircut in 5 days on the storefront, and the owner adds an internal note to the 5-day one.
1. As the customer, `/account/bookings` → Upcoming lists both in the org zone. Open the 5-day one: the city and country, a "Booked" timeline entry, and "You can cancel until …". There's no internal note on the page, and the API response has no `internalNote`.
2. Add to calendar: the downloaded file's `DTSTART` is the booking's start in UTC (10:00 Vilnius → 07:00 or 08:00 UTC).
3. Cancel it → the status is cancelled, it moves to Past, the timeline shows "Cancelled by you", and the outbox has "Cancellation confirmed" (customer) and "Booking cancelled by customer" (owner).
4. Open tomorrow's: no Cancel button, and the contact message shows. `POST /api/account/bookings/<id>/cancel` as the customer → 409 `BOOKING_CANCELLATION_WINDOW_PASSED`.
5. "Book again" opens `/<slug>/book?service=<id>` with Haircut selected.
6. A second `user` with no bookings sees the empty state.

Nothing is simulated.

---

## Phase 11: Account overview

**Goal:** `/account/` shows the customer's next booking and quick "Book again" links.

**Files:**
- `Sinwy.Backend/modules/bookings/`: `GET /api/account/bookings/summary` (`requireAuth`), registered so it isn't matched as a `:bookingId`.
- `Sinwy.Shared/types/booking/Booking.ts`: `CustomerBookingSummaryDto`.
- Web: `account-dashboard/routes/_shell.index.tsx` (replace the placeholder), `account-dashboard/lib/booking-queries.ts`, new card components in `account-dashboard/components/bookings/`.

**Steps:**
- `next`: the session user's soonest upcoming `pending`/`confirmed` booking as a `CustomerBookingDto`, or null.
- `rebook`: up to 3 distinct services from the user's bookings, newest booking first, any status.
  - Only services that are active and not archived, at orgs that pass `findPublicOrganization`.
  - Each item has the org name and slug, plus the service id, name, duration and current price (not the booking's).
- Web: a "Next booking" card with the time in the org zone and its label, the org, the service and the status. It links to the detail page and offers Add to calendar from Phase 10.
  - A "Book again" list links to `/<slug>/book?service=<id>`.
  - With neither, keep the existing empty state.
- Cancelling on the detail page invalidates the summary key.

**Tests that matter:**
- `next` leaves out cancelled, past and other users' bookings, and manual bookings with the user's email.
- `rebook` leaves out archived or inactive services and non-public orgs, lists a service booked twice once, and stops at 3.

**Done when:**
- The overview shows the right next booking and rebook links, and updates after a cancel.

**Verify:** Seed `bookable-org` and a `user` customer.
1. Before booking, `/account/` shows the empty state.
2. Book Colouring in 3 days and Haircut tomorrow: "Next booking" is Haircut tomorrow in the org zone, and "Book again" lists Haircut and Colouring with their prices.
3. Cancel the Haircut on its detail page and go back: "Next booking" is Colouring, and Haircut is still under "Book again".
4. The owner archives Colouring: "Book again" lists only Haircut.

Nothing is simulated.

---

## Phase 12: Bookings when an org, account or service goes away

**Goal:** Org deletion and customer account deletion handle upcoming bookings per the lifecycle decision, the deletion and archive dialogs show the counts, and the rules map describes bookings.

**Files:**
- `Sinwy.Backend/modules/bookings/`: export `cancelUpcomingOrganizationBookings(organizationIds, tx?)` and `handleCustomerAccountDeleted(userId, tx?)`, plus count helpers.
- `Sinwy.Backend/modules/auth/auth.ts`: `deleteUser.beforeDelete` (after `scheduleOwnedOrganizationsForDeletion`, call `handleCustomerAccountDeleted`) and a new `organizationHooks.beforeDeleteOrganization`.
- `Sinwy.Backend/modules/organizations/service.ts` (`scheduleOwnedOrganizationsForDeletion`, `getAccountDeletionPreview`): cancel the scheduled orgs' upcoming bookings and add an upcoming-bookings count per org to the preview DTO in `@sinwy/shared`.
- Web: the account deletion dialog (find it with `grep -rn "deletion-preview" Sinwy.WebFrontend/src`) and the archive dialog in `org-dashboard/components/ServiceActions.tsx`. The archive count comes from a new `upcomingCount` in the service detail DTO or a bookings endpoint.
- `docs/org-rules-map.md` §1, §9, §11 and §14; `docs/user-flow-map.md` for the storefront, Customer Mode bookings and the account overview.

**Steps:**
- **Org deletion cancels upcoming bookings:** `pending`/`confirmed` with `startsAt >= now`, `cancelledBy: "organization"`, the reason "The business closed its Sinwy account", the actor `system`. Customer emails dispatch after commit.
  - Immediate deletion runs this from `beforeDeleteOrganization`, so the emails go before the cascade deletes the rows: load what the emails need first.
  - Scheduled deletion runs it inside the scheduling flow.
- **Customer account deletion:** `handleCustomerAccountDeleted` cancels the user's upcoming bookings as the customer and dispatches the org emails. The FK nulls `customerUserId` when the user row goes.
  - Keep every retention choice inside this function; a comment says it's the one place to change for regional rules.
  - This also runs for owners, after their orgs were scheduled, so their own bookings elsewhere are cancelled too.
- Both flows ignore the cancellation window: `customerCanCancel` is only for cancels the customer starts.
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
- Customer deletion: their upcoming bookings are cancelled by the customer, including ones inside their cancellation window, the org is emailed, and the snapshot is still there with `customer_user_id` null.
- The deletion preview count matches upcoming active bookings only.

**Done when:**
- The three lifecycle flows behave as decided, the dialogs show counts, and the rules map is updated.

**Verify:** Seed `bookable-org` and two `user` customers. Customer A books a Haircut tomorrow; customer B books a Colouring the day after.
1. Customer A deletes their account (`/account/settings`, confirm via the outbox link): A's booking is `cancelled` with `cancelled_by = 'customer'` and `customer_user_id` null, the name and email are still there, and the owner gets "Booking cancelled by customer".
2. Archive Haircut: the dialog warns about upcoming bookings (0 now); archive Colouring → "1 upcoming booking stays booked".
3. The owner starts account deletion: the dialog lists the org with "1 upcoming booking will be cancelled". Confirm via the outbox link: B's booking is cancelled by the organization, and B gets "Booking cancelled" with the closing reason.

Polar revocation uses the seeded subscription as in the `e2e-test` skill; emails go to the local outbox.

---

## Phase 13: Code review

**Goal:** The bookings work is reviewed for races, authorization leaks, timezone bugs and lifecycle gaps, and the findings are fixed.

**Files:** Everything changed in Phases 1–12 (`git diff master...HEAD --stat`).

**Steps:**
- **Races:** every path that creates or moves a booking takes the org advisory lock before reading overlaps. Status changes lock the row.
- **Authorization:** each route's middleware matches its permission; customer endpoints filter on the session user; public endpoints never return `internalNote`, other customers' data or inactive orgs; another org's ids are 404.
- **Time:** every conversion between a local date and an instant goes through the org zone, nothing uses the browser zone for booking times, and the DST tests exist for the calendar and overview.
- **Lifecycle:** emails dispatch only after commit; org deletion emails go out before the cascade; no booking is left `pending`/`confirmed` at a scheduled org.
- **Cancellation window:** the server and the web both use `customerCanCancel`; only customer-started cancels check it.
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
6. Customer cancel from Customer Mode, outside and then inside a cancellation window.
7. Owner account deletion.

Check the DB rows and the outbox at each step, as in Phases 5–12. Emails go to the local outbox; Polar uses the seeded subscription.
