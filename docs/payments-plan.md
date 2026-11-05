# Payments plan

A records-only payments MVP. Every priced booking gets a payment row. The org sees the rows on `/payments` with a date-range filter, totals and a CSV export, and can mark them as paid. Customers see receipts at `/account/payments`. No money moves: Stripe Connect ([booking-payments-decision.md](booking-payments-decision.md)) attaches later as another `provider` value on the same table.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [payments-log.md](payments-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Payment table and booking sync | – | done | `feat(backend): add the payment table and sync it with bookings` |
| 2 | Payments API and permission | 1 | done | `feat(backend): add the payments API and the payments:write permission` |
| 3 | Org payments page | 2 | done | `feat(web): add the org payments page` |
| 4 | Customer receipts | 2 | todo | |
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
- Shared payment UI from phase 3: `PaymentStatusBadge` (`status` prop), `PAYMENT_PROVIDER_LABELS`, and `PaymentsNotice audience="customer"` (already `print:hidden`) in `src/shared/components/payment/`. `src/shared/` must never import from `src/modules/`. Money is formatted with `formatMinorUnits` (`src/shared/lib/money.ts`), and dates with `formatDateIn`, `formatShortDateIn` and `formatTimeIn` (`src/shared/lib/date.ts`).
- Search schemas: TanStack Router merges a route's validated search over the parent's raw URL params, so a schema that drops a key must set it to `undefined`. Bun's `toEqual` ignores `undefined` keys; use `toStrictEqual` to test that (phase 3 log).
- The shadcn CLI (`bunx --bun shadcn@latest add …`) adds a bogus npm `cn` dependency and bumps unrelated lockfile entries. Revert `package.json` and `bun.lock`, and import `cn` from `@/shared/lib/utils` as the other ui files do.
- Servers: `bun run start:server` on :3001 and `bun run start:web` on :3000 (logs `/tmp/sinwy-server.log`, `/tmp/sinwy-web.log`) were started in phase 2. Reuse them; phase 5 stops them. Seeded: `seed-f38dbb3a` (owner `webdevrokas+seed-f38dbb3a-owner@gmail.com`, customer `webdevrokas+seed-02e0ef19-user@gmail.com`, one Haircut `paid`), `seed-ac470bf6` (owner `webdevrokas+seed-ac470bf6-owner@gmail.com`, customer `webdevrokas+seed-4587e97f-user@gmail.com`, Haircut `paid` and Colouring `void`), and `org-with-staff` `seed-ab1d5b8d`. Sessions come from `bun run dev:login-as`.
- Seeds: `bun run dev:seed-scenario bookable-org` creates an active org (Europe/Vilnius, "Haircut" €25 auto-confirmed, "Colouring" €80 needs approval) but no bookings; `bun run dev:seed-scenario user` creates a customer. Bookings made at `/<slug>/book` get their payment automatically. After 17:00 Vilnius time today has no free slots; book the next day. A pending request is cancelled with "Decline", not "Cancel booking".

---

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

---

## Phase 5: Code review and cleanup

**Goal:** The payments work is reviewed for scoping, permission and money correctness, the findings are fixed, and the plan is closed out.

**Files:** Everything under `Sinwy.Backend/modules/payments/`, the changes to `modules/bookings/repository.ts`, the migration, `Sinwy.Shared/types/payment/`, the permission files, the new frontend files, and `docs/org-rules-map.md`.

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
