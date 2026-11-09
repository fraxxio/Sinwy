# Analytics log

Finished phases of the [analytics plan](analytics-plan.md), each with its spec and log entry.

## Phase 1: Event capture

**Goal:** Visits to published pages and the booking page, and the confirm step being reached, are stored as raw events without IPs or user agents.

**Files:**
- `Sinwy.Shared/types/analytics/` (new). Export it from `Sinwy.Shared/types/index.ts`.
- `Sinwy.Backend/db/schema/analyticsSchema.ts` (new). Export it from `db/schema/index.ts`, then run `bun run db:generate`.
- `Sinwy.Backend/lib/app/index.ts` and `lib/app/types.ts`: `ReqContext` and the route closure.
- `Sinwy.Backend/lib/appConfig.ts` and `Sinwy.Backend/.env.example`: `TRUSTED_PROXY_HEADER`.
- `Sinwy.Backend/modules/pages/service.ts`, `index.ts`: a served-page lookup for tracking.
- `Sinwy.Backend/modules/analytics/` (new): `index.ts`, `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `tests/`.
- `Sinwy.Backend/import_map.json`, `tsconfig.json` (the `@analyticsModule` alias) and `Sinwy.Backend/index.ts` (route registration).
- Frontend: `Sinwy.WebFrontend/src/modules/storefront/lib/track.ts` (new), `routes/$pageSlug.tsx`, and `routes/book.tsx` (`BookPage`, and the component that renders `ConfirmStep` around line 286).

**Steps:**
- **Shared types:** `ANALYTICS_EVENT_KINDS = ["view", "booking_started"]`, `DEVICE_TYPES`, and `trackEventSchema`:
  - `kind`
  - optional `pageSlug`, which means the booking page when absent
  - optional `referrer` URL, bounded in length
- **`analytics_event` table:**
  - Columns: `id`, `organizationId` (deleted with the org), `pageId` (nullable, deleted with the page; null means the booking page), `kind`, `localDate` (date), `visitorHash`, `referrerHost` (nullable), `device`, `createdAt`.
  - `oneOf` checks on `kind` and `device`, and an index on `(organizationId, localDate)`.
- **`analytics_salt` table:** `localDate` (date, primary key) and `salt`. Get-or-create it with `INSERT … ON CONFLICT DO NOTHING`, then select, so two instances agree on the salt.
- **Client IP:**
  - Pass `server` into `ReqContext` and add a `clientIp(ctx)` helper.
  - When `TRUSTED_PROXY_HEADER` is set, use the first entry of that header; otherwise use `server.requestIP(req)`.
  - Document the setting in `.env.example`.
- **Pages module:** export `findServedPageId(organizationId, plan, pageSlug)` or similar. It must reuse the same served-page check as `getPublicPage`; don't duplicate the cap logic.
- **Tracking endpoint:** `POST /api/public/organizations/:slug/events`, with no auth.
  1. Resolve the org with `findPublicOrganization`. Resolve `pageSlug` through the pages module; the plan comes from `findPublicOrganizationPlan` or a combined lookup.
  2. Compute `localDate = todayIn(org.timezone)`, then hash the visitor, read the device from the user agent and strip the referrer to its host.
  3. Insert one row.
  4. Always respond 204. Drop silently (Defaults 5–7) for an unknown or inactive org, a page that isn't served, an invalid body or a bot.
- **Frontend `track.ts`:**
  - `trackEvent(slug, event)` uses `fetch` with `keepalive: true`, runs only in the browser and swallows errors.
  - `$pageSlug.tsx` sends a `view` with the page slug once per mount, using `document.referrer`.
  - `book.tsx` sends a booking-page `view` on mount.
  - The confirm step sends `booking_started` on mount.

**Tests that matter:**
- No column holds an IP or user agent.
- The same IP and user agent give the same hash on the same day, and a different hash on another day or for another org.
- Bots, unknown or inactive orgs, unpublished pages and pages beyond the plan cap store nothing, and all return 204.
- `localDate` follows the org's timezone around midnight.
- `TRUSTED_PROXY_HEADER` is honoured when set and ignored when unset.
- Deleting a page deletes its events.

**Done when:**
- Visiting a published page, the booking page and the confirm step each add one row with the right `kind`, `pageId`, `device` and `referrerHost`.
- The migration is generated and applied.

**Verify:**
- **Seed:** start from `pro-org`. As the owner, create and publish one page in the dashboard.
- **Flow:** in a fresh browser context, signed out:
  1. Open `/<orgSlug>/<pageSlug>`.
  2. Open `/<orgSlug>/book`.
  3. Pick a service and a time so the confirm step shows.
- **Expect:** `psql service=sinwy_ro` on `analytics_event` (organization id, kind, page_id, device, referrer_host, local_date; LIMIT 10) shows three rows: page `view`, booking-page `view` (null `page_id`) and `booking_started`.
  - Unpublish the page and reload it: no new row.
  - `curl` the endpoint with a `Googlebot` user agent: 204 and no row.
- **Simulated:** nothing.

### Log (2026-11-08, `feat(backend, shared, web): capture page and booking analytics events`)
- Shipped:
  - `analytics_event` and `analytics_salt` (migration `0025_analytics_events.sql`).
  - `POST /api/public/organizations/:slug/events`, which always answers 204 and drops bots, missing user agents, orgs that aren't public, pages that aren't served and bad bodies.
  - `ctx.server` on `IReqContext`, `clientIp(ctx)` in `lib/clientIp.ts` and `TRUSTED_PROXY_HEADER`.
  - `findServedPageId` in the pages module, which shares an `isServed` helper with `getPublicPage`.
  - `useTrackEvent` in `storefront/lib/track.ts`, used by the page route, the booking page and `Confirm`.
  - 9 tests in `modules/analytics/tests/tracking.test.ts`.
- Differs from plan:
  - `todayIn` comes from `@servicesModule`, not `lib/localDate.ts`.
  - `findPublicOrganizationPlan` now also returns `timezone`, so tracking needs one org lookup.
  - The schema refuses `booking_started` with a `pageSlug`. A malformed `referrer` is dropped on its own, so the view is still kept.
  - When `TRUSTED_PROXY_HEADER` is set but missing from a request, the socket address is used.
  - `useTrackEvent` keeps a ref guard. TanStack Start's default client entry wraps the app in `<StrictMode>`, so in dev, effects on client-mounted components (`/book` is `ssr: false`, and so is `Confirm`) ran twice and stored duplicate rows. The e2e run found this.
- Checked in the running app (pro-org `seed-68a85e45`, page `analytics-test`, a non-headless user agent):
  - A page view, a booking-page view (null `page_id`) and `booking_started` were stored with device `desktop`.
  - Unpublishing the page stopped its views being stored. Googlebot, an empty user agent and an invalid `kind` all got 204 and stored no row.
  - Curl with an iPhone user agent and an Instagram referrer stored `mobile` and `www.instagram.com`.
  - The StrictMode duplicates were reproduced, then shown fixed: after the fix each load stored exactly one row.
  - Not checked: a referrer from a real cross-site navigation (navigation was by `goto`), and a production build.


---

## Phase 2: Daily rollup job

**Goal:** An hourly job rolls complete days of raw events into daily tables and deletes them.

**Files:**
- `Sinwy.Backend/db/schema/analyticsSchema.ts`, next to `analyticsEvent` and `analyticsSalt`. Run `bun run db:generate`, then rename the migration to `0026_analytics_rollup.sql` and its tag in `drizzle/meta/_journal.json` (the repo names migrations; drizzle tracks them by hash).
- `Sinwy.Backend/modules/analytics/rollup.ts` (new), `repository.ts` and `index.ts`.
- `Sinwy.Backend/jobs.ts`; `Sinwy.Backend/lib/jobs.ts` (read only).
- `Sinwy.Backend/modules/analytics/tests/`: `tracking.test.ts` has `seedOrg` and `insertPage` helpers to copy.
- `organization.timezone` in `db/schema/organizationSchema.ts`, for the SQL join.

**Steps:**
- **`analytics_daily` table:**
  - Columns: `organizationId` (deleted with the org), `localDate`, `metric`, `key` (not null, default `''`), `events`, `visitors`.
  - Primary key on `(organizationId, localDate, metric, key)`.
  - `metric` is one of `total` (view events), `booking_started`, `referrer` (`key` is the host, `''` for direct) or `device`.
  - Referrer and device rows count only `view` events.
- **`analytics_page_daily` table:**
  - Columns: `organizationId` (deleted with the org), `localDate`, `pageId` (nullable, deleted with the page; null means the booking page), `views`, `visitors`.
  - A unique index on `(organizationId, localDate, pageId)` with nulls not distinct.
- **`rollupAnalyticsJob`:** named `rollup-analytics`, running hourly. In one `db.transaction`:
  1. Select raw rows whose `localDate` is before today in their org's timezone, by joining `organization.timezone` in SQL. This is a read of the org's timezone only.
  2. Insert grouped counts into both tables. Visitors are `count(DISTINCT visitorHash)`.
  3. On conflict, add to the existing counts (Decision on rare double rollups after a timezone change).
  4. Delete the rolled-up raw rows.
  5. Delete salts older than 2 days.
  6. Log the counts.
- Register the job in `Sinwy.Backend/jobs.ts`.

**Tests that matter:**
- Counts and distinct visitors are right for each metric and page.
- Today's rows (org-local) are left alone, including for an org east of UTC just after its midnight.
- Raw rows are deleted only in the same transaction as the insert; a failure leaves them in place.
- A second run is a no-op.
- Old salts are deleted.
- Deleting a page deletes its `analytics_page_daily` rows; `analytics_daily` totals stay.

**Done when:** after the job runs, yesterday's raw rows are gone and the daily tables hold their totals.

**Verify:**
- **Seed:** start from Phase 1's data. Using `psql service=sinwy_rw`, set `local_date` to yesterday on that org's `analytics_event` rows, and add a few rows with two distinct `visitor_hash` values and different devices and referrers.
- **Flow:** restart the backend, since the job runs at start.
- **Expect:**
  - `analytics_event` has no rows for yesterday.
  - `analytics_daily` and `analytics_page_daily` have rows matching the inserted counts (LIMIT 20).
  - A second restart changes nothing.
- **Simulated:** event rows inserted by SQL rather than by browsing.

### Log (2026-11-09, `feat(backend, shared): roll up analytics events into daily tables`)
- Shipped:
  - `analytics_daily` (primary key on org, date, metric and key, with a check on `metric`) and `analytics_page_daily` (unique, nulls not distinct, on org, date and page), in migration `0026_analytics_rollup.sql`. `ANALYTICS_DAILY_METRICS` is in Shared.
  - `rollupAnalytics(now)` and `rollupAnalyticsJob` (`modules/analytics/rollup.ts`), registered in `jobs.ts`. It logs only when it moved events or deleted salts.
  - Tests in `modules/analytics/tests/rollup.test.ts`, covering per-metric counts, timezones, a second run, a double rollup, a failure, salts and page deletion.
- Differs from plan:
  - The select, the inserts and the delete are one SQL statement: a `DELETE … RETURNING` CTE that feeds both inserts. Separate statements under read committed could delete an event that arrives between the insert and the delete without counting it. Salt deletion runs in the same `db.transaction`.
  - Salts are deleted when their date is before UTC today minus 2 days.
  - Drizzle 0.45 has `.nullsNotDistinct()` only on `unique()` constraints, not on `uniqueIndex()`, so the page table uses a unique constraint.
  - The failure test adds a temporary `CHECK (views < 0) NOT VALID` constraint on `analytics_page_daily` to make the insert fail.
  - `analytics_page_daily` has no index on `page_id` of its own. The cascade from a page delete scans the table, which is fine while page deletes are rare; Phase 7 may add one (`analytics_event` is in the same position).
- Checked in the running app (e2e subagent, org `5645cff9…` in UTC):
  - 22 Phase 1 and SQL-inserted events over 2026-11-07 and 2026-11-08 rolled up on backend start. The log said `events: 22, dailyRows: 14, pageRows: 4, salts: 1`, and all 14 daily and 4 page rows matched the counts computed beforehand.
  - Today's row and the 2026-11-08 salt stayed, and a stale 2026-11-06 salt was deleted.
  - A second restart changed nothing, and neither log had warnings or errors.
  - Not checked live: a non-UTC org (covered by the tests), and events captured by browsing then rolled up after midnight.

## Phase 3: Range, retention and traffic endpoints

**Goal:** Members with `analytics:read` get traffic series for a range clamped to complete days and their plan's retention window.

**Files:**
- `Sinwy.Shared/types/plan/PlanLimits.ts`, and the PlanLimits tests in `Sinwy.Backend/modules/billing/tests/planFeatures.test.ts` and `Sinwy.WebFrontend/src/shared/tests/plans.test.ts`.
- `Sinwy.Shared/types/analytics/`: the range query schema and the traffic DTOs (`AnalyticsEvent.ts` has `ANALYTICS_DAILY_METRICS`).
- `Sinwy.Backend/db/schema/analyticsSchema.ts` (read only): `analyticsDaily` and `analyticsPageDaily`.
- `Sinwy.Backend/modules/analytics/`: `range.ts` (new), `service.ts`, `controller.ts`, `routes.ts`, `repository.ts`; `tests/rollup.test.ts` shows how to insert daily rows (or raw events plus `rollupAnalytics(now)`).
- `Sinwy.Backend/modules/pages/service.ts` and `index.ts`: page titles and slugs by id.
- `Sinwy.Backend/modules/organizations` (`getOrganizationLocale`).
- `modules/auth` (`requirePermission`, `requireFeature`, `organizationPath`, `membershipFrom`).
- `docs/org-rules-map.md`, around line 181 and line 220.

**Steps:**
- **Plan limit:** add `analyticsRetentionDays` to `PlanLimits` (30, 365, 730, and 0 with no plan).
- **Range:** `resolveAnalyticsRange(membership, query, now)`, a pure function plus the org locale. It takes the default and the clamps from Default 3, and returns `{ from, to, timezone, currency, retentionDays, clamped }`. It refuses retention 0 with a 402.
- **Shared schema:** `analyticsRangeQuerySchema` with optional ordered `from` and `to`, in the payments style.
- **`GET analytics/traffic`** (`analytics:read`): totals and a daily series of views and visitors, with missing days filled with zeros.
- **`GET analytics/traffic/breakdown`** (`analytics:read` and `requireFeature("analytics-advanced")`):
  - top pages, with titles from the pages module, and the booking page labelled by a null id
  - referrers, with direct as null
  - devices
- **Docs:** add retention and the `analytics-advanced` contents to `docs/org-rules-map.md`, under plans and under "Enforced in".

**Tests that matter:**
- The default range is 30 complete days.
- `to` = today or later is cut to yesterday, and `from` is cut to the retention window per plan.
- An inactive org or no plan gets 402.
- Staff get 403, and Starter gets 402 on the breakdown but 200 on the traffic totals.
- The series is filled with zeros and uses the org's timezone.
- Another org's data never leaks.

**Done when:** both endpoints return correct data for the Phase 2 rows, and the gates behave as tested.

**Verify:**
- **Seed:** start from Phase 2's data on the `pro-org` org.
- **Flow:** using the owner session (`bun run dev:login-as`), call:
  - `GET /api/organizations/<id>/analytics/traffic`
  - the same endpoint with a range reaching 2 years back
  - `/analytics/traffic/breakdown`
- **Expect:**
  - The totals match the `analytics_daily` rows.
  - `from` is cut to 365 days back.
  - After setting the owner's projected plan to `starter` with `psql service=sinwy_rw` (`user.plan`), the breakdown answers 402 and the range is cut to 30 days.
- **Simulated:** the plan change, done directly in the DB.

### Log (2026-11-09, `feat(backend, shared): serve analytics traffic within the plan's retention window`)
- Shipped:
  - `PLAN_LIMITS.analyticsRetentionDays` (30, 365, 730; 0 with no plan), with the backend limits test pinning both limits.
  - `analyticsRangeQuerySchema`, `ANALYTICS_LIMITS` and the traffic DTOs in `Sinwy.Shared/types/analytics/AnalyticsReport.ts`.
  - `modules/analytics/range.ts`: `clampAnalyticsRange` (pure), `resolveAnalyticsRange` (adds the org locale; `no-retention` → 402 `PLAN_UPGRADE_REQUIRED`) and `datesIn`.
  - `GET analytics/traffic` (`analytics:read`) and `GET analytics/traffic/breakdown` (plus `requireFeature("analytics-advanced")`), registered by `registerAnalyticsRoutes`.
  - `getPageLabels(organizationId, ids)` exported from the pages module for page titles and slugs.
  - Tests in `modules/analytics/tests/traffic.test.ts`; retention and the advanced contents in `docs/org-rules-map.md` § 5.
- Differs from plan:
  - Both ends of a range are clamped into `[today − retentionDays, yesterday]`, so a range wholly in the future or wholly before the window collapses onto one edge day rather than erroring. Only `to` given → the 30 days ending there. `clamped` means only that retention cut `from`, not the yesterday cap.
  - Referrers fold `www.` into the bare host and are capped at the top 20 (`ANALYTICS_LIMITS.topReferrers`); pages and devices are uncapped (at most 26 pages and 3 devices).
  - The `www.` fold is a `CASE … LIKE 'www.%'` expression with no bound parameters: Drizzle binds each `${}` separately, and Postgres then rejects the same expression in SELECT and GROUP BY ("must appear in the GROUP BY clause"; probed). Grouping by ordinal (`group by 1`) works.
  - The plan's "`user.plan`" is wrong: the projected plan is `user_subscription.plan`.
- Checked in the running app (e2e subagent, org `5645cff9…` in UTC, Phase 2 rows):
  - Default traffic: 30 days 2026-10-10 to 2026-11-08, totals 17/6 matching `analytics_daily`; zero-filled series.
  - A range two years back on Professional: `from` 2025-11-09, `clamped: true`; a range to 2026-11-20: `to` 2026-11-08.
  - Breakdown: pages, referrers (with `www.instagram.com` folded) and devices matched the table sums and page titles.
  - With `user_subscription.plan = starter`: breakdown 402 (code 4021), range cut to 2026-10-10; restored to Professional afterwards. No warnings or errors in the backend log.
  - Not checked live: an inactive org's 402 and a non-UTC org (both covered by the tests), a real Polar plan change.


## Phase 4: Booking metrics, funnel and CSV export

**Goal:** Booking volume, booked value, the breakdown, the funnel and CSV exports are served from the booking table and the rollups.

**Files:**
- `Sinwy.Backend/modules/bookings/repository.ts` (`sumBookingsBetween` at line 550 for the booked-value filter), `service.ts` and `index.ts`.
- `Sinwy.Backend/modules/analytics/`:
  - `service.ts` (`getTraffic` and `getTrafficBreakdown` are the shape to follow), `controller.ts` (`respondError`, `parseQuery`), `routes.ts` (`read`, `readAdvanced`), `range.ts` (`resolveAnalyticsRange`, `datesIn`), and `csv.ts` (new).
  - `tests/traffic.test.ts` for the HTTP setup, sessions and the 402/403 checks.
- `Sinwy.Backend/lib/localDate.ts`: `localDateRange(from, to, timezone)` turns the resolved dates into the `start`/`end` instants for the `createdAt` and `startsAt` filters.
- `Sinwy.Backend/lib/csv.ts` (new), and `Sinwy.Backend/modules/payments/csv.ts` (`FORMULA_START` at line 19, `cell` at line 21), with `modules/payments/tests/payments.test.ts`.
- `Sinwy.Shared/types/analytics/AnalyticsReport.ts`: add the bookings, funnel and export-query DTOs next to `analyticsRangeQuerySchema`.

**Steps:**
- **Bookings module:** export `getBookingAnalytics(organizationId, { start, end, from, to }, timezone)`, with the date definitions from Decisions:
  - daily created counts, by `createdAt`
  - daily booked value, by `startsAt`
  - counts and booked value per service, with the service name, by `createdAt`
  - cancellation rate split by `cancelledBy`, by `startsAt`
  - no-show rate, by `startsAt`
  - storefront-created count, by `createdAt`

  Group by day in the org's timezone with `AT TIME ZONE`. The analytics module never reads `booking` itself.
- **`GET analytics/bookings`** (any plan with retention): the volume and booked value series and their totals.
- **`GET analytics/bookings/breakdown`** (`analytics-advanced`): by service, plus the cancellation and no-show rates. A rate with a zero denominator is null, not 0.
- **`GET analytics/funnel`** (`analytics-advanced`): view visitors (sum of `total` visitors), then started visitors (sum of `booking_started` visitors), then storefront bookings.
- **CSV:**
  - Move `cell` to `lib/csv.ts` and use it from payments and analytics.
  - `GET analytics/export?report=traffic|bookings|funnel&from&to` (`analytics-advanced`) returns one row per day for traffic and bookings, and one row per step for the funnel.
  - The filename is `analytics-<report>-<from>-to-<to>.csv`.

**Tests that matter:**
- Each metric follows its date column across midnight in the org's timezone.
- Cancelled, pending and no-show bookings are excluded from booked value.
- The no-show rate ignores future, pending and confirmed bookings, and is null with nothing to divide by.
- The funnel's last step counts only `bookedBy = customer`.
- Every advanced endpoint answers 402 for Starter.
- CSV cells starting with `= + - @` are escaped, and the payments CSV still passes its tests.

**Done when:** all endpoints match hand-computed values for the seeded bookings, and the CSV downloads.

**Verify:**
- **Seed:** `bookable-org`. Upgrade it to Professional the same way as Phase 3, or create a `pro-org` and book through the storefront. Cancel one booking and mark one as a no-show in the dashboard. Backdate `created_at` and `starts_at` with `psql service=sinwy_rw` so they fall within the range.
- **Flow:** using the owner session, call `analytics/bookings`, `analytics/bookings/breakdown`, `analytics/funnel` and `analytics/export?report=bookings`.
- **Expect:**
  - The counts, rates and booked value match a `psql service=sinwy_ro` query on `booking` (LIMIT 50).
  - The CSV has a header and one row per day.
- **Simulated:** the backdated timestamps.

### Log (2026-11-09, `feat(backend, shared): serve booking analytics, the funnel and CSV exports`)
- Shipped:
  - `getBookingAnalytics(organizationId, { from, to }, timezone)` in the bookings module, built from three grouped queries:
    - `countCreatedByDay`, by `createdAt`: bookings made per local day, all of them and the storefront ones.
    - `sumStartingByDay`, by `startsAt`: per local day, the booked value, cancellations by each side, completed bookings and no-shows.
    - `sumCreatedByService`, by `createdAt`: count and booked value per service.
    - `bookedValue` is shared with `sumBookingsBetween`.
  - The endpoints `GET analytics/bookings`, `analytics/bookings/breakdown`, `analytics/funnel` and `analytics/export?report=traffic|bookings|funnel`. The controller's range handlers share one `rangeHandler`.
  - `lib/csv.ts` (`cell`, `csvOf`, `majorUnits`), used by payments and by `modules/analytics/csv.ts`:
    - Bookings CSV columns: Date, Bookings made, Booked value (major units), Currency.
    - Funnel CSV columns: Step, Count, Of previous step (percent).
  - Tests in `modules/analytics/tests/bookings.test.ts` and `lib/tests/csv.test.ts`. `docs/org-rules-map.md` § 5 lists the new metrics.
- Differs from plan:
  - `getBookingAnalytics` takes the local `{ from, to }` and works out the instants itself.
  - `booking.created_at` is `timestamp` *without* time zone and holds UTC wall time, so its local day is `((created_at AT TIME ZONE 'UTC') AT TIME ZONE tz)::date`. `starts_at` is `timestamptz`. Dates are cast `::text` so the driver doesn't parse them.
  - The funnel's last step counts every storefront booking made in the range, including ones cancelled later.
  - `analyticsRangeQuerySchema` and `analyticsExportQuerySchema` share their fields and refine, because Zod 4 can't `.extend` a refined object. The funnel step type is named `AnalyticsFunnelStep` because `FunnelStep` already exists in the shared types.
- Checked in the running app by the e2e subagent:
  - Setup: org `bf2f32a9…` (`seed-83a3f25e`, Europe/Vilnius) with 8 bookings made through the storefront and dashboard APIs, statuses changed through the API, then `created_at` and `starts_at` backdated.
  - `bookings`: totals of 8 bookings and 13000 booked value, and every non-zero day, matched a psql grouping. This included three bookings near midnight on both sides of the 25 Oct DST change. A booking starting today was correctly left out.
  - `bookings/breakdown`: everything matched psql, and a custom range matched too.
    - Services: 5 bookings / 7500 and 3 / 8000.
    - Cancellation: 7 bookings, 1 cancelled by each side, rate 0.2857.
    - No-show: 1 of 3, rate 0.3333.
  - `funnel`: 0 / 0 / 4. The org has no traffic rows; the 4 storefront bookings matched psql.
  - `export?report=bookings`: a header plus 30 rows, filename `analytics-bookings-2026-10-10-to-2026-11-08.csv`.
  - On Starter, `bookings` answered 200 and the other three answered 402 (code 4021). No warnings or errors in the backend log.
  - Not checked live: the funnel with real traffic rows (covered by tests), cancel and no-show from the dashboard UI, and a real Polar upgrade.
  - Noted by the e2e run: as specified, per-service booked value (by `createdAt`) and the total booked value (by `startsAt`) differ for the same range, so Phase 5 must label them.
