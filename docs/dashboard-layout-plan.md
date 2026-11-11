# Dashboard layout plan

Redesign the dashboard shell (organization dashboard and personal account) to the simpler layout in the reference image: the sidebar blends into the page canvas with no border, a small breadcrumb row sits at the top, the page title sits on the canvas, and the page content lives in one white window below it. Every dashboard page is moved onto that layout and checked so nothing regresses.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [dashboard-layout-log.md](dashboard-layout-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shell chrome: sidebar, breadcrumb row, page header, window | – | done | `feat(web): restyle the dashboard shell to a borderless sidebar and one window` |
| 2 | Organization dashboard pages in one window | 1 | todo | |
| 3 | Account pages in one window | 2 | todo | |
| 4 | Full regression sweep and cleanup | 3 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Follow the reference image.** `Header above the window.png` in the repo root (2880×1800, a 1440×900 viewport at 2x). The standing notes describe it in words.
- **Smaller breadcrumbs.** The breadcrumb row is reduced in size from today's 64px bar.
- **No sidebar border.** The sidebar has no border or shadow against the page.
- **Sidebar animation unchanged.** Expanding and collapsing behaves exactly as today: same widths, duration, easing, icon-collapsed mode, cookie, shortcut and rail.
- **One window on every page.** Every dashboard page shows its content in a single white window under the page title, including card-grid pages (Overview, Analytics, booking detail), list pages and empty states. Cards inside the window are flattened where card-in-card looks heavy.
- **The whole page scrolls.** The window grows with its content and the document scrolls as today; the sidebar stays fixed. On short pages the window stretches to the bottom of the screen.
- **Every page is checked.** All dashboard pages are verified in the running app; the inventory is in the phases below.

### Defaults (not yet confirmed; change only if asked)

1. Pages own the window: each page renders `PageHeader` followed by one `ContentBox`. The shell does not draw the window (see the SSR note).
2. `ContentBox` is the window component and is restyled to the reference; its two storefront uses inherit the new look.
3. Sidebar widths stay 16rem expanded and 3rem collapsed, although the mock's sidebar looks slightly narrower.
4. Dark mode has no reference: the sidebar takes the canvas colour (`--background`) and the window stays `--card`.
5. The breadcrumb row keeps one height in both sidebar states (today it shrinks from 64px to 48px on collapse); the vertical separator next to the trigger goes, and crumbs are separated by "/" as in the reference.
6. `PageHeader` stacks the description under the title as in the reference (today they sit side by side).
7. The sidebar rail (hover line on the sidebar edge that toggles it) stays.
8. Mobile keeps the sheet sidebar and the same order (breadcrumb row, title, window), with an equal small margin on both sides of the window.
9. The `Card` primitive is not restyled globally; cards are flattened only where they sit inside a window.
10. The payment-failed banner stays a full-width strip under the breadcrumb row.
11. The reference image stays untracked in the repo root: never commit or delete it.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Reference, in CSS px at 1440×900:** sidebar and canvas are the same grey with no divider. Title 24px semibold with a 14px muted description under it; actions right-aligned on the same block. The window starts about 124px from the top, begins where the sidebar ends, has about 8px margin right and bottom, about 16px radius, about 24px inner padding and a white surface. The calendar inside it has no outer border and its Month view fits the screen with the "Times in …" line visible.
- **Paths below are relative to `Sinwy.WebFrontend/src/`.**
- **Shell (done in Phase 1, see the log):** `shared/components/shell/AppShell.tsx` is mounted by exactly two layout routes, `modules/org-dashboard/routes/_shell.tsx` and `modules/account-dashboard/routes/_shell.tsx`. Breadcrumb row: `mt-1 h-12 px-5 md:pl-3`, not sticky. Banner: `sticky top-0 mb-4 bg-background`. Body: `flex flex-1 flex-col gap-4 px-2 pb-2 md:pl-0`, so anything a page renders outside a window touches the sidebar edge on desktop.
- **`PageHeader`** stacks the description under the title, bottom-aligns the action, wraps, and carries the 12px inset itself (`px-3 pb-0.5`). **`ContentBox`** is `flex flex-1 flex-col rounded-lg border bg-card p-6`; a `className` still overrides padding. Bookings uses the default padding; the other pages still pass `p-4` or `gap-4 p-4`.
- **Radius scale:** `--radius` is 1rem, so `rounded-lg` is 16px, `rounded-xl` 22.4px, `rounded-2xl` 28.8px and `Card`'s `rounded-4xl` 41.6px. A card inside the 16px window needs `rounded-md` (12.8px) or smaller.
- **Canvas contrast:** in light mode `bg-muted` (0.96) and the ghost button's hover are invisible on the canvas (0.9702). On the canvas use `surface-raised` for a selected state (Bookings view toggle) and `--sidebar-accent` (light 0.925, dark 0.235) for hover. Both are fine inside the white window.
- **Both shells are `ssr: false`** (the account shell through `protectedRoute`, `shared/lib/auth/protected-route.ts:33`): the server sends an empty body, so there is no hydration to mismatch. The plan's earlier SSR note was wrong; Default 1 was not changed.
- **Scrollbar gutter:** `html` has `scrollbar-gutter: stable`. While a dashboard is mounted the body takes the canvas colour (`body:has([data-slot="sidebar-wrapper"])` in styles.css) so the gutter does not show as a strip. With classic scrollbars the window's right margin is 8px plus the 15px gutter on pages that do not scroll; this was only seen in headless Chromium.
- **Sidebar animation** lives in `shared/components/ui/sidebar.tsx` and must stay as is: gap `transition-[width] duration-200 ease-linear`, container `transition-[left,right,width] duration-200 ease-linear`, widths 16rem and 3rem, `sidebar_state` cookie, Ctrl/Cmd+B, rail; below `md` the sidebar is a Sheet.
- **Bookings Month view** is 959px tall in a 900px viewport (rows are `min-h-28` in `modules/org-dashboard/components/bookings/MonthView.tsx:48`, about 105px in the reference), so the page scrolls; the grid keeps its own `rounded-lg border` (MonthView.tsx:31). Both are open gaps against the reference.
- **`Card`** (`shared/components/ui/card.tsx`) is `glass-card rounded-4xl` with blur and a `depth-2` shadow and is used across the site. **`EmptyState`** has a dashed border and `flex-1`; grep its users before changing it.
- **Week and Day calendar** has its own scroller (`max-h-[70vh] overflow-y-auto`, `modules/org-dashboard/components/bookings/TimeGridView.tsx:91`).
- **Print:** the breadcrumb row and banner are `print:hidden`, the sidebar is hidden by an unlayered rule in styles.css, and the account receipt page prints (`modules/account-dashboard/routes/_shell.payments.$paymentId.tsx`, `components/payments/Receipt.tsx`).
- **Theme:** `localStorage.theme` is `light`, `dark` or `auto` and sets a class on `<html>`; the switch is "Toggle theme" in the user menu at the bottom of the sidebar.
- **Local stack:** web app on `localhost:3000`, backend on `localhost:3001`. Phase 1 stopped the servers it started. Organization `seed-75781209` (a `bookable-org` seed, owner user id `lNenSI9j0ePY0P1XKDMHD9Pr7yEECMe9`) has one confirmed Haircut booking on 12 November 2026 and can be reused with `dev:login-as --user-id`.
- **Browser checks:** the shell is zsh, so call `bunx playwright-cli` directly or through a function (a variable is not word-split) and quote globs. Screenshots from Phase 1 are in `.playwright-cli/` (`p1-*`, `verify-p1-*`) until Phase 4 deletes them.
- **Git:** stage files by path; `Header above the window.png` is untracked and must stay out of commits.

---

## Phase 2: Organization dashboard pages in one window

**Goal:** Every organization dashboard page shows its content in a single window under its title, in every state (loading, error, empty, data).

**Files:** all in `modules/org-dashboard/`. Structures below come from grep; confirm by reading each component's `return` blocks. `ContentBox` call sites that pass their own padding, to move onto the default: `routes/_shell.pages.index.tsx:80`, `_shell.payments.tsx:93`, `_shell.services.index.tsx:75`, `_shell.team.tsx:88` and `103` (`gap-4 p-4`), `_shell.pages.$id.preview.tsx:67` (`p-6 sm:p-10`). Forms that own their window: `components/ServiceForm.tsx:63`, `components/pages/PageDetailsForm.tsx:86`, `components/pages/NewPageForm.tsx:84`, `components/bookings/ManualBookingForm.tsx:72`.

| Route file (`routes/`) | Today | Components |
| --- | --- | --- |
| `_shell.index.tsx` | header, stat-card grid, two-column card grid; three header branches (error, skeleton grid, data) | `components/overview/*` |
| `_shell.analytics.tsx` | header, `Tabs` with widgets on the canvas, `PlanGate` | `components/analytics/*`, `DateRangeFilter.tsx` |
| `_shell.bookings.index.tsx` | header, one `ContentBox` with default padding; the availability loading and error branches (107–109) still render a bare `Skeleton` or `FieldError` with no window | `components/bookings/MonthView.tsx` (grid border at 31, row height at 48), `BookingsCalendar.tsx`, `BookingsList.tsx` |
| `_shell.bookings.$id.tsx` | header, several `Card`s; the loading branch returns a bare skeleton with no header | `components/bookings/BookingActions.tsx`, `BookingHistory.tsx`, `ContactCard.tsx` |
| `_shell.bookings.new.tsx` | header, form with its own `ContentBox` | `components/bookings/ManualBookingForm.tsx` |
| `_shell.customers.index.tsx`, `_shell.customers.$id.tsx` | header and `EmptyState`; header only (stub) | – |
| `_shell.pages.index.tsx` | header, `ContentBox` | `components/pages/PagesTable.tsx`, `PageUsage.tsx` |
| `_shell.pages.new.tsx` | header, form with its own `ContentBox` | `components/pages/NewPageForm.tsx`, `TemplatePicker.tsx` |
| `_shell.pages.$id.index.tsx` | header (two branches), `ContentBox divide-y` | `PageDetailsForm.tsx`, `PagePublishing.tsx`, `PageContentSummary.tsx` |
| `_shell.pages.$id.preview.tsx` | no `PageHeader`; `Alert` then `ContentBox`; bare skeleton while loading | – |
| `_shell.payments.tsx` | header, totals, `ContentBox` | `components/payments/*` |
| `_shell.services.index.tsx`, `.new.tsx`, `.$id.tsx`, `.hours.tsx` | header, `ContentBox` (table or `divide-y` form) | `ServicesTable.tsx`, `ServiceForm.tsx`, `BusinessHoursForm.tsx`, `ClosuresList.tsx` |
| `_shell.settings.index.tsx` | header, `ContentBox divide-y` | `TransferSection.tsx`, `shared/components/SettingsSection.tsx` |
| `_shell.team.tsx` | header, two `ContentBox`es (members, invitations) | `components/team/*` |

**Steps:**
- Each page renders exactly one window under its header, and every branch (loading, error, empty, data) renders the header and the window so the frame does not jump between states.
- Pages with several boxes become one window with sections (Team: members and invitations).
- Card-grid pages (Overview, Analytics, booking detail) move inside the window. Choose one flat treatment for cards inside a window (no glass blur, no `depth-2` shadow, a radius that sits well inside the window) and apply it at the usages; do not change `Card` itself. Record the treatment in the standing notes for Phase 3.
- Empty states sit inside the window; drop the dashed border there if it reads as a box in a box, after checking `EmptyState`'s other users.
- Skeletons are sized to the content they replace, inside the window.
- The preview page keeps its notice above the window; decide whether it needs a `PageHeader` by how it looks next to the other pages.
- Tables and the calendar must not gain horizontal overflow from the new padding; the Week and Day views keep their own scroller.
- No behaviour changes: queries, permissions, search params and actions stay as they are.

**Tests that matter:**
- No new unit tests. The existing module tests still pass; a failing one means behaviour changed by accident.

**Done when:**
- Every route in the table shows one window under its title in loading, empty and data states.
- No page has a card-in-card look or horizontal overflow at 1440 and 1024 wide.
- `bun run verify` exits 0.

**Verify:** Seed `bookable-org` (owner A) and `pro-org` (owner B). As A, create one booking from Bookings → New booking so the calendar, list and a booking detail have data. Nothing else is simulated. For each page take a screenshot at 1440×900 with the sidebar expanded, then collapsed, in light and in dark, and check: one white window under the title, breadcrumbs correct for the page, no nested boxes with heavy shadows, nothing clipped or overflowing, window reaches the bottom on short pages.
- As A at `/dashboard/<slug>`: Overview (`/`), Bookings (`/bookings`: Calendar in Month, Week and Day, then List), the booking's detail, New booking (`/bookings/new`), Customers (`/customers`), Services (`/services`), New service (`/services/new`), the Haircut's edit page, Business hours (`/services/hours`), Payments (`/payments`), Team (`/team`), Settings (`/settings`).
- As B: Analytics (`/analytics`, each tab), Pages (`/pages`), New page (`/pages/new`), a page's detail and its Preview.
- As A: Analytics again, to see the upgrade prompt for the gated tabs inside the window.
- On Overview and Bookings, reload with the network throttled and confirm the loading state already shows the title and the window.
Report each page as pass or fail with the screenshot path, plus console errors.

---

## Phase 3: Account pages in one window

**Goal:** Every personal account page shows its content in a single window under its title, in every state.

**Files:** all in `modules/account-dashboard/`. Phase 2 rewrites this list with the card treatment it chose.

| Route file (`routes/`) | Today | Components |
| --- | --- | --- |
| `_shell.index.tsx` | header, skeleton or `EmptyState` or card grid | `components/overview/*` |
| `_shell.billing.tsx` | header, `ContentBox divide-y` | `components/billing/*` |
| `_shell.bookings.index.tsx` | header, filter pills, list or `EmptyState` | `components/bookings/CustomerBookingList.tsx` |
| `_shell.bookings.$id.tsx` | three header branches, `Card`s | `components/bookings/*` |
| `_shell.notifications.tsx` | header, `EmptyState` | – |
| `_shell.organizations.tsx` | two header branches, `ContentBox` or `EmptyState` | `components/IncomingTransfers.tsx` (own `ContentBox mb-6`), `AcceptTransferDialog.tsx` |
| `_shell.payments.index.tsx` | header, list | `components/payments/CustomerPaymentList.tsx` |
| `_shell.payments.$paymentId.tsx` | three header branches, receipt `Card`, print button | `components/payments/Receipt.tsx` |
| `_shell.settings.tsx` | header, `ContentBox divide-y` | `components/settings/*` |

**Steps:**
- Same rules as Phase 2, reusing its card treatment and empty-state handling.
- Organizations: the incoming-transfers box and the organization list become sections of one window.
- Receipt: printing must still produce a clean receipt. The window's surface, padding and shadow must not print, and the title and print button stay hidden as today.
- These routes are server-rendered: check there is no layout shift or hydration warning on first load.

**Tests that matter:**
- No new unit tests; existing module tests still pass.
- The printed receipt is checked in Verify because print styles are easy to break and nothing else covers them.

**Done when:**
- Every route in the table shows one window under its title in loading, empty and data states.
- The receipt's print preview shows only the receipt.
- `bun run verify` exits 0.

**Verify:** Seed `bookable-org` (owner A) and a separate `user` (customer C). As C, book the Haircut on the storefront at `/<slug>` so C has an account booking. A payment for C may not be producible locally: if the Payments list is empty, check its empty state and report the payment detail page as unchecked instead of faking a row. Billing details for a seeded subscription are empty by design.
For each page take screenshots at 1440×900, sidebar expanded and collapsed, light and dark, with the same checks as Phase 2.
- As C at `/account`: Overview, Bookings (each filter), the booking's detail, Payments, Notifications, Organizations (empty), Settings.
- As A at `/account`: Overview, Organizations (one organization listed), Billing, Settings.
- If a payment detail is reachable, open it and emulate print media: only the receipt shows, with no window frame, sidebar, breadcrumbs or buttons.
- Hard-reload `/account` and `/account/settings` and watch for content jumping after load; report hydration warnings from the console.
Report each page as pass or fail with the screenshot path.

---

## Phase 4: Full regression sweep and cleanup

**Goal:** Every dashboard page is confirmed on the new layout across themes, sidebar states, screen sizes and roles, and whatever the sweep finds is fixed.

**Files:** none known in advance; fixes land in the files from Phases 1–3. Phase 3 fills this in with anything it left open.

**Steps:**
- Run the Verify brief below first, then fix its findings and rerun only the affected pages.
- Compare Bookings once more against the reference image and close remaining gaps in spacing or size that are within the Decisions.
- Confirm routes outside the dashboards are untouched: home, auth, checkout, organization creation and onboarding, invite, storefront.
- Remove leftovers: unused tokens or utilities, class names that only served the old chrome, stale comments.
- Last, after the plan and log are written: stop every dev server this plan's work started, and delete the screenshots, console logs and scratch files it created under `.playwright-cli/` and elsewhere. Leave `Header above the window.png` in place.

**Tests that matter:**
- No new unit tests. `bun run verify` output is read in full for new warnings or "other output".

**Done when:**
- Every page in the Phase 2 and Phase 3 tables passes at 1440, 1024, 768 and 390 wide, in light and dark, with the sidebar expanded and collapsed (sheet on mobile).
- Staff see the same chrome with their reduced navigation.
- No dev servers or temporary artifacts from this plan remain.
- `bun run verify` exits 0.

**Verify:** Seed `org-with-staff` (owner and one staff member), `bookable-org` and `pro-org`, with one booking created as in Phase 2. The payment-failed state is simulated by setting the owner's `user_subscription.status` to `past_due` with `psql service=sinwy_rw`; restore it afterwards.
1. Size sweep: for every page listed in Phases 2 and 3, screenshot at 1024×768, 768×1024 and 390×844 in light mode. Check: no horizontal scroll, title and actions wrap without overlap, tables and the calendar stay usable, the window keeps its margins, the mobile sheet opens and navigates.
2. Dark sweep at 390×844 for Overview, Bookings, Settings and the account Overview.
3. As the staff member: open the organization dashboard, confirm the navigation shows only what staff may see and each visible page renders in the window; open a hidden page's URL directly and confirm the redirect and notice still work.
4. Payment-failed banner: with the owner's subscription `past_due`, open the dashboard as the owner (only the owner sees it). The banner is a full-width strip under the breadcrumb row, stays pinned while scrolling a long page (Settings) and does not cover the title.
5. Long page: scroll Settings and Billing to the bottom. The whole page scrolls, the sidebar stays fixed, and the window's bottom corners and margin are visible at the end.
6. Navigation: click through every sidebar item with the sidebar collapsed, then expanded; the collapsed state survives navigation and a reload.
7. Outside the dashboards: open `/`, `/auth/login`, the storefront `/<slug>` and `/organizations/new`; they look as before, with the site header and footer where they had them.
Report a pass or fail table per page and size, with screenshot paths and console errors.
