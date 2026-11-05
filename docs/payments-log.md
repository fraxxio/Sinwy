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

## Phase 3: Org payments page

**Goal:** `/dashboard/<slug>/payments` shows the notice, the date-range filter, the totals, the transaction table with status badges and "Mark as paid", and a CSV download.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/ui/alert.tsx` (new, via the shadcn MCP or CLI; `alert-dialog.tsx`, `card.tsx`, `table.tsx`, `badge.tsx` already exist).
- `Sinwy.WebFrontend/src/shared/components/payment/` (new): `PaymentStatusBadge.tsx` (with `PAYMENT_STATUS_LABELS: Record<PaymentStatus, …>`, like `shared/components/booking/BookingStatusBadge.tsx`) and `PaymentsNotice.tsx` (an `audience: "organization" | "customer"` prop, `print:hidden`).
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/payment-queries.ts` and `payment-search.ts` (new; copy `booking-queries.ts` and `booking-search.ts`). Types come from `@sinwy/shared` (`PaymentListDto`, `PaymentDto`, `PAYMENT_LIMITS`).
- `Sinwy.WebFrontend/src/modules/org-dashboard/components/payments/` (new): `PaymentFilters.tsx` (date inputs as in `components/bookings/BookingFilters.tsx`), `PaymentTotals.tsx`, `PaymentsTable.tsx` and `MarkPaidDialog.tsx`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.payments.tsx` (replace the stub; it already has the `payments:read` `beforeLoad` and crumb).
- `Sinwy.WebFrontend/src/modules/org-dashboard/tests/` (new `payment-search.test.ts`, next to `booking-search.test.ts`).

**Steps:**
- The search params are `from`, `to` and `page`, validated with zod. When they're missing, the page shows the range the API returned.
- Totals are one card per currency: Collected (paid), Outstanding (pending) and the payment count.
- Table columns: created, customer, service, appointment, amount, status badge, paid on, and an actions column. The row links to the booking detail.
- "Mark as paid" shows only on `pending` rows when `hasPermission(member.roles, "payments:write")`. It uses `alert-dialog`. On success, invalidate the list query. On error, run it through `handleOrganizationInactive` first, then show a toast.
- The "Export CSV" button points to `/api/organizations/<id>/payments/export?from&to` as a download link.
- The notice always sits under the `PageHeader`. When the range has no payments, `EmptyState` sits under the notice.

**Tests that matter:**
- Unit tests in `src/modules/org-dashboard/tests/` for the search schema defaults and the export URL builder.
- Badge labels cover every `PAYMENT_STATUSES` value, enforced as a `Record<PaymentStatus, …>`.

**Done when:**
- The page renders all parts with seeded data, the button is hidden for admins without `payments:write` (none exist) and for staff, who can't open the page at all, and `bun run verify` passes.

**Verify:** Seed `bookable-org` and `user`. As the customer, book "Haircut" and "Colouring". As the owner, open `/dashboard/<slug>/payments`:
1. The notice is shown, with two rows (Haircut `pending` €25, Colouring `pending` €80) and Outstanding €105.
2. Mark Haircut as paid. The badge turns green, Collected shows €25, Outstanding €80, and the DB row is `paid`.
3. Set a range that excludes today. The table is empty with the notice still shown.
4. Click Export CSV. The file downloads with the rows in range.
5. Cancel the Colouring booking from bookings. Back on payments it shows `void`, and Outstanding is €0.

Log in as staff (`org-with-staff`): the Payments nav item is hidden and the route is refused. Nothing is simulated.

### Log (2026-11-05, `feat(web): add the org payments page`)
- Shipped: `ui/alert.tsx` (shadcn), shared `payment/PaymentStatusBadge.tsx` (`PAYMENT_STATUS_LABELS`, `PAYMENT_PROVIDER_LABELS`) and `payment/PaymentsNotice.tsx` (`role="note"`, `print:hidden`). In `org-dashboard`: `lib/payment-search.ts` (schema, `changeRange`, `paymentsPath`, `paymentsExportUrl`), `lib/payment-queries.ts` (`paymentKeys`, `paymentListQuery`, `markPaymentPaid`), and `components/payments/` (`PaymentFilters`, `PaymentTotals`, `PaymentsTable`, `MarkPaidDialog`). `_shell.payments.tsx` replaces the stub. `tests/payment-search.test.ts` has 7 tests: schema defaults and fallbacks, a reversed or one-sided range, `changeRange`, the export URL, and a label for every status.
- Differs from plan: the filters sit between the notice and the EmptyState, so an empty range can still be changed. The totals cards are hidden when the range is empty. Export CSV is a plain `<a download>` with `buttonVariants`, so it keeps the link role (the Base UI `Button` with `render` gave it `role="button"`). The file name comes from the server's `Content-Disposition` (`payments-<from>-to-<to>.csv`). The org timezone comes from `availabilityQuery`, as on the bookings pages. Mark-paid errors go through `useUnwrapWrite`, which runs `handleOrganizationInactive` first. The e2e run found that typing a From after To got a 400 and left the page with only the error. Now `changeRange` moves the other end along, and the schema clears a reversed or one-sided range. TanStack Router merges each route's validated search over the parent's raw URL params, so the schema has to set `from`/`to` to `undefined`; leaving the keys out keeps them.
- Checked in the running app (e2e subagent, fresh `bookable-org` `seed-ac470bf6`, customer `webdevrokas+seed-4587e97f-user@gmail.com`, `org-with-staff` `seed-ab1d5b8d`): all five Verify steps passed. The Colouring request was cancelled with Decline, since a pending request has no "Cancel booking". The CSV was captured as a download, with header-only output for an empty range. Day-boundary ranges were checked with curl, and the export returned 401 without a cookie. Staff had no nav item, were redirected away from the route and got 403 from the API. Console and server logs were clean. The reversed-range fix was rechecked inline in the browser. Not checked: CSV download in Firefox or Safari (headless Chromium only).

## Phase 4: Customer receipts

**Goal:** `/account/payments` lists the customer's payments, and `/account/payments/$paymentId` shows a printable receipt.

**Files:**
- `Sinwy.WebFrontend/src/modules/account-dashboard/lib/payment-queries.ts` (new; copy `lib/booking-queries.ts`). Put the receipt heading and number helpers in a small `lib/receipt.ts`, tested in `tests/receipt.test.ts` (next to `customer-booking.test.ts`).
- `Sinwy.WebFrontend/src/modules/account-dashboard/components/payments/` (new): `CustomerPaymentList.tsx` (copy `components/bookings/CustomerBookingList.tsx`) and `Receipt.tsx`.
- `Sinwy.WebFrontend/src/modules/account-dashboard/routes/`: mirror the bookings split (`_shell.bookings.tsx` layout, `_shell.bookings.index.tsx` list with `BOOKING_LIMITS.customerListPageSize` at L39, `_shell.bookings.$id.tsx` detail). The `_shell.payments.tsx` stub becomes the layout, and `_shell.payments.index.tsx` and `_shell.payments.$paymentId.tsx` are new.
- Print: Tailwind `print:hidden` on the sidebar and header in `src/shared/components/shell/AppShell.tsx` (or print CSS in `src/styles.css`).
- `Sinwy.WebFrontend/src/shared/components/payment/` (from phase 3; reuse as is).

**Steps:**
- List columns: date, business, service, amount and status badge. Each row links to the detail. Pagination works like the customer bookings list.
- The receipt shows the business name, receipt number, customer name, service, appointment (in the org timezone), amount, status, paid on and provider label. The heading changes with the status.
- The "Print" button calls `window.print()` and is itself `print:hidden`.
- The notice shows on the list page and the detail page.

**Tests that matter:**
- A unit test for the receipt heading and receipt number helper: paid vs pending, and the 8-character uppercase id.

**Done when:**
- Both routes render with seeded data, the print preview shows only the receipt, and `bun run verify` passes.

**Verify:** Seed `bookable-org` and `user`. As the customer, book "Haircut". As the owner, mark it as paid on `/dashboard/<slug>/payments`. As the customer:
1. Open `/account/payments`. The notice and one row are shown, with a green Paid badge.
2. Open the row. The heading reads "Receipt", and the business, service, €25 and paid date are shown.
3. Print preview (Playwright `page.emulateMedia({ media: "print" })` with a screenshot) shows no sidebar, notice or Print button.
4. Book "Colouring". Its detail reads "Payment summary · Not paid yet".
5. Opening another user's payment id shows not found.

Nothing is simulated.

### Log (2026-11-05, `feat(web): add the customer payments list and receipt`)
- Shipped: in `account-dashboard`: `lib/payment-queries.ts` (`accountPaymentKeys`, `accountPaymentsQuery`, `accountPaymentQuery` returning null on 404), `lib/receipt.ts` (`receiptHeadingOf`, `receiptNumberOf`) with `tests/receipt.test.ts`, `components/payments/CustomerPaymentList.tsx` and `Receipt.tsx`. `_shell.payments.tsx` is now the layout (crumb "Payments"), with `_shell.payments.index.tsx` (list, notice, `page` search like bookings) and `_shell.payments.$paymentId.tsx` (heading from `receiptHeadingOf`, `print:hidden` Print button, notice, receipt; "Payment not found" for null). In print, `AppShell`'s header and banner are `print:hidden`, and an unlayered `@media print` rule in `styles.css` hides `[data-slot="sidebar"]`.
- Differs from plan: the list's date column is the appointment start in the org timezone, the same as the bookings list; rows are still ordered by `createdAt desc`. The receipt shows "Payment method" (the provider label) only when the payment is paid, since "Paid at the business" would be wrong on a pending payment. For pending payments, "Paid on" reads "Not paid yet" and the total reads "Amount due". Any status other than paid or pending gets the heading "Payment summary"; void is never shown, because the customer endpoints return 404 for it. The detail crumb is "Payment" so it fits pending and not-found pages too. The e2e run found the sidebar still showing in print at widths of 768px or more: a print rule inside `@layer base` loses to the sidebar's `md:block` utility. The rule now sits outside any layer.
- Checked in the running app (e2e subagent; fresh `bookable-org` `seed-64cf6437`, customer `webdevrokas+seed-b4727f33-user@gmail.com`): steps 1, 2, 4 and 5 passed. Another user's payment and an unknown id show "Payment not found", and the API returns 404 for both. Step 3 failed at first (sidebar in print). After the fix, I reproduced it and rechecked it inline with system Chromium: at 1280px wide in print media, the sidebar, header, notice and Print button all compute to `display: none`, and the screenshot shows only the receipt. Console and server logs were clean apart from the expected 404s. Not checked: a real print dialog or PDF render, and Firefox or Safari.
