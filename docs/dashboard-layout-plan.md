# Dashboard layout plan

Redesign the dashboard shell (organization dashboard and personal account) to the simpler layout in the reference image: the sidebar blends into the page canvas with no border, a small breadcrumb row sits at the top, the page title sits on the canvas, and the page content lives in one white window below it. Every dashboard page is moved onto that layout and checked so nothing regresses.

All phases are finished; they and their logs are in [dashboard-layout-log.md](dashboard-layout-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Shell chrome: sidebar, breadcrumb row, page header, window | – | done | `feat(web): restyle the dashboard shell to a borderless sidebar and one window` |
| 2 | Organization dashboard pages in one window | 1 | done | `feat(web): put every organization dashboard page in one window` |
| 3 | Account pages in one window | 2 | done | `feat(web): put every account page in one window` |
| 4 | Full regression sweep and cleanup | 3 | done | `fix(web): fix dashboard pages at narrow widths and dark-mode primary text` |

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

All four phases are done. These are the facts later work on the dashboards relies on; detail is in the log.

- **Paths below are relative to `Sinwy.WebFrontend/src/`.**
- **Shell:** `shared/components/shell/AppShell.tsx` is mounted by exactly two layout routes, `modules/org-dashboard/routes/_shell.tsx` and `modules/account-dashboard/routes/_shell.tsx`. Breadcrumb row: `mt-1 h-12 px-5 md:pl-3`, not sticky. Banner: `sticky top-0 mb-4 bg-background`. Body: `flex flex-1 flex-col gap-4 px-2 pb-2 md:pl-0`, so anything a page renders outside a window touches the sidebar edge on desktop. `SidebarInset` has `min-w-0`. The mobile sheet closes on every navigation (`CloseSheetOnNavigation`, `router.subscribe("onResolved")`).
- **`PageHeader`** stacks the description under the title, bottom-aligns the action, wraps, carries the 12px inset itself and has a minimum height of 38px, so the window starts at 124px with a description and at 106px without one, with or without a button. A page keeps its description in the loading state or has none in any state. Optional props are typed `?: string | undefined` because of `exactOptionalPropertyTypes`.
- **`ContentBox`** is `flex flex-1 flex-col rounded-lg border bg-card p-6`. The route renders `PageHeader` and one `ContentBox` in every branch, with the error and the skeleton inside the window. Forms do not render the window: a `<form>` around a `ContentBox` is a block, so the window stops stretching to the bottom. Sections in one window are `divide-y` with `SettingsSection`, or `ContentBox className="gap-8"` with `<section className="grid gap-4">` (Team).
- **Size content by the window, not the viewport.** With the sidebar expanded the window's content is 439px wide at 768 and 697px at 1024, so `sm:`/`md:`/`lg:` grids break there. Use a container query (`@container` on the parent, `@2xl:grid-cols-…`) as `PaymentTotals` and the flat `PlanCards` do, give a grid item that holds a table `min-w-0`, and give a `flex-wrap` row's text a basis (`grow basis-48`) instead of `flex-1`, which never wraps. `SettingsSection` stacks its action under the description below `sm`.
- **Cards in a window** use `FlatCard` (`shared/components/FlatCard.tsx`). It needs `!` on background, shadow and border colour, because `glass-card` is emitted after those utilities in the CSS; for the same reason a caller's own border utility needs `!`. `PlanCards` takes `flat` for the account Billing page and stays a glass `Card` with `md:grid-cols-3` on the home page. `Card` itself (`glass-card rounded-4xl`) is not changed.
- **Empty states in a window:** `EmptyState` takes a `className`; pass `border-none` when it is the only content of the window or of a tab. Other boxes in a window (alerts, dashed notes, bordered lists, option cards, skeletons) are `rounded-md`.
- **Radius scale:** `--radius` is 1rem, so `rounded-lg` is 16px, `rounded-xl` 22.4px, `rounded-2xl` 28.8px and `Card`'s `rounded-4xl` 41.6px. A card inside the 16px window needs `rounded-md` (12.8px) or smaller.
- **Canvas contrast:** in light mode `bg-muted` and the ghost button's hover are invisible on the canvas. On the canvas use `surface-raised` for a selected state and `--sidebar-accent` for hover. Both are fine inside the white window.
- **`text-primary`** reads `--primary-text` (`--text-color-primary` in the `@theme inline` block of `styles.css`): the same as `--primary` in light and `oklch(0.696 0.17 162.48)` in dark, about 7:1 on the dark surfaces. `bg-primary` and `border-primary` still read `--primary`. This applies to the whole site, not only the dashboards.
- **Scrollbar gutter:** `html` has `scrollbar-gutter: stable`. While a dashboard is mounted the body takes the canvas colour (`body:has([data-slot="sidebar-wrapper"])` in styles.css). With classic scrollbars the window's right margin is 8px plus the 15px gutter; with overlay scrollbars (phones) it is 8px on both sides.
- **Sidebar animation** lives in `shared/components/ui/sidebar.tsx` and must stay as is: widths 16rem and 3rem, 200ms linear, `sidebar_state` cookie, Ctrl/Cmd+B, rail; below `md` the sidebar is a Sheet.
- **Bookings calendar:** the Month view matches the reference and fits 1440×900 without scrolling. Week and Day have their own vertical scroller (`modules/org-dashboard/components/bookings/TimeGridView.tsx`); the Week view is at least 36rem wide and scrolls sideways inside its frame on a phone.
- **Print:** the breadcrumb row and banner are `print:hidden`, the sidebar is hidden by an unlayered rule in styles.css, and the account receipt page prints its title and the receipt, aligned at 12px, with no window frame.
- **Left open (see the Phase 4 log):** the Bookings toolbar row is 38px against 32px in the reference, so the weekday row sits 14px lower; the three plan cards on account Billing are tight at 1024 with the sidebar expanded (221px each); the payment-failed banner is four lines at 390; nothing was checked on a real phone, in Safari or Firefox, or on paper; past-due, suspended, ownership-offer and non-empty analytics states were only seen with changed API responses.
- **Checking in the browser:** the reference image `Header above the window.png` stays untracked in the repo root: never commit or delete it, and stage files by path. Seeds that can be reused with `dev:login-as --user-id`: organization `seed-75781209` (`bookable-org`, owner `lNenSI9j0ePY0P1XKDMHD9Pr7yEECMe9`), `seed-5fb75f2c` (`pro-org`, owner `ZhntZFTbbYsHsqHeTmsJRwpCYlaaqNcK`), `seed-ddc374e9` (`org-with-staff`, owner `1jwUrbvwDfm5H4fi4KUctKuGCrE2v4CT`, staff `I57wrnBZn25QB8QprhVxLsGc5XzxnDBo`) and customer `aJ8Y8VWhJo5Mao6z3xUNK80L52IGVoWw`. A state the seeds cannot reach can be shown with `page.route` on the API response (`{ isSuccess, data, message, code }`), without touching the database.
