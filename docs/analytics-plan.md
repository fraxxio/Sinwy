# Analytics plan

A first analytics module for the organization dashboard. It covers cookieless traffic tracking of public pages and the booking page, a daily rollup, and booking metrics read live from the `booking` table. The endpoints return pre-aggregated series, clamped to a retention window per plan, and the dashboard shows Traffic, Conversion and Bookings tabs with a shared date range and CSV export. It's built to be extended later with real revenue (Phase 7 online payments), live "today" numbers and Enterprise reports.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [analytics-log.md](analytics-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Event capture | – | done | `feat(backend, shared, web): capture page and booking analytics events` |
| 2 | Daily rollup job | 1 | done | `feat(backend, shared): roll up analytics events into daily tables` |
| 3 | Range, retention and traffic endpoints | 2 | done | `feat(backend, shared): serve analytics traffic within the plan's retention window` |
| 4 | Booking metrics, funnel and CSV export | 3 | todo | |
| 5 | Analytics dashboard | 4 | todo | |
| 6 | Exclude members and rate-limit tracking | 1 | todo | |
| 7 | Code review and cleanup | 1–6 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Plan split.** Every plan with retention gets total views, unique visitors, booking volume and booked value. `analytics-advanced` (Professional, Enterprise) adds top pages, referrers, devices, the funnel, bookings by service, cancellation and no-show rates, and CSV export. Enterprise gets nothing extra yet beyond longer retention.
- **Retention per plan.** `PLAN_LIMITS.analyticsRetentionDays`: Starter 30, Professional 365, Enterprise 730, no plan 0. It limits only what the endpoints return. Data is kept, so an upgrade reveals history at once and a downgrade deletes nothing.
- **Cookieless unique visitors.** `visitorHash = sha256(daily salt + organizationId + ip + userAgent)`. Unique visitors over a range are the sum of daily uniques. No cookies and no stored IPs or user agents.
- **"Booking started"** is sent when the confirm step of the booking page appears. "Completed" is a booking created from the storefront (`bookedBy = customer`).
- **Both dates.** Volume, bookings by service and the funnel go by `createdAt`. Booked value and the cancellation and no-show rates go by `startsAt`.
- **Rates.** Cancellation is cancelled divided by all bookings, split by `cancelledBy`. No-show is `no_show` divided by (`completed` + `no_show`).
- **Up to yesterday.** Analytics shows complete days only. There are no live numbers for today.
- **Exclusions are their own phase.** Not counting signed-in organization members is Phase 6, after the MVP.
- **Deleted pages are deleted from analytics.** Their raw events and daily page rows go with the page.
- **Revenue is booked value for now.** It's the sum of `priceMinor` for confirmed and completed bookings, the same as `sumBookingsBetween`. Real revenue waits for Phase 7 online payments.
- **Deployment is undecided.** The app will run on a VPS, but the proxy setup is unknown, so the trusted client-IP header is configurable.

### Defaults (not yet confirmed; change only if asked)

1. The yesterday cap applies to the whole analytics page, bookings included. Today's and future bookings stay on Overview and Bookings.
2. A deleted page's views stay in the site totals (`analytics_daily`); only its top-pages rows go.
3. The default range is the last 30 complete days. `to` is capped at yesterday and `from` at the start of the retention window. The response returns the resolved range and `retentionDays`.
4. An org with 0 retention days (no plan, or inactive) gets 402 `PLAN_UPGRADE_REQUIRED` from every analytics endpoint.
5. Tracking always answers 204, even when it drops the event, so it never reveals whether an org or page exists.
6. The referrer is stored as its host only. A referrer on our own host (`WEB_APP_URL`) counts as direct (null).
7. Bots are dropped with a user-agent regex (`bot|crawl|spider|slurp|preview|headless|lighthouse`, plus a missing user agent). Device is `mobile`, `tablet` or `desktop`, read from the user agent.
8. The Phase 6 rate limit is in memory, per server instance, keyed by IP and org.
9. The analytics tables sit in their own `db/schema/analyticsSchema.ts`, and the module's alias is `@analyticsModule`.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Tracking.** `trackEvent` (`modules/analytics/service.ts`) does every drop check before the insert; `clientIp(ctx)` is in `lib/clientIp.ts`, and `ctx.server` is on `IReqContext`.
- **Daily tables.** `analytics_daily` rows are `(org, localDate, metric, key)` with `events` and `visitors`; `key` is `''` for `total`, `booking_started` and direct referrers, else the referrer host or device. `analytics_page_daily` has `pageId` null for the booking page. Dates are `date` columns read as `"YYYY-MM-DD"`, and a day only has rows once it's over in the org's timezone (rolled up hourly). Days with no events have no rows. Log, Phase 2.
- **Analytics range and gates.** `resolveAnalyticsRange(membership, query, now)` (`modules/analytics/range.ts`) returns the clamped `AnalyticsRangeDto` (with `timezone` and `currency`) or `no-retention`, which the controller's `respondError` turns into 402. `datesIn(range)` lists the days to zero-fill. `routes.ts` has `read` and `readAdvanced` middleware arrays; the controller has its own `parseQuery`. Shared schema and DTOs: `Sinwy.Shared/types/analytics/AnalyticsReport.ts`. Log, Phase 3.
- **GROUP BY with bound parameters fails.** Drizzle binds every `${…}` as its own parameter, so `(created_at AT TIME ZONE ${timezone})::date` in both SELECT and GROUP BY is rejected by Postgres; group by ordinal (`group by 1`) instead. Log, Phase 3.
- **Endpoint tests run on the real clock.** Date seeded rows relative to `todayIn(timezone, new Date())`, and test fixed-`now` logic through the service or `range.ts` (see `tests/traffic.test.ts`, which also has the HTTP and session setup).
- **Page deletion.** `deletePage` in the pages service hard-deletes the `page` row (`repository.ts`, the `.delete(page)` call), so `onDelete: "cascade"` foreign keys remove analytics rows.
- **Drizzle raw SQL.** `tx.execute(sql\`…\`)` rows are untyped records: read them as `row?.["name"]` and coerce counts with `Number`.
- **Date helpers.** Backend: `todayIn` is exported from `@servicesModule` (not `lib/localDate.ts`); `addDaysToDate`, `startOfLocalDate` and `localDateRange` are in `lib/localDate.ts`. Frontend: all four in `src/shared/lib/date.ts`.
- **CSV and range patterns** to copy:
  - Backend: `exportPayments` in `modules/payments/service.ts`, and `paymentsCsv` with the `cell` formula guard in `modules/payments/csv.ts`. The CSV is returned by `exportPaymentsHandler` with `Content-Disposition`.
  - Frontend: `paymentsSearchSchema`, `changeRange` and `paymentsExportUrl` (`org-dashboard/lib/payment-search.ts`), and `PaymentFilters` (`org-dashboard/components/payments/PaymentFilters.tsx`).
- **No chart or tabs components yet.** `src/shared/components/ui/` has neither; add them with `bunx shadcn add chart tabs`.
- **Booking page flow.** `/$organizationSlug/book` is `ssr: false`. The confirm step renders when `search.service` and `search.start` are set; signing in from it returns to the same URL, so `booking_started` can be sent twice per visitor (the funnel counts visitors, not events).
- **User agents in tests.** Bun's `fetch` adds its own user agent when none is set, so send `user-agent: ""` to test a missing one. Playwright's headless Chromium sends `HeadlessChrome`, which the bot filter drops. Override the user agent with `playwright-cli open --config=<file>`, where the file holds `browser.contextOptions.userAgent` plus `browserName: "chromium"` and `launchOptions.channel: "chromium"` (a custom config replaces `.playwright/cli.config.json`).
- **StrictMode in dev.** TanStack Start's default client entry wraps the app in `<StrictMode>`, so mount effects on client-rendered components run twice in dev. Guard one-shot side effects with a ref (see `useTrackEvent`; log, Phase 1).
- **Projected plan.** The owner's plan is `user_subscription.plan` (keyed by `user_id`), read by `organizationPlanOf`; setting it with `psql service=sinwy_rw` simulates a plan change. `membershipFrom(ctx).plan` is null for an inactive org.
- **Seed scenarios.** `bun run dev:seed-scenario <user|owner-with-org|subscribed-org|pro-org|org-with-staff|bookable-org>`. `bookable-org` creates bookings and `pro-org` is on Professional. The Phase 2/3 data is on org `5645cff9…` (`seed-68a85e45`, UTC, Professional).

---

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

---

## Phase 5: Analytics dashboard

**Goal:** Owners and admins see Traffic, Conversion and Bookings tabs with a shared date range, upgrade prompts for advanced sections, and CSV export.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.analytics.tsx` and `_shell.payments.tsx`.
- `org-dashboard/components/payments/PaymentFilters.tsx`, which becomes `org-dashboard/components/DateRangeFilter.tsx`.
- `org-dashboard/lib/payment-search.ts`; `changeRange` moves to a shared range helper there or in a new `lib/date-range.ts`.
- `org-dashboard/lib/analytics-queries.ts` and `analytics-search.ts` (new), and `org-dashboard/components/analytics/` (new).
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
- **Seed:** start from the Phase 4 data on a Professional org, plus a `starter` org from `subscribed-org` and a staff member from `org-with-staff`.
- **Flow:**
  1. As the Pro owner: open Analytics, switch tabs, pick the 7-day preset, then export CSV.
  2. As the Starter owner: open Analytics.
  3. As staff: open `/dashboard/<slug>/analytics`.
- **Expect:**
  - Pro: the charts match the Phase 3 and 4 API values, the URL holds the range, and the CSV downloads.
  - Starter: totals with upgrade prompts and no export button.
  - Staff: the existing access-denied redirect.
- **Simulated:** the backdated data from earlier phases.

---

## Phase 6: Exclude members and rate-limit tracking

**Goal:** Signed-in members of the organization aren't counted, and one client can't flood an org's events.

**Files:** `Sinwy.Backend/modules/analytics/controller.ts`, `service.ts` and `tests/`; `modules/auth` (session lookup without requiring auth, and the membership check, both through `index.ts`). `storefront/lib/track.ts` needs no change: its same-origin `fetch` already sends the session cookie.

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

---

## Phase 7: Code review and cleanup

**Goal:** The whole plan's change is reviewed for privacy, auth, plan gating and data deletion, and the workspace is left clean.

**Files:** every file changed in Phases 1–6 (`git diff` from the commit before Phase 1), `docs/org-rules-map.md` and `README.md`.

**Steps:**
- Review for:
  - no raw IPs or user agents stored or logged
  - salts deleted on time
  - every analytics route behind `analytics:read`, and advanced routes behind `requireFeature`
  - no data from one org visible to another
  - cascade foreign keys on org and page deletion, and the organization purge still working
  - the timezone edge cases
  - CSV escaping
- Fix the findings, or record them as follow-ups in the log.
- Check that `docs/org-rules-map.md` and the README match what shipped.
- Last step: stop every dev server started during the plan's work, and delete the probe scripts, screenshots, browser logs and scratch data it created.

**Tests that matter:** any regression tests the review's fixes need.

**Done when:** the review findings are fixed or logged, `bun run verify` exits 0, and the workspace is clean.

**Verify:** None.
