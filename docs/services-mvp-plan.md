# Services MVP plan

Gives an organization something to book: services with a duration and price, weekly business hours, whole-day closures, and a tested function that turns them into bookable times. It's the first working version that proves the concept; per-service hours, staff, capacity above 1 and payments come in later plans. The bookings ticket builds on the bookable-times function and endpoint added here.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [services-mvp-log.md](services-mvp-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Organization timezone and currency | – | done | `feat(backend, web): organization timezone and currency` |
| 2 | Services module: schema and CRUD | 1 | done | `feat(backend): services schema and CRUD` |
| 3 | Business hours and closures: schema and endpoints | 2 | done | `feat(backend): business hours and closures API` |
| 4 | Bookable times function and endpoint | 3 | done | `feat(backend): bookable times function and endpoint` |
| 5 | Services list, editor and duplicate (web) | 2 | done | `feat(backend, web): services list, editor and duplicate` |
| 6 | Business hours and closures page (web) | 3, 5 | done | `feat(web): business hours and closures page` |
| 7 | Code review | 1–6 | done | `test(backend): review the services MVP and map org timezone and currency` |

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

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes. All phases are done; these carry over to the bookings plan.

- **"Slot" is taken.** In this codebase a slot is one unit of an owner's plan cap (`modules/organizations/slots.ts`, [org-rules-map.md](org-rules-map.md)). Call the generated booking start times **bookable times** in code, routes and UI copy (`bookableTimes.ts`, `/times`), never "slots".
- **Permissions already exist.** `services:read` / `services:write` are in `Sinwy.Shared/types/access/Permission.ts` and `RolePermissions.ts`: owner and admin write, staff read. Use `requirePermission` from `@authModule`; don't add permissions.
- **Membership gives the status.** `membershipFrom(ctx)` returns `{ organizationId, roles, status, plan }` (`Sinwy.Backend/modules/auth/requirePermission.ts`); `status === "active"` is the write check. `resolveMembership` already returns null for orgs scheduled for deletion.
- **Services module (Phase 2):** `@servicesModule` is wired (`import_map.json`, `tsconfig.json`, `Sinwy.Backend/index.ts`). Add new routes to `registerServiceRoutes` in `modules/services/routes.ts` with its `read`/`write` middleware arrays; controllers use the local `respondError` and `parseBody` (400 with the first Zod message); service functions take the `Membership`, return `Result<T>` and check `membership.status !== "active"` → `inactive` before any write.
- **IDs are `crypto.randomUUID()` in `text` columns**; FKs to `organization.id` use `onDelete: "cascade"`, so org purge (`modules/organizations/purge.ts`) removes services and hours without code changes.
- **Migrations:** edit `Sinwy.Backend/db/schema/`, export from `db/schema/index.ts`, then `bun run db:generate --name <name>` and `bun run db:migrate` (both from the repo root). Latest is `drizzle/0019_availability.sql`. Check constraints use `check(...)`; see `organizationTransfer` in `organizationSchema.ts`.
- **Backend tests** use `bun:test` with a real DB and helpers in `Sinwy.Backend/test/helpers.ts`: `createUserWithSession`, `insertOrganization`, `givePlan`, `holdSlot`, `activateOrganization`, `joinOrganization`, `fakeCtx`. HTTP-level tests start an app on port 0; copy the `seedOrg`/`call` harness in `modules/services/tests/services.test.ts` (also used by `availability.test.ts`). Make an org inactive by setting `slotHeldAt: null`.
- **Drizzle queries are thenables, not Promises:** `expect(query).rejects` fails; use `query.then(() => null, (e) => e)` and read `error.cause.message` for the Postgres text (see the check-constraint tests).
- **`exactOptionalPropertyTypes` is on:** a `.partial()` Zod output has `| undefined` values, so repository update types spell that out (`ServiceUpdate` in `modules/services/repository.ts`).
- **Availability (Phase 3):** `service_availability` and `availability_exception` live in `db/schema/serviceSchema.ts`. Drizzle `time` columns read back as `"HH:MM:SS"` (the service maps them to `"HH:MM"`) and accept `"HH:MM"` on insert; `date` columns are `"YYYY-MM-DD"` strings. The repository reads only org-wide rows (`serviceId` null) and whole-day closures (`kind = 'closed'`, null times). `todayIn(timezone, now?)` is in `modules/services/utils.ts`. Shared: `availabilitySchema`, `closureSchema`, `AvailabilityDto`, `ClosureDto`, `WeeklyRangeDto`, `AVAILABILITY_LIMITS` in `Sinwy.Shared/types/service/Availability.ts`. Times run 00:00–23:45, so a day can't close at midnight yet. Log: Phase 3.
- **Cross-module transactions** open in the repository and pass `tx` into the other module's exported function (`saveOrganizationHours` → `setOrganizationTimezone`, as `transfers/repository.ts` does); `Tx` stays unexported.
- **Org locale (Phase 1):** `getOrganizationLocale(organizationId) → { timezone, currency } | null` and `setOrganizationTimezone(organizationId, timezone, executor?)` come from `@organizationsModule`; pass a transaction as `executor` to join it (`Tx` pattern in `modules/organizations/access.ts`). Validate zones with `isTimeZone` from `@sinwy/shared` (also `DEFAULT_TIME_ZONE`, `currencyForCountry`, `DEFAULT_CURRENCY`).
- **Time zone names:** Bun lacks newer names like `Europe/Kyiv` (has `Europe/Kiev`); `isTimeZone` also accepts any `Area/City` Intl can format, so the hours page adds the stored zone and `UTC` to the browser list (`timeZoneOptions`). Log: Phase 1.
- **Bookable times (Phase 4):** `bookableTimes` (pure) and `listBookableTimes(organizationId, serviceId, range, busy, now?)` are exported from `@servicesModule`; `GET services/:serviceId/times?from&to` returns `BookableTimesDto` (`{ timezone, times }`, ISO instants). Archived services are 404 like every other route, inactive ones an empty list. Wall times convert with `tzOffset`, never `TZDate`: `TZDate` picks the first or second fall-back occurrence depending on the host's `TZ` (`bun test` runs with UTC). Log: Phase 4.
- **Web:** dashboard routes live in `Sinwy.WebFrontend/src/modules/org-dashboard/routes/`; route context gives `organization` (now with `currency`, a read-only better-auth field) and `member`; check writes with `hasPermission(member.roles, "services:write")`. Shared UI: `PageHeader`, `EmptyState`, `ContentBox`, `SettingsSection`, `TextField`, `TextareaField`, `SelectField`, `ComboboxField`, `SubmitButton`; shadcn `switch`, `table`, `collapsible`, `alert-dialog` exist. Running the shadcn CLI adds a stray `cn` npm package and imports it: revert `package.json`/`bun.lock` and import `cn` from `@/shared/lib/utils`. Log: Phase 5.
- **Services web (Phase 5):** `org-dashboard/lib/service-queries.ts` holds `serviceKeys` (invalidate `serviceKeys.all(orgId)` after writes), the queries, the write functions and `useUnwrapWrite()`, which throws the API message or, for a 409 inactive org, calls `handleOrganizationInactive` and throws an empty message (show nothing). Form pattern: string form values, a Zod schema that transforms into the shared schema (`lib/services.ts`), `onSubmit` returning an error message or null, and `<fieldset disabled>` for read-only staff. Money input: `parseMinorUnits`/`formatAmountInput` in `src/shared/lib/money.ts`.
- **Hours web (Phase 6):** `/services/hours` (`_shell.services.hours.tsx`) reads `availabilityQuery` (`serviceKeys.availability`); form ↔ DTO mapping and the closure form schema are in `org-dashboard/lib/business-hours.ts`. Closed days keep 09:00–17:00 in form state only; the "can't book yet" hint follows saved hours, not unsaved edits. Closures before today (org zone) are refused client-side only; the API accepts them and hides them. Log: Phase 6.
- **Bookings must check the org is active.** `listBookableTimes` doesn't look at org status (the dashboard reads times for an inactive org on purpose, tested); a public booking route must refuse inactive orgs itself, as [org-rules-map.md](org-rules-map.md) §9 requires. Log: Phase 7.
- **Fall-back hour:** on a DST-end day only the first occurrence of a repeated wall time is offered, so the repeated hour's second pass has no bookable times. Fine for the MVP; revisit if bookings show demand. Log: Phases 4 and 7.
