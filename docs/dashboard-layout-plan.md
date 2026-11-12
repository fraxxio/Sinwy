# Dashboard layout plan

Redesign the dashboard shell (organization dashboard and personal account) to the simpler layout in the reference image: the sidebar blends into the page canvas with no border, a small breadcrumb row sits at the top, the page title sits on the canvas, and the page content lives in one white window below it. Every dashboard page is moved onto that layout and checked so nothing regresses.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [dashboard-layout-log.md](dashboard-layout-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shell chrome: sidebar, breadcrumb row, page header, window | – | done | `feat(web): restyle the dashboard shell to a borderless sidebar and one window` |
| 2 | Organization dashboard pages in one window | 1 | done | `feat(web): put every organization dashboard page in one window` |
| 3 | Account pages in one window | 2 | done | `feat(web): put every account page in one window` |
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
- **Shell (done in Phase 1, see the log):** `shared/components/shell/AppShell.tsx` is mounted by exactly two layout routes, `modules/org-dashboard/routes/_shell.tsx` and `modules/account-dashboard/routes/_shell.tsx`. Breadcrumb row: `mt-1 h-12 px-5 md:pl-3`, not sticky. Banner: `sticky top-0 mb-4 bg-background`. Body: `flex flex-1 flex-col gap-4 px-2 pb-2 md:pl-0`, so anything a page renders outside a window touches the sidebar edge on desktop. `SidebarInset` has `min-w-0`, so a wide table scrolls inside its own container instead of widening the page.
- **`PageHeader`** stacks the description under the title, bottom-aligns the action, wraps, and carries the 12px inset itself (`px-3 pb-0.5`). The window starts at 124px with a description, 102px without one and 106px without one but with a button, so a page keeps the description in its loading state (Overview shows "This week", Preview "Loading the latest version…", the account booking detail "Loading your booking…") or has none in any state, and a title with a button keeps the button, disabled, while loading (the account payment detail). The top still differs from page to page; that is open. Optional props are typed `?: string | undefined` because of `exactOptionalPropertyTypes`.
- **`ContentBox`** is `flex flex-1 flex-col rounded-lg border bg-card p-6`. Every page uses the default padding and passes only layout classes (`gap-4`, `gap-8`, `divide-y`); the account payment detail also passes print classes.
- **Window rules from Phases 2 and 3 (see the log):** the route renders `PageHeader` and one `ContentBox` in every branch, with the error (`FieldError`) and the skeleton inside the window. Forms do not render the window: a `<form>` around a `ContentBox` is a block, so the window stops stretching to the bottom. Sections in one window are `divide-y` with `SettingsSection`, or `ContentBox className="gap-8"` with `<section className="grid gap-4">` (Team).
- **Cards in a window** use `FlatCard` (`shared/components/FlatCard.tsx`): `Card` with a 12.8px radius, the `--border` hairline, no background, shadow or blur. It needs `!` on background, shadow and border colour, because `glass-card` is emitted after those utilities in the CSS and wins without it; for the same reason a caller's own border utility needs `!` (`print:border-0!` on the receipt, `border-primary!` on the popular plan card). `PlanCards` takes `flat` for the account Billing page and stays a glass `Card` on the home page.
- **Empty states in a window:** `EmptyState` takes a `className`; pass `border-none` when it is the only content of the window or of a tab. The dashed border stays the default because the storefront uses `EmptyState` outside windows. `UpgradePrompt` passes a `className` through.
- **Other boxes in a window** (alerts, dashed notes, bordered lists, option cards, skeletons) are `rounded-md`. `Alert` is `rounded-2xl` by default; `PaymentsNotice` is already `rounded-md` for both dashboards.
- **Radius scale:** `--radius` is 1rem, so `rounded-lg` is 16px, `rounded-xl` 22.4px, `rounded-2xl` 28.8px and `Card`'s `rounded-4xl` 41.6px. A card inside the 16px window needs `rounded-md` (12.8px) or smaller.
- **Canvas contrast:** in light mode `bg-muted` (0.96) and the ghost button's hover are invisible on the canvas (0.9702). On the canvas use `surface-raised` for a selected state (Bookings view toggle) and `--sidebar-accent` (light 0.925, dark 0.235) for hover. Both are fine inside the white window.
- **Both shells are `ssr: false`** (the account shell through `protectedRoute`, `shared/lib/auth/protected-route.ts:33`): the server sends an empty body, so there is no hydration to mismatch.
- **Scrollbar gutter:** `html` has `scrollbar-gutter: stable`. While a dashboard is mounted the body takes the canvas colour (`body:has([data-slot="sidebar-wrapper"])` in styles.css) so the gutter does not show as a strip. With classic scrollbars the window's right margin is 8px plus the 15px gutter on pages that do not scroll; this was only seen in headless Chromium.
- **Sidebar animation** lives in `shared/components/ui/sidebar.tsx` and must stay as is: gap `transition-[width] duration-200 ease-linear`, container `transition-[left,right,width] duration-200 ease-linear`, widths 16rem and 3rem, `sidebar_state` cookie, Ctrl/Cmd+B, rail; below `md` the sidebar is a Sheet.
- **Bookings Month view** matches the reference: no outer border, plain weekday row, no line under the last week, and the grid fills the window (`flex-1 auto-rows-fr`, rows at least 96px), so it fits 1440×900 without scrolling.
- **`Card`** (`shared/components/ui/card.tsx`) is `glass-card rounded-4xl` with blur and a `depth-2` shadow and is used across the site; it is not changed.
- **Week and Day calendar** has its own scroller (`max-h-[max(24rem,calc(100dvh-18rem))] overflow-y-auto`, `modules/org-dashboard/components/bookings/TimeGridView.tsx:91`), sized so the page itself does not scroll at 1440×900, and keeps a `rounded-md border` frame.
- **Left open by Phase 2 (see the log), for Phase 4:** New booking's submit button is full width while other forms use `w-fit` (`components/bookings/ManualBookingForm.tsx`, the last `div`); the divider above Closures on Business hours runs the full window width while the others stop at `max-w-3xl`; in dark mode today's column label in the Week view (`text-primary`, TimeGridView.tsx:72 and 81) is hard to read; Analytics was only seen in its empty states.
- **Left open by Phase 3 (see the log), for Phase 4:** in dark mode `text-primary` on the dark surface is about 2.3:1, seen on the "Save 20%" badge (`modules/organizations/components/PlanCards.tsx:174`) and the "Retry" link on account Billing (`modules/account-dashboard/components/billing/CurrentPlanSection.tsx:42`), the same cause as the Week view label; in print the receipt's content is indented 12px more than the title (`modules/account-dashboard/components/payments/Receipt.tsx`); account pages were only seen at 1440 wide; Billing's suspended and past-due states and the ownership offers on Organizations were only seen with a changed API response in light mode.
- **Print:** the breadcrumb row and banner are `print:hidden`, the sidebar is hidden by an unlayered rule in styles.css, and the account receipt page prints its title and the receipt with no window frame (`modules/account-dashboard/routes/_shell.payments.$paymentId.tsx`, `components/payments/Receipt.tsx`).
- **Theme:** `localStorage.theme` is `light`, `dark` or `auto` and sets a class on `<html>`; the switch is "Toggle theme" in the user menu at the bottom of the sidebar.
- **Local stack:** web app on `localhost:3000`, backend on `localhost:3001`. Phases 1 to 3 stopped the servers they started. The seeds can be reused with `dev:login-as --user-id`: organization `seed-75781209` (`bookable-org`, owner `lNenSI9j0ePY0P1XKDMHD9Pr7yEECMe9`) has one confirmed Haircut booking on 12 November 2026; organization `seed-5fb75f2c` (`pro-org`, owner `ZhntZFTbbYsHsqHeTmsJRwpCYlaaqNcK`) has one draft page "About us"; customer `aJ8Y8VWhJo5Mao6z3xUNK80L52IGVoWw` (a `user` seed with no organization or plan) has one confirmed Haircut booking at `seed-75781209` on 13 November 2026 (`/account/bookings/1b59fc3a-abeb-4a11-beee-980897c85889`) and its pending payment (`/account/payments/288e67bd-afd0-48a9-b6d3-cd146e765197`). A storefront booking with a price creates the payment row, so the payment detail is reachable locally.
- **Browser checks:** the shell is zsh, so call `bunx playwright-cli` directly or through a function (a variable is not word-split) and quote globs. Screenshots from Phases 1 to 3 are in `.playwright-cli/` (`p1-*`, `verify-p1-*`, `p2-*`, `verify-p2-*`, `p3-*`, `verify-p3-*`), with the server logs (`p2-*.log`, `p3-*.log`), Phase 3's measurement files (`verify-p3-*.json`, `.ts`, `.js`, `.sh`, `.log`) and Phase 2's helper scripts in `/tmp/sinwy-verify-p2/`, until Phase 4 deletes them. A state the seeds cannot reach (suspended plan, past due, an ownership offer) can be seen without touching the database: `page.route` on `/api/account/subscription` or `/api/transfers/incoming`, `route.fetch()`, change the `data` of the `{ isSuccess, data, message, code }` envelope and `route.fulfill`. The data request of each account page is under `/api/account/`, which is what to delay for a loading state. With every API call delayed, the screen stays blank for several request rounds before the shell mounts (session, flags, organizations, active member); that is the route guards, not the layout.
- **Git:** stage files by path; `Header above the window.png` is untracked and must stay out of commits.

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
