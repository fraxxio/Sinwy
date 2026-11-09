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


## Phase 5: Analytics dashboard

**Goal:** Owners and admins see Traffic, Conversion and Bookings tabs with a shared date range, upgrade prompts for advanced sections, and CSV export.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.analytics.tsx` (the current placeholder with `EmptyState`) and `_shell.payments.tsx`.
- `org-dashboard/components/payments/PaymentFilters.tsx`, which becomes `org-dashboard/components/DateRangeFilter.tsx`.
- `org-dashboard/lib/payment-search.ts` (`paymentsSearchSchema`, `changeRange`, `paymentsExportUrl`) and its `payment-search.test.ts`; `changeRange` moves to a shared range helper there or in a new `lib/date-range.ts`.
- `org-dashboard/lib/analytics-queries.ts` and `analytics-search.ts` (new), and `org-dashboard/components/analytics/` (new).
- `Sinwy.Shared/types/analytics/AnalyticsReport.ts` for the DTOs (read only).
- `src/shared/components/PlanGate.tsx` and `UpgradePrompt.tsx`, and `src/shared/lib/api.ts` (`api`).
- `src/shared/components/ui/`: add `chart` and `tabs` with `bunx shadcn add chart tabs`.
- `org-dashboard/tests/`.

**Steps:**
- **Shared date range picker:** extract `DateRangeFilter` with 7, 30 and 90 day presets plus custom From/To inputs, and use it on Payments without changing Payments' behaviour.
- **Search schema:** `analyticsSearchSchema` holds `from`, `to` and `tab` (`traffic` | `conversion` | `bookings`). A bad value falls back to the defaults, as on Payments.
- **Traffic tab:** cards for views and visitors, an area chart, and a `PlanGate` section with tables for top pages, referrers and devices.
- **Conversion tab:** a `PlanGate` funnel with step counts and conversion percentages between steps.
- **Bookings tab:** cards and charts for volume and booked value (formatted with `formatMinorUnits`), and a `PlanGate` section for by-service and the rates.
- **Header:** an Export CSV link for the active tab, shown only with `analytics-advanced`, plus notes for "Traffic updates once a day" and "Your plan shows the last N days" when `clamped`.
- **Empty and error states:** keep the existing `EmptyState` when every series is zero, and show `FieldError` on errors.

**Tests that matter:**
- The search schema falls back on bad input.
- The presets resolve to complete days ending yesterday.
- The Payments range behaves as before (the `payment-search.test.ts` tests still pass).

**Done when:** a Pro owner sees all three tabs with data and can export, a Starter owner sees totals with upgrade prompts, and staff can't open the page.

**Verify:**
- **Seed:** start from the Phase 4 bookings (org `bf2f32a9…`, set back to Professional) and the Phase 3 traffic (org `5645cff9…`), plus a `starter` org from `subscribed-org` and a staff member from `org-with-staff`.
- **Flow:**
  1. As the Pro owner: open Analytics, switch tabs, pick the 7-day preset, then export CSV.
  2. As the Starter owner: open Analytics.
  3. As staff: open `/dashboard/<slug>/analytics`.
- **Expect:**
  - Pro: the charts match the Phase 3 and 4 API values, the URL holds the range, and the CSV downloads.
  - Starter: totals with upgrade prompts and no export button.
  - Staff: the existing access-denied redirect.
- **Simulated:** the backdated data from earlier phases.


### Log (2026-11-09, `feat(web): add the analytics dashboard with traffic, conversion and bookings tabs`)
- Shipped:
  - `/dashboard/<slug>/analytics` with Traffic, Conversion and Bookings tabs (`tab` in the URL), a shared range and an Export CSV link for the active tab (`conversion` exports `funnel`), hidden without `analytics-advanced`.
  - `components/DateRangeFilter.tsx` (presets optional, `min`/`max`) replaces `PaymentFilters`; Payments passes no presets, so it behaves as before. `lib/date-range.ts` holds `changeRange`, `validRangeOr`, `completeDaysRange` and `clampRange`, shared by `payment-search.ts` and `analytics-search.ts`.
  - `lib/analytics-queries.ts` has one `analyticsQuery(orgId, report, range)`. The traffic query (every plan) carries the resolved range, so it drives the filter, notes and presets on every tab. Advanced queries run only inside `PlanGate`.
  - Labels follow the two date columns: "Bookings made" by booking date, "Booked value" by appointment date, and "Value of bookings made" in the by-service table.
  - Tests: `analytics-search.test.ts` (fallbacks, presets ending yesterday, the 30-day preset is the API default, export URL) and `date-range.test.ts` (`changeRange` moved here from `payment-search.test.ts`, timezone, clamping).
  - shadcn `chart` and `tabs`, and `recharts@3.8.0`.
- Differs from plan:
  - `changeRange` moved to `lib/date-range.ts`, and its test moved with it; the other `payment-search.test.ts` tests are unchanged and pass.
  - Empty states are per tab ("No visits / bookings / visitors in this range"), not one page-wide `EmptyState`, so the range filter stays usable.
  - The date inputs show the requested range clamped into the retention window, as the API clamps it. This was added after the e2e run found a URL `to` after yesterday sitting in the input while the data stopped at yesterday.
  - `bunx shadcn add` wrote `import { cn } from "cn"`, installed a bogus `cn` package and re-resolved every `latest` TanStack range, leaving two `@tanstack/query-core` versions and type errors. Fixed by pointing the import at `@/shared/lib/utils` and keeping the old TanStack entries in `bun.lock`, so the lockfile adds only recharts and its dependencies.
- Checked in the running app by the e2e subagent; every step passed:
  - Pro, org `bf2f32a9…`: Bookings showed 8 / €130.00, by service Haircut 5 / €75.00 and Colouring 3 / €80.00, cancellation 28.6% (14.3% each side, of 7) and no-show 33.3%. The funnel showed 0 / 0 / 4. All matched a fresh API fetch.
  - Pro, org `5645cff9…`: the traffic tables and the funnel (6 / 3 / 0) matched `traffic/breakdown` and `funnel`.
  - 7-day preset: the URL became `from=2026-11-02&to=2026-11-08` and the figures matched the API. The CSV downloaded as `analytics-bookings-2026-11-02-to-2026-11-08.csv`, and the other reports exported with the default range.
  - Bad URL params fell back to the defaults. A range older than retention showed "Your plan shows the last N days".
  - Starter (`bf2f32a9…` on starter, and `subscribed-org` org `548cd1e5…`): totals, upgrade prompts and no export link.
  - Staff (`org-with-staff` org `494d7138…`): the access-denied redirect and toast, and a 403 from the API.
  - No console errors and nothing in the backend or web logs.
  - Not checked: gating after a real Polar plan change, and live visits fed through the rollup.
  - Noted, not fixed: Starter is offered the 90-day preset, clamped and explained by the note. The two bookings charts pick different x-axis ticks.

## Phase 6: Exclude members and rate-limit tracking

**Goal:** Signed-in members of the organization aren't counted, and one client can't flood an org's events.

**Files:**
- `Sinwy.Backend/modules/analytics/controller.ts` (the tracking handler; it already reads `clientIp(ctx)` from `lib/clientIp.ts`), `service.ts` (`trackEvent`, which does every drop check before the insert) and `tests/` (the tracking tests).
- `modules/auth/index.ts`: a session lookup that doesn't require auth, and the membership check. Don't import auth internals.
- `storefront/lib/track.ts` needs no change: its same-origin `fetch` already sends the session cookie.

**Steps:**
- **Members:** the tracking endpoint reads the session if there is one. When the user is a member of the org, it drops the event and still answers 204.
- **Rate limit:** an in-memory limiter keyed by IP and org (Default 8), for example at most 60 events a minute. Events over the limit are dropped and the endpoint still answers 204.

**Tests that matter:**
- A member's view isn't stored; a signed-in customer's view is.
- Events past the limit are dropped, and the limiter resets.

**Done when:** owner and staff visits leave no rows, and customer visits still do.

**Verify:**
- **Seed:** `org-with-staff` with a published page (set up as in Phase 1, on a plan with `page-builder`) and a separate `user`.
- **Flow:** open the page as the owner, as staff and as the customer user.
- **Expect:** only the customer's visit adds an `analytics_event` row.
- **Simulated:** nothing.

### Log (2026-11-09, `feat(backend): skip organization members and rate-limit analytics tracking`)
- Shipped:
  - The tracking handler looks up the session with the new auth `findSession(ctx)` and passes `userId` to `trackEvent`, which drops the event when `isOrganizationMember` (new, in the auth module) is true for the resolved org. Still 204.
  - `modules/analytics/rateLimit.ts`: an in-memory limiter, 60 events a minute per `ip|slug`, the window starting at a key's first hit and expired keys swept once a minute. The handler checks it first, before the body, the session lookup or any DB query, and answers 204 when it drops.
  - Tests in `tracking.test.ts`: owner and staff views not stored, a signed-in customer (a member of another org) and an anonymous visitor stored; the 61st event dropped while another org still counts; the limiter resetting after its window (fixed-clock unit test).
- Differs from plan:
  - The rate limit runs in the controller, not in `trackEvent`, so a flood never reaches the session lookup or the database. Keyed by the URL slug, since the org id isn't known before the DB lookup; unknown slugs only create keys that expire within a minute.
  - Members of an org scheduled for deletion aren't special-cased: such an org isn't public, so its events are dropped earlier.
- Checked in the running app by the e2e subagent; every step passed:
  - `org-with-staff` org `0ce90ef2…` (`seed-010e0e0f`), owner set to Professional with psql for `page-builder`; page `welcome` created and published through the API as the owner.
  - Owner and staff visits (signed in, desktop Chrome user agent) each sent one events POST, answered 204, and left the count at 0. The customer `webdevrokas+seed-ce28d113-user@gmail.com` added 1 row (`view`, the page's id), and an anonymous visit added 1 more.
  - No console errors and nothing in the backend or web logs.
  - Not checked: creating the page through the dashboard UI, and the rate limit in the browser (unit-tested only).
  - The backend left running from Phase 5 had no watch mode and ran old code. My `kill` was refused by the auto mode classifier; the process had exited by the time the user tried, and a new one was started.
