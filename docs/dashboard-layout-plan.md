# Dashboard layout plan

Redesign the dashboard shell (organization dashboard and personal account) to the simpler layout in the reference image: the sidebar blends into the page canvas with no border, a small breadcrumb row sits at the top, the page title sits on the canvas, and the page content lives in one white window below it. Every dashboard page is moved onto that layout and checked so nothing regresses.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [dashboard-layout-log.md](dashboard-layout-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shell chrome: sidebar, breadcrumb row, page header, window | – | done | `feat(web): restyle the dashboard shell to a borderless sidebar and one window` |
| 2 | Organization dashboard pages in one window | 1 | done | `feat(web): put every organization dashboard page in one window` |
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
- **Shell (done in Phase 1, see the log):** `shared/components/shell/AppShell.tsx` is mounted by exactly two layout routes, `modules/org-dashboard/routes/_shell.tsx` and `modules/account-dashboard/routes/_shell.tsx`. Breadcrumb row: `mt-1 h-12 px-5 md:pl-3`, not sticky. Banner: `sticky top-0 mb-4 bg-background`. Body: `flex flex-1 flex-col gap-4 px-2 pb-2 md:pl-0`, so anything a page renders outside a window touches the sidebar edge on desktop. `SidebarInset` has `min-w-0`, so a wide table scrolls inside its own container instead of widening the page.
- **`PageHeader`** stacks the description under the title, bottom-aligns the action, wraps, and carries the 12px inset itself (`px-3 pb-0.5`). The window starts at 124px with a description, 102px without one and 106px without one but with a button, so a page keeps the description in its loading state (Overview shows "This week", Preview "Loading the latest version…") or has none in any state. The top still differs from page to page; that is open. Optional props are typed `?: string | undefined` because of `exactOptionalPropertyTypes`.
- **`ContentBox`** is `flex flex-1 flex-col rounded-lg border bg-card p-6`. Every organization page uses the default padding and passes only layout classes (`gap-4`, `divide-y`).
- **Window rules from Phase 2 (see the log):** the route renders `PageHeader` and one `ContentBox` in every branch, with the error (`FieldError`) and the skeleton inside the window. Forms do not render the window: a `<form>` around a `ContentBox` is a block, so the window stops stretching to the bottom. Sections in one window are `divide-y` with `SettingsSection`, or `ContentBox className="gap-8"` with `<section className="grid gap-4">` (Team).
- **Cards in a window** use `FlatCard` (`shared/components/FlatCard.tsx`): `Card` with a 12.8px radius, the `--border` hairline, no background, shadow or blur. It needs `!` on background, shadow and border colour, because `glass-card` is emitted after those utilities in the CSS and wins without it.
- **Empty states in a window:** `EmptyState` takes a `className`; pass `border-none` when it is the only content of the window or of a tab. The dashed border stays the default because the storefront uses `EmptyState` outside windows. `UpgradePrompt` passes a `className` through.
- **Other boxes in a window** (alerts, dashed notes, bordered lists, option cards, skeletons) are `rounded-md`. `Alert` is `rounded-2xl` by default; `PaymentsNotice` is already `rounded-md` for both dashboards.
- **Radius scale:** `--radius` is 1rem, so `rounded-lg` is 16px, `rounded-xl` 22.4px, `rounded-2xl` 28.8px and `Card`'s `rounded-4xl` 41.6px. A card inside the 16px window needs `rounded-md` (12.8px) or smaller.
- **Canvas contrast:** in light mode `bg-muted` (0.96) and the ghost button's hover are invisible on the canvas (0.9702). On the canvas use `surface-raised` for a selected state (Bookings view toggle) and `--sidebar-accent` (light 0.925, dark 0.235) for hover. Both are fine inside the white window.
- **Both shells are `ssr: false`** (the account shell through `protectedRoute`, `shared/lib/auth/protected-route.ts:33`): the server sends an empty body, so there is no hydration to mismatch. The plan's earlier SSR note was wrong; Default 1 was not changed.
- **Scrollbar gutter:** `html` has `scrollbar-gutter: stable`. While a dashboard is mounted the body takes the canvas colour (`body:has([data-slot="sidebar-wrapper"])` in styles.css) so the gutter does not show as a strip. With classic scrollbars the window's right margin is 8px plus the 15px gutter on pages that do not scroll; this was only seen in headless Chromium.
- **Sidebar animation** lives in `shared/components/ui/sidebar.tsx` and must stay as is: gap `transition-[width] duration-200 ease-linear`, container `transition-[left,right,width] duration-200 ease-linear`, widths 16rem and 3rem, `sidebar_state` cookie, Ctrl/Cmd+B, rail; below `md` the sidebar is a Sheet.
- **Bookings Month view** matches the reference: no outer border, plain weekday row, no line under the last week, and the grid fills the window (`flex-1 auto-rows-fr`, rows at least 96px), so it fits 1440×900 without scrolling.
- **`Card`** (`shared/components/ui/card.tsx`) is `glass-card rounded-4xl` with blur and a `depth-2` shadow and is used across the site; it is not changed.
- **Week and Day calendar** has its own scroller (`max-h-[max(24rem,calc(100dvh-18rem))] overflow-y-auto`, `modules/org-dashboard/components/bookings/TimeGridView.tsx:91`), sized so the page itself does not scroll at 1440×900, and keeps a `rounded-md border` frame.
- **Left open by Phase 2 (see the log), for Phase 4:** New booking's submit button is full width while other forms use `w-fit` (`components/bookings/ManualBookingForm.tsx`, the last `div`); the divider above Closures on Business hours runs the full window width while the others stop at `max-w-3xl`; in dark mode today's column label in the Week view (`text-primary`, TimeGridView.tsx:72 and 81) is hard to read; Analytics was only seen in its empty states.
- **Print:** the breadcrumb row and banner are `print:hidden`, the sidebar is hidden by an unlayered rule in styles.css, and the account receipt page prints (`modules/account-dashboard/routes/_shell.payments.$paymentId.tsx`, `components/payments/Receipt.tsx`).
- **Theme:** `localStorage.theme` is `light`, `dark` or `auto` and sets a class on `<html>`; the switch is "Toggle theme" in the user menu at the bottom of the sidebar.
- **Local stack:** web app on `localhost:3000`, backend on `localhost:3001`. Phases 1 and 2 stopped the servers they started. Both seeds can be reused with `dev:login-as --user-id`: organization `seed-75781209` (`bookable-org`, owner `lNenSI9j0ePY0P1XKDMHD9Pr7yEECMe9`) has one confirmed Haircut booking on 12 November 2026; organization `seed-5fb75f2c` (`pro-org`, owner `ZhntZFTbbYsHsqHeTmsJRwpCYlaaqNcK`) has one draft page "About us".
- **Browser checks:** the shell is zsh, so call `bunx playwright-cli` directly or through a function (a variable is not word-split) and quote globs. Screenshots from Phases 1 and 2 are in `.playwright-cli/` (`p1-*`, `verify-p1-*`, `p2-*`, `verify-p2-*`), with Phase 2's server logs (`p2-*.log`) and helper scripts in `/tmp/sinwy-verify-p2/`, until Phase 4 deletes them. With every API call delayed, the screen stays blank for several request rounds before the shell mounts (session, flags, organizations, active member); that is the route guards, not the layout.
- **Git:** stage files by path; `Header above the window.png` is untracked and must stay out of commits.

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
