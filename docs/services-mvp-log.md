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
