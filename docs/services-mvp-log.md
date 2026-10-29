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
