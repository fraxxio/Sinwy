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
