# Services MVP log

Finished phases of [services-mvp-plan.md](services-mvp-plan.md).

## Phase 1: Organization timezone and currency

**Goal:** Every organization has a valid IANA timezone and an ISO 4217 currency, new ones get them automatically, and both are readable by other modules.

**Files:**
- `Sinwy.Backend/db/schema/organizationSchema.ts` (`organization` table), new migration in `Sinwy.Backend/drizzle/`.
- `Sinwy.Shared/types/organization/Country.ts` (`COUNTRY_CODES`) and a new `Currency.ts` in the same folder, exported from its `index.ts`.
- `Sinwy.Backend/modules/organizations/`: `utils.ts` (`createOrganizationBody`), `controller.ts` (`createOrganizationHandler`), `service.ts` (`createOrganization`, `saveOrganizationProfile`), `repository.ts` (insert, `upsertProfile`), `index.ts`.
- `Sinwy.WebFrontend/src/modules/organizations/routes/new.tsx` (POST `/organizations`, line ~99).

**Steps:**
- Add `timezone text not null default 'UTC'` and `currency text not null default 'EUR'` to `organization`; the defaults backfill existing rows.
- Shared: `CURRENCY_BY_COUNTRY` (country code → ISO 4217, covering every `COUNTRY_CODES` entry) and `currencyForCountry(code)` falling back to `EUR`; an `isTimeZone(value)` helper backed by `Intl.supportedValuesOf("timeZone")`.
- `createOrganizationBody` takes an optional `timezone` (validated with `isTimeZone`, else `UTC`); `new.tsx` sends the browser's zone.
- `saveOrganizationProfile` also sets `organization.currency = currencyForCountry(country)`, in the same write path.
- Export from the organizations `index.ts`: `getOrganizationLocale(organizationId) → { timezone, currency }` and `setOrganizationTimezone(organizationId, timezone)`. Don't add them to `OrganizationDto` unless a page needs them; the services endpoints return them.

**Tests that matter:**
- Creating an org with a valid zone stores it; an invalid or missing zone stores `UTC`, not a 400.
- Saving the profile with `country: "GB"` sets `GBP`; an unmapped code falls back to `EUR`.

**Done when:**
- Migration applied, existing orgs read `UTC`/`EUR`, and a new org created in the browser has the browser's zone.

**Verify:** Seed `user`, log in, create an organization through `/organizations/new` and finish the business profile with country United Kingdom. Expect `organization.timezone` to be the browser's zone (Playwright's default, often `UTC` unless the context sets one) and `organization.currency = 'GBP'` (`psql service=sinwy_ro`). Nothing simulated.

### Log (2026-10-29, `feat(backend, web): organization timezone and currency`)
- Shipped: `organization.timezone` (default `UTC`) and `organization.currency` (default `EUR`), migration 0017 backfilling existing orgs. `CURRENCY_BY_COUNTRY`/`currencyForCountry` in `Sinwy.Shared/types/organization/Currency.ts` and `isTimeZone` in `TimeZone.ts`. Org creation takes an optional `timezone` (bad or missing → `UTC`); `new.tsx` sends the browser's zone. Profile save sets the currency in the same transaction as the profile upsert. `getOrganizationLocale` and `setOrganizationTimezone` (optional transaction executor) are exported from the organizations module.
- Differs from plan: `isTimeZone` accepts `Area/City` names Intl can format even when `Intl.supportedValuesOf` doesn't list them, because Bun 1.3.13 lists `Europe/Kiev` but not `Europe/Kyiv`, which browsers may report; offsets like `+02:00` are rejected. Bulgaria maps to `EUR` (euro since 2026-01-01). The "unmapped code" test is a unit test of `currencyForCountry`, since the profile body only accepts known country codes.
- Checked in the running app: seeded `user`, created an org at `/organizations/new` and saved the profile with United Kingdom. The org stored `timezone = 'Europe/Vilnius'` (the Playwright browser's zone, the host's) and `currency = 'GBP'`; no backend warnings. Console showed "ResizeObserver loop completed with undelivered notifications" ×10 on the onboarding form (harmless, not caused by this phase). Not checked in the browser: a `UTC` or invalid browser zone (covered by backend tests) and countries other than GB.

## Phase 2: Services module: schema and CRUD

**Goal:** Owners and admins can create, list, edit, toggle, duplicate and archive services through the API; staff can only read.

**Files:**
- New `Sinwy.Backend/db/schema/serviceSchema.ts` (export from `db/schema/index.ts`), new migration.
- New module `Sinwy.Backend/modules/services/`: `index.ts`, `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `utils.ts` (Zod bodies), `tests/`.
- New `Sinwy.Backend/lib/slug.ts`, moving `slugify`/`uniqueSlug` out of `modules/organizations/utils.ts` (update its imports).
- `Sinwy.Backend/import_map.json`, `Sinwy.Backend/tsconfig.json`, `Sinwy.Backend/index.ts`.
- New `Sinwy.Shared/types/service/` (`ServiceDto`, shared Zod schema for the editor fields), exported from `Sinwy.Shared/types/index.ts`.
- `getOrganizationLocale` from `@organizationsModule` (currency for create); `membershipFrom`/`requirePermission` from `@authModule`.
- Tests: `Sinwy.Backend/test/helpers.ts`; `modules/organizations/tests/slug.test.ts` follows the slug helpers to `lib/`.

**Steps:**
- `service` table: `id`, `organizationId` (FK cascade), `name`, `slug`, `description` (nullable), `durationMinutes`, `priceMinor`, `currency` (char 3), `capacity` (default 1), `bufferBeforeMinutes`, `bufferAfterMinutes` (default 0), `isActive` (default true), `archivedAt` (nullable), `createdAt`, `updatedAt`. Partial unique index on `(organizationId, slug) where archived_at is null`; index on `organizationId`. Check constraints: duration 5–720, price ≥ 0, buffers 0–240, capacity ≥ 1.
- Shared schema validates the same ranges plus multiples of 5 for duration and buffers; backend body extends it (trim, canonicalize), like `organizationProfileBody` does.
- Endpoints under `organizationPath("services")`: `GET` list (non-archived, by name), `POST` create, `GET :serviceId`, `PATCH :serviceId` (partial, includes `isActive`), `POST :serviceId/duplicate`, `DELETE :serviceId` (sets `archivedAt`). Reads `services:read`, writes `services:write`.
- Create copies `currency` from `getOrganizationLocale`; the body has no currency or capacity field.
- Every query scopes by `membership.organizationId`; a service of another org, or archived, is 404.
- Writes on an inactive org return the 409 `ORGANIZATION_INACTIVE` error.
- Duplicate copies every field except id, slug, timestamps; name becomes "<name> (copy)", `isActive` false so it isn't bookable by surprise.
- Map rows to `ServiceDto`; never return the Drizzle row.

**Tests that matter:**
- Staff gets 403 on every write and 200 on reads; a member of org A gets 404 for org B's service ids.
- Inactive org: writes 409, reads 200.
- Archive frees the slug: creating a service with the same name afterwards succeeds and gets the base slug.
- Duplicate keeps price, currency, duration and buffers, comes back inactive, with a distinct slug.
- Price and duration out of range are rejected at 400 and by the DB constraint.

**Done when:**
- All endpoints respond as above and `ServiceDto` is importable from `@sinwy/shared`.

**Verify:** Seed `org-with-staff`. As the owner, via the API: create "Haircut" (30 min, 2500), list it, patch `isActive: false`, duplicate it, archive the original. Check `service` rows: two rows, one with `archived_at` set, the copy inactive with currency equal to the org's. As the staff member, `POST` returns 403 and `GET` returns the list. Nothing simulated.

### Log (2026-10-29, `feat(backend): services schema and CRUD`)
- Shipped: `service` table (migration 0018) with the planned checks, `(organization_id, slug)` unique only while not archived. Module `modules/services/` with list, create, get, PATCH (partial, incl. `isActive`), duplicate and archive under `organizationPath("services")`. `ServiceDto`, `SERVICE_LIMITS` and `serviceSchema` in `Sinwy.Shared/types/service/`. `slugify`/`uniqueSlug` moved to `Sinwy.Backend/lib/slug.ts` with a `fallback` argument (`"service"` for services); the organization-only `reservedSlugs` stay in `modules/organizations/utils.ts` and organizations pass them into `isTaken`. 24 tests (HTTP and DB constraint) in `modules/services/tests/services.test.ts`.
- Differs from plan: `ServiceDto` leaves out `capacity` (not editable, Default 7). Price has an upper bound (`priceMinorMax` 99,999,999) so a huge number is a 400, not an integer-overflow 500. Duplicate names are cut so "<name> (copy)" stays within the 100-character limit; the copy's slug comes from that name (`haircut-copy`). Unknown body keys (`currency`, `capacity`) are dropped, not rejected. The reserved-slug test moved from the slug unit test to an org-creation HTTP test.
- Checked in the running app: seeded `org-with-staff`; as the owner via curl, create (201, `haircut`, EUR), list, PATCH `isActive: false`, duplicate (201, "Haircut (copy)", inactive) and archive (200, then 404 on GET) all behaved as planned. The DB had two rows, the original with `archived_at` and the copy inactive in the org's currency. As staff, `POST` was 403 with no row written and `GET` was 200. The subagent also switched the org to US (currency USD) and confirmed a new service took USD, then restored it. No backend warnings. Not checked in the running app: the admin role, PATCH validation, collisions and cross-org access (all covered by backend tests).

## Phase 3: Business hours and closures: schema and endpoints

**Goal:** An organization's weekly hours, timezone and whole-day closures can be read and saved through the API.

**Files:**
- `Sinwy.Backend/db/schema/serviceSchema.ts` (add both tables next to `service`; already exported from `db/schema/index.ts`), new migration `0019`.
- `Sinwy.Backend/modules/services/`: `routes.ts` (`organizationPath("availability")`, `read`/`write` arrays), `controller.ts` (`respondError`, `parseBody`), `service.ts` (`Result<T>`, inactive check), `repository.ts`, `utils.ts`, new `tests/availability.test.ts` reusing the harness from `tests/services.test.ts`.
- `Sinwy.Shared/types/service/` (new `Availability.ts` with `AvailabilityDto`/`ClosureDto` and the shared Zod schemas; export from `service/index.ts`).
- `getOrganizationLocale` and `setOrganizationTimezone(organizationId, timezone, executor)` from `@organizationsModule`. Its `Tx` type lives in `modules/organizations/access.ts` and isn't exported from the module's `index.ts`; export it there or derive it locally from `db.transaction`. "Today in the org's zone" needs no library: `Intl.DateTimeFormat("en-CA", { timeZone })` formats `YYYY-MM-DD` (`date-fns` only arrives in Phase 4).

**Steps:**
- `service_availability`: `id`, `organizationId` (FK cascade), `serviceId` (nullable FK cascade), `weekday` smallint 1–7, `startTime`/`endTime` `time`, check `start_time < end_time`, index on `(organizationId, serviceId)`.
- `availability_exception`: `id`, `organizationId`, `serviceId` (nullable), `date` (`date`), `kind` (`closed` | `open`, `oneOf` check), `startTime`/`endTime` (nullable `time`, null = whole day), `note` (nullable), `createdAt`. The MVP writes only `kind = closed` with null times; the columns exist so openings and partial closures need no migration.
- `GET organizationPath("availability")` (`services:read`): `{ timezone, weekly: [{ weekday, start, end }], closures: [{ id, date, note }] }`, closures from today (in the org's zone) onwards.
- `PUT availability` (`services:write`): `{ timezone, weekly }` replaces the org-wide rows (`serviceId` null) in one transaction and sets the timezone through `setOrganizationTimezone`. Validate: times `HH:MM` on 15-minute steps, ranges on the same weekday don't overlap, at most one range per weekday in the MVP body.
- `POST availability/closures` `{ date, note? }` and `DELETE availability/closures/:closureId`. Same date twice is a no-op, not an error.
- Times go over the wire as `"HH:MM"` strings and dates as `"YYYY-MM-DD"`; no `Date` objects for wall-clock values.

**Tests that matter:**
- PUT replaces, never appends: saving twice leaves one set of rows; another org's rows are untouched.
- Invalid timezone, `end <= start`, or off-grid minutes → 400 and nothing written (transaction).
- Staff 403 on writes; inactive org 409.

**Done when:**
- Hours, timezone and closures round-trip through the API.

**Verify:** Seed `subscribed-org`. As the owner via the API: PUT Mon–Fri 09:00–17:00 with `Europe/Vilnius`, POST a closure for next Monday, GET availability. Expect 5 `service_availability` rows with null `service_id`, `organization.timezone = 'Europe/Vilnius'`, one `availability_exception` row with `kind = 'closed'`. PUT Mon only and expect 1 row left. Nothing simulated.

### Log (2026-10-30, `feat(backend): business hours and closures API`)
- Shipped: `service_availability` and `availability_exception` tables (migration 0019) with weekday, range and kind checks, plus a partial unique index on `(organization_id, date)` for org-wide whole-day closures. `GET`/`PUT availability` and `POST`/`DELETE availability/closures[/:closureId]` in `modules/services/`. The PUT deletes and reinserts the org rows and sets the timezone in one transaction, opened in the repository (`saveOrganizationHours`). Shared `availabilitySchema`, `closureSchema` and the DTOs are in `Sinwy.Shared/types/service/Availability.ts`. 7 HTTP and constraint tests are in `modules/services/tests/availability.test.ts`.
- Differs from plan: `Tx` isn't exported; the transaction follows the `transfers/repository.ts` pattern. "One range per weekday" also covers "ranges don't overlap", so there's no separate overlap check. A repeated closure date returns 201 with the existing row and keeps its original note (the new note is ignored). Closure dates in the past are accepted (they just don't show in GET). Times stop at 23:45; there's no `24:00` end.
- Checked in the running app: the e2e subagent seeded `subscribed-org` (org `3d18666a-cf87-4340-baeb-a2507e1b9f0e`) and used curl as the owner. PUT Mon–Fri 09:00–17:00 `Europe/Vilnius` gave 5 rows with null `service_id` and set the timezone. POST 2026-11-02 gave one `closed` row, and posting it again returned the same id. Invalid PUTs (end ≤ start, `09:10`, unknown zone, two Monday ranges) returned 400 and changed nothing. PUT Mon only left 1 row. DELETE removed the closure, and a second DELETE was 404. No backend warnings. Not checked in the running app: staff 403 and inactive 409 (covered by backend tests).

## Phase 4: Bookable times function and endpoint

**Goal:** A pure, thoroughly tested function turns hours, closures, busy intervals, duration and buffers into bookable start times, exposed for a service and a date range.

**Files:**
- New `Sinwy.Backend/modules/services/bookableTimes.ts` and `tests/bookableTimes.test.ts` (pure, no DB harness needed).
- `Sinwy.Backend/modules/services/repository.ts`: add a query for a service's own `service_availability` rows and closures in a date range (the existing `findOrganizationHours`/`findClosuresFrom` read org-wide rows only; reuse `orgWide`/`orgClosures`).
- `Sinwy.Backend/modules/services/service.ts` (`listBookableTimes`, reusing `toClock`, `getOrganizationLocale` and `findService`, which already hides archived services), `controller.ts` (`respondError`; query-string parsing, not `parseBody`), `routes.ts` (`read` array), `index.ts`.
- `Sinwy.Shared/types/service/Availability.ts` (range query schema and a `BookableTimesDto`).
- `Sinwy.Backend/package.json` (add `date-fns`, `@date-fns/tz` with `bun add`).
- Endpoint test: extend `tests/availability.test.ts` or add `tests/times.test.ts` with the same harness.

**Steps:**
- `bookableTimes(input) → Date[]` with no DB or clock access. Input: `timezone`, `weekly` rules, `closures` (local dates), `busy` (`{ start, end }` instants), `durationMinutes`, `bufferBeforeMinutes`, `bufferAfterMinutes`, `from`/`to` (local dates, inclusive), `now`, `minNoticeMinutes`, `stepMinutes`. Export the step as a constant `BOOKABLE_TIME_STEP_MINUTES = 15`.
- Walk each local date in the range; skip closed dates; for each rule on that weekday, try starts on the clock's quarter hours inside the range where `start + duration <= rangeEnd`. Convert wall time to an instant with `@date-fns/tz`; a wall time that doesn't exist (spring-forward gap) is skipped; an ambiguous one (fall-back) uses the first occurrence.
- Reject a start if `start < now + minNotice`, or if `[start − bufferBefore, start + duration + bufferAfter)` overlaps any busy interval (half-open, so back-to-back is allowed).
- Rule selection lives in the service layer, not the function: use the service's own rows if it has any, otherwise the org rows (Default 3).
- `GET organizationPath("services/:serviceId/times")?from=YYYY-MM-DD&to=YYYY-MM-DD` (`services:read`): range at most 31 days, `from <= to`; inactive or archived services return an empty list; busy is `[]` and `minNoticeMinutes` is 0 until bookings exist. Return ISO strings plus the timezone so the client can format.
- Export `bookableTimes` and a service-level `listBookableTimes(organizationId, serviceId, range, busy)` from `index.ts` for the bookings ticket.

**Tests that matter:** table-driven, each with a fixed `now`:
- Open day 09:00–12:00, 60-min service → 09:00 … 11:00 every 15 min (9 times); 11:15 excluded because it ends after 12:00.
- Range starting at 09:10 → first time 09:15.
- Closed weekday and closure date → no times.
- Busy 10:00–11:00 with 15-min buffers on both sides → no start whose padded window touches 09:45–11:15; 08:45 end-to-start adjacency allowed.
- `now` mid-day → nothing earlier than now; `minNoticeMinutes` pushes it further.
- DST in `Europe/Vilnius`: last Sunday of March, hours 02:00–05:00 skip the missing 03:00–03:59 and produce correct UTC instants; last Sunday of October produces each wall time once.
- Range crossing midnight UTC for a far-offset zone (`Pacific/Auckland`) puts times on the right local date.
- Service rows replace org rows; with none, org rows apply.

**Done when:**
- The test table passes and the endpoint returns times for a service under the hours saved in Phase 3.

**Verify:** Seed `subscribed-org`. Via the API as the owner: PUT Mon–Fri 09:00–12:00 `Europe/Vilnius`, create a 60-min service with 15-min buffer after, add a closure for next Wednesday, GET times for next Monday–Friday. Expect 9 times per open day as ISO strings (07:00Z–09:00Z in winter time), none on Wednesday or the weekend; deactivate the service and expect an empty list. Nothing simulated.

### Log (2026-10-30, `feat(backend): bookable times function and endpoint`)
- Shipped: pure `bookableTimes` in `modules/services/bookableTimes.ts` with `BOOKABLE_TIME_STEP_MINUTES = 15`, and `listBookableTimes` in `service.ts`. It reads the service's own rows and the org rows in one query (`findHoursForService`) and uses the service's own when it has any. Closed dates come from `findClosedDates`. The endpoint is `GET services/:serviceId/times?from&to` (`services:read`). Shared `bookableTimesQuerySchema` (from ≤ to, at most `AVAILABILITY_LIMITS.bookableTimesDays` = 31 days) and `BookableTimesDto` are in `Availability.ts`. `date-fns` and `@date-fns/tz` were added to the backend. 13 table-driven cases are in `tests/bookableTimes.test.ts` and 5 HTTP tests in `tests/times.test.ts` (service rows replace org rows, closures, inactive/archived/foreign services, range validation, inactive org reads).
- Differs from plan: wall times are converted with `tzOffset` instead of `TZDate`. `new TZDate(...)` resolves a fall-back wall time to the first occurrence when the host is `Europe/Vilnius` but to the second under `TZ=UTC` (what `bun test` uses), so results would have depended on the server's zone. `tzOffset` gave the same answer under UTC, Vilnius and New York; the unit tests pass under all three. A closing time inside a DST gap closes at its earlier reading (conservative; 03:30 on the spring-forward day counts as 02:30 +02:00). Archived services return 404 rather than an empty list: `findService` hides them and every other route treats them as not found; they still never produce times. The range end is checked as an instant, so an appointment spanning a DST change must really fit before closing. Closures are org-wide only, as the MVP writes no service-level ones.
- Checked in the running app: the e2e subagent seeded `subscribed-org` (org `b32d3e27-d3d8-4a26-bd3d-81fea0315fce`) and used curl as the owner. PUT Mon–Fri 09:00–12:00 `Europe/Vilnius`, a 60-min service with a 15-min buffer after, and a closure on 2026-11-04. GET 2026-11-02 … 11-06 returned 9 times per open day, 07:00Z–09:00Z, none on Wednesday; a range including the weekend gave the same 36. Ranges of 32 days and from > to were 400; exactly 31 days was 200. Past dates gave no times. 2027-03-25 … 03-30 moved from 07:00Z to 06:00Z across the spring change. After deactivation GET returned `times: []`. DB rows matched and the backend logged no warnings. Not checked in the running app: staff reads and inactive-org reads (covered by `times.test.ts`).
