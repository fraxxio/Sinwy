# Payments log

Finished phases of the [payments plan](payments-plan.md), each with its spec and log entry.

---

## Phase 1: Payment table and booking sync

**Goal:** Every priced booking has exactly one payment row, created and voided in the same transaction as the booking change, and existing bookings are backfilled.

**Files:**
- `Sinwy.Shared/types/payment/` (new): `PaymentStatus.ts` with `PAYMENT_STATUSES`, `PAYMENT_PROVIDERS` and types, and an `index.ts`. Export it from `Sinwy.Shared/types/index.ts`.
- `Sinwy.Backend/db/index.ts`: export `type Tx`. Replace the copies in `modules/bookings/repository.ts:40`, `modules/billing/repository.ts:12` and `modules/organizations/access.ts:9` (keep the re-export from `access.ts` pointing at the shared one, or update its importers).
- `Sinwy.Backend/db/schema/paymentSchema.ts` (new) and `db/schema/index.ts`.
- `Sinwy.Backend/drizzle/0023_*.sql` (generated, plus hand-written backfill).
- `Sinwy.Backend/modules/payments/` (new): `repository.ts` and `index.ts` exporting `createBookingPayment(tx, booking)` and `voidBookingPayment(tx, bookingId)`.
- `Sinwy.Backend/import_map.json` and `tsconfig.json`: add the `@paymentsModule` alias.
- `Sinwy.Backend/modules/bookings/repository.ts`: `insertBookingIfFree` (L130) and `changeBooking` (L203).

**Steps:**
- Table `payment` has `id text pk`, `organization_id` (FK cascade), `booking_id` (FK cascade, unique), `amount_minor integer` (check `>= 0`), `currency char(3)`, `status text` (`oneOf`), `provider text` (`oneOf`), `provider_ref text null`, `paid_at timestamptz null`, `created_at` and `updated_at`. Indexes: `(organization_id, created_at)` and unique `(provider, provider_ref)`. Add a check that `paid_at IS NOT NULL` exactly when `status = 'paid'`, and keep it if refunds later need otherwise.
- The backfill is a single `INSERT … SELECT gen_random_uuid()::text …` from `booking` where `price_minor > 0`, using status `CASE WHEN status = 'cancelled' THEN 'void' ELSE 'pending' END` and `created_at = booking.created_at`.
- `createBookingPayment` is a no-op when `priceMinor === 0`. `voidBookingPayment` only updates rows that are `pending`.
- Bookings calls these through `@paymentsModule`. Payments must not import from `@bookingsModule`.

**Tests that matter:**
- A manual booking and a self-booking each create one `pending` payment with the booking's amount and currency. A free service creates none.
- Cancelling by staff, by the customer, through `cancelUpcomingOrganizationBookings` and through `handleCustomerAccountDeleted` voids a `pending` payment. A `paid` payment (set directly in the test) stays `paid`.
- Confirming, completing, no-show and rescheduling don't touch the payment.
- A failed booking insert (time taken) leaves no payment. Deleting the organization removes its payments.
- The DB rejects a second payment for the same booking and an unknown status or provider.

**Done when:**
- The migration applies on the dev DB, and `psql service=sinwy_ro -c "select status, count(*) from payment group by 1 limit 10"` shows the backfill matches the priced bookings.
- `bun run verify` passes.

**Verify:** Seed `bookable-org`. As the owner, create a manual booking for "Haircut" on `/dashboard/<slug>/bookings/new`: one `payment` row appears, `pending`, `2500 EUR`, `manual`. Cancel that booking from its detail page: the row becomes `void`. Nothing in the payments UI changes yet. No external services are involved.

### Log (2026-11-04, `feat(backend): add the payment table and sync it with bookings`)
- Shipped: `payment` table (`db/schema/paymentSchema.ts`) with the unique `bookingId`, `(provider, providerRef)` and `(organizationId, createdAt)` indexes and the status, provider, amount and `paid_at` checks; migration `0023_payments.sql` with the backfill; `@paymentsModule` exposing `createBookingPayment` and `voidBookingPayment`, called from `insertBookingIfFree` and `changeBooking`; shared `PAYMENT_STATUSES` and `PAYMENT_PROVIDERS`; `Tx` exported from `@db` and its three copies removed. Tests in `modules/bookings/tests/payments.test.ts` cover every item in "Tests that matter", plus `paid` without `paidAt` being rejected.
- Differs from plan: the sync tests live in the bookings module, not in payments, so no payments file imports `@bookingsModule`. Payment timestamps are `timestamptz`, while `booking.created_at` is a UTC `timestamp`, so the backfill converts it with `AT TIME ZONE 'UTC'`. The dev DB backfill produced 18 `pending` and 14 `void` payments for 32 priced bookings (14 of them cancelled). Every row matches its booking's amount, currency and `created_at`.
- Checked in the running app: on seeded `bookable-org` (`seed-182d7175`), a manual Haircut booking made in the dashboard created one `pending` 2500 EUR `manual` payment. Cancelling it from the detail page set the payment to `void` in the same transaction. The payments page placeholder is unchanged, and the server, web and console logs were clean. Not checked in the browser: self-booking, the bulk cancellations and paid payments (covered by the tests). The dev servers are still running (logs in `/tmp/sinwy-server.log` and `/tmp/sinwy-web.log`) for phase 5 to stop.

## Phase 2: Payments API and permission

**Goal:** The org and customer endpoints return payments, totals, CSV and receipt detail, and owners and admins can mark a pending payment as paid.

**Files:**
- `Sinwy.Shared/types/access/Permission.ts:8` (`payments: ["read", "write"]`), `RolePermissions.ts` (admin list, `payments:read` at L16; add `payments:write`), and `Sinwy.Backend/modules/auth/tests/permissions.test.ts` (owner L20, admin L39).
- `Sinwy.Shared/types/payment/` (has `PaymentStatus.ts` and `index.ts`): add `Payment.ts` (`PaymentDto`, `PaymentListDto` with `items`, `total`, `totals`, `CustomerPaymentDto`, `CustomerPaymentDetailDto`, `PAYMENT_LIMITS`) and `PaymentSchema.ts` (`paymentListQuerySchema` with `from`/`to` local dates, ordered refine, `page`/`pageSize`; `paymentExportQuerySchema`; `customerPaymentListQuerySchema`), exported from `index.ts`.
- `Sinwy.Shared/types/api/ApiResponse.ts`: `PAYMENT_STATUS_CHANGE_NOT_ALLOWED: 40923`.
- `Sinwy.Backend/modules/payments/`: `repository.ts` (has `createBookingPayment` and `voidBookingPayment`; add the queries), `service.ts`, `controller.ts`, `routes.ts`, `csv.ts` if it grows, `index.ts`, and `tests/`. Schema in `db/schema/paymentSchema.ts`.
- `Sinwy.Backend/modules/bookings/utils.ts:9-38` (`startOfLocalDate`, `localDateRange`, `addDaysToDate`): move to a `Sinwy.Backend/lib/` util and update the imports in `bookings/service.ts:77-81` and `bookings/tests/utils.test.ts:2`.
- `Sinwy.Backend/index.ts` (imports L7, registrations L25): register `registerPaymentRoutes` and `registerAccountPaymentRoutes`.
- `docs/org-rules-map.md`: add a payments section and the "Enforced in" paths.

**Steps:**
- Org routes:
  - `GET organizationPath("payments")` (`payments:read`)
  - `GET organizationPath("payments/export")` (`payments:read`)
  - `POST organizationPath("payments/:paymentId/mark-paid")` (`payments:write`)
- Account routes (`requireAuth`): `GET /api/account/payments` and `GET /api/account/payments/:paymentId`.
- With no `from`/`to`, the org list defaults to the first day of the current month through today, both in the org's timezone, resolved through `getOrganizationLocale` and `todayIn`. The response echoes the resolved `from`/`to` so the UI can fill its inputs.
- Totals come from one grouped query over the same filter: `sum(amount) filter (where status = 'paid')`, the same for `pending`, and `count(*) filter (where status <> 'void')`, grouped by currency.
- The list DTO joins `booking` (customer name, `startsAt`) and `service` (name). The customer DTO joins `organization` (name, slug) and the org timezone for formatting. Never return Drizzle rows.
- Mark as paid: refuse with `inactive` when `membership.status !== "active"`. Lock and update with `where id = ? and organization_id = ? and status = 'pending'`. Zero rows means not-found if the payment doesn't exist in this org, and `PAYMENT_STATUS_CHANGE_NOT_ALLOWED` (409) otherwise.
- The CSV response carries `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="…"`. Quote every field and escape `"`. Prefix cells that start with `=`, `+`, `-` or `@` with `'` to block formula injection, since customer names are user input.
- The customer detail returns 404 unless `booking.customerUserId` is the session user, and also 404 for `void` payments.

**Tests that matter:**
- Scoping: another org's payment never shows up in the list or export, and can't be marked paid (404). Another user's payment detail returns 404. A manual booking carrying the customer's email doesn't appear in their list.
- Permissions: staff get 403 on list, export and mark-paid. Admins can mark as paid.
- Mark as paid sets `paid` and `paidAt`. A second call, or a call on a `void` payment, returns 409 with the new code. An inactive org gets `ORGANIZATION_INACTIVE`.
- The date range is org-local and inclusive: a payment created at 23:30 local time on the `to` date is included, and one at 00:30 the next day is not. Totals ignore pagination and `void` rows and split by currency.
- The CSV has a header, one line per payment in the range, escaped quotes, and neutralised formula cells.

**Done when:**
- The endpoints answer as above, `org-rules-map.md` describes the payment rules, and `bun run verify` passes.

**Verify:** Seed `bookable-org` and `user`. Log in as the customer and book "Haircut" on `/<slug>/book`. Then, with the owner's cookie:
1. `GET /api/organizations/<id>/payments` lists one `pending` row, and its totals show `pendingMinor: 2500`.
2. `POST …/payments/<paymentId>/mark-paid` sets the DB row to `paid` with `paid_at` set. A second call returns 409.
3. `GET …/payments/export` downloads a CSV with that row.
4. As the customer, `GET /api/account/payments` and `GET /api/account/payments/<paymentId>` return it.

Booking emails go to the local outbox. No external services are involved.

### Log (2026-11-05, `feat(backend): add the payments API and the payments:write permission`)
- Shipped: `payments:write` (owner and admin) and `PAYMENT_STATUS_CHANGE_NOT_ALLOWED: 40923`. Shared `Payment.ts` (`PaymentDto`, `PaymentTotalsDto`, `PaymentListDto`, `CustomerPaymentDto`, `CustomerPaymentListDto`, `CustomerPaymentDetailDto`, `PAYMENT_LIMITS`) and `PaymentSchema.ts` (list, export and customer list queries). The payments module gained `service.ts`, `controller.ts`, `routes.ts`, `csv.ts` and the list, count, grouped totals, mark-paid and customer queries in `repository.ts`, and its routes are registered in `index.ts`. `startOfLocalDate`, `localDateRange` and `addDaysToDate` moved to `Sinwy.Backend/lib/localDate.ts`, with their test in `lib/tests/localDate.test.ts`. `org-rules-map.md` has a new §14 Payments (Known gaps is §15), and the roles and inactive-org sections mention payments. The 11 tests in `modules/payments/tests/payments.test.ts` cover every item in "Tests that matter", plus a reversed range (400), a void-only currency missing from the totals, and an unauthenticated account request (401).
- Differs from plan: the list DTO also echoes `from`/`to`. When only one end of the range is given, `to` defaults to today and `from` to the 1st of `to`'s month. Mark as paid is a single conditional `UPDATE … WHERE status = 'pending'` rather than a `SELECT … FOR UPDATE`; when it updates nothing, an existence check decides between 404 and 409. The CSV header uses capitalised column names and CRLF line endings, and amounts use the currency's own decimals (`Intl`), so `25.00` for EUR and `0` decimals for JPY. Totals leave out a currency whose payments in the range are all void.
- Checked in the running app: the phase 1 dev servers had stopped, so they were restarted. On a fresh `bookable-org` (`seed-f38dbb3a`), the customer booked Haircut on `/<slug>/book` in the browser, which created a `pending` 2500 EUR payment. With the owner's cookie, the list returned it with `pendingMinor: 2500` and the default range 2026-11-01 to 2026-11-05. Mark as paid set `paid` and `paid_at` in the DB, and a second call returned 409 with 40923. The export returned the CSV with the right headers and the row in org-local ISO times. The customer list and detail returned it. The customer got 404 on org routes, the owner got 404 on the customer's detail, and a request without a cookie got 401. The server, web and console logs were clean. Not checked in the running app: the staff 403 and the inactive-org refusal (both covered by the tests).
