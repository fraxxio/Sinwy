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
