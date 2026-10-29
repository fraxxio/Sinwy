# Services MVP plan

Gives an organization something to book: services with a duration and price, weekly business hours, whole-day closures, and a tested function that turns them into bookable times. It's the first working version that proves the concept; per-service hours, staff, capacity above 1 and payments come in later plans. The bookings ticket builds on the bookable-times function and endpoint added here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [services-mvp-log.md](services-mvp-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Organization timezone and currency | – | done | `feat(backend, web): organization timezone and currency` |
| 2 | Services module: schema and CRUD | 1 | done | `feat(backend): services schema and CRUD` |
| 3 | Business hours and closures: schema and endpoints | 2 | todo | |
| 4 | Bookable times function and endpoint | 3 | todo | |
| 5 | Services list, editor and duplicate (web) | 2 | todo | |
| 6 | Business hours and closures page (web) | 3, 5 | todo | |
| 7 | Code review | 1–6 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Timezone is detected, then edited on the hours page.** Creating an organization stores the browser's IANA timezone; the owner changes it at the top of the business hours page.
- **One currency per organization, copied onto each service.** The organization's currency comes from its country; every service stores `priceMinor` + `currency` together, copied when it's created, so multi-currency later needs no migration. The editor shows the currency but can't change it.
- **Bookable times start every 15 minutes**, on the clock's quarter hours, wherever the service fits.
- **MVP extras: only "Duplicate service".** No industry templates and no slot preview panel in this plan.
- **Scope is the MVP only.** Per-service hours, multiple ranges per day, extra openings, partial-day closures, capacity above 1, staff, minimum notice and booking horizon are later plans.

### Defaults (not yet confirmed; change only if asked)

1. **Prices are integers in the currency's smallest unit** (`priceMinor`, cents). Never floats, never decimals in the database.
2. **Services are archived, not deleted.** "Delete" sets `archivedAt`; archived services leave every list and can't be booked, but rows stay for future bookings to reference. `isActive` is the separate "bookable right now" switch.
3. **Service hours replace org hours.** The availability table already takes an optional `serviceId`; when per-service rows arrive, a service that has any rows uses only those, never a merge. The MVP UI writes org rows only (`serviceId` null), but the bookable-times input selection implements the rule now.
4. **Hours are local wall-clock times plus the org's timezone.** Rules store `weekday` (ISO, 1 = Monday … 7 = Sunday) and `startTime`/`endTime` as Postgres `time`; instants are only computed in the bookable-times function.
5. **The bookable-times function is pure and takes busy intervals as generic input** (`{ start, end }` instants). Bookings, staff calendars and Google Calendar all feed in later through the same parameter; the MVP passes an empty list.
6. **Buffers pad the appointment, not the opening hours.** The appointment itself must fit inside an opening range; its window padded by `bufferBefore`/`bufferAfter` must not overlap a busy interval (which callers pass already padded by its own service's buffers).
7. **Capacity is stored but not editable.** Column defaults to 1, absent from the API body and the editor.
8. **Slugs are generated once and unique among an org's non-archived services.** Renaming keeps the slug (future public URLs); a duplicate gets a fresh one from "<name> copy".
9. **Writes need an active organization**; reads only need membership. Inactive orgs get the existing 409 `ORGANIZATION_INACTIVE`, as the profile does. Drafts can't open the dashboard, so they need no exception.
10. **Currency follows the country on every profile save** (a country → ISO 4217 map in `@sinwy/shared`, falling back to EUR); existing services keep the currency they were created with.
11. **Existing orgs are backfilled with `UTC` and `EUR`**; the owner corrects the timezone on the hours page.
12. **Time zone maths uses `date-fns` + `@date-fns/tz`** in the backend; Bun 1.3.13 has no `Temporal`.
13. **Native `<input type="date">` and `<input type="time" step="900">`** in the web forms; no date-picker component for the MVP.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **"Slot" is taken.** In this codebase a slot is one unit of an owner's plan cap (`modules/organizations/slots.ts`, [org-rules-map.md](org-rules-map.md)). Call the generated booking start times **bookable times** in code, routes and UI copy (`bookableTimes.ts`, `/times`), never "slots".
- **Permissions already exist.** `services:read` / `services:write` are in `Sinwy.Shared/types/access/Permission.ts` and `RolePermissions.ts`: owner and admin write, staff read. Use `requirePermission` from `@authModule`; don't add permissions.
- **Membership gives the status.** `membershipFrom(ctx)` returns `{ organizationId, roles, status, plan }` (`Sinwy.Backend/modules/auth/requirePermission.ts`); `status === "active"` is the write check. `resolveMembership` already returns null for orgs scheduled for deletion.
- **Services module (Phase 2):** `@servicesModule` is wired (`import_map.json`, `tsconfig.json`, `Sinwy.Backend/index.ts`). Add new routes to `registerServiceRoutes` in `modules/services/routes.ts` with its `read`/`write` middleware arrays; controllers use the local `respondError` and `parseBody` (400 with the first Zod message); service functions take the `Membership`, return `Result<T>` and check `membership.status !== "active"` → `inactive` before any write.
- **IDs are `crypto.randomUUID()` in `text` columns**; FKs to `organization.id` use `onDelete: "cascade"`, so org purge (`modules/organizations/purge.ts`) removes services and hours without code changes.
- **Migrations:** edit `Sinwy.Backend/db/schema/`, export from `db/schema/index.ts`, then `bun run db:generate --name <name>` and `bun run db:migrate`. Latest is `drizzle/0018_services.sql`. Check constraints use `check(...)`; see `organizationTransfer` in `organizationSchema.ts`.
- **Backend tests** use `bun:test` with a real DB and helpers in `Sinwy.Backend/test/helpers.ts`: `createUserWithSession`, `insertOrganization`, `givePlan`, `holdSlot`, `activateOrganization`, `joinOrganization`, `fakeCtx`. HTTP-level tests start an app on port 0; copy the `seedOrg`/`call` harness in `modules/services/tests/services.test.ts`. Make an org inactive by setting `slotHeldAt: null`.
- **Drizzle queries are thenables, not Promises:** `expect(query).rejects` fails; use `query.then(() => null, (e) => e)` and read `error.cause.message` for the Postgres text (see the check-constraint tests).
- **`exactOptionalPropertyTypes` is on:** a `.partial()` Zod output has `| undefined` values, so repository update types spell that out (`ServiceUpdate` in `modules/services/repository.ts`).
- **Org locale (Phase 1):** `getOrganizationLocale(organizationId) → { timezone, currency } | null` and `setOrganizationTimezone(organizationId, timezone, executor?)` come from `@organizationsModule`; pass a transaction as `executor` to join it (`Tx` pattern in `modules/organizations/access.ts`). Validate zones with `isTimeZone` from `@sinwy/shared` (also `DEFAULT_TIME_ZONE`, `currencyForCountry`, `DEFAULT_CURRENCY`).
- **Time zone names:** Bun lists 445 zones in `Intl.supportedValuesOf("timeZone")` but lacks newer names like `Europe/Kyiv` (it has `Europe/Kiev`); `isTimeZone` also accepts any `Area/City` name Intl can format, so a stored zone may be missing from that list. The Phase 6 combobox must still show the stored value. Log: Phase 1.
- **Playwright's browser zone is the host's** (`Europe/Vilnius`), not `UTC`, unless the context sets `timezoneId`.
- **Web:** dashboard routes live in `Sinwy.WebFrontend/src/modules/org-dashboard/routes/` (`_shell.services.tsx` layout already guards `services:read`; `_shell.services.index.tsx` is an `EmptyState` stub; `_shell.services.$id.tsx` exists). Data fetching follows `lib/transfer-queries.ts` (`queryOptions` + `api<T>()` from `#/shared/lib/api`). Route context gives `organization` and `member`; check writes with `hasPermission(member.roles, "services:write")`. Shared UI: `PageHeader`, `EmptyState`, `ContentBox`, `SettingsSection`, `TextField`, `TextareaField`, `SelectField`, `ComboboxField`, `SubmitButton`; shadcn kit in `src/shared/components/ui/` has no `switch` or `table` yet (add with the shadcn MCP or CLI, `components.json` exists).
- **E2E seeds:** `bun run dev:seed-scenario subscribed-org` gives an active org with an owner; `org-with-staff` adds a staff member. Details in `.agents/skills/e2e-test/references/seed-scenario.md`.

---

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

---

## Phase 4: Bookable times function and endpoint

**Goal:** A pure, thoroughly tested function turns hours, closures, busy intervals, duration and buffers into bookable start times, exposed for a service and a date range.

**Files:**
- New `Sinwy.Backend/modules/services/bookableTimes.ts` and `tests/bookableTimes.test.ts`.
- `Sinwy.Backend/modules/services/` (`service.ts`, `controller.ts`, `routes.ts`, `index.ts`).
- `Sinwy.Backend/package.json` (add `date-fns`, `@date-fns/tz` with `bun add`).

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

---

## Phase 5: Services list, editor and duplicate (web)

**Goal:** In the dashboard an owner creates, edits, toggles, duplicates and archives services; staff see them read-only; a new org sees an empty state that leads to its first service.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.services.index.tsx` (replace stub), `_shell.services.$id.tsx` (editor), new `_shell.services.new.tsx`.
- New `Sinwy.WebFrontend/src/modules/org-dashboard/lib/service-queries.ts`, components under `org-dashboard/components/` (e.g. `ServiceForm.tsx`, `ServicesTable.tsx`).
- `src/shared/components/ui/` (add shadcn `switch`, `table`), `src/shared/components/EmptyState.tsx`.

**Steps:**
- List: table with name, duration ("45 min"), price formatted with `Intl.NumberFormat` from `priceMinor` and `currency`, and an active switch that PATCHes optimistically. Row actions: Edit, Duplicate, Archive (confirm with `alert-dialog`). Write controls only render with `services:write`.
- Empty state: "Create your first service" button to `/services/new` (writers only; staff see text without a button).
- Editor: one form with sections "Details" (name, description), "Pricing & duration" (price as a decimal input converted to minor units on submit, read-only currency, duration select in 5-min steps), "Advanced" in a `collapsible` (buffers before/after). Validate with the shared Zod schema. Shared by new and edit.
- After create or duplicate, go to the editor of the new service; after archive, back to the list. Invalidate the list query after every write.
- A 409 inactive response shows the existing inactive messaging, not a generic error.

**Tests that matter:**
- Price conversion: "25", "25.5", "25.50" → 2500, 2550, 2550; more than two decimals rejected; JPY-style zero-decimal currencies don't multiply by 100 (use `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`).
- Staff see no write controls.

**Done when:**
- The full create → edit → toggle → duplicate → archive flow works in the browser for an owner, read-only for staff.

**Verify:** Seed `org-with-staff`. Log in as the owner, open Services: the empty state shows a create button. Create "Haircut" 30 min, €25, buffer after 10: list shows "30 min" and "€25.00"; `service` row has `price_minor = 2500`. Toggle it off (`is_active = false`), duplicate it (new inactive row named "Haircut (copy)"), archive the original (row gets `archived_at`, disappears from the list). Log in as staff: list visible, no create, switch, or row actions. Nothing simulated.

---

## Phase 6: Business hours and closures page (web)

**Goal:** An owner sets the timezone, weekly hours and closure dates from the dashboard; staff see them read-only.

**Files:**
- New `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.services.hours.tsx` (static segment, wins over `$id`).
- `org-dashboard/lib/service-queries.ts` (availability queries and mutations from Phase 5's file), new `org-dashboard/components/BusinessHoursForm.tsx`, `ClosuresList.tsx`.
- `_shell.services.index.tsx` (link to "Business hours" in the page header).

**Steps:**
- Timezone: `ComboboxField` over `Intl.supportedValuesOf("timeZone")`, at the top of the form.
- Seven rows Monday–Sunday: open/closed switch plus start and end `<input type="time" step="900">`; "Copy Monday to weekdays" button. One range per day. Save sends the whole set with PUT.
- Client validation mirrors the shared schema (end after start, quarter hours); server errors show inline.
- Closures: date input + optional note + Add; upcoming closures listed with Remove.
- New orgs with no rows show all days closed and a hint that customers can't book until hours are set.

**Tests that matter:**
- Form ↔ DTO mapping: closed days send no rule; open days send `HH:MM` exactly; loading the DTO back produces the same form state.

**Done when:**
- Hours and closures saved in the browser are what the bookable-times endpoint uses.

**Verify:** Seed `subscribed-org`, log in as the owner, open Services → Business hours. Set timezone `Europe/Vilnius`, Monday open 09:00–17:00, Copy to weekdays, save: 5 `service_availability` rows, `organization.timezone` updated, page reload shows the same values. Add a closure for next Friday with note "Holiday", then remove it: the `availability_exception` row appears and is deleted. As staff (seed `org-with-staff`), the page is visible with disabled inputs and no save. Nothing simulated.

---

## Phase 7: Code review

**Goal:** The plan's changes are reviewed for correctness in the risky areas before bookings build on them.

**Files:** Every file changed by Phases 1–6 (`git log` for this plan's commits).

**Steps:**
- Review with focus on: org scoping of every services query (no cross-org reads or writes), permission middleware on every route, the inactive-org write guard, money as integers end to end (DB, DTO, form conversion), timezone and DST handling in `bookableTimes`, the "service rows replace org rows" selection, and archived/inactive services never producing bookable times.
- Update [org-rules-map.md](org-rules-map.md) where the plan touched org rules: an org's timezone and currency and where they come from, and that services and hours are writable only while the org is active.
- Fix or file what the review finds; record the outcome in the log.

**Tests that matter:**
- Any gap the review finds in the risky behaviour above gets a test.

**Done when:**
- Review findings are fixed or ticketed and `bun run verify` passes.

**Verify:** None.
