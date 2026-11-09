# Analytics plan

A first analytics module for the organization dashboard. It covers cookieless traffic tracking of public pages and the booking page, a daily rollup, and booking metrics read live from the `booking` table. The endpoints return pre-aggregated series, clamped to a retention window per plan, and the dashboard shows Traffic, Conversion and Bookings tabs with a shared date range and CSV export. It's built to be extended later with real revenue (Phase 7 online payments), live "today" numbers and Enterprise reports.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [analytics-log.md](analytics-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Event capture | – | done | `feat(backend, shared, web): capture page and booking analytics events` |
| 2 | Daily rollup job | 1 | done | `feat(backend, shared): roll up analytics events into daily tables` |
| 3 | Range, retention and traffic endpoints | 2 | done | `feat(backend, shared): serve analytics traffic within the plan's retention window` |
| 4 | Booking metrics, funnel and CSV export | 3 | done | `feat(backend, shared): serve booking analytics, the funnel and CSV exports` |
| 5 | Analytics dashboard | 4 | done | `feat(web): add the analytics dashboard with traffic, conversion and bookings tabs` |
| 6 | Exclude members and rate-limit tracking | 1 | done | `feat(backend): skip organization members and rate-limit analytics tracking` |
| 7 | Code review and cleanup | 1–6 | done | `fix(backend): roll up and group analytics days without database zone names` |

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

- **Tracking.** The handler (`modules/analytics/controller.ts`) applies the rate limit (`rateLimit.ts`, 60 a minute per IP and slug, in memory) before parsing or the session lookup; `trackEvent` (`service.ts`) does every other drop check, the member check included, before the insert. `clientIp(ctx)` is in `lib/clientIp.ts`. Auth exports `findSession(ctx)` (no `requireAuth` needed) and `isOrganizationMember`. Log, Phase 6.
- **Daily tables.** `analytics_daily` rows are `(org, localDate, metric, key)` with `events` and `visitors`; `key` is `''` for `total`, `booking_started` and direct referrers, else the referrer host or device. `analytics_page_daily` has `pageId` null for the booking page. Dates are `date` columns read as `"YYYY-MM-DD"`, and a day only has rows once it's over in the org's timezone (rolled up hourly). Days with no events have no rows. Log, Phase 2.
- **Analytics range and gates.** `resolveAnalyticsRange(membership, query, now)` (`modules/analytics/range.ts`) returns the clamped `AnalyticsRangeDto` (with `timezone` and `currency`) or `no-retention`, which the controller's `respondError` turns into 402. `datesIn(range)` (`lib/localDate.ts`) lists the days to zero-fill. `routes.ts` has `read` and `readAdvanced` middleware arrays; the controller has its own `parseQuery`. Shared schema and DTOs: `Sinwy.Shared/types/analytics/AnalyticsReport.ts`. Log, Phase 3.
- **Analytics endpoints** (all `GET /api/organizations/:id/analytics/…`, `from`/`to` optional): `traffic`, `bookings` (every plan); `traffic/breakdown`, `bookings/breakdown`, `funnel`, `export?report=traffic|bookings|funnel` (`analytics-advanced`, else 402). DTOs in `Sinwy.Shared/types/analytics/AnalyticsReport.ts` (`TrafficDto`, `BookingsDto`, `BookingsBreakdownDto`, `FunnelDto`, `ANALYTICS_REPORTS`, `ANALYTICS_FUNNEL_STEPS`); every response carries `range` (resolved dates, `timezone`, `currency`, `retentionDays`, `clamped`). Rates are 0–1 fractions, null with a zero denominator. Log, Phases 3–4.
- **Endpoint tests run on the real clock.** Date seeded rows relative to `todayIn(timezone, new Date())`, and test fixed-`now` logic through the service or `range.ts` (see `tests/traffic.test.ts` and `tests/bookings.test.ts`).
- **User agents in tests.** Bun's `fetch` adds its own user agent when none is set, so send `user-agent: ""` to test a missing one. Playwright's headless Chromium sends `HeadlessChrome`, which the bot filter drops. Override the user agent with `playwright-cli open --config=<file>`, where the file holds `browser.contextOptions.userAgent` plus `browserName: "chromium"` and `launchOptions.channel: "chromium"` (a custom config replaces `.playwright/cli.config.json`).
- **StrictMode in dev.** TanStack Start's default client entry wraps the app in `<StrictMode>`, so mount effects on client-rendered components run twice in dev. Guard one-shot side effects with a ref (see `useTrackEvent`; log, Phase 1).
- **Projected plan.** The owner's plan is `user_subscription.plan` (keyed by `user_id`), read by `organizationPlanOf`; setting it with `psql service=sinwy_rw` simulates a plan change. `membershipFrom(ctx).plan` is null for an inactive org.
- **Seed scenarios.** `bun run dev:seed-scenario <user|owner-with-org|subscribed-org|pro-org|org-with-staff|bookable-org>`. `bookable-org` creates bookable services but no bookings (book through the storefront API as a `user`), and `pro-org` is on Professional. The Phase 2/3 data is on org `5645cff9…` (`seed-68a85e45`, UTC, Professional).
- **No zone names in SQL.** Postgres may not know every zone name the app accepts (this Debian 13 build rejects `Asia/Calcutta`, `Europe/Kiev`). Compute local days in JS (`todayIn`, `startOfLocalDate`) and pass instants or dates; booking days use `width_bucket` over day starts. Log, Phase 7.
- **Killing processes.** The auto mode classifier refuses to kill agent-started dev servers; ask the user to stop them (log, Phases 6–7).
- **Test orgs.** Org `bf2f32a9…` (`seed-83a3f25e`, Europe/Vilnius, owner `webdevrokas+seed-83a3f25e-owner@gmail.com`, left on **Professional**) has 8 backdated bookings but no traffic. Org `5645cff9…` has the traffic rows. Phase 5 seeded `subscribed-org` `548cd1e5…` (`seed-c26106f6`) and `org-with-staff` `494d7138…` (`seed-83c3a0c1`, staff `webdevrokas+seed-83c3a0c1-staff1@gmail.com`). Phase 6 seeded `org-with-staff` `0ce90ef2…` (`seed-010e0e0f`, owner set to Professional by psql, published page `welcome`) and user `webdevrokas+seed-ce28d113-user@gmail.com`.
- **Scratch files and `bun run verify`.** Biome checks untracked files, so save API responses in `.agent-logs/` as `.txt`, not unformatted `.json` (log, Phase 5).
- **Adding packages.** `bunx shadcn add` writes `import { cn } from "cn"` and installs a bogus `cn` package; point the import at `@/shared/lib/utils` and remove it. Any `bun add` re-resolves the `latest` TanStack ranges and can leave two `@tanstack/query-core` versions (QueryClient type errors), so keep the old TanStack entries in `bun.lock` (log, Phase 5).
- **Dashboard.** The analytics page is in `org-dashboard/routes/_shell.analytics.tsx` and `components/analytics/`. Range helpers are in `lib/date-range.ts`, and `DateRangeFilter` is shared with Payments. Phase 5 log.
