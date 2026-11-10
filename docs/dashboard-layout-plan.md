# Dashboard layout plan

Redesign the dashboard shell (organization dashboard and personal account) to the simpler layout in the reference image: the sidebar blends into the page canvas with no border, a small breadcrumb row sits at the top, the page title sits on the canvas, and the page content lives in one white window below it. Every dashboard page is moved onto that layout and checked so nothing regresses.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [dashboard-layout-log.md](dashboard-layout-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shell chrome: sidebar, breadcrumb row, page header, window | – | todo | |
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

- **Reference, in CSS px at 1440×900:** sidebar and canvas are the same grey with no divider. Breadcrumb row: small muted sidebar-trigger icon, then about 13px crumbs separated by "/", vertically centred about 28px from the top, no bar background, border or shadow. Title 24px semibold with a 14px muted description under it; actions right-aligned on the same block. The window starts about 124px from the top, begins where the sidebar ends, has about 8px margin right and bottom, about 16px radius, about 24px inner padding, a white surface and at most a hairline or soft shadow. Title and breadcrumbs are inset about 12px from the window's left edge. The active nav item is a white raised pill.
- **Paths below are relative to `Sinwy.WebFrontend/src/`.**
- **Shell:** `shared/components/shell/AppShell.tsx` is mounted by exactly two layout routes, `modules/org-dashboard/routes/_shell.tsx` and `modules/account-dashboard/routes/_shell.tsx`. Header bar at line 69 (`chrome-edge`, `h-16`, `border-b`, `bg-sidebar`, height transition); banner slot at 103–110 (`sticky top-0 bg-background`); body container at 111 (`flex flex-1 flex-col gap-4 p-4`).
- **SSR:** the organization shell is `ssr: false` but the account shell is server-rendered, so a portal-based "header slot" in the shell would make titles pop in after hydration. This is why pages own the window.
- **Sidebar border and shadow** are one class list in `shared/components/ui/sidebar.tsx:234` (`chrome-edge border-sidebar-border … border-r`). `chrome-edge` (styles.css:532) and `--depth-chrome` (styles.css:121, 221, 303) are used only by that line and the AppShell header.
- **Sidebar animation** lives in `shared/components/ui/sidebar.tsx`: gap at 218 (`transition-[width] duration-200 ease-linear`), container at 230 (`transition-[left,right,width] duration-200 ease-linear`), group label at 400, menu buttons at 475, widths at 27–29. State persists in the `sidebar_state` cookie, read by `readSidebarCookie` in AppShell; Ctrl/Cmd+B toggles; below `md` the sidebar is a Sheet.
- **Tokens (styles.css, three theme blocks each):** `--background` 66/169/256, `--sidebar` 91/193/275, `--sidebar-accent` 95/197/279. In light mode `--sidebar-accent` (0.96) is almost the canvas colour (0.9702), so sidebar hover and open states become invisible once the sidebar shares the canvas colour. In dark mode `--sidebar` equals `--card` today.
- **Active nav item** already uses `data-active:surface-raised` (white, hairline ring, small shadow), which matches the reference.
- **`shared/components/PageHeader.tsx`** is used only by the two dashboard modules. **`shared/components/ContentBox.tsx`** (`flex flex-1 flex-col rounded-xl border bg-card p-8`) is also used by `modules/storefront/components/BookingSuccess.tsx` and `ConfirmStep.tsx`.
- **`Card`** (`shared/components/ui/card.tsx`) is `glass-card rounded-4xl` with blur and a `depth-2` shadow and is used across the site. **`EmptyState`** has a dashed border and `flex-1`; grep its users before changing it.
- **Week and Day calendar** has its own scroller (`max-h-[70vh] overflow-y-auto`, `modules/org-dashboard/components/bookings/TimeGridView.tsx:91`).
- **Print:** the shell header and banner are `print:hidden`, the sidebar is hidden by an unlayered rule at styles.css:701, and the account receipt page prints (`modules/account-dashboard/routes/_shell.payments.$paymentId.tsx`, `components/payments/Receipt.tsx`).
- **Theme:** `localStorage.theme` is `light`, `dark` or `auto` and sets a class on `<html>`; the switch is in the user menu at the bottom of the sidebar.
- **Local stack:** web app on `localhost:3000`, backend on `localhost:3001`. No dev server was running when this plan was written.
- **Git:** stage files by path; `Header above the window.png` is untracked and must stay out of commits.

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

---

## Phase 2: Organization dashboard pages in one window

**Goal:** Every organization dashboard page shows its content in a single window under its title, in every state (loading, error, empty, data).

**Files:** all in `modules/org-dashboard/`. Structures below come from grep; confirm by reading each component's `return` blocks.

| Route file (`routes/`) | Today | Components |
| --- | --- | --- |
| `_shell.index.tsx` | header, stat-card grid, two-column card grid; three header branches (error, skeleton grid, data) | `components/overview/*` |
| `_shell.analytics.tsx` | header, `Tabs` with widgets on the canvas, `PlanGate` | `components/analytics/*`, `DateRangeFilter.tsx` |
| `_shell.bookings.index.tsx` | header, one `ContentBox` (calendar or list) | benchmark from Phase 1 |
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
