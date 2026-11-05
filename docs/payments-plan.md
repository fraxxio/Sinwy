# Payments plan

A records-only payments MVP. Every priced booking gets a payment row. The org sees the rows on `/payments` with a date-range filter, totals and a CSV export, and can mark them as paid. Customers see receipts at `/account/payments`. No money moves: Stripe Connect ([booking-payments-decision.md](booking-payments-decision.md)) attaches later as another `provider` value on the same table.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [payments-log.md](payments-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Payment table and booking sync | – | done | `feat(backend): add the payment table and sync it with bookings` |
| 2 | Payments API and permission | 1 | done | `feat(backend): add the payments API and the payments:write permission` |
| 3 | Org payments page | 2 | todo | |
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
- The API (phase 2 log): `GET /api/organizations/<id>/payments?from&to&page&pageSize` returns `PaymentListDto` (`items`, `total`, `totals[]` of `{currency, paidMinor, pendingMinor, count}`, and the resolved `from`/`to`, which default to the 1st of the month through today in the org timezone). `GET …/payments/export?from&to` returns the CSV. `POST …/payments/<id>/mark-paid` returns the updated `PaymentDto`, or 409 with `PAYMENT_STATUS_CHANGE_NOT_ALLOWED` (40923) / `ORGANIZATION_INACTIVE` (4091). `GET /api/account/payments?page` returns `CustomerPaymentListDto`, and `GET /api/account/payments/<id>` returns `CustomerPaymentDetailDto` (adds `customerName`; `organization` has `name`, `slug`, `timezone`). Types and `PAYMENT_LIMITS` (`listPageSize` 25, `customerListPageSize` 20) are in `Sinwy.Shared/types/payment/`.
- `payments:write` is held by owner and admin; staff have neither payments permission (403). Non-members get 404 on org routes, as elsewhere. `docs/org-rules-map.md` §14 describes the payment rules (Known gaps is now §15).
- CSV cells are all quoted, and dates are ISO with the org offset (`2026-11-05T17:44:19+02:00`), so a frontend test of the export only needs to build the URL.
- `payment` timestamps are `timestamptz`, but `booking.created_at` is a UTC `timestamp`; the backfill converts it with `AT TIME ZONE 'UTC'`. Migration `Sinwy.Backend/drizzle/0023_payments.sql` (phase 5 reviews it).
- Inactive orgs can't open the org dashboard at all: the shell redirects them. The UI needs no inactive check; the backend refusal plus `handleOrganizationInactive` (`src/shared/lib/auth/organization-inactive.ts`, reacts to 4091) is the backstop.
- Frontend shared vs module split: `src/shared/components/booking/BookingStatusBadge.tsx` (shared badge and labels) vs `src/modules/*/components/bookings/`. `src/shared/` must never import from `src/modules/`. Money is formatted with `formatMinorUnits` (`src/shared/lib/money.ts`), and dates with `formatDateIn` and `formatTimeIn` (`src/shared/lib/date.ts`).
- The frontend API client `api` (`src/shared/lib/api.ts`) parses JSON only. In the browser `/api` is same-origin with the cookie, so the CSV can be downloaded with a plain link or `window.location.assign("/api/…/payments/export?…")`.
- Query and search patterns to copy: `src/modules/org-dashboard/lib/booking-queries.ts` and `booking-search.ts` (`validateSearch` in `_shell.bookings.index.tsx:44`). The date inputs are in `components/bookings/BookingFilters.tsx` (L182, L197, `type="date"`). Permission checks in the UI use `hasPermission(member.roles, "…")`, as in `_shell.bookings.$id.tsx:53`. The payments nav item and its `payments:read` guard already exist (`lib/sections.ts:24`).
- The phase 1 servers had stopped; phase 2 restarted them (`bun run start:server` on :3001, `bun run start:web` on :3000, logs `/tmp/sinwy-server.log`, `/tmp/sinwy-web.log`). Reuse them; phase 5 stops them. Seeded by phase 2: `bookable-org` `seed-f38dbb3a` (owner `webdevrokas+seed-f38dbb3a-owner@gmail.com`) and customer `webdevrokas+seed-02e0ef19-user@gmail.com`, with one Haircut payment already `paid`. Sessions come from `bun run dev:login-as`.
- Seeds: `bun run dev:seed-scenario bookable-org` creates an active org (Europe/Vilnius, "Haircut" €25 auto-confirmed, "Colouring" €80 needs approval) but no bookings; `bun run dev:seed-scenario user` creates a customer. Bookings created through the UI or API get their payment automatically. After 17:00 Vilnius time today has no free slots; book the next day.

---

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

---

## Phase 4: Customer receipts

**Goal:** `/account/payments` lists the customer's payments, and `/account/payments/$paymentId` shows a printable receipt.

**Files:**
- `Sinwy.WebFrontend/src/modules/account-dashboard/lib/payment-queries.ts` (new; copy `booking-queries.ts`).
- `Sinwy.WebFrontend/src/modules/account-dashboard/components/payments/` (new): `CustomerPaymentList.tsx` and `Receipt.tsx`.
- `Sinwy.WebFrontend/src/modules/account-dashboard/routes/`: mirror the bookings split (`_shell.bookings.tsx` layout, `_shell.bookings.index.tsx` list, `_shell.bookings.$id.tsx` detail). The `_shell.payments.tsx` stub becomes the layout, and `_shell.payments.index.tsx` and `_shell.payments.$paymentId.tsx` are new.
- The print CSS lives in `Sinwy.WebFrontend/src/styles.css`, or comes from Tailwind `print:` variants on the account shell (`src/shared/components/shell/`). Hide the sidebar, header and notice.
- `Sinwy.WebFrontend/src/shared/components/payment/` (from phase 3).

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
