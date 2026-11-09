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
