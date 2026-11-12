# Dashboard layout log

Finished phases of [dashboard-layout-plan.md](dashboard-layout-plan.md), each with its spec and log entry.

---

## Phase 1: Shell chrome: sidebar, breadcrumb row, page header, window

**Goal:** The shell matches the reference on pages already built as title plus one box (Bookings is the benchmark), with the sidebar animation untouched.

**Files:**
- `shared/components/shell/AppShell.tsx` (header 69–101, banner 103–110, body 111, doc comment 25–38)
- `shared/components/ui/sidebar.tsx` (234 border and shadow; 138 wrapper; 307 `SidebarInset`; read 218 and 230 only to leave them alone)
- `shared/components/ui/breadcrumb.tsx` (`BreadcrumbList` text size and gaps, `BreadcrumbSeparator` default chevron)
- `shared/components/PageHeader.tsx`, `shared/components/ContentBox.tsx`
- `styles.css` (tokens and `chrome-edge` at the lines in the standing notes)
- `shared/components/shell/OrganizationSwitcher.tsx`, `NavUser.tsx`, `SidebarNav.tsx` (check only: hover and open states on the new sidebar colour)
- `modules/org-dashboard/routes/_shell.bookings.index.tsx` (benchmark page: `ContentBox className="… p-4"` at 163 and 190)

**Steps:**
- Sidebar: remove the border and the `chrome-edge` shadow, and give it the canvas colour in all three theme blocks. Delete `chrome-edge` and `--depth-chrome` once nothing uses them.
- Do not touch the transition classes, widths, `collapsible="icon"`, the cookie, the shortcut or the rail. Icon-collapsed mode must still centre the icons and show tooltips.
- Pick a `--sidebar-accent` (light and dark) that reads as a hover on the canvas colour, and check the organization switcher, user menu, nav items, sub-items and the collapsible group.
- Breadcrumb row: no background, border or shadow; about 48px tall in both sidebar states; about 13px text; "/" separators; no vertical separator after the trigger. Size the crumbs from AppShell through class names where possible, and change `breadcrumb.tsx` only if that is not enough. Keep the `md` rule that shows only the last crumb on small screens.
- Body container: the window starts where the sidebar ends on desktop, with about 8px margin right and bottom and an equal margin on both sides below `md`; the breadcrumb row and `PageHeader` are inset about 12px from the window edge. The body still fills the viewport height so a short page's window reaches the bottom.
- `PageHeader`: description under the title, action on the right, wrapping cleanly on narrow screens.
- `ContentBox`: restyle to the reference window (surface, radius, hairline or soft shadow, default padding). Pages pass their own padding today (`p-4`, `divide-y`), so check that the override pattern still works.
- Banner: keep it sticky and full width; make sure it does not sit on a background that now mismatches the canvas.
- Update the AppShell doc comment where it no longer describes the shell (it says "sticky header").

**Tests that matter:**
- No new unit tests; the risk is visual and is covered by Verify. `shared/tests/nav-filter.test.ts` still passes.
- The sidebar transition values are compared before and after in Verify, since an accidental class change would not fail any test.

**Done when:**
- Bookings at 1440×900 in light mode matches the reference's structure: borderless sidebar on the canvas colour, compact breadcrumb row, stacked title and description, one white window to the bottom of the screen.
- The sidebar's computed transitions and widths are identical to `master`.
- `bun run verify` exits 0.

**Verify:** Seed `bookable-org` and log in as its owner. Nothing is simulated beyond the seed.
1. Open `/dashboard/<slug>/bookings` at 1440×900, light theme. Compare a screenshot with `Header above the window.png` in the repo root: no line or shadow between sidebar and page, sidebar and canvas the same colour, breadcrumbs "Org name / Bookings" small with a trigger icon before them, title "Bookings" with its description underneath, Calendar/List and "New booking" on the right, one white rounded window reaching the bottom of the screen with a small margin.
2. Read the computed `transition-property`, `transition-duration` and `transition-timing-function` of `[data-slot="sidebar-gap"]` and `[data-slot="sidebar-container"]`: they must be `width` and `left, right, width`, `0.2s`, `linear`. Expanded width 256px, collapsed 48px.
3. Collapse and expand with the trigger, with Ctrl+B and by clicking the sidebar's edge. Collapsed: icons centred, labels gone, tooltips on hover, window widens. Reload while collapsed: it stays collapsed (`sidebar_state=false` cookie).
4. Hover a nav item, the organization switcher and the user menu: each shows a visible hover state. The active item is a white raised pill.
5. Switch to dark from the user menu and repeat steps 1 and 4: no border, sidebar matches the canvas, window is the lighter surface, text contrast is fine.
6. Resize to 390×844: sidebar is gone, the trigger opens it as a sheet, only the last crumb shows, the window has equal margins and nothing overflows horizontally.
7. Open `/account`: same chrome with the "Your account" nav.
8. Open the storefront at `/<slug>` and go through booking a Haircut to the confirm step and the success screen: the boxes there still look right.
Report console errors and any page where the chrome differs from the description.

### Log (2026-11-11, `feat(web): restyle the dashboard shell to a borderless sidebar and one window`)
- Shipped: the sidebar has no border or shadow and takes the canvas colour (`--sidebar: var(--background)` in all three theme blocks); `chrome-edge` and `--depth-chrome` are deleted. The breadcrumb row is 48px in both sidebar states with 13px crumbs, "/" separators, a 14px muted trigger and no bar, border or separator. `PageHeader` stacks the description under the title with the action bottom-aligned on the right. `ContentBox` is the window: 16px radius, hairline border, 24px padding. The body container starts the window at the sidebar edge with 8px right and bottom margins, and 8px on both sides below `md`. `--sidebar-accent` is 0.925 in light and 0.235 in dark. Bookings uses the window's default padding, puts Calendar/List before "New booking" as in the reference, and marks the selected view with `surface-raised`. The AppShell doc comment is updated.
- Differs from plan: `breadcrumb.tsx` was not touched (class names from AppShell were enough). The window uses `rounded-lg`, because this project's `rounded-2xl` is 28.8px. The banner got `mb-4` so it does not touch the title. Not in the plan: the body takes the canvas colour while a dashboard is mounted, because the `scrollbar-gutter` strip showed the site's body gradient as a white band next to the window; the sidebar trigger hovers with `--sidebar-accent`, because the ghost hover is invisible on the canvas. The plan's SSR note was wrong: the account shell is `ssr: false` too, so step 7's hydration check has nothing to find. Default 1 (pages own the window) was left as it is.
- Checked in the running app: all eight Verify steps passed in a subagent run on `seed-75781209` (Bookings against the reference in light and dark, transitions `width` and `left, right, width` at `0.2s linear`, widths 256px and 48px, collapse by trigger, Ctrl+B and rail, cookie surviving a reload, tooltips and centred icons when collapsed, hover states, 390×844 with the sheet and no horizontal overflow, `/account`, storefront confirm and success boxes), with no console errors. Its findings (28.8px radius, invisible selected view toggle and trigger hover in light, gutter strip, faint dark hover) were fixed and each fix was measured again inline in both themes; the full brief was not rerun after them. Not checked: a headed browser with classic scrollbars, a real phone, and the storefront boxes after the radius went from 28.8px to 16px. Left open for later phases: the Month calendar is taller than a 900px screen and keeps its own outer border, unlike the reference. `bun run verify` exited 0.

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

### Log (2026-11-11, `feat(web): put every organization dashboard page in one window`)
- Shipped: every organization route renders `PageHeader` and one `ContentBox` in each branch, with the error and a skeleton inside the window. The four forms no longer render the window themselves. Team's two boxes and the page detail's two boxes are sections of one window. Cards inside a window use the new `FlatCard` (hairline border, 12.8px radius, no background, shadow or blur); `Card` is unchanged. `EmptyState` and `UpgradePrompt` take a `className`, and empty states that are a window's only content pass `border-none`. Alerts, dashed notes, bordered lists and the template cards inside a window are `rounded-md`. The Month view has no outer border, a plain weekday row and no line under the last week, and fills the window so it fits 1440×900. The Week and Day scroller is sized from the viewport so the page does not scroll as well. `SidebarInset` got `min-w-0`. The page usage meter's track uses `--sidebar-accent`, because `bg-muted` is invisible on the canvas.
- Differs from plan: the Preview page has a `PageHeader` ("Preview", the notice's text as the description, "Back to page" as the action) in place of the alert, because the white alert above the window read as a second window and the verify run failed it. `PaymentsNotice` and the page limit notice moved inside the window. `FlatCard` uses `!` on three utilities, because `glass-card` is emitted later in the CSS and wins otherwise. `AppShell` (a Phase 1 file) was changed for `min-w-0`: without it the Payments table widened the whole page at 1024 wide. The Month grid's border and row height, listed as open gaps, were closed here.
- Checked in the running app: a subagent ran the Verify brief on `seed-75781209` (owner A) and `seed-5fb75f2c` (owner B): 25 page states at 1440×900 with the sidebar expanded and collapsed in light and dark, plus 1024×768 in light. 23 passed: one window, left edge at the sidebar, 8px margins, window reaching the bottom on short pages, flat cards, correct breadcrumbs, no console errors. The throttled reload of Overview and Bookings showed the title and the window with skeletons, and the window did not move when the data arrived. The two failures (Payments overflowing at 1024, Preview with no canvas title and two boxes) were reproduced, fixed and measured again inline at 1440 and 1024, together with the Week and Day page scroll and the Overview skeleton sizes; the full brief was not rerun after the fixes. Not checked: Analytics with data (stat cards, charts, breakdown tables, the funnel and the upgrade prompt below charts), because traffic is produced once a day and nothing was inserted; the empty Pages list; Overview lists with rows; `/customers/$id`; dialogs and menus; error states; widths below 1024; the account dashboard after `min-w-0`; a browser with classic scrollbars. `bun run verify` exited 0 after the last change.

---

## Phase 3: Account pages in one window

**Goal:** Every personal account page shows its content in a single window under its title, in every state.

**Files:** all in `modules/account-dashboard/`. Line numbers come from grep; confirm by reading each `return` block. Apply the window rules, `FlatCard` and the empty-state rule from the standing notes.

| Route file (`routes/`) | Today | To do |
| --- | --- | --- |
| `_shell.index.tsx` | header (21), bare skeleton (28) or `EmptyState` (30) or two `Card`s | one window in every branch; `FlatCard` in `components/overview/NextBookingCard.tsx:17` and `BookAgainCard.tsx:18`; `border-none` on the empty state |
| `_shell.billing.tsx` | header (51), bare skeleton (61), `ContentBox divide-y` (138) | skeleton inside the window; `FlatCard` in `components/billing/ResumePanel.tsx:100` if it sits in the window; `rounded-md` for `CurrentPlanSection.tsx:203` (dashed, `rounded-xl`) and `PaymentFailedNotice.tsx:16` (`rounded-2xl`) |
| `_shell.bookings.index.tsx` | header (48), filter pills on the canvas (52), bare skeleton (75), list or two `EmptyState`s (85, 91) | pills, list and empty states inside one window; `components/bookings/CustomerBookingList.tsx:15` is `rounded-xl border`: `rounded-md`, or drop the frame |
| `_shell.bookings.$id.tsx` | headers at 43, 51 and 86; bare skeleton with no header (47); `EmptyState` (52); four `Card`s (90, 149, 175, 227) | header and window in every branch; `FlatCard`s; same shape as the organization booking detail |
| `_shell.notifications.tsx` | header (14), `EmptyState` (18) on the canvas | wrap in the window, `border-none` |
| `_shell.organizations.tsx` | headers at 76 and 91; `EmptyState` (80) on the canvas; `ContentBox` (98); `components/IncomingTransfers.tsx:21` renders its own `ContentBox mb-6` | one window with two sections (incoming transfers, organizations); `IncomingTransfers` loses its window |
| `_shell.payments.index.tsx` | header (43), `PaymentsNotice` on the canvas (47), bare skeleton (51), list or `EmptyState` (61) | notice inside the window as on the organization Payments page; `components/payments/CustomerPaymentList.tsx:14` is `rounded-xl border` |
| `_shell.payments.$paymentId.tsx` | headers at 26, 34 and 54; bare skeleton with no header (30); `EmptyState` (35); `PaymentsNotice` (67); receipt `Card` with print classes (`components/payments/Receipt.tsx:17`) | header and window in every branch; the window must not print (surface, border, padding), the receipt must |
| `_shell.settings.tsx` | header (58), `ContentBox divide-y` (62) | already one window; `rounded-md` for the `rounded-2xl` boxes in `components/settings/EmailSection.tsx:70` and `DangerZone.tsx:113`, `120` |

Dialogs (`AcceptTransferDialog.tsx`, `billing/ChangePlanDialog.tsx`) are not in a window and keep their radii.

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

### Log (2026-11-12, `feat(web): put every account page in one window`)
- Shipped: every account route renders `PageHeader` and one `ContentBox` in each branch, with the error, the skeleton and the empty state (`border-none`) inside the window. Overview, the booking detail, the receipt and the resume panel use `FlatCard`. Bookings has its pills, list and pagination in the window; Payments has the notice, list and pagination. The two lists keep a `rounded-md` frame with `overflow-hidden`, so the row hover does not cross the corners. Organizations is one `divide-y` window: ownership offers (when there are any), then the slot line and the list; `IncomingTransfers` renders a section and no window. Billing is one window in all five states (loading, error, suspended, no plan, plan): `BillingDetails` renders a `divide-y` block, and the resume panel and the payment-failed notice sit above it at `max-w-3xl`. The payment detail window drops its border, background and padding in print, and the receipt card its border. The dashed notes in `CurrentPlanSection` and `EmailSection` and the payment-failed notice are `rounded-md`.
- Differs from plan: Billing's "Choose a plan" state was not in the table; it is in the window, and `PlanCards` (`modules/organizations/components/PlanCards.tsx`, shared with the home page) got a `flat` prop that only Billing passes. The two `rounded-2xl` boxes in `DangerZone.tsx` are inside the delete dialog, not the window, so they keep their radius. The plan called these routes server-rendered; they are not (`ssr: false`), so there is no hydration to check. The plan said the receipt's title stays hidden in print "as today"; it never was hidden, and it still prints, because it is the receipt's heading. The detail pages' loading titles got the same height as the loaded ones ("Loading your booking…" as the description, a disabled Print button), after the verify run measured the window jumping 22px and 4px when the data arrived.
- Checked in the running app: a subagent ran the Verify brief at 1440×900 as customer C (new `user` seed, one real Haircut booking made on the storefront, which also created a pending payment) and as owner A of `seed-75781209`. All pages passed with the sidebar expanded and collapsed in light and dark: one window, left edge at the sidebar, 8px margins, window reaching the bottom on short pages, flat cards at 12.8px, no dashed frames, correct breadcrumbs, no horizontal scroll, no console errors or hydration warnings. As C: Overview, Bookings (both pills, clicked), the booking detail, Payments, the payment detail, Notifications, Organizations (empty), Settings, Billing (no plan). As A: Overview, Organizations, Billing, Settings, plus Bookings, Payments and Notifications. Print media on the payment detail showed only the title and the receipt, with no window frame, sidebar, breadcrumbs, notice or button. Hard reloads of `/account` and `/account/settings` did not move the title or the window. With the data request delayed, six pages showed the title and one window with skeletons. The run was cut off once by a usage limit and resumed after the servers were restarted. The detail-page jump was fixed afterwards and measured inline (window at 124px and 106px before and after loading); the brief was not rerun. Inline, with the API response changed in the browser and nothing written to the database: Billing suspended (resume panel), Billing past due (notice) and Organizations with an ownership offer, light mode only. Not checked: Billing with a real sandbox subscription (plan details, invoices, a pending plan change); a paid receipt; a real print or PDF; error and not-found states; `AcceptTransferDialog` and `ChangePlanDialog`; the email-change note in Settings; widths below 1440. `bun run verify` exited 0 after the last change.

---

## Phase 4: Full regression sweep and cleanup

**Goal:** Every dashboard page is confirmed on the new layout across themes, sidebar states, screen sizes and roles, and whatever the sweep finds is fixed.

**Files:** fixes land in the files from Phases 1–3 (paths relative to `Sinwy.WebFrontend/src/`). Known before the sweep, from the two "Left open" standing notes:
- `modules/org-dashboard/components/bookings/ManualBookingForm.tsx`: full-width submit button.
- `modules/org-dashboard/routes/_shell.services.hours.tsx` (around line 82, where `ClosuresList` is rendered): the divider above Closures runs the full window width.
- `modules/org-dashboard/components/bookings/TimeGridView.tsx:72`, `81`, `modules/organizations/components/PlanCards.tsx:174` and `modules/account-dashboard/components/billing/CurrentPlanSection.tsx:42`: `text-primary` is hard to read in dark mode. Check where the token is set in `styles.css` before changing the three places one by one.
- `modules/account-dashboard/components/payments/Receipt.tsx`: 12px print indent against the title.
- The account routes (`modules/account-dashboard/routes/_shell.*.tsx`) have not been seen below 1440 wide; the wide rows are `components/bookings/CustomerBookingList.tsx`, `components/payments/CustomerPaymentList.tsx`, the rows in `routes/_shell.organizations.tsx` and the three plan cards on Billing without a plan.

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

**Verify:** Seed `org-with-staff` (owner and one staff member); reuse `bookable-org`, `pro-org` and the customer from the standing notes for the pages of Phases 2 and 3. The payment-failed state is simulated by setting the owner's `user_subscription.status` to `past_due` with `psql service=sinwy_rw`; restore it afterwards.
1. Size sweep: for every page listed in Phases 2 and 3, screenshot at 1024×768, 768×1024 and 390×844 in light mode. Check: no horizontal scroll, title and actions wrap without overlap, tables and the calendar stay usable, the window keeps its margins, the mobile sheet opens and navigates.
2. Dark sweep at 390×844 for Overview, Bookings, Settings and the account Overview.
3. As the staff member: open the organization dashboard, confirm the navigation shows only what staff may see and each visible page renders in the window; open a hidden page's URL directly and confirm the redirect and notice still work.
4. Payment-failed banner: with the owner's subscription `past_due`, open the dashboard as the owner (only the owner sees it). The banner is a full-width strip under the breadcrumb row, stays pinned while scrolling a long page (Settings) and does not cover the title.
5. Long page: scroll Settings and Billing to the bottom. The whole page scrolls, the sidebar stays fixed, and the window's bottom corners and margin are visible at the end.
6. Navigation: click through every sidebar item with the sidebar collapsed, then expanded; the collapsed state survives navigation and a reload.
7. Outside the dashboards: open `/`, `/auth/login`, the storefront `/<slug>` and `/organizations/new`; they look as before, with the site header and footer where they had them.
Report a pass or fail table per page and size, with screenshot paths and console errors.

### Log (2026-11-13, `fix(web): fix dashboard pages at narrow widths and dark-mode primary text`)
- Shipped, known before the sweep: New booking's submit button is `w-fit`; `BusinessHoursForm` is `max-w-3xl`, so the divider above Closures stops where the others do; `text-primary` reads a new `--primary-text` token through `--text-color-primary` (light unchanged, dark `oklch(0.696 0.17 162.48)`), which fixes the Week view's today label, the "Save 20%" badge and the link-style buttons in one place; the receipt's content is `print:px-3`, level with the title.
- Shipped, found by the sweep: the Analytics "By service" table no longer widens the page at 390 (`min-w-0` on its grid item); the past-due notice on account Billing wraps its button under the text instead of squeezing the text to 20px (`grow basis-48`); the plan cards on account Billing and the totals on Payments follow the window's width with container queries instead of the viewport's; the Week view is at least 36rem wide and scrolls sideways in its frame on a phone; the hours inputs are 136px so "09:00 AM" fits, and `SettingsSection` stacks its action under the description below `sm`; `PageHeader` has a 38px minimum height, so a title with a button and a title without one sit at the same height (window at 106px); ownership offers wrap their buttons under the text; the mobile sheet closes on navigation.
- Differs from plan: the known items were fixed before the sweep instead of after, so the sweep covered them. The `text-primary` fix is a token, so it also brightens the green text on the home page in dark mode (light is unchanged); that is the one change outside the dashboards. The sheet staying open after a tap was not caused by the redesign (no code ever closed it) but was fixed here. Bookings was compared with the reference and left as it is: the shell numbers match, and what differs is the toolbar row (38px against 32px, weekday row 14px lower, month rows 102.5px against 105.5px) and the sidebar width, which Default 3 keeps. The cleanup found nothing to remove: Phase 1 already deleted `chrome-edge` and `--depth-chrome`, every sidebar token is still used, and the unused utilities in styles.css (`text-link`, `glass-toolbar` and others) were unused on `master` too. The sweep was cut off by a usage limit and resumed the next day from its saved results, with both servers restarted.
- Checked in the running app: a subagent ran the Verify brief and a measured matrix of 544 cells (every page at 1440, 1024, 768 and 390, light and dark, sidebar expanded and collapsed or sheet): no horizontal scroll, window at the sidebar edge with 8px margins, 16px radius, 24px padding, one window per page, no title and action overlap, no console errors. Step 1 screenshots at 1024, 768 and 390 in light (93, of which 32 were judged on measurements only) found F3, F5, F6 and F7; the mocked states found F1 and F2. Staff see Overview, Bookings, Services, Customers and Pages, and a hidden URL redirects to the Overview with "You don't have access to that page". The payment-failed banner (owner's `user_subscription.status` set to `past_due`, then restored and read back) is a full-width strip under the breadcrumb row, stays pinned while scrolling and does not cover the title. Long pages scroll as a whole with the sidebar fixed and the window's bottom corners visible. Every sidebar item works collapsed and expanded, and the collapsed state survives navigation and a reload. `/`, `/auth/login`, the storefront and `/organizations/new` keep their header and footer. In dark mode the three `text-primary` places measure 6.8:1 to 7.5:1. After the fixes each affected page was opened again: Week view at 390 and 1440, Business hours at 390, Payments at 1024, 768 and 1440, past-due Billing at 390 and 1440, the ownership offer at 390, plan cards at 768, 1024 and 1440 (and on the home page at 1440, 768 and 740, where the columns are unchanged), Analytics with mocked data at 390 and 1440, the sheet at 390, and the title and window position on nine pages. `bun run verify` exits 0.
- Not checked: the full matrix was not run again after the fixes, only the affected pages; a real phone, Safari, Firefox and a real print; a real past-due or suspended subscription, a real ownership offer and real analytics data (all shown through changed API responses); the banner with the sidebar collapsed; the staff view at other sizes or in dark. The backend log of the first sweep session was lost when the server restarted.
- Cleanup: the backend and web dev servers started for this phase are stopped, and the plan's screenshots, logs and scratch files are deleted from `.playwright-cli/` (`p1-*` to `p4-*`, `verify-p*`) and `/tmp/sinwy-verify-p2/` and `/tmp/sinwy-verify-p4/`. The seeded users and organizations stay, as does `Header above the window.png`.
