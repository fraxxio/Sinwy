# Payments plan

A records-only payments MVP. Every priced booking gets a payment row. The org sees the rows on `/payments` with a date-range filter, totals and a CSV export, and can mark them as paid. Customers see receipts at `/account/payments`. No money moves: Stripe Connect ([booking-payments-decision.md](booking-payments-decision.md)) attaches later as another `provider` value on the same table.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [payments-log.md](payments-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Payment table and booking sync | – | done | `feat(backend): add the payment table and sync it with bookings` |
| 2 | Payments API and permission | 1 | done | `feat(backend): add the payments API and the payments:write permission` |
| 3 | Org payments page | 2 | done | `feat(web): add the org payments page` |
| 4 | Customer receipts | 2 | done | `feat(web): add the customer payments list and receipt` |
| 5 | Code review and cleanup | 3, 4 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Rows come from bookings.** Every booking with `priceMinor > 0` gets one `pending` payment with `provider = "manual"` and the booking's amount and currency. Free bookings get none.
- **Statuses are `pending | paid | void | refunded`.** `refunded` exists in the enum and check but nothing sets it yet. There is no `failed` status.
- **The payment follows the booking.** Cancelling a booking voids a `pending` payment. A `paid` payment stays `paid`; refunds are a later ticket. `no_show` and `completed` leave the payment alone.
- **Same transaction.** The bookings repository calls the payments module inside `insertBookingIfFree` and `changeBooking`. The dependency goes one way, bookings → payments. The payments repository reads `booking` and `service` through joins.
- **No provider abstraction.** `provider` is a checked text column (`["manual"]`) and `providerRef` is nullable, with a unique index on `(provider, providerRef)`. There is no adapter interface.
- **Mark as paid.** `pending` → `paid` sets `paidAt`. Only `pending` rows can change (409 otherwise). It needs the new `payments:write` permission, held by owner and admin only. It is a row action on the org payments page behind a confirm dialog. There is no undo, and the booking detail page is untouched.
- **Inactive org.** The list, totals and CSV stay readable. Mark as paid is refused with "organization inactive", like booking writes.
- **Org list.** `from`/`to` are org-local inclusive dates that filter on the payment's `createdAt`; the default is the current month. Pagination works like bookings (`page`/`pageSize`), sorted by `createdAt desc`. Totals cover the whole filtered range, grouped by currency (`paidMinor`, `pendingMinor`, `count`), with `void` excluded. There are no status or text filters.
- **CSV export is a server endpoint** for the same range, without pagination. Columns: created, paid on, customer, service, appointment, amount, currency, status, provider, reference.
- **Customer view.** Payments are scoped by `booking.customerUserId`. The list shows every non-void payment, newest first, paginated, with no filter or totals. The detail at `/account/payments/$paymentId` is printable with `window.print()`. Its heading is "Receipt" when `paid` and "Payment summary · Not paid yet" when `pending`. The receipt number is the first 8 characters of the id, uppercased. There is no PDF and no email.
- **The notice is always shown**, with no flag, on both pages, above the empty state, and hidden in print. The copy:
  - Org: "Online payments aren't set up yet. Sinwy doesn't charge your customers. Each booking with a price is listed here as pending. Mark it as paid once you've taken payment at your business."
  - Customer: "Payments aren't taken online yet. You pay the business directly. This page lists what's due and what the business has marked as paid."
- **Backfill.** The migration inserts a payment for every existing booking with `price_minor > 0`: `void` if the booking is cancelled, `pending` otherwise, with `created_at` taken from the booking. A unique index on `bookingId` makes it one payment per booking.
- **Deletion.** Both foreign keys (`organizationId`, `bookingId`) are `ON DELETE CASCADE`. Customer account deletion leaves payments alone.
- **Deferred:** provider adapter, `failed`, refunds, undo, staff access, payment status on booking detail, status and text filters, PDF and email receipts, deposits and split payments.

### Defaults (not yet confirmed; change only if asked)

1. Badge tones: pending amber, paid green, void and refunded muted. Provider label: `manual` reads "Paid at the business".
2. Error code `PAYMENT_STATUS_CHANGE_NOT_ALLOWED` for the 409 on mark-paid of a non-pending row.
3. The CSV file is named `payments-<from>-to-<to>.csv`. Amounts are written in major units with a dot decimal (`25.00`) and dates as ISO in the org timezone.
4. The customer list uses a fixed page size (`PAYMENT_LIMITS.customerListPageSize`, 20) like `BOOKING_LIMITS.customerListPageSize`.
5. The notice is a new shadcn `alert` component in `src/shared/components/ui/` (none exists yet).

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- Payments are created and voided only by the bookings repository (`insertBookingIfFree`, `changeBooking`); the sync tests are in `modules/bookings/tests/payments.test.ts`, the API tests in `modules/payments/tests/payments.test.ts` (rows inserted directly through `@db/schema`; payments never imports `@bookingsModule`).
- The API (phase 2 log): `GET /api/organizations/<id>/payments?from&to&page&pageSize` returns `PaymentListDto`, `GET …/payments/export?from&to` the CSV, `POST …/payments/<id>/mark-paid` the updated `PaymentDto` or 409 (`PAYMENT_STATUS_CHANGE_NOT_ALLOWED` 40923 / `ORGANIZATION_INACTIVE` 4091). `GET /api/account/payments?page` returns `CustomerPaymentListDto`, and `GET /api/account/payments/<id>` returns `CustomerPaymentDetailDto` (adds `customerName`; `organization` has `name`, `slug`, `timezone`, so the receipt needs no other query). Types and `PAYMENT_LIMITS` (`customerListPageSize` 20) are in `Sinwy.Shared/types/payment/`.
- `payments:write` is held by owner and admin; staff have neither payments permission (403). `docs/org-rules-map.md` §14 describes the payment rules (Known gaps is §15).
- `payment` timestamps are `timestamptz`, but `booking.created_at` is a UTC `timestamp`; the backfill converts it with `AT TIME ZONE 'UTC'`. Migration `Sinwy.Backend/drizzle/0023_payments.sql` (phase 5 reviews it).
- Customer pages scope only through the API: void payments and other users' ids both get 404, which the detail page shows as "Payment not found" (phase 4 log). Print hiding is `print:hidden` on `AppShell`'s header and banner plus an unlayered `@media print` rule for `[data-slot="sidebar"]` in `styles.css`. A print rule inside `@layer base` loses to Tailwind utilities.
- Servers: `bun run start:server` on :3001 and `bun run start:web` on :3000 (logs `/tmp/sinwy-server.log`, `/tmp/sinwy-web.log`) were started in phase 2. Reuse them; phase 5 stops them. Seeded: `seed-64cf6437` (owner `webdevrokas+seed-64cf6437-owner@gmail.com`, customer `webdevrokas+seed-b4727f33-user@gmail.com`, Haircut `paid`, Colouring `pending`), `seed-f38dbb3a` (owner `webdevrokas+seed-f38dbb3a-owner@gmail.com`, customer `webdevrokas+seed-02e0ef19-user@gmail.com`, one Haircut `paid`), `seed-ac470bf6` (owner `webdevrokas+seed-ac470bf6-owner@gmail.com`, customer `webdevrokas+seed-4587e97f-user@gmail.com`, Haircut `paid` and Colouring `void`), and `org-with-staff` `seed-ab1d5b8d`. Sessions come from `bun run dev:login-as`.
- Temp files to delete in phase 5: `/tmp/e2e-*` (screenshots, PDFs, cookies, seed JSON, `e2e-p1`/`e2e-p3`/`e2e-scripts` dirs) and the session state files in `.playwright-cli/auth/` (gitignored). The `playwright` package Bun resolves wants a headless shell that isn't installed; scripts need `executablePath: "/run/current-system/sw/bin/chromium"`.

---

## Phase 5: Code review and cleanup

**Goal:** The payments work is reviewed for scoping, permission and money correctness, the findings are fixed, and the plan is closed out.

**Files:**
- Backend: `Sinwy.Backend/modules/payments/` (`repository.ts`: `ownedBy` and the org queries, the totals `filter (where status <> 'void')`; `service.ts`; `controller.ts`; `routes.ts`; `csv.ts`; `tests/payments.test.ts`), the payment calls in `modules/bookings/repository.ts` (`insertBookingIfFree`, `changeBooking`) with `modules/bookings/tests/payments.test.ts`, the migration `Sinwy.Backend/drizzle/0023_payments.sql`, and the `payments:write` permission files.
- Shared: `Sinwy.Shared/types/payment/` (`Payment.ts`, `PaymentSchema.ts`, `PaymentStatus.ts`).
- Frontend: `src/shared/components/payment/`, `src/shared/components/ui/alert.tsx`, `org-dashboard` (`lib/payment-search.ts`, `lib/payment-queries.ts`, `components/payments/`, `routes/_shell.payments.tsx`), `account-dashboard` (`lib/payment-queries.ts`, `lib/receipt.ts`, `components/payments/`, `routes/_shell.payments*.tsx`), the print changes in `src/shared/components/shell/AppShell.tsx` and `src/styles.css`.
- Docs: `docs/org-rules-map.md` §14.

**Steps:**
- Review against the Decisions:
  - every query scoped by org or by `customerUserId`
  - no Drizzle row leaks into the DTOs
  - mark-paid only from `pending`
  - totals exclude `void`
  - CSV escaping
  - payments never imports from `@bookingsModule`
  - the migration backfill is correct
- Fix the findings, then run `bun run verify` once.
- Update `org-rules-map.md` if a review change touched the rules. Move the finished phases to `payments-log.md`.
- Final step: stop every dev server started during the plan's work unless the user asked to keep it running. Delete the temporary files the work created (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- Any missing scoping or permission test the review turns up.

**Done when:**
- The review findings are fixed or recorded as deferred, `bun run verify` passes, the plan shows every phase done, and the leftover processes and files are gone.

**Verify:** None.
