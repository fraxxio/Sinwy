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
| 5 | Code review and cleanup | 3, 4 | done | `fix(backend): neutralise tab-led CSV cells and test outsider payment access` |

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

All phases are done. Before Stripe Connect work, read the deferred list in Decisions and the phase 5 log entry for the cleanup still owed.
