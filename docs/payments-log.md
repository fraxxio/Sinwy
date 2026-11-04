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
