# Payments plan

A records-only payments MVP. Every priced booking gets a payment row. The org sees the rows on `/payments` with a date-range filter, totals and a CSV export, and can mark them as paid. Customers see receipts at `/account/payments`. No money moves: Stripe Connect ([booking-payments-decision.md](booking-payments-decision.md)) attaches later as another `provider` value on the same table.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [payments-log.md](payments-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Payment table and booking sync | – | done | `feat(backend): add the payment table and sync it with bookings` |
| 2 | Payments API and permission | 1 | todo | |
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

- Payments are created and voided only by the bookings repository (`insertBookingIfFree`, `changeBooking`); the sync tests are in `modules/bookings/tests/payments.test.ts`. Payments tests must not import `@bookingsModule` either: insert `booking` and `payment` rows directly through `@db/schema` (raw booking inserts get no payment).
- `payment` timestamps are `timestamptz`, but `booking.created_at` is a UTC `timestamp`; the backfill converts it with `AT TIME ZONE 'UTC'`. The `payment_paid_at_check` rejects `paid` without `paidAt` (and `paidAt` on any other status), so mark-paid must set both in one update.
- `Tx` is exported from `@db` (`import db, { type Tx } from "@db"`).
- Status checks use `oneOf(column, values)` from `@db/oneOf`, built from the shared constant lists. Renaming a value needs a data migration.
- Migrations are `bun run db:generate` then `bun run db:migrate`, with files in `Sinwy.Backend/drizzle/` (latest `0023_payments.sql`). Backfill SQL is appended by hand to the generated file. The test DB is built with `drizzle-kit push` (`test/setup.ts`), so tests never run migration SQL.
- Module aliases are declared in both `Sinwy.Backend/import_map.json` and `Sinwy.Backend/tsconfig.json` (`@paymentsModule` exists). Routes are registered in `Sinwy.Backend/index.ts` (around lines 7 and 25).
- Org-local date ranges: `localDateRange(from, to, timezone)` (with `startOfLocalDate` and `addDaysToDate`) is in `modules/bookings/utils.ts:30`, used by bookings `service.ts:79`. Exporting it through the bookings index would make payments import `@bookingsModule`, so it moves to a backend `lib/` util. `todayIn` comes from `@servicesModule` and `getOrganizationLocale` from `@organizationsModule`.
- The controller pattern lives in `modules/bookings/controller.ts`: a `respondError` switch (L46), `parseQuery` (L111), and `membershipFrom(c)` from `@authModule` for the org scope. `sessionFrom` gives the account user. `Handler` returns a plain `Response` (`lib/app/types.ts:15`), so the CSV handler can return `new Response(csv, { headers })` directly.
- Route guards look like `[requireAuth, requirePermission("bookings:read")]` with `organizationPath("…")` from `@authModule`. Account routes use `[requireAuth]` under `/api/account/...`.
- Error codes are in `Sinwy.Shared/types/api/ApiResponse.ts` (`API_ERROR_CODES`, latest `BOOKING_CANCELLATION_WINDOW_PASSED: 40922`). `ORGANIZATION_INACTIVE: 4091` is what the shell's `handleOrganizationInactive` (`src/shared/lib/auth/organization-inactive.ts`) reacts to.
- Permissions: `PERMISSION_STATEMENTS` in `Sinwy.Shared/types/access/Permission.ts` (`payments: ["read"]`) and `ROLE_PERMISSIONS` in `RolePermissions.ts`. Owner gets `[...PERMISSIONS]` automatically. `Sinwy.Backend/modules/auth/tests/permissions.test.ts` pins the exact owner and admin lists (L11, L30).
- Inactive orgs can't open the org dashboard at all: the shell redirects them. The UI needs no inactive check; the backend refusal plus `handleOrganizationInactive` is the backstop.
- Frontend shared vs module split: `src/shared/components/booking/BookingStatusBadge.tsx` (shared badge and labels) vs `src/modules/*/components/bookings/`. `src/shared/` must never import from `src/modules/`. Money is formatted with `formatMinorUnits` (`src/shared/lib/money.ts`), and dates with `formatDateIn` and `formatTimeIn` (`src/shared/lib/date.ts`).
- The frontend API client `api` (`src/shared/lib/api.ts`) parses JSON only. In the browser `/api` is same-origin with the cookie, so the CSV can be downloaded with a plain link or `window.location.assign("/api/…/payments/export?…")`.
- Query and search patterns to copy: `src/modules/org-dashboard/lib/booking-queries.ts` and `booking-search.ts` (`validateSearch` in `_shell.bookings.index.tsx:44`). The date inputs are in `components/bookings/BookingFilters.tsx` (L182, L197, `type="date"`). Permission checks in the UI use `hasPermission(member.roles, "…")`, as in `_shell.bookings.$id.tsx:53`.
- Phase 1 left the backend and web dev servers running (logs `/tmp/sinwy-server.log`, `/tmp/sinwy-web.log`) and a seeded `bookable-org` (`seed-182d7175`). Reuse them; phase 5 stops them.
- Seeds: `bun run dev:seed-scenario bookable-org` creates an active org (Europe/Vilnius, "Haircut" €25 auto-confirmed, "Colouring" €80 needs approval) but no bookings; `bun run dev:seed-scenario user` creates a customer. Bookings created through the UI or API get their payment automatically.

---

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

---

## Phase 3: Org payments page

**Goal:** `/dashboard/<slug>/payments` shows the notice, the date-range filter, the totals, the transaction table with status badges and "Mark as paid", and a CSV download.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/ui/alert.tsx` (new, via the shadcn MCP or CLI).
- `Sinwy.WebFrontend/src/shared/components/payment/` (new): `PaymentStatusBadge.tsx` (with `PAYMENT_STATUS_LABELS`) and `PaymentsNotice.tsx` (an `audience: "organization" | "customer"` prop, `print:hidden`).
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/payment-queries.ts` and `payment-search.ts` (new; copy the booking ones).
- `Sinwy.WebFrontend/src/modules/org-dashboard/components/payments/` (new): `PaymentFilters.tsx`, `PaymentTotals.tsx`, `PaymentsTable.tsx` and `MarkPaidDialog.tsx`.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.payments.tsx` (replace the stub).

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
